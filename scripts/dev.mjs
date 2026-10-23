import { spawn } from 'node:child_process';
import { setTimeout as aguardar } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPorta = process.env.API_PORT || '3001';
const apiBase = process.env.API_INTERNAL_URL || `http://localhost:${apiPorta}`;
const apiSaude = new URL('/api/health', apiBase);
if (apiSaude.hostname === 'localhost') apiSaude.hostname = '127.0.0.1';

const processos = new Set();
let encerrando = false;

function iniciarProcesso(nome, arquivo, argumentos, diretorio, ambiente = process.env) {
  console.info(`[dev] Iniciando ${nome}...`);
  const processo = spawn(process.execPath, [arquivo, ...argumentos], {
    cwd: diretorio,
    env: ambiente,
    stdio: 'inherit',
  });
  processos.add(processo);
  processo.on('error', erro => {
    console.error(`[dev] Não foi possível iniciar ${nome}: ${erro.message}`);
    encerrar(1);
  });
  processo.on('exit', (codigo, sinal) => {
    processos.delete(processo);
    if (encerrando) {
      if (processos.size === 0) process.exit(process.exitCode ?? 0);
      return;
    }
    console.error(`[dev] ${nome} encerrou (${sinal ?? codigo ?? 'sem código'}).`);
    encerrar(codigo && codigo !== 0 ? codigo : 1);
  });
  return processo;
}

function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  process.exitCode = codigo;
  for (const processo of processos) {
    if (processo.exitCode === null) processo.kill('SIGTERM');
  }
}

async function apiDisponivel() {
  try {
    const resposta = await fetch(apiSaude, { signal: AbortSignal.timeout(1000) });
    return resposta.ok;
  } catch {
    return false;
  }
}

async function aguardarApi(processoApi) {
  const prazo = Date.now() + 60_000;
  while (Date.now() < prazo && !encerrando) {
    if (processoApi?.exitCode !== null && processoApi?.exitCode !== undefined)
      throw new Error('A API encerrou antes de ficar disponível.');
    if (await apiDisponivel()) return;
    await aguardar(300);
  }
  throw new Error(`A API não respondeu em ${apiSaude.origin}/api/health após 60 segundos.`);
}

process.on('SIGINT', () => encerrar(130));
process.on('SIGTERM', () => encerrar(143));

try {
  let processoApi = null;
  if (await apiDisponivel()) {
    console.info(`[dev] API já disponível em ${apiSaude.origin}; vou reutilizá-la.`);
  } else {
    const diretorioApi = resolve(raiz, 'apps/api');
    processoApi = iniciarProcesso('API',
      resolve(diretorioApi, 'node_modules/tsx/dist/cli.mjs'),
      ['watch', 'src/server.ts'], diretorioApi,
      { ...process.env, PORT: apiPorta });
  }

  await aguardarApi(processoApi);
  if (encerrando) process.exitCode ??= 130;
  else {
    console.info(`[dev] API pronta em ${apiSaude.origin}; iniciando frontend.`);
    const diretorioWeb = resolve(raiz, 'apps/web');
    iniciarProcesso('Frontend',
      resolve(diretorioWeb, 'node_modules/next/dist/bin/next'),
      ['dev', '-p', '3000'], diretorioWeb,
      { ...process.env, API_INTERNAL_URL: apiBase });
  }
} catch (erro) {
  console.error(`[dev] ${erro instanceof Error ? erro.message : String(erro)}`);
  encerrar(1);
}
