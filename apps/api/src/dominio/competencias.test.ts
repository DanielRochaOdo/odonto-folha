import { describe, expect, it } from 'vitest';
import type { CampoDinamico, Funcionario } from '@odontofolha/contracts';
import {
  abrirCompetencia, incluirCampoNaCompetencia, definirVinculo, definirBloqueioCampo, salvarLancamento,
  limparLancamentos, pendenciasComissao, concluirComissao, reabrirComissao, consolidarEstado,
} from './competencias';

const outubro = { ano: 2026, mes: 10 };
const dp = { id: 'dp-sintetico', perfil: 'DP' as const };
const adm = { id: 'adm-sintetico', perfil: 'ADM' as const };
const central = { id: 'central-sintetico', perfil: 'CENTRAL' as const };
const pessoa: Funcionario = {
  id: 'vinculo-1', empresaContratanteId: 'empresa-1', empresaLotadoId: 'empresa-1',
  setorLotacaoId: 'setor-1', cpf: '00000000001', nome: 'Pessoa Exemplo',
  cargo: 'Atendimento', admissao: '2026-01-02', salarioContratual: 2000, ativo: true,
};
const beneficio: CampoDinamico = {
  id: 'b1', grupoId: 'b', grupoNome: 'Transporte', nome: 'VT',
  origem: 'BENEFICIO', tipo: 'moeda', classificacao: 'desconto',
  ordemGlobal: 2, criadoEm: outubro,
};
const comissao: CampoDinamico = {
  id: 'c1', grupoId: 'c', grupoNome: 'Atendimento', nome: 'Comissão',
  origem: 'COMISSAO', tipo: 'moeda', classificacao: 'provento',
  ordemGlobal: 1, criadoEm: outubro,
};
function novo() {
  return abrirCompetencia({
    competencia: outubro, funcionarios: [pessoa], campos: [beneficio, comissao],
    vinculos: [{ funcionarioId: pessoa.id, campoId: comissao.id },
      { funcionarioId: pessoa.id, campoId: beneficio.id }],
    gruposComissao: [{ grupoId: 'c', responsavel: 'ADM' }],
  });
}
describe('Competências, papéis e auditoria E0', () => {
  it('abre competência com comissões pendentes e colunas na ordem global', () => {
    const e = novo();
    expect(e.campos.map(c => c.id)).toEqual(['c1', 'b1']);
    expect(e.lancamentos).toEqual([]);
    expect(pendenciasComissao(e, 'c')).toEqual(['vinculo-1:c1']);
    expect(e.envios[0].concluido).toBe(false);
  });
  it('não acrescenta coluna criada no futuro à competência antiga', () => {
    const e = novo();
    const futuro = { ...comissao, id: 'c-futuro', ordemGlobal: 3, criadoEm: { ano: 2026, mes: 11 } };
    expect(() => incluirCampoNaCompetencia(e, futuro, dp, e.revisao))
      .toThrow(/não pertence/);
    expect(e.campos).toHaveLength(2);
  });
  it('não dá a CENTRAL acesso à comissão ADM ou aos benefícios', () => {
    const e = novo();
    expect(() => salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 0, modo: 'total', versaoEsperada: e.revisao }, central)).toThrow(/escopo/);
    expect(() => salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'b1',
      valor: 10, modo: 'total', versaoEsperada: e.revisao }, adm)).toThrow(/DP\/ADMIN/);
  });
  it('diferencia zero informado, pendente e ausência de vínculo', () => {
    const e = novo();
    const resultado = salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 0, modo: 'total', versaoEsperada: e.revisao }, adm);
    const dados = consolidarEstado(resultado.estado, new Set([pessoa.id]));
    expect(dados.abas[0].funcionarios[0].celulas.c1).toMatchObject({ situacao: 'preenchido', valor: 0 });
    expect(dados.abas[0].funcionarios[0].celulas.b1.situacao).toBe('pendente');
  });
  it('preserva valor lançado ao desvincular e exclui desligados na reexportação', () => {
    const e = novo();
    const e1 = salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 100, modo: 'total', versaoEsperada: e.revisao }, adm).estado;
    const e2 = definirVinculo(e1, pessoa.id, 'c1', false, dp, e1.revisao);
    expect(consolidarEstado(e2, new Set([pessoa.id])).abas[0].funcionarios[0].totalAritmetico)
      .toBe(2100);
    expect(consolidarEstado(e2, new Set()).abas).toEqual([]);
    expect(e2.lancamentos).toHaveLength(1);
  });
  it('exige confirmação para substituir total por parcelas e mantém histórico', () => {
    const e = novo();
    const total = salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 30, modo: 'total', versaoEsperada: e.revisao }, adm).estado;
    const opcao = { funcionarioId: pessoa.id, campoId: 'c1', valor: 40,
      modo: 'parcela' as const, versaoEsperada: total.revisao };
    expect(() => salvarLancamento(total, opcao, adm)).toThrow(/Confirme/);
    const parcelas = salvarLancamento(total, { ...opcao, confirmarSubstituicao: true }, adm).estado;
    expect(parcelas.lancamentos.filter(l => l.vigente)).toHaveLength(1);
    expect(parcelas.lancamentos.filter(l => !l.vigente)).toHaveLength(1);
    const segunda = salvarLancamento(parcelas, { ...opcao,
      versaoEsperada: parcelas.revisao }, adm);
    expect(segunda.avisos[0]).toMatch(/duplicada/);
    expect(consolidarEstado(segunda.estado, new Set([pessoa.id]))
      .abas[0].funcionarios[0].totalAritmetico).toBe(2080);
  });
  it('conclusão independente bloqueia setor até reabertura pelo DP', () => {
    const e = novo();
    expect(() => concluirComissao(e, 'c', adm, e.revisao)).toThrow(/pendências/);
    const fechado = concluirComissao(e, 'c', adm, e.revisao, true);
    expect(fechado.envios[0]).toMatchObject({ concluido: true, concluidoPor: 'adm-sintetico' });
    expect(() => salvarLancamento(fechado, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 10, modo: 'total', versaoEsperada: fechado.revisao }, adm))
      .toThrow(/bloqueada/);
    expect(() => reabrirComissao(fechado, 'c', adm, fechado.revisao)).toThrow(/DP\/ADMIN/);
    const aberto = reabrirComissao(fechado, 'c', dp, fechado.revisao);
    expect(aberto.envios[0].concluido).toBe(false);
    expect(salvarLancamento(aberto, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 10, modo: 'total', versaoEsperada: aberto.revisao }, adm).estado.revisao)
      .toBe(aberto.revisao + 1);
  });
  it('conflitos de revisão impedem sobrescrever alterações concorrentes', () => {
    const e = novo();
    const atual = salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 10, modo: 'total', versaoEsperada: e.revisao }, adm).estado;
    expect(() => salvarLancamento(atual, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 20, modo: 'total', versaoEsperada: e.revisao }, adm))
      .toThrow(/Conflito/);
  });
  it('mantém coluna/valor após desativar, impedindo nova edição pelo setor', () => {
    const e = novo();
    const salvo = salvarLancamento(e, { funcionarioId: pessoa.id, campoId: 'c1',
      valor: 50, modo: 'total', versaoEsperada: e.revisao }, adm).estado;
    const bloqueado = definirBloqueioCampo(salvo, 'c1', true, dp, salvo.revisao);
    expect(consolidarEstado(bloqueado, new Set([pessoa.id])).abas[0].funcionarios[0]
      .celulas.c1.valor).toBe(50);
    expect(() => salvarLancamento(bloqueado, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 60, modo: 'total', versaoEsperada: bloqueado.revisao,
      confirmarSubstituicao: true }, adm)).toThrow(/bloqueada/);
    const reaberto = definirBloqueioCampo(bloqueado, 'c1', false, dp, bloqueado.revisao);
    expect(reaberto.camposBloqueados).not.toContain('c1');
  });
  it('comissão NENHUM é editável por DP sem concluir envio', () => {
    const c = abrirCompetencia({ competencia: outubro, funcionarios: [pessoa],
      campos: [comissao], vinculos: [{ funcionarioId: pessoa.id, campoId: 'c1' }],
      gruposComissao: [{ grupoId: 'c', responsavel: 'NENHUM' }] });
    expect(() => concluirComissao(c, 'c', dp, c.revisao)).toThrow(/não utiliza/);
    const editado = salvarLancamento(c, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 70, modo: 'total', versaoEsperada: c.revisao }, dp);
    expect(editado.estado.lancamentos[0].valor).toBe(70);
    expect(() => salvarLancamento(c, { funcionarioId: pessoa.id,
      campoId: 'c1', valor: 70, modo: 'total', versaoEsperada: c.revisao }, adm))
      .toThrow(/escopo/);
  });
  it('DP pode limpar valor preservando lançamento não vigente e auditando', () => {
    const e = novo();
    const atual = salvarLancamento(e, { funcionarioId: pessoa.id,
      campoId: 'b1', valor: 15, modo: 'total', versaoEsperada: e.revisao }, dp).estado;
    const limpo = limparLancamentos(atual, pessoa.id, 'b1', dp, atual.revisao);
    expect(limpo.lancamentos).toHaveLength(1);
    expect(limpo.lancamentos[0].vigente).toBe(false);
    expect(limpo.auditoria.at(-1)?.acao).toBe('LANCAMENTO_LIMPO');
  });
});
