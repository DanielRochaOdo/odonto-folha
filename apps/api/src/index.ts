import { Hono } from 'hono';
import { healthSchema } from '@odontofolha/contracts';
import { validarAmbiente } from './config/ambiente';
import { criarAplicacaoAutenticada } from './identidade/criar-api';

/**
 * Um único artefato de implantação. As rotas de negócio permanecem fechadas
 * até a ativação explícita após a revisão das migrations e provisionamento.
 */
const tecnico = new Hono().basePath('/api');
tecnico.get('/health', c => {
  c.header('Cache-Control', 'no-store');
  return c.json(healthSchema.parse({ status: 'ok', service: 'api' }));
});

const app = process.env.ODONTOFOLHA_API_REAL === 'ativada'
  ? criarAplicacaoAutenticada(validarAmbiente(process.env)).aplicacao
  : tecnico;

export default app;
export type Api = typeof app;
