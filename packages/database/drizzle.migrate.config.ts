import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

/**
 * Destino explícito de migração: DIRECT_URL, não DATABASE_URL (pooled).
 * Executar somente após backup e revisão do SQL gerado.
 */
const arquivosAmbiente = {
  development: '../../.env.migration.development',
  production: '../../.env.migration.production',
} as const;
const destino = process.env.MIGRATION_TARGET;
if (!destino || !(destino in arquivosAmbiente)) {
  throw new Error('Defina MIGRATION_TARGET usando pnpm db:migrate:dev ou pnpm db:migrate:prod');
}

const envFile = fileURLToPath(new URL(arquivosAmbiente[destino as keyof typeof arquivosAmbiente], import.meta.url));
if (!existsSync(envFile)) {
  throw new Error(`Arquivo de conexão de migration não encontrado: ${envFile}`);
}
// A conexão vem exclusivamente do arquivo do destino escolhido, nunca do .env geral.
delete process.env.DIRECT_URL;
loadEnvFile(envFile);
const connectionString = process.env.DIRECT_URL;
if (!connectionString) throw new Error(`DIRECT_URL ausente no arquivo de conexão de ${destino}`);
const url = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname.endsWith('.neon.tech') ||
    url.hostname.includes('-pooler')) {
  throw new Error('DIRECT_URL deve ser conexão PostgreSQL DIRETA do Neon, sem -pooler');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: connectionString },
  strict: true,
  verbose: true,
});
