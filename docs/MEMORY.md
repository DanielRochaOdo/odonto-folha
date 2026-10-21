# MEMORY — Estado verificável do projeto

**Data da revisão:** 21/10/2026.

## Decisões do proprietário
- Especificação funcional E0.1–E0.68 concluída em conversa; síntese em docs/PRD.md.
- Primeira entrega para validação deve ser aplicação online **completa**, integrada,
  protegida por login, acessível pelo navegador.
- Conta inicial ADMIN criada por provisionamento privado e seguro (nenhuma senha em arquivos).
- A1 autorizada: desenvolvimento em branch, documentação, código, testes e PR.
- A2 (infra/banco), A3 (hospedagem), A4 (provisionamento de login) e A5 (produção/dados
  reais) ainda exigem decisões/autorizações distintas.

## Situação técnica conhecida
- main no começo da A1: commit cc71769b5c83fce9c3e8add9dfad2068e4024385.
- Apps web e API Hono existentes; health check; contratos Zod; CI pnpm check.
- A1 inicia modelagem tipada, consolidação aritmética pura e testes;
  **não significa autenticação, banco ou aplicativo ponta a ponta pronto**.

## Engenharia
Respeitar AGENTS.md e docs/RULES.md. PRs para revisão humana, sem acesso a
segredos, planilhas reais ou infraestrutura não autorizada.
A fonte de verdade de execução é o GitHub (código e histórico de PR/CI).
