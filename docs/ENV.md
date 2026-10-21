# Configuração das variáveis de ambiente — OdontoFolha

**Situação em 21/10/2026:** configuração planejada, ainda NÃO conectada nem implantada.
O proprietário optou por criar inicialmente um projeto Neon de produção; não autorizou
a criação de banco de homologação neste momento. Isso não autoriza migrações em produção,
uso de dados reais em testes nem publicação online.

## apps/api — Vercel do backend Hono

| Variável | Conteúdo | Observação |
| --- | --- | --- |
| DATABASE_URL | URL PostgreSQL **pooled** obtida no Neon / Connect | Segredo; apenas servidor; não usar NEXT_PUBLIC_ |
| DIRECT_URL | URL PostgreSQL **direct** do mesmo banco | Apenas migração administrativa; não necessária como variável runtime da API |
| BETTER_AUTH_SECRET | Segredo aleatório com no mínimo 32 caracteres | Gerar com `openssl rand -base64 32` fora do Git |
| BETTER_AUTH_URL | Origem pública canônica da API (ex.: https://api.exemplo.com) | Backend autenticará sob /api/auth; a rota ainda não existe |
| WEB_ORIGIN | Origem pública canônica da Web (ex.: https://folha.exemplo.com) | Para CORS/origens confiáveis; implementar antes do login |

## apps/web — Vercel do frontend Next.js

| Variável | Conteúdo | Observação |
| --- | --- | --- |
| API_INTERNAL_URL | URL HTTPS da API Hono | Endereço servidor-servidor ou destino de rewrite; roteamento ainda não implementado |

Não incluir DATABASE_URL, DIRECT_URL ou BETTER_AUTH_SECRET em apps/web;
não criar NEXT_PUBLIC_ para segredos. No navegador, preferir chamadas de mesma origem
por proxy /api quando o roteamento estiver validado, para evitar complexidade de cookies.

## Onde obter a URL Neon
1. Acesse o projeto Neon e clique em **Connect**.
2. Confira projeto, branch principal, banco e role correspondente.
3. Copie **pooled connection** para DATABASE_URL: host com `-pooler`.
4. Desative Connection pooling e copie a conexão **direct** somente para migrations.
5. Preserve `sslmode=require` e parâmetros de segurança fornecidos pelo Neon.
6. NÃO cole URLs reais em chat, PR ou arquivo versionado, pois elas contêm senha.

## Configuração na Vercel
Quando A3 autorizar vinculação/publicação, criar DOIS projetos Vercel, um para
`apps/web` e outro para `apps/api`, respeitando root directories.
Configurar Environment Variables com alvo `Production` no projeto certo.
Se posteriormente houver Preview/Development, não apontar esses ambientes ao
banco de produção; configurar branch Neon isolada antes.

Os valores de `BETTER_AUTH_URL`, `WEB_ORIGIN` e `API_INTERNAL_URL` só
serão definitivos quando a Vercel fornecer os domínios de ambos os apps.
Não usar senha fixa de ADMIN em .env. A conta será provisionada por mecanismo
seguro com hash, não seed com senha em texto puro.

**Nota:** caso tenha sido habilitado o serviço gerenciado de Neon Auth durante
a criação do projeto, escolher e integrar um único provedor de autenticação,
evitando duas autenticações paralelas. A arquitetura atual propõe Better Auth
no backend Hono; Neon Auth demanda integração diferente e não está implementado.

## Desenvolvimento local
Não conectar o ambiente local ao Neon de produção. Se um dia houver
`apps/api/.env.local`, o script atual `tsx watch src/server.ts` ainda não
garante o carregamento automático desse arquivo: implementar carregamento explícito
ou uso de variáveis do processo antes de tentar iniciar API com segredos locais.
Next.js carrega `apps/web/.env.local`, mas esse arquivo também deve permanecer fora
do Git. O repositório já ignora `.env` e `.env.*`, exceto `.env.example`.

## Fase atual
Somente declaração de variáveis e documentação. Banco, transações, migrações,
autenticação, CORS, rewrite, deploy e provisionamento inicial ainda estão pendentes.
