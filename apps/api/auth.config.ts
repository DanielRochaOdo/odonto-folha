/**
 * Entrada exclusiva do CLI Better Auth. NÃO usada pelo servidor Hono.
 * Carrega o ambiente local e a conexão exclusiva do destino de migration.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { criarIdentidade } from './src/identidade/auth';
import { validarAmbiente } from './src/config/ambiente';

const raiz = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(raiz)) loadEnvFile(raiz);

const arquivosAmbiente = {
  development: '../../.env.migration.development',
  production: '../../.env.migration.production',
} as const;
const destino = process.env.MIGRATION_TARGET;
if (!destino || !(destino in arquivosAmbiente)) {
  throw new Error('Defina MIGRATION_TARGET usando pnpm db:migrate:dev ou pnpm db:migrate:prod');
}
const arquivoDestino = fileURLToPath(
  new URL(arquivosAmbiente[destino as keyof typeof arquivosAmbiente], import.meta.url),
);
if (!existsSync(arquivoDestino)) {
  throw new Error(`Arquivo de conexão de migration não encontrado: ${arquivoDestino}`);
}
delete process.env.DIRECT_URL;
loadEnvFile(arquivoDestino);

const ambiente = validarAmbiente(process.env);
const direto = process.env.DIRECT_URL;
if (!direto) {
  throw new Error('DIRECT_URL obrigatório para CLI de migração Better Auth.');
}
const url = new URL(direto);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname.includes('-pooler')) {
  throw new Error('DIRECT_URL deve ser uma conexão direta do PostgreSQL.');
}
export const auth = criarIdentidade({
  ...ambiente,
  DATABASE_URL: direto,
}).auth;
