import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/** Cria o cliente sob demanda, sem iniciar queries no import ou no build. */
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
