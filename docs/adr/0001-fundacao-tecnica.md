# ADR-0001 — Fundação técnica modular

- **Estado:** Proposto, aguardando revisão humana.
- **Data:** 15/10/2026.
- **Contexto:** sistema web interno de baixo tráfego inicial e alto cuidado com dados; um desenvolvedor, crescimento modular, Vercel/Neon, GitHub público.
- **Decisão candidata:** monorepo pnpm/Turborepo com Next.js e Hono em apps separados, TypeScript e contratos Zod, Drizzle como persistência futura, deploys Vercel independentes.
- **Alternativas:** Next.js full-stack único; NestJS para API; microsserviços.
- **Justificativa:** mantém fronteiras e implementações independentes com menos infraestrutura/complexidade do que serviços distribuídos.
- **Consequências:** integrar autenticação e sessões entre domínios, gerenciar duas aplicações e validar transações. Os módulos ainda não são executados em produção.
- **Reavaliar:** crescimento de equipes, cargas de trabalho incompatíveis com Functions ou necessidade confirmada de serviços independentes.
- **Aprovação:** pendente do proprietário no PR.
