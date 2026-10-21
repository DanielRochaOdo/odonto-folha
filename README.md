# OdontoFolha — Grupo Odontoart

Sistema web interno para reunir lançamentos mensais do DP, ADM e Central,
organizar benefícios e comissões configuráveis e exportar planilhas por empresa.

**Situação:** implementação iniciada em branch de desenvolvimento, após definição
funcional E0.1–E0.68. Ainda não há login funcional, banco provisionado ou ambiente
online pronto para testar; não utilizar com dados reais.

## Tecnologias existentes
- Next.js 16 e React em apps/web.
- API Hono em apps/api, frontend sem acesso direto a banco.
- Contratos Zod em packages/contracts; tipos de folha iniciados na A1.
- Persistência prevista em Neon PostgreSQL/Drizzle, autenticação Better Auth
  e hospedagem Vercel, a configurar somente com aprovação específica.

## Desenvolvimento local

Requisitos: Node.js 24, pnpm 10.

~~~bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm check
~~~

Web: http://localhost:3000. Health da API: http://localhost:3001/api/health.
As regras puras de cálculo e autorização estão em apps/api/src/dominio,
com testes executados pelo pnpm check. Não existe rota de negócio desprotegida.

## Plano e segurança
- Especificação: docs/PRD.md
- Execução e critérios de aceite: docs/TASKS.md e docs/IMPLEMENTACAO.md
- Instruções obrigatórias: AGENTS.md e docs/RULES.md
- Arquitetura: docs/ARCHITECTURE.md

Repositório público: **não inserir credenciais, planilhas, CPF real, dados de RH,
segredos, logs sensíveis ou dumps.** Seeds de conta ADMIN e credenciais reais
devem ser geridos fora do Git. Nenhum agente faz merge direto na main ou deploy
sem aprovação humana.
