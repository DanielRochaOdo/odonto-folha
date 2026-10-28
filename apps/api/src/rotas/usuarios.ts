import { randomUUID } from 'node:crypto';
import { Hono, type Context, type Next } from 'hono';
import { hashPassword } from 'better-auth/crypto';
import { z } from '@odontofolha/contracts';
import type { ConexaoFolha } from '@odontofolha/database';
import type { SessaoOperacional } from './operacionais';

const perfilGerenciavel = z.enum(['DP', 'CENTRO_CUSTO']);
const schemaNovoUsuario = z.object({
  nome: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  senha: z.string().min(6).max(128),
  perfil: perfilGerenciavel,
  centroCustoId: z.uuid().nullable(),
}).strict().refine(dados => dados.perfil === 'DP' ? dados.centroCustoId === null
  : dados.centroCustoId !== null, 'Selecione um centro de custo para este usuário.');
const schemaAtualizarUsuario = z.object({
  nome: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  perfil: perfilGerenciavel,
  centroCustoId: z.uuid().nullable(),
  ativo: z.boolean(),
}).strict().refine(dados => dados.perfil === 'DP' ? dados.centroCustoId === null
  : dados.centroCustoId !== null, 'Selecione um centro de custo para este usuário.');
const schemaRedefinirSenha = z.object({
  senha: z.string().min(6).max(128),
}).strict();

type DependenciasUsuarios = {
  autenticar: (cabecalhos: Headers) => Promise<SessaoOperacional | null>;
  pool: ConexaoFolha['pool'];
};
type ClienteSql = { query: (texto: string, valores?: unknown[]) => Promise<unknown> };

function codigoPostgres(erro: unknown): string | undefined {
  if (erro && typeof erro === 'object' && 'code' in erro && typeof erro.code === 'string')
    return erro.code;
  return undefined;
}

async function registrarAuditoria(
  conexao: ClienteSql,
  autorId: string,
  usuarioId: string,
  acao: string,
  detalhes: Record<string, boolean | string>,
) {
  await conexao.query(
    'INSERT INTO auditoria (usuario_id, entidade, entidade_id, acao, detalhes) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [autorId, 'usuario', usuarioId, acao, JSON.stringify(detalhes)],
  );
}

/** Gestão de contas de acesso pelos perfis ADMIN e DP. */
export function criarRotasUsuarios(deps: DependenciasUsuarios) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  const exigirGestorUsuarios = async (
    c: Context<{ Variables: { sessao: SessaoOperacional } }>, proximo: Next,
  ) => {
    c.header('Cache-Control', 'no-store');
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    if (sessao.perfil !== 'ADMIN' && sessao.perfil !== 'DP')
      return c.json({ erro: 'Somente ADMIN ou DP pode gerenciar usuários.' }, 403);
    c.set('sessao', sessao);
    await proximo();
  };
  app.use('/usuarios', exigirGestorUsuarios);
  app.use('/usuarios/*', exigirGestorUsuarios);

  app.get('/usuarios', async c => {
    const resultado = await deps.pool.query(
      `SELECT u.id, u.name AS nome, u.email, p.perfil, p.ativo,
         p.centro_custo_id AS "centroCustoId", cc.nome AS "centroCustoNome"
       FROM "user" u JOIN usuarios_perfis p ON p.usuario_id = u.id
       LEFT JOIN centros_custo cc ON cc.id = p.centro_custo_id
       WHERE p.perfil <> 'ADMIN' ORDER BY lower(u.name), lower(u.email)`,
    );
    return c.json({ usuarios: resultado.rows });
  });

  app.post('/usuarios', async c => {
    const corpo = schemaNovoUsuario.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: 'Confira nome, e-mail, setor e senha (mínimo de 6 caracteres).' }, 400);

    const email = corpo.data.email.toLowerCase();
    const usuarioId = randomUUID();
    const senhaHash = await hashPassword(corpo.data.senha);
    const conexao = await deps.pool.connect();
    try {
      await conexao.query('BEGIN');
      if (corpo.data.centroCustoId) {
        const centro = await conexao.query(
          'SELECT id FROM centros_custo WHERE id = $1 AND ativo = true',
          [corpo.data.centroCustoId],
        );
        if (!centro.rows.length) {
          await conexao.query('ROLLBACK');
          return c.json({ erro: 'Selecione um centro de custo ativo.' }, 400);
        }
      }
      await conexao.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, false, NULL, now(), now())`,
        [usuarioId, corpo.data.nome, email],
      );
      await conexao.query(
        `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $1, 'credential', $1, $2, now(), now())`,
        [usuarioId, senhaHash],
      );
      await conexao.query(
        'INSERT INTO usuarios_perfis (usuario_id, perfil, centro_custo_id, ativo) VALUES ($1, $2, $3, true)',
        [usuarioId, corpo.data.perfil, corpo.data.centroCustoId],
      );
      const ator = c.get('sessao');
      await registrarAuditoria(conexao, ator.usuarioId, usuarioId, 'criou', {
        perfil: corpo.data.perfil,
      });
      await conexao.query('COMMIT');
      return c.json({ id: usuarioId }, 201);
    } catch (erro) {
      await conexao.query('ROLLBACK').catch(() => undefined);
      if (codigoPostgres(erro) === '23505')
        return c.json({ erro: 'Já existe uma conta com este e-mail.' }, 409);
      return c.json({ erro: 'Não foi possível criar o usuário.' }, 500);
    } finally { conexao.release(); }
  });

  app.patch('/usuarios/:id', async c => {
    const corpo = schemaAtualizarUsuario.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: 'Confira nome, e-mail, setor e situação do usuário.' }, 400);
    const usuarioId = c.req.param('id');
    const email = corpo.data.email.toLowerCase();
    const conexao = await deps.pool.connect();
    try {
      await conexao.query('BEGIN');
      if (corpo.data.centroCustoId) {
        const centro = await conexao.query(
          'SELECT id FROM centros_custo WHERE id = $1 AND ativo = true',
          [corpo.data.centroCustoId],
        );
        if (!centro.rows.length) {
          await conexao.query('ROLLBACK');
          return c.json({ erro: 'Selecione um centro de custo ativo.' }, 400);
        }
      }
      const atual = await conexao.query(
        `SELECT u.email, p.perfil FROM "user" u
         JOIN usuarios_perfis p ON p.usuario_id = u.id WHERE u.id = $1 FOR UPDATE OF u, p`,
        [usuarioId],
      );
      if (!atual.rows.length || atual.rows[0]?.perfil === 'ADMIN') {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'Usuário não encontrado ou não pode ser alterado por esta tela.' }, 404);
      }
      const emailAnterior = String(atual.rows[0]?.email ?? '');
      const emailAlterado = emailAnterior.toLowerCase() !== email;
      const existente = await conexao.query(
        'SELECT id FROM "user" WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1',
        [email, usuarioId],
      );
      if (existente.rows.length) {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'Este e-mail já está sendo usado por outra conta.' }, 409);
      }
      await conexao.query(
        `UPDATE "user" SET name = $1, email = $2,
         "emailVerified" = CASE WHEN lower(email) <> lower($2) THEN false ELSE "emailVerified" END,
         "updatedAt" = now() WHERE id = $3`,
        [corpo.data.nome, email, usuarioId],
      );
      await conexao.query(
        'UPDATE usuarios_perfis SET perfil = $1, centro_custo_id = $2, ativo = $3 WHERE usuario_id = $4',
        [corpo.data.perfil, corpo.data.centroCustoId, corpo.data.ativo, usuarioId],
      );
      if (emailAlterado || !corpo.data.ativo)
        await conexao.query('DELETE FROM "session" WHERE "userId" = $1', [usuarioId]);
      const ator = c.get('sessao');
      await registrarAuditoria(conexao, ator.usuarioId, usuarioId, 'atualizou', {
        perfil: corpo.data.perfil,
        ativo: corpo.data.ativo,
        emailAlterado,
      });
      await conexao.query('COMMIT');
      return c.json({ atualizado: true });
    } catch (erro) {
      await conexao.query('ROLLBACK').catch(() => undefined);
      if (codigoPostgres(erro) === '23505')
        return c.json({ erro: 'Já existe uma conta com este e-mail.' }, 409);
      return c.json({ erro: 'Não foi possível atualizar o usuário.' }, 500);
    } finally { conexao.release(); }
  });

  app.post('/usuarios/:id/senha', async c => {
    const corpo = schemaRedefinirSenha.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return c.json({ erro: 'A senha deve ter de 6 a 128 caracteres.' }, 400);
    const usuarioId = c.req.param('id');
    const senhaHash = await hashPassword(corpo.data.senha);
    const conexao = await deps.pool.connect();
    try {
      await conexao.query('BEGIN');
      const usuario = await conexao.query(
        `SELECT p.perfil FROM usuarios_perfis p WHERE p.usuario_id = $1 FOR UPDATE`,
        [usuarioId],
      );
      if (!usuario.rows.length || usuario.rows[0]?.perfil === 'ADMIN') {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'Usuário não encontrado ou não pode ser alterado por esta tela.' }, 404);
      }
      const alterado = await conexao.query(
        `UPDATE "account" SET password = $1, "updatedAt" = now()
         WHERE "userId" = $2 AND "providerId" = 'credential'`,
        [senhaHash, usuarioId],
      );
      if (!alterado.rowCount) {
        await conexao.query('ROLLBACK');
        return c.json({ erro: 'A conta não possui senha local para redefinir.' }, 409);
      }
      await conexao.query('DELETE FROM "session" WHERE "userId" = $1', [usuarioId]);
      const ator = c.get('sessao');
      await registrarAuditoria(conexao, ator.usuarioId, usuarioId, 'redefiniu_senha', {});
      await conexao.query('COMMIT');
      return c.json({ atualizado: true });
    } catch {
      await conexao.query('ROLLBACK').catch(() => undefined);
      return c.json({ erro: 'Não foi possível redefinir a senha.' }, 500);
    } finally { conexao.release(); }
  });

  return app;
}
