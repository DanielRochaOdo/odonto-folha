# ADR-0002 — Centros de custo dinâmicos

- **Estado:** Aprovado pelo proprietário em 27/10/2026.
- **Contexto:** a autorização de comissões e os perfis de usuário aceitavam apenas ADM e CENTRAL. Esse modelo não permitia cadastrar departamentos novos.
- **Decisão:** cadastrar centros de custo com nome e estado ativo. Cada usuário operacional pertence a um centro. DP e ADMIN mantêm acesso geral. Cada comissão guarda o ID do centro responsável. Cada competência mantém uma fotografia do ID e do nome usado no período.
- **Alternativas:** manter ADM/CENTRAL fixos; salvar apenas nomes livres sem IDs estáveis.
- **Consequências:** uma migration cria e preenche os centros ADM e CENTRAL, converte os perfis existentes e mantém os IDs nos envios históricos. Centros não são excluídos; podem ser desativados. A migration deve ser aplicada antes de ativar esta versão da aplicação.
- **Aprovação:** proprietário, por resposta explícita na conversa de 27/10/2026.
