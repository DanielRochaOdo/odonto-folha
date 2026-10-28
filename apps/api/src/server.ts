import { serve } from '@hono/node-server';
import { carregarAmbienteLocal } from './config/carregar-ambiente-local';

/** Entrada exclusiva para desenvolvimento local; Vercel usa o export default. */
carregarAmbienteLocal();
const { default: app } = await import('./index');
const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  const modo = process.env.ODONTOFOLHA_API_REAL === 'ativada' ? 'autenticada' : 'técnica';
  console.info(`API ${modo} disponível na porta`, info.port);
});
