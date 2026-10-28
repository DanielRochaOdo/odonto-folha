import { Hono } from 'hono';
import { verifyPassword } from 'better-auth/crypto';
import { z } from '@odontofolha/contracts';
import type { ConexaoFolha } from '@odontofolha/database';
import type { SessaoOperacional } from './operacionais';

const schemaAlterarEmail = z.object({
  novoEmail: z.string().trim().email().max(320),
  senhaAtual: z.string().min(1).max(128),
}).strict();

type DependenciasConta = {
  autenticar: (cabecalhos: Headers) => Promise<SessaoOperacional | null>;
  pool: ConexaoFolha['pool'];
  obterSessaoAuth: (cabecalhos: Headers) => Promise<{
    session: { id: string };
    user: { id: string; email: string };
  } | null>;
};

function codigoPostgres(erro: unknown): string | undefined {
  if (erro && typeof erro === 'object' && 'code' in erro && typeof erro.code === 'string')
    return erro.code;
  return undefined;
}

/** Rotas de dados e credenciais da própria conta autenticada. */
export function criarRotasConta(deps: DependenciasConta) {
  const app = new Hono().basePath('/api');

  app.post('/conta/email', async c => {
    c.header('Cache-Control', 'no-store');
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);

    const corpo = schemaAlterarEmail.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return c.json({ erro: 'Informe um e-mail válido e a senha atual.' }, 400);

    const sessaoAuth = await deps.obterSessaoAuth(c.req.raw.headers);
    if (!sessaoAuth || sessaoAuth.user.id !== sessao.usuarioId)
      return c.json({ erro: 'Sessão necessária' }, 401);

    const conta = await deps.pool.query(
      'SELECT password FROM "account" WHERE "userId" = $1 AND "providerId" = $2 LIMIT 1',
      [sessao.usuarioId, 'credential'],
    );
    const hash = conta.rows[0]?.password;
    if (typeof hash !== 'string' || !await verifyPassword({
      hash, password: corpo.data.senhaAtual,
    })) return c.json({ erro: 'A senha atual está incorreta.' }, 400);

    const novoEmail = corpo.data.novoEmail.toLowerCase();
    if (novoEmail === sessaoAuth.user.email.toLowerCase())
      return c.json({ erro: 'O novo e-mail é igual ao atual.' }, 400);

    const conexao = await deps.pool.connect();
    try {
      await conexao.query('BEGIN');
      const existente = await conexao.query(
        'SELECT id FROM "user" WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1',
        [novoEmail, sessao.usuarioId],
      );
      if (existente.rows.length)
      {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'Este e-mail já está sendo usado por outra conta.' }, 409);
      }

      const atualizado = await conexao.query(
        'UPDATE "user" SET email = $1, "emailVerified" = false, "updatedAt" = now() WHERE id = $2 RETURNING email',
        [novoEmail, sessao.usuarioId],
      );
      const emailAtualizado = atualizado.rows[0]?.email;
      if (typeof emailAtualizado !== 'string') {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'Não foi possível atualizar a conta.' }, 404);
      }
      await conexao.query(
        'DELETE FROM "session" WHERE "userId" = $1 AND id <> $2',
        [sessao.usuarioId, sessaoAuth.session.id],
      );
      await conexao.query('COMMIT');
      return c.json({ email: emailAtualizado });
    } catch (erro) {
      await conexao.query('ROLLBACK').catch(() => undefined);
      if (codigoPostgres(erro) === '23505')
        return c.json({ erro: 'Este e-mail já está sendo usado por outra conta.' }, 409);
      return c.json({ erro: 'Não foi possível atualizar o e-mail.' }, 500);
    } finally {
      conexao.release();
    }
  });

  return app;
}
