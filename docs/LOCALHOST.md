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
com credenciais. Para execução local futura da integração, a API precisará de:

```dotenv
DATABASE_URL=postgresql://usuario:senha@host/banco?sslmode=require
BETTER_AUTH_SECRET=gere-um-segredo-aleatorio-com-no-minimo-32-caracteres
BETTER_AUTH_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
```

`DIRECT_URL` destina-se exclusivamente às migrações administrativas e não é
necessária no processo HTTP da API. O módulo `config/ambiente.ts` valida as
variáveis, mas **ainda não conecta Neon nem implementa autenticação**. O script
de desenvolvimento ainda precisa receber carregamento explícito do arquivo
de ambiente quando essa integração for ativada.

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
