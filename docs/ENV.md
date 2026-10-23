# Variáveis de ambiente — OdontoFolha

As variáveis de produção ainda não foram configuradas na Vercel. Em Services,
os serviços pertencem ao mesmo projeto e compartilham seu escopo de variáveis.
Considere cada variável de projeto disponível aos builds e runtimes de ambos.

## API Hono

| Variável | Conteúdo | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL pooled do Neon | Runtime da API; nunca usar `NEXT_PUBLIC_` |
| `BETTER_AUTH_SECRET` | Segredo aleatório de ao menos 32 caracteres | Runtime de autenticação |
| `BETTER_AUTH_URL` | Origem HTTPS pública do projeto, sem caminho | Better Auth; rotas em `/api/auth/*` |
| `WEB_ORIGIN` | Origem HTTPS pública do projeto, sem barra final | Origem confiável do Better Auth |
| `ODONTOFOLHA_API_REAL` | Valor exato `ativada` | Opcional; habilita autenticação e rotas de negócio |

Na topologia de um domínio, `BETTER_AUTH_URL` e `WEB_ORIGIN` devem apontar para
a mesma origem pública, por exemplo `https://odonto-folha.vercel.app`.
`DIRECT_URL` é somente para tarefas administrativas de migration; não a
configure no runtime. O processo da aplicação não executa migrations nem seeds.

## Web Next.js

Não precisa de URL de API na Vercel: as chamadas relativas `/api/...` são
encaminhadas pelo roteamento do projeto. `API_INTERNAL_URL` é opcional e local;
serve somente ao proxy usado por `pnpm dev` quando a API local não está na porta
padrão `3001`.

Não exponha `DATABASE_URL`, `DIRECT_URL` ou `BETTER_AUTH_SECRET` por variáveis
`NEXT_PUBLIC_`. Como o escopo de ambiente do projeto é compartilhado, o código
da Web não deve ler esses segredos.

## Ambientes

- **Production:** configurar as origens definitivas somente após o projeto e
  domínio serem escolhidos. Manter `ODONTOFOLHA_API_REAL` ausente até revisar e
  autorizar banco, migrations e provisionamento inicial.
- **Preview:** não compartilhar credenciais nem URL do banco de produção. Manter
  a API de negócio desativada até existir banco isolado e autorizado.
- **Development local:** usar arquivos de ambiente ignorados pelo Git. Não
  copiar secrets para o repositório.

O proprietário optou por usar inicialmente um único projeto Neon. Isso não
autoriza migrations, seeds, testes destrutivos nem uso de dados reais em Preview.
