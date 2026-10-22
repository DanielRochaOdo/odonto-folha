import { describe, expect, it } from 'vitest';
import type { CampoDinamico, Funcionario } from '@odontofolha/contracts';
import { gerarConsolidacao } from './consolidacao';
import { gerarXlsx } from './exportacao-xlsx';

const competencia = { ano: 2026, mes: 10 };
const base: Omit<Funcionario, 'id' | 'nome' | 'cpf' | 'empresaContratanteId'> = {
  ativo: true, empresaLotadoId: 'empresa-b', setorLotacaoId: 'setor',
  cargo: 'Auxiliar', admissao: '2026-02-05', salarioContratual: 1500,
};
const funcionarios: Funcionario[] = [
  { ...base, id: 'pessoa-z', nome: 'Zélia Exemplo', cpf: '00000000003', empresaContratanteId: 'empresa-a' },
  { ...base, id: 'pessoa-a', nome: 'Ana Exemplo', cpf: '00000000002', empresaContratanteId: 'empresa-a' },
  { ...base, id: 'pessoa-b', nome: 'Bruno Exemplo', cpf: '00000000004', empresaContratanteId: 'empresa-b' },
  { ...base, id: 'inativo', nome: 'Inativo Exemplo', cpf: '00000000005', empresaContratanteId: 'empresa-b', ativo: false },
];
const campos: CampoDinamico[] = [
  { id: 'desconto', grupoId: 'x', grupoNome: 'Transporte', nome: 'Valor',
    origem: 'BENEFICIO', tipo: 'moeda', classificacao: 'desconto', ordemGlobal: 2, criadoEm: competencia },
  { id: 'comissao', grupoId: 'y', grupoNome: 'Atendimento', nome: 'Valor',
    origem: 'COMISSAO', tipo: 'moeda', classificacao: 'provento', ordemGlobal: 1, criadoEm: competencia },
  { id: 'percentual', grupoId: 'z', grupoNome: 'Índice', nome: 'Valor',
    origem: 'BENEFICIO', tipo: 'percentual', classificacao: 'informativo', ordemGlobal: 3, criadoEm: competencia },
];
const nomes = { empresas: { 'empresa-a': 'Alfa', 'empresa-b': 'Beta' }, setores: { setor: 'Recepção' } };
function exemplo() {
  return gerarConsolidacao({
    competencia, funcionarios, camposDaCompetencia: campos,
    vinculosDaCompetencia: [
      { funcionarioId: 'pessoa-a', campoId: 'comissao' },
      { funcionarioId: 'pessoa-a', campoId: 'desconto' },
      { funcionarioId: 'pessoa-z', campoId: 'comissao' },
    ],
    lancamentosDaCompetencia: [
      { id: 'zero', funcionarioId: 'pessoa-a', campoId: 'comissao', valor: 0, modo: 'total', vigente: true },
      { id: 'desconto', funcionarioId: 'pessoa-a', campoId: 'desconto', valor: 20, modo: 'total', vigente: true },
      { id: 'percentual', funcionarioId: 'pessoa-a', campoId: 'percentual', valor: 15, modo: 'total', vigente: true },
    ],
  });
}
describe('Exportação XLSX conforme E0', () => {
  it('produz ZIP XLSX, uma aba por empresa, sem resumo nem funcionários inativos', () => {
    const b = gerarXlsx(exemplo(), nomes);
    expect(b.readUInt32LE(0)).toBe(0x04034b50);
    const xml = b.toString('utf8');
    expect(xml).toContain('sheet name="Alfa"');
    expect(xml).toContain('sheet name="Beta"');
    expect(xml).not.toContain('sheet name="Resumo"');
    expect(xml).not.toContain('Inativo Exemplo');
    expect(xml.indexOf('Ana Exemplo')).toBeLessThan(xml.indexOf('Zélia Exemplo'));
  });
  it('preserva ordem global, zero informado e pendências vazias', () => {
    const xml = gerarXlsx(exemplo(), nomes).toString('utf8');
    expect(xml.indexOf('Atendimento — Valor')).toBeLessThan(xml.indexOf('Transporte — Valor'));
    expect(xml).toContain('r="I2" s="4"><v>0</v>');
    expect(xml).not.toContain('r="I3" s="4"');
    expect(xml).toContain('r="K2" s="5"><v>0.15</v>');
  });
  it('escreve fórmulas por pessoa e totais verticais', () => {
    const xml = gerarXlsx(exemplo(), nomes).toString('utf8');
    expect(xml).toContain('<f>SUM(H2,I2)-SUM(J2)</f>');
    expect(xml).toContain('<f>SUM(L2:L3)</f>');
    expect(xml).toContain('TOTAL PARCIAL');
  });
  it('não exporta cadastro incompleto de empresa ou setor', () => {
    expect(() => gerarXlsx(exemplo(), { empresas: {}, setores: {} }))
      .toThrow(/Empresa ou setor sem nome/);
  });
});
