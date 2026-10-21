import { z } from 'zod';
export { z } from 'zod';

/** Endpoint técnico público; contratos de negócio são reexportados separadamente. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type HealthResponse = z.infer<typeof healthSchema>;
export * from './folha';
