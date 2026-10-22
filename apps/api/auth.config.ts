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

export const auth = criarIdentidade(validarAmbiente(process.env)).auth;
