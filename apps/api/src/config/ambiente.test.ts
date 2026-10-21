import { describe, expect, it } from 'vitest';
import { validarAmbiente } from './ambiente';

const valido = {
  DATABASE_URL: 'postgresql://usuario:senha@exemplo.neon.tech/banco?sslmode=require',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('configuração privada da API', () => {
  it('aceita configuração local válida', () => {
    expect(validarAmbiente(valido).WEB_ORIGIN).toBe('http://localhost:3000');
  });

  it('rejeita segredo curto sem imprimir credenciais', () => {
    expect(() => validarAmbiente({ ...valido, BETTER_AUTH_SECRET: 'curto' }))
      .toThrow('BETTER_AUTH_SECRET');
  });

  it('rejeita conexão não PostgreSQL', () => {
    expect(() => validarAmbiente({ ...valido, DATABASE_URL: 'https://exemplo.com' }))
      .toThrow('DATABASE_URL');
  });

  it('rejeita caminho de autenticação na URL-base', () => {
    expect(() => validarAmbiente({ ...valido, BETTER_AUTH_URL: 'http://localhost:3001/api/auth' }))
      .toThrow('BETTER_AUTH_URL');
  });

  it('não revela a senha da URL em mensagens de erro', () => {
    const senha = 'senha-privada-de-teste';
    expect(() => validarAmbiente({
      ...valido,
      DATABASE_URL: `postgresql://usuario:${senha}@exemplo.neon.tech/banco`,
      WEB_ORIGIN: 'valor-invalido',
    })).toThrow(/WEB_ORIGIN/);
    try {
      validarAmbiente({ ...valido, DATABASE_URL: `postgresql://usuario:${senha}@exemplo.neon.tech/banco`, WEB_ORIGIN: 'valor-invalido' });
    } catch (erro) {
      expect(String(erro)).not.toContain(senha);
    }
  });
});
