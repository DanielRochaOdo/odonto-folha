# ARCHITECTURE — OdontoFolha

**Estado:** proposta de execução G1; não implica prontidão de produção. **Responsável por aprovações:** proprietário do repositório.

## Diretrizes confirmadas

Sistema web desktop-first, uso interno do grupo, diversas empresas/unidades, 4 usuários iniciais (10–20 em projeção); Vercel como hospedagem escolhida e Neon PostgreSQL como banco escolhido. Código público sem dados pessoais. Segurança, escalabilidade e experiência visual são prioridades.

## Topologia proposta

```text
Browser
   |
   v
apps/web (Next.js / Vercel projeto A)
   | HTTPS /api/* (roteamento a validar no G2)
   v
apps/api (Hono / Vercel projeto B)
   | sessão, autorização, validação, regras, auditoria
   v
packages/database (Drizzle / Neon PostgreSQL)
```

O frontend não recebe `DATABASE_URL`. O backend é responsável por transações e todo acesso a dados. Módulos de negócio futuros terão casos de uso independentes de HTTP e de UI.

## Contratos

`packages/contracts` é compatível com frontend e API; apenas tipos e validação pública. Nunca compartilhar queries, tokens ou lógica privilegiada com a web.

## Restrições e evolução

- Endpoints de negócio: autenticados por padrão; apenas health check técnico pode ser público.
- Separação por empresa/unidade em toda consulta autorizada; nunca confiar no escopo enviado pelo navegador.
- Soft delete e preservação de versões de relatórios são requisitos futuros, não estão implementados.
- Transações reais e rollback precisam de teste; avaliar driver Neon compatível com transações interativas em G2.
- Jobs idempotentes e polling na primeira versão; filas e WebSocket dependerão de necessidade demonstrada.
- Logs técnicos temporários separados de trilha persistente de auditoria.
- Arquivos XLSX/PDF terão armazenamento privado e autorização por download, ainda por definir.
- Dois projetos Vercel no mesmo monorepo; conectar Neon e definir variáveis isoladas apenas com aprovação.
- Sem restrição de acesso por IP/rede corporativa. A proteção será por identidade/permissões.
- RTO desejado 12h e RPO desejado 1h; não testados nesta etapa.

## Estágios

**G1:** scaffold, contratos, /health, checks, CI e documentação (presente PR).
**G2:** identidade, banco de desenvolvimento separado, autorização, rollback, sessão/rewrite.
**G3:** design system com identidade Odontoart (cores/logo ainda não fornecidos).
**G4:** auditoria, arquivos e jobs técnicos.
**G5:** escopo e regras de negócio do DP.
