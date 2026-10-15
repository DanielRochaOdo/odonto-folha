import { z } from 'zod';

/** Único contrato técnico exposto em G1. Não contém dados de negócio. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type HealthResponse = z.infer<typeof healthSchema>;
