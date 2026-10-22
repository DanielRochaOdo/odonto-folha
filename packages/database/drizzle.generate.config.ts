import { defineConfig } from 'drizzle-kit';

/** Geração offline: nunca conecta ao Neon. */
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});
