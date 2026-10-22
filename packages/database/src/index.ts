import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
export { eq, and, desc } from 'drizzle-orm';
import * as schema from './schema';

export function criarConexao(url: string) {
  const endereco = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(endereco.protocol))
    throw new Error('URL PostgreSQL obrigatória');
  const pool = new Pool({
    connectionString: url, max: 5,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true,
  });
  return { pool, db: drizzle({ client: pool, schema }) };
}
export type ConexaoFolha = ReturnType<typeof criarConexao>;
export * as tabelas from './schema';

export async function obterPerfilAtivo(conexao: ConexaoFolha, usuarioId: string) {
  const perfil = await conexao.db.select({
    perfil: schema.usuariosPerfis.perfil,
  }).from(schema.usuariosPerfis)
    .where(and(eq(schema.usuariosPerfis.usuarioId, usuarioId),
      eq(schema.usuariosPerfis.ativo, true)))
    .limit(1);
  return perfil[0]?.perfil ?? null;
}
