import type {
  CampoDinamico, Competencia, Lancamento, ResponsavelComissao,
} from '@odontofolha/contracts';
import type { AtorFolha } from './competencias';

export type GrupoConfigurado = {
  id: string; nome: string; origem: 'BENEFICIO' | 'COMISSAO';
  responsavel: ResponsavelComissao; ativo: boolean;
};
export type CampoConfigurado = CampoDinamico & { ativo: boolean };
export type AuditoriaCampo = {
  autorId: string; campoOuGrupoId: string; acao: string; criadaEm: string;
};
export type CatalogoCampos = {
  grupos: GrupoConfigurado[];
  campos: CampoConfigurado[];
  proximaOrdemGlobal: number;
  revisao: number;
  auditoria: AuditoriaCampo[];
};
export type NovoCampo = Pick<CampoDinamico, 'nome' | 'tipo' | 'classificacao' | 'criadoEm'>;

export function catalogoCamposVazio(): CatalogoCampos {
  return { grupos: [], campos: [], proximaOrdemGlobal: 0, revisao: 0, auditoria: [] };
}
function conferir(catalogo: CatalogoCampos, ator: AtorFolha, revisao: number): void {
  if (ator.perfil !== 'ADMIN' && ator.perfil !== 'DP')
    throw new Error('Somente DP/ADMIN configura campos dinâmicos');
  if (catalogo.revisao !== revisao) throw new Error('Conflito de edição de campos');
}
function evento(ator: AtorFolha, alvo: string, acao: string): AuditoriaCampo {
  return { autorId: ator.id, campoOuGrupoId: alvo, acao, criadaEm: new Date().toISOString() };
}
function proximo(catalogo: CatalogoCampos, eventoNovo: AuditoriaCampo) {
  return { revisao: catalogo.revisao + 1,
    auditoria: [...catalogo.auditoria, eventoNovo] };
}
const ordem = (c: Competencia) => c.ano * 12 + c.mes;
const nomeValido = (nome: string) => {
  const valor = nome.trim();
  if (!valor) throw new Error('Nome obrigatório');
  return valor;
};
export function criarGrupo(
  catalogo: CatalogoCampos,
  nome: string, origem: GrupoConfigurado['origem'],
  responsavel: ResponsavelComissao, ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  if (origem === 'BENEFICIO' && responsavel !== 'NENHUM')
    throw new Error('Benefícios não têm responsável ADM/CENTRAL');
  const grupo: GrupoConfigurado = {
    id: crypto.randomUUID(), nome: nomeValido(nome), origem, responsavel, ativo: true,
  };
  return { ...catalogo, grupos: [...catalogo.grupos, grupo],
    ...proximo(catalogo, evento(ator, grupo.id, 'GRUPO_CRIADO')) };
}
export function criarCampo(
  catalogo: CatalogoCampos, grupoId: string, novo: NovoCampo,
  ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  const grupo = catalogo.grupos.find(g => g.id === grupoId && g.ativo);
  if (!grupo) throw new Error('Grupo inexistente ou inativo');
  if (!['moeda', 'percentual', 'data', 'horario'].includes(novo.tipo))
    throw new Error('Tipo de campo inválido');
  const campo: CampoConfigurado = {
    id: crypto.randomUUID(), grupoId, grupoNome: grupo.nome, nome: nomeValido(novo.nome),
    origem: grupo.origem, tipo: novo.tipo, classificacao: novo.classificacao,
    criadoEm: novo.criadoEm, ordemGlobal: catalogo.proximaOrdemGlobal, ativo: true,
  };
  return { ...catalogo, campos: [...catalogo.campos, campo],
    proximaOrdemGlobal: catalogo.proximaOrdemGlobal + 1,
    ...proximo(catalogo, evento(ator, campo.id, 'CAMPO_CRIADO')) };
}
/**
 * Renomear nunca muda ordem nem ID. Tipo/classificação ficam imutáveis quando
 * qualquer competência já tenha valores, inclusive zero explícito ou histórico
 * substituído (valores não vigentes ainda contam como valores históricos).
 */
export function editarCampo(
  catalogo: CatalogoCampos, campoId: string,
  alteracoes: Partial<Pick<CampoConfigurado, 'nome' | 'tipo' | 'classificacao'>>,
  lancamentosHistoricos: Lancamento[], ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  const campo = catalogo.campos.find(c => c.id === campoId);
  if (!campo) throw new Error('Campo inexistente');
  const mudouTipo = alteracoes.tipo !== undefined && alteracoes.tipo !== campo.tipo;
  const mudouClassificacao = alteracoes.classificacao !== undefined &&
    alteracoes.classificacao !== campo.classificacao;
  if ((mudouTipo || mudouClassificacao) &&
    lancamentosHistoricos.some(l => l.campoId === campoId))
    throw new Error('Tipo e classificação bloqueados por valores históricos');
  const novos = catalogo.campos.map(c => c.id === campoId ? {
    ...c, nome: alteracoes.nome === undefined ? c.nome : nomeValido(alteracoes.nome),
    tipo: alteracoes.tipo ?? c.tipo, classificacao: alteracoes.classificacao ?? c.classificacao,
  } : c);
  return { ...catalogo, campos: novos,
    ...proximo(catalogo, evento(ator, campoId, 'CAMPO_EDITADO')) };
}
export function renomearGrupo(
  catalogo: CatalogoCampos, grupoId: string, nome: string, ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  if (!catalogo.grupos.some(g => g.id === grupoId)) throw new Error('Grupo inexistente');
  const valor = nomeValido(nome);
  return { ...catalogo,
    grupos: catalogo.grupos.map(g => g.id === grupoId ? { ...g, nome: valor } : g),
    campos: catalogo.campos.map(c => c.grupoId === grupoId ? { ...c, grupoNome: valor } : c),
    ...proximo(catalogo, evento(ator, grupoId, 'GRUPO_RENOMEADO')) };
}
export function ativarGrupo(
  catalogo: CatalogoCampos, grupoId: string, ativo: boolean, ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  if (!catalogo.grupos.some(g => g.id === grupoId)) throw new Error('Grupo inexistente');
  return { ...catalogo, grupos: catalogo.grupos.map(g => g.id === grupoId ? { ...g, ativo } : g),
    ...proximo(catalogo, evento(ator, grupoId, ativo ? 'GRUPO_ATIVADO' : 'GRUPO_DESATIVADO')) };
}
export function ativarCampo(
  catalogo: CatalogoCampos, campoId: string, ativo: boolean, ator: AtorFolha, revisao: number,
): CatalogoCampos {
  conferir(catalogo, ator, revisao);
  if (!catalogo.campos.some(c => c.id === campoId)) throw new Error('Campo inexistente');
  return { ...catalogo, campos: catalogo.campos.map(c => c.id === campoId ? { ...c, ativo } : c),
    ...proximo(catalogo, evento(ator, campoId, ativo ? 'CAMPO_ATIVADO' : 'CAMPO_DESATIVADO')) };
}
/** Campo desativado desaparece de novas competências, nunca do snapshot antigo. */
export function camposParaNovaCompetencia(catalogo: CatalogoCampos, competencia: Competencia): CampoDinamico[] {
  const gruposAtivos = new Set(catalogo.grupos.filter(g => g.ativo).map(g => g.id));
  return catalogo.campos.filter(c => c.ativo && gruposAtivos.has(c.grupoId) &&
    ordem(c.criadoEm) <= ordem(competencia))
    .sort((a, b) => a.ordemGlobal - b.ordemGlobal)
    .map(({ ativo: _ativo, ...restante }) => restante);
}
