# RULES — Normas permanentes de engenharia

- Repositório único; alterações em branch e Pull Request revisado pelo proprietário.
- Não modificar a `main` diretamente; não permitir publicação automática em produção por agente.
- TypeScript estrito; funções coesas; validação de entrada nas fronteiras com Zod; erros controlados; sem `any` injustificado.
- Código e documentação em pt-BR; convenções de identificadores estáveis e nomes de APIs externas preservados.
- `apps/web` não importa `packages/database`; `apps/api` não importa componentes visuais.
- Todo acesso de negócio passa pela API e aplica autorização baseada no escopo da sessão.
- Nenhum dado pessoal, dado real de RH, arquivo de produção, segredo ou URL privada em PR, log, teste, print ou prompt de IA.
- Usar fixtures sintéticas; nunca usar Neon de produção em desenvolvimento ou CI.
- Operações de banco/schema, integrações externas e infraestrutura requerem justificativa e aprovação prévia.
- Não reescrever registros históricos para alterar demonstrativos já publicados.
- Incluir testes de regras/elegibilidade e transações quando esses módulos forem implementados.
- `pnpm check` é o gate mínimo antes de merge; corrigir violações, não desativar o gate.
- Preferir mudança pequena, sem refatoração não relacionada.
- Alterações em padrões técnicos exigem ADR; aprovação de ADR pertence ao humano responsável.
- Manter documentação alinhada ao comportamento real; não marcar tarefas concluídas sem evidência.
