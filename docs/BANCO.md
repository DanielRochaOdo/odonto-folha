# Banco de dados — proposta inicial (sem execução)

O arquivo `packages/database/propostas/001_dominio.sql` é uma **proposta de
modelo relacional para revisão**, não uma migração aprovada ou executada.

## Limites e decisões

- Não há conexão aberta com o Neon, alteração de banco ou criação de usuários.
- A autenticação Better Auth terá tabelas próprias conforme a versão e o adaptador
  oficial escolhidos; não criar tabelas de sessão artesanalmente.
- Usar Drizzle ORM e migrations versionadas após instalar dependências e atualizar
  o lockfile, testando primeiro em banco isolado ou mediante aprovação explícita
  para execução no banco destinado à produção.
- O modelo atual cobre as entidades centrais, mas ainda precisa de refinamento:
  vigência e snapshot por competência, regras de valores recorrentes e exceções,
  unicidade de vínculos com competência nula, classificação por origem, transições
  de comissões, exclusão lógica e autorização transacional.
- **Não executar este SQL diretamente**: ainda não representa integralmente E0.1–E0.68.
- `BETTER_AUTH_SECRET` e URLs Neon devem permanecer fora do GitHub.
- A senha inicial ADMIN nunca será armazenada em texto puro ou incluída em seed.

## Próxima implementação

1. Instalar Drizzle, driver PostgreSQL e Better Auth com versões fixadas e lockfile
   consistente.
2. Criar schema tipado e migrações revisadas; integrar carregamento explícito do
   ambiente local e conexão sob demanda, sem tocar no banco ao iniciar testes.
3. Configurar Better Auth no Hono, cookies/origens confiáveis e permissões por rota.
4. Criar tela real de login e fluxo seguro de provisionamento ADMIN.
