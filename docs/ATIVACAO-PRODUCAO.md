# Entrada de produção — ativação controlada

O mesmo artefato da API aceita duas situações:

- `ODONTOFOLHA_API_REAL` ausente: somente `/api/health` funciona. A API
  **não consulta** o banco, não cria tabelas ou usuários e não monta
  endpoints de negócio.
- `ODONTOFOLHA_API_REAL=ativada`: carrega `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` e `WEB_ORIGIN`, monta
  `/api/auth/*`, `/api/sessao` e as rotas operacionais com repositório
  Drizzle transacional.

Esta flag **não deve ser ativada antes** da revisão e execução autorizada
das migrações, backup verificado, perfil ADMIN provisionado com segurança e
verificação de permissões. Não existe migração/seed automática no boot.

O Next.js encaminha `/api/*` para a API por `API_INTERNAL_URL`.
No desenvolvimento, aponta por padrão para `http://localhost:3001`;
na Vercel exige variável própria. URLs de conexão e credenciais
continuam exclusivas do servidor.

O proprietário optou por não criar homologação separada, e deseja testar
manualmente apenas no lançamento. **Testes automáticos isolados, revisão de
migrations e verificações de segurança continuam exigidos pelas regras
do repositório**. Nenhum dado real deve ser usado nesses testes.
