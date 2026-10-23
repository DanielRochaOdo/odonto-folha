# Preparação de deploy na Vercel

## Topologia proposta

Topologia selecionada: um projeto Vercel com dois Services:

| Serviço | Raiz | Framework | Acesso público proposto |
| --- | --- | --- | --- |
| `web` | `apps/web` | Next.js | Público em `/*` |
| `api` | `apps/api` | Hono | Público em `/api/*` |

O roteamento está declarado no `vercel.json` da raiz. A regra `/api/*` vem antes
do catch-all da Web. A Vercel preserva o caminho original, e a API já usa o
prefixo `/api`. As chamadas do navegador usam caminhos relativos `/api/...`.
Não foi encontrado fluxo servidor-servidor entre Web e API, portanto não há
binding de serviço nesta proposta. `API_INTERNAL_URL` fica restrita ao proxy de
desenvolvimento local do Next.js.

Services está em Private Beta e depende de acesso concedido pela Vercel. A tela
de importação enviada pelo proprietário mostrava `Services` como opção, o que
sugere disponibilidade. A conexão da Vercel confirma a equipe, mas não expõe o
entitlement do Beta; também não há projeto OdontoFolha criado nessa equipe.
Portanto, o acesso ainda precisa ser confirmado ao selecionar Services na tela
de importação. Esta preparação não cria nem vincula projeto, não pede acesso ao
Beta, não configura variáveis e não publica deploy.

## Build e runtime

Cada serviço tem `root` e `framework` definidos na configuração raiz. Os
comandos de instalação e build ficam sob detecção automática. O Hono é exportado
por padrão em `apps/api/src/index.ts`; `apps/api/src/server.ts` é usado no
desenvolvimento local. Os apps fixam Node.js `24.x`.

## Variáveis e banco

Consulte [ENV.md](ENV.md). A API continua inativa para rotas de negócio até que
`ODONTOFOLHA_API_REAL=ativada` seja configurada com as variáveis necessárias.
Não executar migrations ou seeds ao iniciar. `DIRECT_URL` é exclusiva de
operações administrativas autorizadas.

Como o projeto Services usa um único escopo de ambiente, tratar variáveis de
projeto como potencialmente disponíveis aos builds e runtimes de ambos os
serviços. A aplicação Web não deve ler nem expor secrets; nunca usar prefixo
`NEXT_PUBLIC_` em credenciais.

## Validação e ativação

1. Na tela de importação, verificar que Services pode ser selecionado. Se não
   estiver disponível, solicitar acesso à Vercel antes de continuar.
2. Vincular o repositório como um único projeto com Services e revisar as
   variáveis por ambiente antes de qualquer deploy.
3. Validar o build dos dois serviços e o roteamento `/api/*` no Preview.
4. Antes de ativar rotas de negócio, revisar migrations e obter autorização
   específica para o banco de destino e provisionamento da conta inicial.
5. Não usar banco de produção em Preview. Nenhum deploy ou migration foi
   realizado por esta preparação.

## Documentação da Vercel

- [Services](https://vercel.com/docs/services)
- [Roteamento dos Services](https://vercel.com/docs/services/routing)
- [Bindings de serviço](https://vercel.com/docs/services/bindings)
- [Configuração dos Services](https://vercel.com/docs/services/config-reference)
