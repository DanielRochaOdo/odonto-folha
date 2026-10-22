import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarAmbienteLocal } from './carregar-ambiente-local';

const chaves = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'WEB_ORIGIN'] as const;
const anteriores = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
const pastas: string[] = [];

afterEach(() => {
  for (const chave of chaves) {
    if (anteriores[chave] === undefined) delete process.env[chave];
    else process.env[chave] = anteriores[chave];
  }
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('carregamento do ambiente local', () => {
  it('mantém o health check disponível sem configuração do banco', () => {
    for (const chave of chaves) delete process.env[chave];
    const pasta = mkdtempSync(join(tmpdir(), 'odontofolha-env-'));
    pastas.push(pasta);
    const cwd = join(pasta, 'a', 'b');
    mkdirSync(cwd, { recursive: true });
    expect(() => carregarAmbienteLocal(cwd)).not.toThrow();
  });

  it('carrega o arquivo da raiz sem expor credenciais', () => {
    for (const chave of chaves) delete process.env[chave];
    const pasta = mkdtempSync(join(tmpdir(), 'odontofolha-env-'));
    pastas.push(pasta);
    const cwd = join(pasta, 'apps', 'api');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(pasta, '.env'), [
      'DATABASE_URL=postgresql://usuario:senha@exemplo.neon.tech/banco',
      'BETTER_AUTH_SECRET=segredo-aleatorio-de-teste-com-32-caracteres',
      'BETTER_AUTH_URL=http://localhost:3001',
      'WEB_ORIGIN=http://localhost:3000',
    ].join('\n'));
    expect(() => carregarAmbienteLocal(cwd)).not.toThrow();
    expect(process.env.WEB_ORIGIN).toBe('http://localhost:3000');
  });

  it('recusa configuração parcial sem incluir segredo na mensagem', () => {
    for (const chave of chaves) delete process.env[chave];
    process.env.DATABASE_URL = 'postgresql://usuario:senha-privada@exemplo.neon.tech/banco';
    const pasta = mkdtempSync(join(tmpdir(), 'odontofolha-env-'));
    pastas.push(pasta);
    const cwd = join(pasta, 'apps', 'api');
    mkdirSync(cwd, { recursive: true });
    expect(() => carregarAmbienteLocal(cwd)).toThrow(/BETTER_AUTH_SECRET/);
    try { carregarAmbienteLocal(cwd); } catch (erro) {
      expect(String(erro)).not.toContain('senha-privada');
    }
  });
});
