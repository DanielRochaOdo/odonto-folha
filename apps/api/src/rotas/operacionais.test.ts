import { describe, expect, it } from 'vitest';
import type { CampoDinamico, Funcionario } from '@odontofolha/contracts';
import { abrirCompetencia } from '../dominio/competencias';
import { criarRotasOperacionais, type SessaoOperacional } from './operacionais';

const competencia = { ano: 2026, mes: 10 };
const f: Funcionario = {
  id: 'v1', empresaContratanteId: 'e1', empresaLotadoId: 'e1',
  setorLotacaoId: 's1', cpf: '00000000001', nome: 'Pessoa de Teste',
  cargo: 'Auxiliar', admissao: '2026-01-02', salarioContratual: 2000, ativo: true,
};
const c: CampoDinamico = {
  id: 'c1', grupoId: 'g1', grupoNome: 'Atendimento', nome: 'Comissão',
  origem: 'COMISSAO', tipo: 'moeda', classificacao: 'provento',
  ordemGlobal: 1, criadoEm: competencia,
};
function ambiente(sessao: SessaoOperacional | null = null, conflito = false) {
  let estado = abrirCompetencia({ competencia, funcionarios: [f], campos: [c],
    vinculos: [{ funcionarioId: 'v1', campoId: 'c1' }],
    gruposComissao: [{ grupoId: 'g1', responsavel: 'ADM' }] });
  const app = criarRotasOperacionais({
    autenticar: async () => sessao,
    buscarCompetencia: async () => estado,
    salvarSeRevisao: async (_id, revisao, novo) => {
      if (conflito || estado.revisao !== revisao) return false;
      estado = novo; return true;
    },
    funcionariosAtivos: async () => new Set(['v1']),
    nomesExportacao: async () => ({ empresas: { e1: 'Odontoart Exemplo' }, setores: { s1: 'Atendimento' } }),
    obterBeneficios: async () => ({ versao: 0, bases: [], excecoes: [], auditoria: [] }),
    listarCompetencias: async () => [{ id: '1', ano: 2026, mes: 10, revisao: estado.revisao }],
    abrirNovaCompetencia: async (ano, mes) => ({ id: 'nova', ano, mes, revisao: 0 }),
  });
  return { app, consultar: () => estado };
}
const dp = { usuarioId: 'dp-exemplo', perfil: 'DP' as const };
const adm = { usuarioId: 'adm-exemplo', perfil: 'ADM' as const };
const central = { usuarioId: 'central-exemplo', perfil: 'CENTRAL' as const };
describe('Rotas operacionais protegidas, sem banco real', () => {
  it('nega por padrão todo acesso sem sessão', async () => {
    const a = ambiente();
    expect((await a.app.request('http://localhost/api/competencias')).status).toBe(401);
    const r = await a.app.request('http://localhost/api/competencias/1/consolidacao');
    expect(r.status).toBe(401);
    const x = await a.app.request('http://localhost/api/competencias/1/exportacao.xlsx');
    expect(x.status).toBe(401);
  });
  it('não expõe salário/CPF de pessoas a ADM/CENTRAL', async () => {
    const a = ambiente(adm);
    const r = await a.app.request('http://localhost/api/competencias/1/comissoes/g1');
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Pessoa de Teste');
    expect(body).not.toContain('00000000001');
    expect(body).not.toContain('2000');
    expect((await a.app.request('http://localhost/api/competencias/1/consolidacao')).status).toBe(403);
    expect((await a.app.request('http://localhost/api/competencias/1/exportacao.xlsx')).status).toBe(403);
    expect((await ambiente(central).app.request('http://localhost/api/competencias/1/comissoes/g1')).status).toBe(403);
  });
  it('DP abre competência, lista meses e ADM não altera vínculos', async () => {
    const admin = ambiente(dp);
    const lista = await admin.app.request('http://localhost/api/competencias');
    expect(lista.status).toBe(200);
    const nova = await admin.app.request('http://localhost/api/competencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano: 2026, mes: 11 }),
    });
    expect(nova.status).toBe(201);
    const setor = ambiente(adm);
    expect((await setor.app.request('http://localhost/api/competencias')).status).toBe(403);
    const bloqueada = await setor.app.request('http://localhost/api/competencias/1/vinculos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionarioId: 'v1', campoId: 'c1',
        vinculado: false, versaoEsperada: 0 }),
    });
    expect(bloqueada.status).toBe(403);
  });
  it('ADM lança zero, conclui sua comissão e fica bloqueado', async () => {
    const a = ambiente(adm);
    const caminho = '/api/competencias/1/lancamentos';
    const corpo = JSON.stringify({ funcionarioId: 'v1', campoId: 'c1', valor: 0,
      modo: 'total', versaoEsperada: 0 });
    const r = await a.app.request('http://localhost' + caminho, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo,
    });
    expect(r.status).toBe(200);
    expect(a.consultar().lancamentos[0].valor).toBe(0);
    const fechar = await a.app.request('http://localhost/api/competencias/1/comissoes/g1/concluir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versaoEsperada: 1 }),
    });
    expect(fechar.status).toBe(200);
    const rejeitada = await a.app.request('http://localhost' + caminho, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionarioId: 'v1', campoId: 'c1', valor: 1,
        modo: 'parcela', versaoEsperada: 2, confirmarSubstituicao: true }),
    });
    expect(rejeitada.status).toBe(403);
  });
  it('DP exporta XLSX com cabeçalhos adequados e sem chamar banco real', async () => {
    const r = await ambiente(dp).app.request('http://localhost/api/competencias/1/exportacao.xlsx');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('spreadsheetml.sheet');
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  });
  it('recusa revisão concorrente e payload inválido', async () => {
    const a = ambiente(adm, true);
    const caminho = 'http://localhost/api/competencias/1/lancamentos';
    const r = await a.app.request(caminho, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionarioId: 'v1', campoId: 'c1',
        valor: 10, modo: 'total', versaoEsperada: 0 }),
    });
    expect(r.status).toBe(409);
    const invalido = await a.app.request(caminho, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionarioId: 'v1', campoId: 'c1', valor: {},
        modo: 'total', versaoEsperada: 0 }),
    });
    expect(invalido.status).toBe(400);
  });
});
