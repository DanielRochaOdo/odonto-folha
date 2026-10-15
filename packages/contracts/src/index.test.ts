import { describe, expect, it } from 'vitest';
import { healthSchema } from './index';

describe('contrato de integridade', () => {
  it('aceita a resposta técnica esperada', () => {
    expect(healthSchema.parse({ status: 'ok', service: 'api' })).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('rejeita respostas fora do contrato', () => {
    expect(() => healthSchema.parse({ status: 'ok', service: 'web' })).toThrow();
  });
});
