import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createInterface } from 'node:readline/promises';

const destino = process.argv[2];
if (!['development', 'production'].includes(destino)) {
  console.error('Uso: pnpm db:migrate:dev | pnpm db:migrate:prod');
  process.exit(1);
}

const arquivoConexao = resolve(process.cwd(), `.env.migration.${destino}`);
if (!existsSync(arquivoConexao)) {
  console.error(`Arquivo de conexão não encontrado: .env.migration.${destino}`);
  process.exit(1);
}

delete process.env.DIRECT_URL;
loadEnvFile(arquivoConexao);
const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error(`Preencha DIRECT_URL em .env.migration.${destino}.`);
  process.exit(1);
}

let url;
try {
  url = new URL(connectionString);
} catch {
  console.error(`DIRECT_URL em .env.migration.${destino} não é uma URL válida.`);
  process.exit(1);
}

if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) {
  console.error('DIRECT_URL deve ser uma conexão PostgreSQL do Neon.');
  process.exit(1);
}
if (url.hostname.includes('-pooler')) {
  console.error(
    'DIRECT_URL está usando pooler. No Neon, desative “Connection pooling” e copie a conexão direta para este arquivo.',
  );
  process.exit(1);
}

if (destino === 'production') {
  if (!process.stdin.isTTY) {
    console.error('Migration de produção exige um terminal interativo para confirmação.');
    process.exit(1);
  }

  const interfaceLinha = createInterface({ input: process.stdin, output: process.stdout });
  const confirmacao = await interfaceLinha.question(
    'Você está prestes a alterar o banco de PRODUÇÃO. Digite PRODUCAO para continuar: ',
  );
  interfaceLinha.close();
  if (confirmacao !== 'PRODUCAO') {
    console.log('Migration cancelada.');
    process.exit(1);
  }
}

const ambiente = { ...process.env, MIGRATION_TARGET: destino };
const comandos = [
  [
    'pnpm',
    ['--filter', '@odontofolha/database', 'exec', 'drizzle-kit', 'migrate', '--config', 'drizzle.migrate.config.ts'],
  ],
  ['pnpm', ['dlx', 'auth@1.7.7', 'migrate', '--config', 'apps/api/auth.config.ts']],
];

for (const [comando, argumentos] of comandos) {
  console.log(`Aplicando ${comando} ${argumentos.join(' ')} no ambiente ${destino}...`);
  const resultado = spawnSync(comando, argumentos, {
    env: ambiente,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (resultado.error) {
    console.error(`Não foi possível iniciar a migration: ${resultado.error.message}`);
    process.exit(1);
  }
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}
