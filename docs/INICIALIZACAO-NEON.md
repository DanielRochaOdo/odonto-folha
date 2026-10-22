# Inicialização do Neon de produção — OdontoFolha em localhost

A versão local usará o banco Neon na branch production. Não haverá Vercel
nem uma segunda base de homologação. **Os comandos de migração escrevem em
produção.** Devem ser executados apenas depois da revisão dos SQLs e do backup.

## Pré-requisitos

- Node.js 24, pnpm 10.18.0, Git Bash no Windows.
- Um snapshot manual foi criado no Neon production em 22/10/2026 antes do esquema.
- Arquivo .env na raiz com DATABASE_URL (pooler), DIRECT_URL (conexão direta),
  BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:3001
  e WEB_ORIGIN=http://localhost:3000.
- A URL direta é obtida no painel Neon com pooling DESABILITADO.
- Não divulgar URLs, senhas ou conteúdo do .env.

## 1. Código e checagem das variáveis

No Git Bash, na raiz do projeto:

~~~bash
pnpm install --frozen-lockfile
node --env-file=.env -e 'for(const v of ["DATABASE_URL","DIRECT_URL","BETTER_AUTH_SECRET","BETTER_AUTH_URL","WEB_ORIGIN"]){if(!process.env[v])throw Error("Falta "+v)} console.log("Configuração presente (segredos ocultos)")'
~~~

## 2. Gerar e revisar SQLs sem gravar o esquema

~~~bash
pnpm --filter @odontofolha/database exec drizzle-kit generate --config drizzle.generate.config.ts

mkdir -p apps/api/migrations
pnpm dlx auth@1.7.7 generate --yes --config apps/api/auth.config.ts --output apps/api/migrations/0000_auth.sql
~~~

O Drizzle gera arquivos em packages/database/drizzle; o Better Auth gera
o SQL indicado. Better Auth pode consultar metadados do banco, mas generate
não executa CREATE TABLE. Os arquivos gerados precisam ser versionados e
revisados contra packages/database/src/schema.ts antes do passo seguinte.
Não utilizar drizzle-kit push no banco definitivo.

## 3. Aplicar migrations após revisão e backup

**Os próximos dois comandos ALTERAM o Neon production:**

~~~bash
pnpm --filter @odontofolha/database exec drizzle-kit migrate --config drizzle.migrate.config.ts

pnpm dlx auth@1.7.7 migrate --config apps/api/auth.config.ts
~~~

Ambos usam DIRECT_URL (sem pooler), nunca a URL pública da interface.
O segundo cria as tabelas necessárias à autenticação: user, session,
account e verification. O primeiro cria as tabelas do domínio OdontoFolha.

## 4. Provisionar a primeira conta ADMIN

Após concluir AMBAS as migrations, executar na raiz do Git Bash:

~~~bash
read -rsp 'Senha inicial ADMIN (oculta, 12+ caracteres): ' ODONTOFOLHA_ADMIN_PASSWORD
echo
export ODONTOFOLHA_ADMIN_PASSWORD
pnpm --filter @odontofolha/api exec node --env-file="$(pwd)/.env" --import tsx scripts/criar-admin.ts daniel.rocha@odontoart.com
unset ODONTOFOLHA_ADMIN_PASSWORD
~~~

O script usa Better Auth para criar uma conta com a senha hasheada e depois
registra o perfil ADMIN ativo no domínio. Para se proteger contra criação
indevida, ele recusa operação se já existir ADMIN ou se o e-mail já existir.
Não inserir senha em comando, GitHub ou .env. Cadastro público permanece
desabilitado no servidor habitual.

## 5. Abrir o sistema em localhost

Parar a API anterior com Ctrl+C. Depois:

~~~bash
ODONTOFOLHA_API_REAL=ativada pnpm --filter @odontofolha/api exec node --env-file="$(pwd)/.env" --import tsx src/server.ts
~~~

Em outro terminal Git Bash:

~~~bash
pnpm --filter @odontofolha/web dev
~~~

Abrir http://localhost:3000 e entrar com o e-mail ADMIN e a nova senha.
A página de saúde da API é http://localhost:3001/api/health.

## Controles finais

Não importar funcionários reais antes do aceite, conferir a integridade do
backup e validar sessão, autorização por perfil, fórmulas e exportação XLSX.
O uso local da aplicação não isola os dados gravados no banco de produção.
Revisar docs/RULES.md e docs/ADR/0001-destino-unico-producao.md.
