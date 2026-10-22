import { describe, expect, it } from 'vitest';
import type { CampoDinamico, Funcionario } from '@odontofolha/contracts';
import { abrirCompetencia } from './competencias';
import {
  catalogoVazio, obterBeneficio, atualizarBaseRecorrente, definirExcecaoMensal,
  preverReajuste, confirmarReajuste, consolidarComBeneficios,
} from './beneficios';

const dp = { id: 'dp', perfil: 'DP' as const };
const adm = { id: 'adm', perfil: 'ADM' as const };
const outubro = { ano: 2026, mes: 10 };
const novembro = { ano: 2026, mes: 11 };
const campo: CampoDinamico = {
  id: 'b', grupoId: 'g', grupoNome: 'Transporte', nome: 'Auxílio',
  origem: 'BENEFICIO', tipo: 'moeda', classificacao: 'provento',
  ordemGlobal: 1, criadoEm: outubro,
};
const pessoa: Funcionario = {
  id: 'v1', empresaContratanteId: 'e1', empresaLotadoId: 'e1', setorLotacaoId: 's1',
  cpf: '00000000001', nome: 'Funcionária Fictícia', cargo: 'Auxiliar',
  admissao: '2026-02-01', salarioContratual: 2000, ativo: true,
};
const estado = (competencia = outubro) => abrirCompetencia({
  competencia, funcionarios: [pessoa], campos: [campo],
  vinculos: [{ funcionarioId: 'v1', campoId: 'b' }], gruposComissao: [],
});
describe('Recorrência, vigência, exceção e reajuste E0', () => {
  it('repete base no futuro sem inventar valores nos meses anteriores', () => {
    const original = catalogoVazio();
    const base = atualizarBaseRecorrente(original, estado(), 'v1', 'b', 100, dp, 0);
    const novo = atualizarBaseRecorrente(base, estado(novembro), 'v1', 'b', 150, dp, base.versao);
    expect(obterBeneficio(novo, 'v1', 'b', outubro)).toBe(100);
    expect(obterBeneficio(novo, 'v1', 'b', novembro)).toBe(150);
    expect(obterBeneficio(original, 'v1', 'b', outubro)).toBeNull();
    expect(consolidarComBeneficios(estado(novembro), novo, new Set(['v1']))
      .abas[0].funcionarios[0].totalAritmetico).toBe(2150);
    expect(consolidarComBeneficios(estado(), novo, new Set(['v1']))
      .abas[0].funcionarios[0].totalAritmetico).toBe(2100);
  });
  it('prioriza a vigência mais recente mesmo quando uma versão antiga foi cadastrada depois', () => {
    const c = {
      ...catalogoVazio(),
      bases: [
        { id: 'novembro', funcionarioId: 'v1', campoId: 'b', inicio: novembro,
          valor: 150, criadaEm: '2026-10-01T00:00:00.000Z', autorId: 'dp' },
        { id: 'outubro', funcionarioId: 'v1', campoId: 'b', inicio: outubro,
          valor: 100, criadaEm: '2026-11-01T00:00:00.000Z', autorId: 'dp' },
      ],
    };
    expect(obterBeneficio(c, 'v1', 'b', outubro)).toBe(100);
    expect(obterBeneficio(c, 'v1', 'b', novembro)).toBe(150);
  });
  it('exceção tem precedência apenas no mês selecionado', () => {
    const c = atualizarBaseRecorrente(catalogoVazio(), estado(), 'v1', 'b', 100, dp, 0);
    const excecao = definirExcecaoMensal(c, estado(), 'v1', 'b', 0, dp, c.versao);
    expect(obterBeneficio(excecao, 'v1', 'b', outubro)).toBe(0);
    expect(obterBeneficio(excecao, 'v1', 'b', novembro)).toBe(100);
    expect(excecao.auditoria.at(-1)?.acao).toBe('EXCECAO_MENSAL');
  });
  it('reajuste mostra prévia, arredonda e impede valores negativos', () => {
    const c = atualizarBaseRecorrente(catalogoVazio(), estado(), 'v1', 'b', 101, dp, 0);
    const previa = preverReajuste(c, estado(novembro), 'b', ['v1'], {
      modo: 'percentual', variacao: 2.5,
    });
    expect(previa.linhas[0].proposto).toBe(103.53);
    const confirmado = confirmarReajuste(c, estado(novembro), previa, dp);
    expect(obterBeneficio(confirmado, 'v1', 'b', outubro)).toBe(101);
    expect(obterBeneficio(confirmado, 'v1', 'b', novembro)).toBe(103.53);
    expect(() => preverReajuste(c, estado(novembro), 'b', ['v1'], {
      modo: 'moeda', variacao: -102,
    })).toThrow(/negativo/);
  });
  it('não permite confirmar prévia desatualizada nem editar benefício por ADM', () => {
    const c = atualizarBaseRecorrente(catalogoVazio(), estado(), 'v1', 'b', 30, dp, 0);
    const previa = preverReajuste(c, estado(novembro), 'b', ['v1'], {
      modo: 'moeda', variacao: 10,
    });
    const atualizado = atualizarBaseRecorrente(c, estado(novembro), 'v1', 'b', 40, dp, c.versao);
    expect(() => confirmarReajuste(atualizado, estado(novembro), previa, dp))
      .toThrow(/Conflito/);
    expect(() => confirmarReajuste(c, estado(novembro), previa, adm))
      .toThrow(/DP\/ADMIN/);
  });
  it('o desligado não aparece na exportação mas versões ficam armazenadas', () => {
    const c = atualizarBaseRecorrente(catalogoVazio(), estado(), 'v1', 'b', 150, dp, 0);
    expect(consolidarComBeneficios(estado(), c, new Set()).abas).toHaveLength(0);
    expect(c.bases).toHaveLength(1);
  });
});
