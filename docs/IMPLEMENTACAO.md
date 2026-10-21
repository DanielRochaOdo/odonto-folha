# Plano de implementação integral e aceitação

**Escopo:** OdontoFolha completo na primeira versão disponibilizada ao proprietário
para homologação; execução interna por etapas menores e revisáveis.

## Dependências técnicas
1. Contratos e funções puras de domínio para validar cenários sem banco.
2. Estrutura de persistência: vínculo empregatício por ID próprio, CPF como identidade
   da pessoa; competências; histórico de alterações; campos dinâmicos com ordem global;
   vínculos, responsáveis, parcelas e lançamentos com estado/versões.
3. Identidade e permissão nos serviços, nunca confiando somente no frontend.
4. UI e API para cadastros, benefícios, comissões e consolidação.
5. XLSX com fórmulas e testes de organização.
6. Homologação protegida e testes reais entre perfis.

## Modelo de competências e preservação histórica
- Manter fotografia/snapshot das colunas efetivas da competência: campos criados depois
  não aparecem em períodos anteriores; desativados não apagam colunas antigas.
- Campo já preenchido na competência de desativação permanece no consolidado e no Excel;
  impedir novos lançamentos de setor enquanto estiver desativado.
- Distinguir nulo pendente, não aplicável sem vínculo e zero explícito preenchido.
- Valores de comissão são exclusivos por campo; parcelas do mesmo campo somam, mas o
  total direto substitui parcelas após confirmação com preservação de histórico.
- A alteração por DP no módulo principal atualiza o mesmo registro da aba de origem.
- Valor já lançado continua no consolidado após desvincular o funcionário da comissão.
- Benefícios exigem versões de base: alteração recorrente vale daqui para frente,
  exceção vale só para competência escolhida, sem reescrever passado.
- Desligamento exclui trabalhador de nova exportação mesmo de competência antiga;
  não remove lançamentos e históricos armazenados.

## Critérios de qualidade antes da homologação
- Autenticação e autorização testadas em cada rota.
- Só fixtures sintéticas em teste/CI e capturas de tela.
- pnpm check e testes automatizados passam de verdade.
- Cenário integrado em navegador: ADMIN cadastra, DP parametriza, ADM/CENTRAL
  lançam, DP consolida/edita, exportação Excel gera fórmulas e abas adequadas.
- Persistência depois de logout e reinício; controle de erros e concorrência.
- A conta inicial não possui senha fixa em código, seed, variáveis públicas ou GitHub.
- Implantação não é produção. Infra e migrações exigem autorização independente.

## Estado atual da A1
Primeira entrega de código: contratos de domínio, regras de acesso básicas e cálculo
aritmético de consolidação por empresa com testes, ainda sem API de negócio pública.
Isso permite validar regras essenciais sem criar endpoints inseguros antes do login.
