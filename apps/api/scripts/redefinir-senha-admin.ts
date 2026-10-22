/**
 * Recuperação LOCAL e explícita da credencial do ADMIN inicial.
 * Não cria usuários nem altera escopo ou perfil de acesso.
 *
 * Usa o hash padrão do Better Auth e revoga sessões anteriores.
 * A senha entra somente por variável de ambiente temporária.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { criarConexao } from '@odontofolha/database';
import { validarAmbiente } from '../src/config/ambiente';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const senha = process.env.ODONTOFOLHA_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe o e-mail da conta ADMIN existente.');
  }
  if (process.env.ODONTOFOLHA_CONFIRMA_RESET_ADMIN !== 'SIM') {
    throw new Error('Defina ODONTOFOLHA_CONFIRMA_RESET_ADMIN=SIM apenas ao autorizar esta redefinição.');
  }
  if (!senha || senha.length < 12 || senha.length > 128) {
    throw new Error('A nova senha deve ter entre 12 e 128 caracteres.');
  }

  const ambiente = validarAmbiente(process.env);
  const conexao = criarConexao(ambiente.DATABASE_URL);
  try {
    // Hash antes da transação para minimizar tempo de lock.
    const hash = await hashPassword(senha);
    const client = await conexao.pool.connect();
    try {
      await client.query('BEGIN');
      const usuario = await client.query<{ id: string }>(
        'SELECT u.id FROM "user" u JOIN usuarios_perfis p ON p.usuario_id = u.id ' +
        "WHERE lower(u.email) = lower($1) AND p.perfil = 'ADMIN' AND p.ativo = true " +
        'FOR UPDATE OF u',
        [email],
      );
      if (usuario.rows.length !== 1) {
        throw new Error('A conta não existe ou não possui perfil ADMIN ativo. Nenhuma alteração.');
      }
      const id = usuario.rows[0].id;
      const contas = await client.query<{ id: string }>(
        'SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = $2',
        [id, 'credential'],
      );
      if (contas.rows.length > 1) {
        throw new Error('Múltiplas credenciais encontradas. Corrigir inconsistência antes de redefinir.');
      }
      if (contas.rows.length === 1) {
        await client.query(
          'UPDATE "account" SET "password" = $1, "updatedAt" = CURRENT_TIMESTAMP ' +
          'WHERE id = $2 AND "userId" = $3',
          [hash, contas.rows[0].id, id],
        );
      } else {
        await client.query(
          'INSERT INTO "account" ' +
          '("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt") ' +
          'VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [randomUUID(), id, 'credential', id, hash],
        );
      }
      await client.query('DELETE FROM "session" WHERE "userId" = $1', [id]);
      await client.query('COMMIT');
      console.info('Senha do ADMIN redefinida e sessões anteriores encerradas:', email);
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  } finally {
    await conexao.pool.end();
  }
}

main().catch((erro: unknown) => {
  // Não registrar SQL, senha, string de conexão nem objetos do driver.
  const permitido = erro instanceof Error && (
    erro.message.startsWith('Informe') ||
    erro.message.startsWith('Defina') ||
    erro.message.startsWith('A nova senha') ||
    erro.message.startsWith('A conta não existe') ||
    erro.message.startsWith('Múltiplas credenciais')
  );
  console.error('Recuperação não concluída:',
    permitido ? (erro as Error).message : 'Falha ao conectar ou atualizar a credencial. Confira o terminal e as variáveis.');
  process.exitCode = 1;
});
