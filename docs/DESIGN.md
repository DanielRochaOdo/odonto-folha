# DESIGN — Diretrizes visuais

## Referências confirmadas
- Identidade corporativa Odontoart (logo, paleta e arquivos ainda não adicionados).
- Referência de comportamento e estética: https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md
- Desktop-first, informação densa, temas claro/escuro e WCAG 2.2 AA.
- Animações expressivas, mas funcionais; movimento reduzido respeitado.

## Critérios
- Hierarquia tipográfica clara, proporção e espaçamento consistentes.
- Feedback imediato; movimentos interrompíveis e consistência espacial; evitar animações bloqueantes.
- Contraste e legibilidade sobre translucidez; foco visível; navegação possível por teclado.
- Tokens semânticos e componentes reutilizáveis em `packages/ui`.
- Não copiar logos Apple, nem assumir cores/ativos da Odontoart sem material oficial.
- A primeira tela técnica é provisória, não constitui aprovação do design final.

## Campos de seleção
- Todo `<select>` usa o padrão global de controles definido em `apps/web/src/app/globals.css`.
- Manter altura, espaçamento, borda, seta e estados de hover, foco visível e desativado coerentes entre telas; cores devem vir dos tokens semânticos para funcionar nos temas claro e escuro.
- Usar o seletor HTML nativo para preservar teclado e acessibilidade. Classes de tela podem ajustar largura e dimensões, mas não devem restaurar a aparência padrão do navegador nem remover espaço para a seta.
- Associar cada seletor a um `<label>` ou fornecer um nome acessível.
