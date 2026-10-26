# Desenvolvimento local — OdontoFolha

## Pré-requisitos

Node.js 24 e pnpm 10. Execute na raiz do monorepo:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

O comando inicia a API e a interface. Acesse http://localhost:3000; o health
check da API fica em http://localhost:3001/api/health.

## Variáveis privadas

O arquivo `.env.example` é apenas um modelo. Nunca envie ao GitHub arquivos
com credenciais. O servidor local da API carrega automaticamente `apps/api/.env`
ou o `.env` na raiz do repositório, priorizando variáveis já definidas no
processo. A API valida o conjunto abaixo se qualquer variável de integração
estiver presente:

```dotenv
DATABASE_URL=postgresql://usuario:senha@host/banco?sslmode=require
BETTER_AUTH_SECRET=gere-um-segredo-aleatorio-com-no-minimo-32-caracteres
BETTER_AUTH_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
```

`DIRECT_URL` destina-se exclusivamente às migrações administrativas e não é
necessária no processo HTTP da API. Para migrações, use os arquivos locais
`.env.migration.development` e `.env.migration.production`, cada um com o
`DIRECT_URL` direto da branch Neon correspondente, sem pooler. Esses arquivos
são ignorados pelo Git.

Na raiz do monorepo, os comandos abaixo aplicam migrations do Drizzle e Better
Auth em apenas um ambiente por vez:

```bash
pnpm db:migrate:dev
pnpm db:migrate:prod
```

Use um comando por vez. O comando de produção exige digitar `PRODUCAO` no
terminal. Antes de executar, revise o SQL e confirme que o arquivo de conexão
aponta para a branch pretendida no Neon. Rodar um comando não aplica migrations
no outro banco.

## Git Bash com conflito de pnpm

Se o NVM interceptar o pnpm com o erro `Node.js v24.x.x is not installed`,
utilize na sessão atual:

```bash
alias pnpm='"/c/Users/daniel.rocha/AppData/Roaming/npm/pnpm"'
```

O caminho acima é específico do computador atual e não deve ser tratado como
configuração universal.
