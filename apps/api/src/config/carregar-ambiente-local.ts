import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { validarAmbiente } from './ambiente';

/**
 * Apenas para o servidor local. Em hospedagem, as variáveis são fornecidas
 * pelo ambiente do processo. Nunca registrar valores ou URLs com senha.
 *
 * Prioridade: variáveis já definidas no processo > apps/api/.env > .env da raiz.
 */
export function carregarAmbienteLocal(diretorioAtual = process.cwd()): void {
  const arquivos = [
    resolve(diretorioAtual, '.env'),
    resolve(diretorioAtual, '../../.env'),
  ];
  for (const arquivo of arquivos) {
    if (existsSync(arquivo)) {
      loadEnvFile(arquivo);
      break;
    }
  }

  // O health check continua utilizável sem banco configurado. Caso qualquer
  // variável de integração esteja presente, exigir o conjunto completo.
  const chaves = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'WEB_ORIGIN'] as const;
  if (chaves.some((chave) => process.env[chave] !== undefined)) {
    validarAmbiente(process.env);
  }
}
