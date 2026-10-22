import { describe, expect, it } from 'vitest';
import { catalogoCamposVazio, criarGrupo, criarCampo, editarCampo,
  renomearGrupo, ativarGrupo, ativarCampo, camposParaNovaCompetencia } from './campos';

const dp = { id: 'dp', perfil: 'DP' as const };
const adm = { id: 'adm', perfil: 'ADM' as const };
const competencia = { ano: 2026, mes: 10 };
function exemplo() {
  const b = criarGrupo(catalogoCamposVazio(), 'Transporte', 'BENEFICIO', 'NENHUM', dp, 0);
  const c = criarGrupo(b, 'Atendimento', 'COMISSAO', 'ADM', dp, b.revisao);
  const bId = c.grupos[0].id, cId = c.grupos[1].id;
  const p = criarCampo(c, cId, { nome: 'Valor', tipo: 'moeda',
    classificacao: 'provento', criadoEm: competencia }, dp, c.revisao);
  const q = criarCampo(p, bId, { nome: 'Valor', tipo: 'moeda',
    classificacao: 'desconto', criadoEm: competencia }, dp, p.revisao);
  return { q, bId, cId };
}
describe('Campos E0: ordem global, vigência e histórico', () => {
  it('mantém colunas com nomes repetidos, IDs únicos e ordem global', () => {
    const { q } = exemplo();
    const colunas = camposParaNovaCompetencia(q, competencia);
    expect(colunas.map(c => c.nome)).toEqual(['Valor', 'Valor']);
    expect(colunas.map(c => c.ordemGlobal)).toEqual([0, 1]);
    expect(new Set(colunas.map(c => c.id)).size).toBe(2);
  });
  it('bloqueia alterar tipo/classificação quando zero histórico foi informado', () => {
    const { q } = exemplo(), id = q.campos[0].id;
    const historico = [{ id: 'l', funcionarioId: 'v1', campoId: id,
      valor: 0, modo: 'total' as const, vigente: false }];
    expect(() => editarCampo(q, id, { classificacao: 'desconto' },
      historico, dp, q.revisao)).toThrow(/históricos/);
    const renomeado = editarCampo(q, id, { nome: 'Comissão corrigida' },
      historico, dp, q.revisao);
    expect(renomeado.campos[0].ordemGlobal).toBe(q.campos[0].ordemGlobal);
    expect(renomeado.campos[0].nome).toBe('Comissão corrigida');
  });
  it('desativação não apaga histórico; mês seguinte omite coluna', () => {
    const { q, bId } = exemplo();
    const snapshot = camposParaNovaCompetencia(q, competencia);
    const desativado = ativarGrupo(q, bId, false, dp, q.revisao);
    expect(camposParaNovaCompetencia(desativado, { ano: 2026, mes: 11 }))
      .toHaveLength(1);
    expect(snapshot).toHaveLength(2);
    const reativado = ativarGrupo(desativado, bId, true, dp, desativado.revisao);
    expect(camposParaNovaCompetencia(reativado, { ano: 2026, mes: 11 }))
      .toHaveLength(2);
  });
  it('nome do grupo pode mudar preservando posições e campo', () => {
    const { q, bId } = exemplo();
    const renomeado = renomearGrupo(q, bId, 'Vale-Transporte', dp, q.revisao);
    expect(renomeado.campos[1].grupoNome).toBe('Vale-Transporte');
    expect(renomeado.campos[1].id).toBe(q.campos[1].id);
    expect(renomeado.campos[1].ordemGlobal).toBe(1);
    const c = ativarCampo(renomeado, renomeado.campos[1].id, false, dp, renomeado.revisao);
    expect(camposParaNovaCompetencia(c, competencia)).toHaveLength(1);
  });
  it('setores não configuram campos ou responsáveis', () => {
    const { q } = exemplo();
    expect(() => criarGrupo(q, 'Indevido', 'COMISSAO', 'ADM', adm, q.revisao))
      .toThrow(/DP\/ADMIN/);
    expect(() => criarGrupo(q, 'Benefício', 'BENEFICIO', 'ADM', dp, q.revisao))
      .toThrow(/não têm responsável/);
  });
});
