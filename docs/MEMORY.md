# MEMORY — Estado verificável do projeto

**Data da revisão:** 23/10/2026.

## Decisões do proprietário
- Especificação funcional E0.1–E0.68 concluída em conversa; síntese em docs/PRD.md.
- Primeira entrega para validação deve ser aplicação online **completa**, integrada,
  protegida por login, acessível pelo navegador.
- Conta inicial ADMIN criada por provisionamento privado e seguro (nenhuma senha em arquivos).
- Em 23/10/2026, o proprietário escolheu Heroicons como biblioteca padrão de ícones do sistema; documentado em `docs/DESIGN.md`.
- Em 23/10/2026, o proprietário definiu Sora como tipografia global do sistema; documentado em `docs/DESIGN.md`.
- Em 23/10/2026, o proprietário aprovou testar o Glassmorphism UI Standard v1.0 gradualmente, começando pelo login e preservando a identidade Odontoart; regras registradas em `docs/DESIGN.md`.
- Em 23/10/2026, o proprietário aprovou avançar a aplicação gradual do Glassmorphism para o módulo Competências após o login.
- Em 23/10/2026, o proprietário aprovou avançar a aplicação gradual do Glassmorphism para Cadastros após Competências.
- Em 23/10/2026, o proprietário pediu alinhamento visual com Reflect; evitar glows fortes, neon e sombras pesadas, mantendo superfícies calmas e a paleta Odontoart.
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

## Interface
- `apps/web` usa `@heroicons/react`, com componentes da variante Outline para os ícones da navegação e ações já migradas.
