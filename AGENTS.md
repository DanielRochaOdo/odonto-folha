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


11. **Relatório obrigatório ao proprietário após cada alteração, entrega ou PR:** informar explicitamente, mesmo quando a resposta for "Não":
    - **Branch:** se foi criada uma nova branch, qual é seu nome, branch base e se o PR foi aberto, mesclado ou ainda está pendente.
    - **Functions:** se foram adicionadas ou alteradas funções de backend, endpoints, funções serverless ou funções SQL (diferenciar cada categoria). Descrever quais exigem build, publicação ou configuração.
    - **Migrations:** se foram criadas/alteradas migrações ou esquema de banco; informar nome/caminho do arquivo, sua finalidade, se foi somente preparada ou efetivamente aplicada, ambiente atingido e autorização necessária.
    - **Ações necessárias:** deixar claro o que o proprietário precisa fazer localmente ou em cada ambiente (atualização de branch, `pnpm install`, build, migration, configuração, deploy), sem supor que Git pull aplica mudanças ao banco.
    - **Validação:** declarar status real dos checks/testes, pendências e bloqueios. Nunca confundir código versionado ou merge com execução de migration/deploy.
    - Incluir essa seção de "Impacto operacional" também na descrição dos próximos PRs e no resumo de conclusão. Não omitir itens sem mudança: escrever "Nenhuma nova branch", "Nenhuma function nova" ou "Nenhuma migration", conforme o caso.

Fluxo: contexto → plano → branch → implementação pequena → testes → PR → aprovação humana.
