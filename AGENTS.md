# Instruções obrigatórias para agentes — OdontoFolha

Este arquivo é a porta de entrada de todo agente (incluindo Codex).

1. Ler `docs/RULES.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md` e `docs/MEMORY.md` antes de editar.
2. Ler `docs/DESIGN.md` antes de alterar UI. Seguir a referência Apple Design indicada no documento.
3. Limitar alterações ao escopo combinado. Alterar uma decisão estrutural somente depois de apresentar motivo, alternativas, riscos e obter aprovação explícita do proprietário.
4. **Proibido** fazer merge/push direto na `main`, publicar em produção ou acessar/commitar dados pessoais, credenciais, tokens, planilhas de RH ou segredos.
5. **Banco e infraestrutura:** nenhuma migration, provisionamento, alteração de permissões ou custo sem aprovação humana e ambiente verificado.
6. Trabalhar em branch, rodar `pnpm check`, abrir PR e registrar bloqueios. Nunca declarar testes aprovados se não foram executados.
7. Atualizar documentação apenas quando a mudança for aprovada; propor modificações em `TASKS.md` e `MEMORY.md` para revisão conjunta.
8. Código, comentários e documentação em pt-BR; nomes de bibliotecas, protocolos e APIs mantêm nomenclatura original.
9. Endpoints de negócio futuros devem exigir autenticação, autorização por escopo (empresa/unidade) e auditoria onde aplicável. Não expor banco ao cliente.
10. Diante de ambiguidade de regra trabalhista, parar: não inferir cálculos ou regras legais.

Fluxo: contexto → plano → branch → implementação pequena → testes → PR → aprovação humana.
