/**
 * Entrada exclusiva do CLI Better Auth. NÃO usada pelo servidor Hono.
 * Carrega o .env local, sem imprimi-lo nem publicar credenciais.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { criarIdentidade } from './src/identidade/auth';
import { validarAmbiente } from './src/config/ambiente';

const raiz = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(raiz)) loadEnvFile(raiz);

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
