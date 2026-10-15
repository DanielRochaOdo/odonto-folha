import { serve } from '@hono/node-server';
import app from './index';

/** Entrada exclusiva para desenvolvimento local; Vercel usa o export default. */
const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.info('API técnica disponível na porta', info.port);
});
