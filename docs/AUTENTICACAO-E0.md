# Integração Better Auth + Drizzle — pendente de ativação

Foram fixadas dependências de Better Auth, Drizzle ORM/Kit e PostgreSQL.
A API possui fábrica de autenticação em apps/api/src/identidade/auth.ts
e fábrica da aplicação autenticada em apps/api/src/identidade/criar-api.ts.

**Atenção:** o servidor atual continua expondo somente o health check.
Nenhum código foi autorizado a executar migrações, queries ou seeds no Neon.
A fábrica não é inicializada automaticamente. Banco isolado e aprovação A2
são obrigatórios para ativar o acesso à persistência.

Ainda faltam o repositório Drizzle transacional, migrations aprovadas de
domínio e Better Auth, provisionamento privado da conta ADMIN (A4) e,
posteriormente, publicação na Vercel (A3).

O cadastro público por e-mail fica desabilitado. Não existem senha fixa,
credencial em seed, planilha real nem configuração privada no GitHub.
