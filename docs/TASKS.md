# TASKS — Implementação integral do OdontoFolha

Fonte funcional: docs/PRD.md (E0.1–E0.68). Cada item só será marcado concluído após
código e validação correspondentes; escopo da primeira entrega é ponta a ponta.

## G1 — Fundação (existente, conferir CI)
- [x] Monorepo Next.js / Hono / TypeScript, contratos, CI e health check em main.
- [x] Lockfile presente em main (verificado em 21/10/2026).
- [ ] Executar pnpm check e confirmar resultado no CI de um PR atualizado.

## A1 — Desenvolvimento autorizado (sem infra/deploy)
- [x] Criar branch isolada de implementação.
- [x] Consolidar especificação E0.1–E0.68 em PRD e plano de execução.
- [x] Iniciar contratos tipados e testes de lógica pura de consolidação/permissões.
- [ ] Confirmar CI verde deste PR; revisar e obter aprovação humana antes de merge.
- [ ] Criar componentes de UI reutilizáveis para campos dinâmicos, tabelas e edições.
- [ ] Implementar os casos de uso e endpoints autenticados após identidade pronta.
- [ ] Implementar lógica de versões/vigência dos campos e benefícios com testes.

## G2 — Segurança e banco (depende de autorização A2)
- [ ] Verificar recursos/limites/custos existentes antes de provisionar.
- [ ] Banco Neon de homologação isolado; Drizzle e migrações versionadas.
- [ ] Transações/rollback, relacionamentos, integridade e snapshots por competência.
- [ ] Better Auth, sessão, recuperação e criação segura da conta ADMIN inicial.
- [ ] Autorização em cada endpoint, auditoria e proteção de escopo.

## G3 — Interface e cadastros
- [ ] Design responsivo desktop-first, identidade Odontoart e acessibilidade.
- [ ] Empresas, unidades, setores, colaboradores, vínculos e usuários por perfil.
- [ ] Gestão de status dos funcionários e mudanças por competência.
- [ ] Tela inicial de competências, cards e filtros.

## G4 — Benefícios e comissões
- [ ] Criar grupos/campos monetário, porcentagem, data e horário; ordenação global.
- [ ] Vincular em massa/individual, ativar/desativar e preservar histórico.
- [ ] Base de benefício recorrente, exceção de mês, reajuste e confirmação.
- [ ] Comissões com responsáveis, lançamentos parcelados/diretos e sincronização.
- [ ] Envio concluído por comissão, bloqueio para setor, reabertura e avisos.

## G5 — Consolidação e Excel
- [ ] Tabela dinâmica da competência com lápis por registro e edição autosalva.
- [ ] Pendência vs zero vs não aplicável; totais aritméticos e avisos parciais.
- [ ] Exportar XLSX com uma aba por contratante, cores, fórmulas e ordem global.
- [ ] Auditar alterações, salvar erros e testar concorrência e históricos.

## G6 — Homologação online (depende de autorizações A2 e A3)
- [ ] Configurar Vercel web/API em ambiente de testes e variáveis privadas.
- [ ] Validar login real, cookies, rotas, políticas e ausência de dados reais.
- [ ] Testes E2E: ADMIN → cadastro → benefícios → comissões → ADM/Central →
      competência → edição DP → exportação.
- [ ] Demonstração ao proprietário para validação módulo por módulo.
- [ ] Solicitar autorização separada antes de dados reais ou produção.

## Restrições permanentes
Sem push direto na main, sem credenciais/PII no GitHub, sem deploy automático,
sem banco ou custos novos sem autorização, sem alegar testes não realizados,
sem calcular encargos ou salário líquido oficial.
