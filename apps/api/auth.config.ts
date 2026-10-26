/**
 * Entrada exclusiva do CLI Better Auth. Não é usada pelo servidor Hono.
 * Migrações locais usam arquivos privados; a CI só aceita PostgreSQL local.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { criarIdentidade } from './src/identidade/auth';
import { validarAmbiente } from './src/config/ambiente';

const destino = process.env.MIGRATION_TARGET;
let direto: string | undefined;

if (destino === 'ci') {
  if (process.env.CI !== 'true') {
    throw new Error('MIGRATION_TARGET=ci só pode ser usado dentro da CI.');
  }

  direto = process.env.DIRECT_URL;
  if (!direto) throw new Error('DIRECT_URL sintético ausente na CI.');
  const url = new URL(direto);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error('A CI só pode usar PostgreSQL local sintético.');
  }
} else {
  const raiz = fileURLToPath(new URL('../../.env', import.meta.url));
  if (existsSync(raiz)) loadEnvFile(raiz);

  const arquivosAmbiente = {
    development: '../../.env.migration.development',
    production: '../../.env.migration.production',
  } as const;
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
  direto = process.env.DIRECT_URL;
  if (!direto) {
    throw new Error('DIRECT_URL obrigatório para CLI de migração Better Auth.');
  }
  const url = new URL(direto);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname.includes('-pooler')) {
    throw new Error('DIRECT_URL deve ser uma conexão direta do PostgreSQL.');
  }
}

if (!direto) throw new Error('DIRECT_URL obrigatória para CLI Better Auth.');
const ambiente = validarAmbiente(process.env);
export const auth = criarIdentidade({
  ...ambiente,
  DATABASE_URL: direto,
}).auth;
