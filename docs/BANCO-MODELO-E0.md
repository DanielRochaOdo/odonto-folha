# Modelo relacional completo para revisão — NÃO EXECUTAR

`packages/database/propostas/002_modelo_e0.sql` detalha o domínio exigido em
`docs/PRD.md` para PostgreSQL, sem executar comandos no Neon.

## Cobertura da proposta

- Identidade de pessoa/CPF distinta do vínculo empregatício, permitindo recontratação.
- Fotografia por competência dos oito campos fixos e das colunas dinâmicas
  (ordenação global e não retroatividade).
- Vínculos lógicos por competência com preservação de lançamentos.
- Células com controle de versão, valores diretos/parcelas e histórico.
- Bases de benefícios por competência e exceções exclusivamente mensais.
- Comissão com responsável ADM/CENTRAL e conclusão individual por grupo.
- Perfis, escopo de empresas e auditoria transacional.

## Ainda precisa de revisão antes de migração

1. Escolher e instalar o driver PostgreSQL, Drizzle ORM/Kit e Better Auth mantendo
   o lockfile e a integração com os pacotes do monorepo; gerar tabelas oficiais
   do Better Auth com o adaptador compatível.
2. Validar DDL e invariantes com testes em banco **isolado**. Não executar no
   Neon destinado à produção sem autorização A2 expressa. Nenhum comando foi
   executado no banco pela criação deste arquivo.
3. Implementar operações Drizzle/SQL em transações com locks e compare-and-swap;
   impedir coexistência de parcelas e total **na transação**.
4. Implementar constraints condicionais de imutabilidade de histórico e
   atualização de campos apenas quando não houver valores, inclusive zero.
5. Implementar e verificar estratégia de backup, restauração e permissões do
   usuário do banco antes de qualquer dado real.

Este é o desenho de armazenamento; **não é migração aprovada, aplicada ou
indicativo de produto pronto para uso**.
