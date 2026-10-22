# Desenvolvimento local — OdontoFolha

## Pré-requisitos

Node.js 24 e pnpm 10. Execute na raiz do monorepo:

```bash
pnpm install --frozen-lockfile
pnpm --filter @odontofolha/web dev
```

Em outro terminal:

```bash
pnpm --filter @odontofolha/api dev
```

A interface responde em http://localhost:3000 e o health check em
http://localhost:3001/api/health.

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
necessária no processo HTTP da API. O carregamento e a validação **ainda não
conectam o Neon nem implementam autenticação**. O health check continua
disponível quando não há variáveis de integração definidas.

## Banco destinado à produção

O proprietário optou por usar um único projeto Neon inicialmente. Não rodar
migrações, seeds ou testes destrutivos nesse banco sem autorização específica.
Usar dados fictícios nos testes automatizados.

## Git Bash com conflito de pnpm

Se o NVM interceptar o pnpm com o erro `Node.js v24.x.x is not installed`,
utilize na sessão atual:

```bash
alias pnpm='"/c/Users/daniel.rocha/AppData/Roaming/npm/pnpm"'
```

O caminho acima é específico do computador atual e não deve ser tratado como
configuração universal.
