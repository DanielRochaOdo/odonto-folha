# Aceitação integral — prioridade E0.1–E0.68

**Fonte normativa:** docs/PRD.md, resultado da entrevista com mais de 60 perguntas.
As respostas aprovadas prevalecem sobre simplificações da prévia ou decisões técnicas.

A primeira versão para o proprietário só poderá ser chamada de **pronta para teste**
quando TODOS os blocos abaixo estiverem funcionando em navegador com login real,
persistência e testes integrados. Não entregar a prévia de localStorage como produto.

| Bloco | Requisito para aceite | Situação |
| --- | --- | --- |
| Identidade | ADMIN, DP, ADM e CENTRAL, sessão, escopo, segurança e auditoria | Pendente |
| Pessoas/empresas | 8 campos fixos, CPF, vínculo, recontratação, lotação, inativação | Pendente |
| Competências | Cards, cópia de vigência, histórico e snapshot de colunas | Pendente |
| Benefícios | Campos tipados, vínculos, recorrência, exceção, reajuste com prévia | Pendente |
| Comissões | ADM/CENTRAL/NENHUM, parcelas/total, conclusão e reabertura | Pendente |
| Consolidação | Ordem global, pendente/zero/N.A., lápis, autosave, cálculos | Domínio puro parcial |
| XLSX | Uma aba/contratante, fórmulas, cores, sem resumo, histórico | Gerador puro; integração pendente |
| Homologação | Banco isolado, login, reinício, testes de perfis, CI pnpm check | Pendente |

## Invariantes que bloqueiam liberação

- Benefício recorrente vale nos meses seguintes; comissão recomeça pendente.
- Um zero informado não equivale a pendente ou a não aplicável.
- Novo campo não aparece retroativamente em mês anterior; ordem global imutável.
- Desativação/desvinculação nunca apaga valores históricos; desligado não aparece
  em **nenhuma nova exportação**, ainda que a competência seja antiga.
- Total é aritmético: salário + proventos monetários − descontos monetários.
  Não é cálculo legal nem salário líquido.
- Planilha XLSX com 8 colunas fixas, campos na ordem global, uma aba por
  empresa contratante, funcionários por nome, fórmulas horizontais e verticais,
  zero numérico explícito e pendentes em branco, sem aba-resumo.
- Identidade/segredos/PII nunca em código público, fixtures ou logs.
- Sem operações em Neon, migrations, dados reais, deploy, A2/A3/A4/A5 sem aprovação.

## Situação da interface provisória

A interface apps/web usa localStorage e CSV; não tem sessão, banco nem versionamento.
Serve unicamente para experimentar navegação com dados fictícios e **não satisfaz E0.67/E0.68**.

O gerador XLSX puro em apps/api/src/dominio/exportacao-xlsx.ts não será ligado
a rota pública antes de haver autenticação, autorização de escopo e auditoria.
Testes e pnpm check do commit atual ainda precisam de execução e evidência.
