# OdontoFolha — Especificação funcional aprovada

**Marco:** decisões E0.1–E0.68 ratificadas em conversa com o proprietário até 21/10/2026.
**Status:** requisitos para implementação; uma decisão registrada aqui não significa que a funcionalidade esteja implementada.

## Objetivo e limites
Aplicação interna leve para cadastrar colaboradores, reunir valores mensais fornecidos pelos setores,
consolidar os dados em uma tabela central e gerar planilha Excel. O sistema **não calcula folha
trabalhista, encargos ou salário líquido oficial**. Os totais exibidos são exclusivamente aritméticos.
Não haverá importação mensal de planilhas; a planilha histórica é referência visual, não esquema fixo.
As empresas contratantes são divisões de organização/exportação, não integrações financeiras.

## Usuários e permissões
- **ADMIN:** superusuário com acesso completo, inclusive configuração, cadastro, auditoria e edição.
- **DP:** gerencia colaboradores, competências, campos, benefícios, comissões, vínculos, configurações,
  responsáveis e edição da tabela principal.
- **ADM e CENTRAL:** somente preenchem campos das comissões sob responsabilidade de seu grupo e dos
  funcionários vinculados pelo DP. Não alteram cadastros nem estrutura.
- O responsável por comissões é o setor/perfil ADM, CENTRAL ou NENHUM, nunca um usuário individual.
- Credenciais, dados pessoais e planilhas reais não podem constar em GitHub, fixtures ou logs.
  Conta ADMIN inicial será provisionada de forma segura, fora do código público.

## Cadastro central de funcionários
Oito colunas permanentes, nessa ordem: **Empresa Contratante, Empresa Lotado, Setor de Lotação,
CPF, Nome, Cargo, Admissão, Salário Contratual**. CPF identifica a pessoa; recontratação cria
outro vínculo empregatício identificável. DP/ADMIN gerenciam cadastros.
Desligados não participam de novas exportações, mesmo ao exportar novamente uma competência
antiga; o histórico continua preservado. Mudanças de empresa/setor/lote são inseridas manualmente
pelo DP com competência de vigência; outros ajustes ficam sob sua responsabilidade.
Cadastro inicial poderá utilizar importação única autorizada, não importação mensal rotineira.

## Benefícios
DP cria e nomeia livremente benefícios (ex.: Clínico, Orto, VT); acrescenta um ou mais campos
independentes pelo botão +. Tipos admitidos: moeda R$, percentual %, data dd/mm/aaaa e hora hh:mm.
Cada campo recebe sua própria coluna na consolidação. Vínculos podem ser definidos individualmente
ou em lote, com histórico de ativação. A associação cadastral do funcionário ao benefício
é independente de competências: qualquer vínculo empregatício cadastrado pode ser associado,
mesmo sem competência aberta ou com vínculo inativo. Na abertura de uma competência, os
lançamentos aplicam apenas os funcionários elegíveis ao período sem remover a associação cadastral. Valores recorrentes persistem na competência seguinte.
Correções de um benefício recorrente, na tela Benefícios ou na tabela principal, atualizam a base da
competência e das seguintes sem reescrever competências anteriores; pode-se optar por exceção
somente do mês. Alertar sobre edição recente conflitante.

Reajuste por benefício: selecionar todos os funcionários vinculados ou subconjunto, escolher
campo e variação positiva/negativa em percentual ou em R$, pré-visualizar por funcionário,
confirmar, arredondar a centavos, impedir resultado negativo e registrar autoria.

## Comissões
DP cria comissão com um ou mais campos tipados, funcionários vinculados e responsável ADM,
CENTRAL ou NENHUM. Cada campo mantém coluna exclusiva, mesmo com nome parecido ao de outro
campo; não agregar colunas diferentes. A cada competência, comissões começam pendentes/vazias.
ADM/CENTRAL visualizam somente comissões e pessoas atribuídas. NENHUM é preenchido apenas
por DP/ADMIN, na aba da comissão ou na tabela principal, com o mesmo registro sincronizado e
sem necessidade de Concluir envio.

Em cada comissão, lançamentos por parcela podem compor seu total ou pode-se informar um
total direto. Ao substituir parcelas por total, solicitar confirmação e preservar histórico,
sem contar ambos. Duplicatas semelhantes geram aviso, não deduplicação automática.
Autosave ao sair da célula, feedback de sucesso/erro, navegação Tab/Enter e retomada parcial.
Cada comissão dispõe de **Concluir envio** independente; informar funcionários pendentes e
permitir concluir após alerta. A conclusão registra responsável e data, notifica DP e bloqueia
edição por setor até DP reabrir aquela comissão. DP/ADMIN editam a consolidação.
Alterar vínculo de funcionários numa competência atualiza a lista do setor; recém-incluídos
ficam pendentes. Desvincular remove da lista normal mas **não remove valores já lançados da
consolidação**, nem apaga histórico.

## Competências e tabela principal
Página inicial: cards de competências mês/ano, funcionários ativos, situação de envios
ADM/CENTRAL e última edição; filtro de ano e ordem decrescente. DP adiciona competência,
que copia a base vigente de colaboradores/benefícios recorrentes e cria comissões vazias.
Detalhes abre tabela ampla com oito colunas fixas, seguidas de **cada** campo dinâmico,
ordenado por criação global sem reagrupamento por origem.

A tela mostra pendente x zero explícito x não aplicável, progresso e totais parciais
identificados como parciais. DP edita clicando no ícone de lápis ao fim da linha do funcionário;
salvamento automático, indicação de êxito/erro, aviso de não salvo e opção de desfazer antes
de persistir. Uma edição na tabela principal altera o mesmo registro da comissão de origem,
sem criar segunda soma. Benefícios recorrentes seguem sua exceção de propagação para competências
futuras. Permitir corrigir valores de comissão conforme edição pelo DP.
Classificação monetária por campo: provento (+), desconto (−), informação (não soma).
Total por funcionário = salário contratual + proventos − descontos; totais monetários verticais
por empresa. Não chamar esse resultado de salário líquido.

## Criação, desativação e edição de campos
Criar novo campo durante competência aberta inclui sua coluna imediatamente nessa competência
e nas seguintes, para funcionários vinculados; não acrescenta coluna retroativamente às
competências anteriores. Preservar posição global de criação.
Cada benefício ou comissão terá controle Ativo na própria tela de gerenciamento. Desativados
somem dos novos lançamentos e das próximas competências; competências anteriores preservam
colunas e valores. Se a competência atual já possuir valores, manter coluna visível,
impedir novos preenchimentos de setor, preservar valores nos totais e exportação.
Reativar na mesma competência recupera visualização e valores. O controle não apaga histórico.

Renomear benefícios, comissões ou campos é livre, sem perder valores ou mover coluna.
Tipo de campo e classificação monetária só podem ser alterados quando **não houver valores
preenchidos**. DP pode apagar valores individualmente para liberar alteração, porém, se
existirem valores em competências anteriores, preservar histórico e bloquear mudança de
tipo/classificação original. Zero explícito também é valor preenchido.

## Exportação
Um XLSX com **uma aba por empresa contratante**; funcionários em ordem alfabética,
sem agrupamento por lotação. Incluir oito campos fixos e todas as colunas dinâmicas existentes
naquela competência, inclusive vazias, na ordem global de criação. Cabeçalhos coloridos
diferenciam cadastro, comissões e benefícios; estética baseada na planilha de referência.
Fórmulas de total horizontal por linha e soma vertical por coluna monetária, atualizáveis
no Excel. Valor zero explícito é 0,00; pendente e não aplicável ficam em branco.
Permitir exportação com campos pendentes mediante identificação do estado parcial.
Não gerar aba de resumo não aprovada.

## Requisitos de proteção e qualidade
API autentica todos endpoints de negócio, autoriza por perfil e escopo, valida contratos
e registra auditoria relevante. Banco separado para homologação e produção; backups/recuperação
a validar antes de uso real. Autosave confiável, tratamento de conflitos, respostas de erro
sem dados sensíveis, foco por teclado e boa navegação horizontal. Iniciar sempre com dados
sintéticos; nenhum dado real em GitHub.

## Primeira entrega e forma de aceitação (E0.67–E0.68)
A primeira **versão disponibilizada para testes** deve cobrir TODOS os módulos acima com
persistência e integração real, acessível por navegador e login ADMIN, não um mock de telas.
Podem existir vários PRs/etapas técnicas antes dessa entrega.
A autorização A1 abrange código, documentação, testes e PRs; não abrange criar banco,
migrar esquema remoto, provisionar hospedagem, publicar ou carregar dados reais.
