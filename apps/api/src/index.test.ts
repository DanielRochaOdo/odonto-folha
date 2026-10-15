import { describe, expect, it } from 'vitest';
import { healthSchema } from '@odontofolha/contracts';
import app from './index';

describe('GET /api/health', () => {
  it('retorna 200 e um corpo compatível com o contrato', async () => {
    const resposta = await app.request('/api/health');
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(healthSchema.parse(await resposta.json())).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('não apresenta endpoints de negócio no scaffold', async () => {
    const resposta = await app.request('/api/funcionarios');
    expect(resposta.status).toBe(404);
  });
});
