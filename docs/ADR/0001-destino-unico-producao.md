# ADR-0001 — Destino único de produção e validação no lançamento

**Data:** 22/10/2026  
**Situação:** decisão de preferência do proprietário registrada; procedimentos de
migração e publicação ainda dependem de autorizações específicas A2/A3/A4/A5.

## Contexto

O proprietário informou: trabalhar direcionado à produção, sem criar um
ambiente adicional de homologação e sem sessões de testes manuais antes do
lançamento. Esta preferência substitui a estratégia anterior de demonstração
com banco isolado, mas **não revoga automaticamente** as demais diretrizes
de segurança de `AGENTS.md`, `docs/RULES.md` e `docs/PRD.md`.

## Decisão de desenvolvimento

1. Prosseguir com código, telas e API na branch de implementação; revisão
   humana em Pull Request, sem publicação automática.
2. Utilizar o projeto Neon escolhido apenas como destino futuro do
   lançamento; **não conectar CI ou desenvolvimento ao banco de produção**.
3. Não exigir testes manuais do proprietário durante a implementação.
   Manter `pnpm check` e testes automatizados com dados sintéticos, executados
   sem acessar serviços remotos e sem custo de banco de produção.
4. Preparar esquema e migrações versionadas e revisadas. Só executar DDL,
   criação de conta ADMIN ou ativação de serviços após aprovação específica
   do procedimento concreto e verificação das condições de recuperação.
5. Na implantação, ativar inicialmente sem registros reais de funcionários.
   Conferir sessão, perfis, fórmulas e armazenamento em janela controlada
   de lançamento, com plano para interromper e restaurar se necessário.

## Riscos e contramedidas

- **Sem homologação separada:** defeitos de integração só poderão surgir
  no destino de produção. Reduzir risco com testes isolados, revisão de schema,
  migrações transacionais/não destrutivas e ativação controlada.
- **Primeira migração no banco definitivo:** exigir DDL revisado, backup,
  confirmação da capacidade de restaurar e ponto de retorno documentado.
- **Falha em login ou permissões:** não disponibilizar qualquer funcionalidade
  com dados reais antes de verificar sessão ADMIN, acesso DP e isolamento
  ADM/CENTRAL no momento do lançamento.
- **Falha nos totais ou XLSX:** preservar todos os históricos, testar fórmulas
  com dados sintéticos em CI e permitir desativar o acesso à funcionalidade.

## Alternativa não adotada neste momento

Branch Neon isolada para homologação, que oferece menor risco de lançamento,
mas não foi escolhida pelo proprietário.

## Limites da autorização

A escolha do ambiente de destino não é autorização irrestrita para:
executar SQL no banco definitivo, eliminar dados, provisionar login,
publicar na Vercel, conectar planilhas reais ou habilitar A5. Cada uma dessas
operações exige aprovação concreta antes de sua execução.

**Fonte funcional:** `docs/PRD.md` (decisões E0.1–E0.68).
