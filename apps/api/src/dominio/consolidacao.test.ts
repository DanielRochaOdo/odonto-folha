import { describe, expect, it } from 'vitest';
import type { CampoDinamico, Funcionario, Lancamento, VinculoCampo } from '@odontofolha/contracts';
import { gerarConsolidacao } from './consolidacao';
import { podeEditarConsolidacao, podeGerenciarCadastros, podePreencherComissao } from './permissoes';

const competencia = { ano: 2026, mes: 10 };
const funcionarios: Funcionario[] = [
  {
    id: 'vinculo-2', empresaContratanteId: 'empresa-a', empresaLotadoId: 'unidade-a',
    setorLotacaoId: 'setor-a', cpf: '00000000002', nome: 'Zélia Exemplo',
    cargo: 'Auxiliar', admissao: '2024-01-02', salarioContratual: 2000, ativo: true,
  },
  {
    id: 'vinculo-1', empresaContratanteId: 'empresa-a', empresaLotadoId: 'unidade-a',
    setorLotacaoId: 'setor-a', cpf: '00000000001', nome: 'Ana Exemplo',
    cargo: 'Recepcionista', admissao: '2024-01-02', salarioContratual: 3000, ativo: true,
  },
  {
    id: 'vinculo-3', empresaContratanteId: 'empresa-b', empresaLotadoId: 'unidade-b',
    setorLotacaoId: 'setor-b', cpf: '00000000003', nome: 'Pessoa Desligada',
    cargo: 'Auxiliar', admissao: '2024-01-02', salarioContratual: 1000, ativo: false,
  },
];

const campos: CampoDinamico[] = [
  {
    id: 'desconto', grupoId: 'clinico', grupoNome: 'Clínico', nome: 'Valor',
    origem: 'BENEFICIO', tipo: 'moeda', classificacao: 'desconto', ordemGlobal: 2,
    criadoEm: competencia,
  },
  {
    id: 'comissao', grupoId: 'recepcao', grupoNome: 'Recepcionistas', nome: 'Valor',
    origem: 'COMISSAO', tipo: 'moeda', classificacao: 'provento', ordemGlobal: 1,
    criadoEm: competencia,
  },
  {
    id: 'novo', grupoId: 'novo', grupoNome: 'Novo', nome: 'Valor',
    origem: 'BENEFICIO', tipo: 'moeda', classificacao: 'informativo', ordemGlobal: 3,
    criadoEm: { ano: 2026, mes: 11 },
  },
];

function entrada(
  funcionarioId: string,
  campoId: string,
  valor: number,
  modo: Lancamento['modo'] = 'total',
): Lancamento {
  return { id: 'l-' + funcionarioId + '-' + campoId + '-' + valor, funcionarioId, campoId, valor, modo, vigente: true };
}

describe('consolidação mensal aritmética', () => {
  it('mantém ordem global, ordena nomes e exclui desligados', () => {
    const resultado = gerarConsolidacao({
      competencia, funcionarios, camposDaCompetencia: campos,
      vinculosDaCompetencia: [], lancamentosDaCompetencia: [],
    });
    expect(resultado.colunas.map((campo) => campo.id)).toEqual(['comissao', 'desconto']);
    expect(resultado.abas).toHaveLength(1);
    expect(resultado.abas[0].funcionarios.map((linha) => linha.funcionario.nome)).toEqual([
      'Ana Exemplo', 'Zélia Exemplo',
    ]);
  });

  it('diferencia campo pendente, zero explícito e não aplicável', () => {
    const vinculosDaCompetencia: VinculoCampo[] = [
      { funcionarioId: 'vinculo-1', campoId: 'comissao' },
      { funcionarioId: 'vinculo-1', campoId: 'desconto' },
    ];
    const resultado = gerarConsolidacao({
      competencia, funcionarios, camposDaCompetencia: campos,
      vinculosDaCompetencia,
      lancamentosDaCompetencia: [entrada('vinculo-1', 'comissao', 0)],
    });
    const ana = resultado.abas[0].funcionarios[0];
    const zelia = resultado.abas[0].funcionarios[1];
    expect(ana.celulas.comissao).toMatchObject({ situacao: 'preenchido', valor: 0 });
    expect(ana.celulas.desconto.situacao).toBe('pendente');
    expect(ana.parcial).toBe(true);
    expect(zelia.celulas.comissao.situacao).toBe('nao_aplicavel');
  });

  it('preserva valor já informado na consolidação mesmo após desvincular', () => {
    const resultado = gerarConsolidacao({
      competencia, funcionarios, camposDaCompetencia: campos,
      vinculosDaCompetencia: [],
      lancamentosDaCompetencia: [entrada('vinculo-1', 'comissao', 500), entrada('vinculo-1', 'desconto', 50)],
    });
    const ana = resultado.abas[0].funcionarios[0];
    expect(ana.celulas.comissao.valor).toBe(500);
    expect(ana.totalAritmetico).toBe(3450);
    expect(resultado.abas[0].totaisMonetarios).toEqual({ comissao: 500, desconto: 50 });
  });

  it('soma parcelas sem somar novamente o total direto', () => {
    const dados = {
      competencia, funcionarios, camposDaCompetencia: campos, vinculosDaCompetencia: [],
    };
    const lancamentosDaCompetencia = [
      entrada('vinculo-1', 'comissao', 100.15, 'parcela'),
      entrada('vinculo-1', 'comissao', 200.20, 'parcela'),
    ];
    const resultado = gerarConsolidacao({ ...dados, lancamentosDaCompetencia });
    expect(resultado.abas[0].funcionarios[0].celulas.comissao.valor).toBe(300.35);
    expect(resultado.abas[0].funcionarios[0].celulas.comissao.quantidadeParcelas).toBe(2);
    expect(() => gerarConsolidacao({
      ...dados, lancamentosDaCompetencia: [...lancamentosDaCompetencia, entrada('vinculo-1', 'comissao', 300.35)],
    })).toThrow('incompatíveis');
  });

  it('não inclui coluna criada em competência posterior', () => {
    const resultado = gerarConsolidacao({
      competencia: { ano: 2026, mes: 9 },
      funcionarios, camposDaCompetencia: campos,
      vinculosDaCompetencia: [], lancamentosDaCompetencia: [],
    });
    expect(resultado.colunas).toHaveLength(0);
  });
});

describe('permissões por perfil de usuário', () => {
  it('reserva cadastros e consolidação ao DP e ADMIN', () => {
    expect(podeGerenciarCadastros('DP')).toBe(true);
    expect(podeEditarConsolidacao('ADMIN')).toBe(true);
    expect(podeGerenciarCadastros('ADM')).toBe(false);
    expect(podeEditarConsolidacao('CENTRAL')).toBe(false);
  });

  it('bloqueia setor sem vínculo, responsável ou comissão reaberta', () => {
    expect(podePreencherComissao('ADM', 'ADM', false, true)).toBe(true);
    expect(podePreencherComissao('ADM', 'CENTRAL', false, true)).toBe(false);
    expect(podePreencherComissao('ADM', 'ADM', true, true)).toBe(false);
    expect(podePreencherComissao('CENTRAL', 'CENTRAL', false, false)).toBe(false);
    expect(podePreencherComissao('DP', 'NENHUM', true, true)).toBe(true);
  });
});
