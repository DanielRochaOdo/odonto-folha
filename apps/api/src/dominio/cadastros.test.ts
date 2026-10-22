import { describe, expect, it } from 'vitest';
import { cadastroVazio, cadastrarEmpresa, cadastrarSetor, contratar, desligar,
  movimentar, fotografarFuncionarios, validarCpf, idsVinculosAtivos } from './cadastros';

const dp = { id: 'dp', perfil: 'DP' as const };
const adm = { id: 'adm', perfil: 'ADM' as const };
function preparado() {
  const e = cadastrarEmpresa(cadastroVazio(), 'Contratante Alfa', dp, 0);
  const d = cadastrarEmpresa(e, 'Unidade Beta', dp, e.revisao);
  const s = cadastrarSetor(d, 'Atendimento', dp, d.revisao);
  return {
    s,
    entrada: {
      cpf: '11144477735', nome: 'Pessoa Exemplo', cargo: 'Auxiliar',
      admissao: '2025-01-10', salarioContratual: 2200,
      empresaContratanteId: s.empresas[0].id, empresaLotadoId: s.empresas[1].id,
      setorLotacaoId: s.setores[0].id,
    },
  };
}
describe('Cadastros e vigência E0', () => {
  it('valida dígitos do CPF e rejeita sequências repetidas', () => {
    expect(validarCpf('11144477735')).toBe(true);
    expect(validarCpf('11144477736')).toBe(false);
    expect(validarCpf('00000000000')).toBe(false);
    expect(validarCpf('1114447773')).toBe(false);
  });
  it('ADM/CENTRAL não alteram cadastros nem saltam revisão', () => {
    const x = preparado();
    expect(() => cadastrarEmpresa(x.s, 'Nova', adm, x.s.revisao)).toThrow(/ADMIN\/DP/);
    expect(() => cadastrarEmpresa(x.s, 'Nova', dp, 0)).toThrow(/Conflito/);
  });
  it('vínculo ativo único por CPF e recontratação cria outro vínculo', () => {
    const x = preparado();
    const c1 = contratar(x.s, x.entrada, dp, x.s.revisao);
    expect(() => contratar(c1, x.entrada, dp, c1.revisao)).toThrow(/vínculo ativo/);
    const antigo = c1.vinculos[0].id;
    const desligado = desligar(c1, antigo, dp, c1.revisao);
    const recontratado = contratar(desligado, { ...x.entrada, admissao: '2026-02-01' },
      dp, desligado.revisao);
    expect(recontratado.pessoas).toHaveLength(1);
    expect(recontratado.vinculos).toHaveLength(2);
    expect(recontratado.vinculos[0].id).not.toBe(recontratado.vinculos[1].id);
    expect(recontratado.auditoria.at(-1)?.acao).toBe('RECONTRATADO');
    expect(idsVinculosAtivos(recontratado).has(antigo)).toBe(false);
  });
  it('mudança de empresa, setor e salário vale desde a competência definida', () => {
    const x = preparado();
    const c1 = contratar(x.s, x.entrada, dp, x.s.revisao);
    const id = c1.vinculos[0].id;
    const mudou = movimentar(c1, {
      vinculoId: id, aPartir: { ano: 2026, mes: 11 },
      empresaContratanteId: x.s.empresas[1].id,
      empresaLotadoId: x.s.empresas[1].id, setorLotacaoId: x.s.setores[0].id,
      cargo: 'Supervisora', salarioContratual: 3100,
    }, dp, c1.revisao);
    expect(fotografarFuncionarios(mudou, { ano: 2026, mes: 10 })[0].salarioContratual).toBe(2200);
    expect(fotografarFuncionarios(mudou, { ano: 2026, mes: 11 })[0].salarioContratual).toBe(3100);
    expect(fotografarFuncionarios(mudou, { ano: 2026, mes: 11 })[0].empresaContratanteId)
      .toBe(x.s.empresas[1].id);
  });
  it('desligado não entra em novos snapshots, sem apagar histórico', () => {
    const x = preparado();
    const c1 = contratar(x.s, x.entrada, dp, x.s.revisao);
    const snapshot = fotografarFuncionarios(c1, { ano: 2026, mes: 10 });
    const desligado = desligar(c1, c1.vinculos[0].id, dp, c1.revisao);
    expect(fotografarFuncionarios(desligado, { ano: 2026, mes: 10 })).toEqual([]);
    expect(snapshot).toHaveLength(1);
    expect(desligado.vinculos[0].ativo).toBe(false);
  });
  it('rejeita salário negativo e movimentação anterior à admissão', () => {
    const x = preparado();
    expect(() => contratar(x.s, { ...x.entrada, salarioContratual: -1 },
      dp, x.s.revisao)).toThrow(/Salário/);
    const c = contratar(x.s, x.entrada, dp, x.s.revisao);
    const v = c.vinculos[0];
    expect(() => movimentar(c, {
      vinculoId: v.id, aPartir: { ano: 2024, mes: 12 },
      empresaContratanteId: v.empresaContratanteId,
      empresaLotadoId: v.empresaLotadoId, setorLotacaoId: v.setorLotacaoId,
      cargo: v.cargo, salarioContratual: v.salarioContratual,
    }, dp, c.revisao)).toThrow(/admissão/);
  });
});
