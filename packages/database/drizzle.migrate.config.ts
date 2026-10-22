import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

/**
 * Destino explícito de migração: DIRECT_URL, não DATABASE_URL (pooled).
 * Executar somente após backup e revisão do SQL gerado.
 */
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);
const connectionString = process.env.DIRECT_URL;
if (!connectionString) throw new Error('DIRECT_URL ausente: configure a conexão direta no .env');
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
