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

## Criação guiada e fluida — regra obrigatória de UI/UX

- **Toda ação "Criar ..." que necessite de mais de uma informação/decisão deve abrir um modal assistido por etapas**, com uma responsabilidade nítida por tela, em vez de expor formulários extensos em linha. Um cadastro simples de um campo pode usar um único passo no modal.
- Padrão: identificar/nomear → configurar campos/opções relevantes → selecionar vínculos/participantes, quando houver → **Finalizar**. Ex.: "Criar benefício" → nome do benefício → campo (tipo, classificação e competência) → funcionários vinculados. Aplicar a mesma lógica a comissões e aos próximos fluxos de criação do sistema.
- Controles explícitos **Próximo**, **Voltar**, **Cancelar/Fechar** e **Finalizar**, com indicador de progresso. Validar a etapa antes de avançar; ao voltar preservar escolhas e valores. Não enviar dados incompletos nem criar duplicatas.
- Preferir persistência **atômica no Finalizar**; se uma operação não admitir isso, explicitar os estados e permitir recuperação sem perda de dados. Nunca apresentar vínculo salvo quando o backend não o persistiu.
- O modal precisa ser acessível por teclado e leitor de tela: título e descrição, foco inicial visível, foco contido no modal, Escape/Fechar, mensagens de erro e sucesso associadas à etapa, tema claro/escuro e layout responsivo. Respeitar movimento reduzido.
- **Divulgação progressiva:** abrir formulários de ações secundárias somente após clique explícito. Ex.: selecionar um benefício/comissão revela os detalhes e o botão **+ Adicionar campo**; este abre seu formulário, com opção **Fechar/Cancelar** sem recarregar a página.
- Na visualização de um benefício/comissão, mostrar seus campos e funcionários vinculados de modo claro, inclusive o estado vazio. Preservar regras de competência, histórico, autorização e escopo; jamais substituir a persistência real por estado local enganoso.
- Evitar fricção, excesso de elementos simultâneos, etapas desnecessárias, navegação imprevisível e perda de contexto. Avaliar sempre a experiência completa (criar → conferir → alterar) antes da aprovação.
