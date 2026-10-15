import { Hono } from 'hono';
import { healthSchema } from '@odontofolha/contracts';

const app = new Hono().basePath('/api');

/** Endpoint público exclusivamente técnico; nunca incluir dados sensíveis. */
app.get('/health', (contexto) => {
  contexto.header('Cache-Control', 'no-store');
  return contexto.json(healthSchema.parse({ status: 'ok', service: 'api' }));
});

export default app;
export type Api = typeof app;
