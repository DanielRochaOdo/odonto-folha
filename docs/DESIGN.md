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
- Tipografia global aprovada: **Sora**, carregada no layout raiz e aplicada por tokens CSS; manter fallback local sans-serif.
- Manter recuos laterais compactos e responsivos no cabeçalho e no conteúdo dos módulos, para priorizar a área útil sem eliminar o respiro mínimo nas telas estreitas.

## Glassmorphism — adoção gradual
- Aplicar o padrão Glassmorphism UI Standard v1.0 fornecido pelo proprietário, sem trocar a paleta, fontes ou identidade Odontoart.
- Avançar módulo a módulo. Após o login, aplicar em Competências e Cadastros; avaliar visualmente cada módulo antes de levar as superfícies aos demais.
- Manter tokens físicos reutilizáveis para transparência, blur, saturação, borda, raio, reflexo e elevação em `apps/web/src/app/globals.css`.
- Cards usam referência de opacidade 72%, blur 16px, saturação 122%, raio 16px e elevação E2. Campos usam opacidade 72%, sem blur e raio 10px.
- Seguir a contenção do app Reflect: fundos quase sólidos, bordas hairline e glows discretos; evitar brilho neon, gradientes intensos e sombras pesadas. Preservar a paleta teal da Odontoart.
- Superfícies de conteúdo denso, como tabelas e relatórios, devem permanecer mais opacas; não aplicar blur aos dados.
- Fornecer fundo opaco quando não houver suporte a `backdrop-filter`, respeitar transparência/movimento reduzidos e manter foco visível e contraste AA.

## Campos de seleção
- Todo `<select>` usa o padrão global de controles definido em `apps/web/src/app/globals.css`.
- Manter altura, espaçamento, borda, seta e estados de hover, foco visível e desativado coerentes entre telas; cores devem vir dos tokens semânticos para funcionar nos temas claro e escuro.
- Usar o seletor HTML nativo para preservar teclado e acessibilidade. Classes de tela podem ajustar largura e dimensões, mas não devem restaurar a aparência padrão do navegador nem remover espaço para a seta.
- Associar cada seletor a um `<label>` ou fornecer um nome acessível.

## Datas
- Exibir datas no padrão brasileiro `dd/mm/aaaa` em tabelas e informações do sistema.
- Manter campos de data nativos e contratos da API no formato ISO `aaaa-mm-dd`.

## Ícones
- Usar **Heroicons** como biblioteca padrão de ícones da interface React, importando os componentes de `@heroicons/react/24/outline`.
- Preferir a variante Outline para a navegação e ações do sistema; não misturar famílias de ícones em novos componentes.
- Manter tamanho e alinhamento coerentes: 20 px para navegação e 16 px para ícones junto a texto, respeitando a cor do contexto.
- Ícones decorativos devem usar `aria-hidden="true"`; controles compostos apenas por ícone precisam de nome acessível via `aria-label` e, quando útil, `title`.
