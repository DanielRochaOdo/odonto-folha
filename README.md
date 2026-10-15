# OdontoFolha

Base técnica do sistema corporativo do Grupo Odontoart. **Este repositório ainda não implementa regras de folha salarial nem está pronto para produção.**

## Arquitetura

- `apps/web`: Next.js 16, React e interface web desktop-first.
- `apps/api`: API Hono, com contratos versionados e sem acesso direto do frontend ao banco.
- `packages/contracts`: esquemas públicos e validação com Zod.
- `packages/database`: fronteira reservada à persistência Neon PostgreSQL/Drizzle (a configurar em G2).
- `packages/ui`: futura biblioteca de componentes do design system.
- `packages/tsconfig`: configuração TypeScript compartilhada.

Veja [a arquitetura](docs/ARCHITECTURE.md), [as regras](docs/RULES.md), [a configuração local](docs/SETUP.md) e [o plano](docs/TASKS.md).

## Início rápido

Requer Node.js 24 e pnpm 10. **Não usar banco ou dados reais no desenvolvimento local.**

```bash
corepack enable
pnpm install
pnpm dev
```

Web em http://localhost:3000; API em http://localhost:3001/api/health.

```bash
pnpm check
```

**Importante:** o lockfile, as credenciais de Neon, autenticação, migrações, integração de deploy e a validação da API em Vercel ainda não foram concluídos. Não executar deploy ou operações em banco até cumprir os critérios G2. O fluxo de publicação exige PR e aprovação humana.

## Projeto GitHub público

Nunca publicar PII, holerites, planilhas de colaboradores, segredos, dumps ou arquivos `.env`. Exemplos e testes devem usar dados fictícios.
