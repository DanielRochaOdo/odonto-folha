# SETUP — Ambiente técnico

## Ferramentas
Node.js 24, corepack/pnpm 10. Opcional: Vercel CLI autenticada para vincular os **dois** projetos quando autorizado.

## G1 local (sem banco)
```bash
corepack enable
pnpm install
pnpm dev
# outros terminais:
pnpm check
```
- Web: http://localhost:3000
- Health API: http://localhost:3001/api/health
- `pnpm --filter @odontofolha/api test` testa resposta e contrato do health endpoint.
- Nenhuma rota de negócio ou conexão de banco está implementada.

## Ambientes (G2, após autorização)
1. Inspecionar projetos Vercel existentes e escolher explicitamente web e api.
2. Vincular cada app ao projeto correto; conferir variáveis de ambiente sem exibir valores.
3. Separar Neon desenvolvimento e produção; nunca rodar migration na produção por conveniência.
4. Rodar teste de conexão, transação e rollback em desenvolvimento; só então habilitar Drizzle real.
5. Configurar roteamento entre apps e validar sessão/cookie com navegador real.
6. Executar testes e demonstrar reversão de um deploy em homologação.

**Não** executar migrações, `db:push`, deploy ou uso de dados reais neste scaffold. Falha de instalação por rede/registry não equivale a teste passado.
