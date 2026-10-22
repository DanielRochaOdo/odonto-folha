import type { Competencia, Perfil } from '@odontofolha/contracts';
import type { AtorFolha, EstadoCompetencia } from './competencias';
import { gerarConsolidacao } from './consolidacao';

/** Vigência é append-only: uma correção nunca altera o valor da base de meses passados. */
export type VersaoBeneficio = {
  id: string; funcionarioId: string; campoId: string;
  inicio: Competencia; valor: number | string; criadaEm: string; autorId: string;
};
export type ExcecaoBeneficio = {
  id: string; funcionarioId: string; campoId: string;
  competencia: Competencia; valor: number | string; criadaEm: string; autorId: string;
};
export type AuditoriaBeneficio = {
  acao: 'BASE_ATUALIZADA' | 'EXCECAO_MENSAL' | 'REAJUSTE_CONFIRMADO';
  autorId: string; referencia: string; criadoEm: string;
};
export type CatalogoBeneficios = {
  versao: number;
  bases: VersaoBeneficio[];
  excecoes: ExcecaoBeneficio[];
  auditoria: AuditoriaBeneficio[];
};
export type AjusteBeneficio = { modo: 'percentual' | 'moeda'; variacao: number };
export type PreviaReajuste = {
  versaoCatalogo: number;
  competencia: Competencia;
  campoId: string;
  modo: AjusteBeneficio['modo'];
  variacao: number;
  linhas: { funcionarioId: string; anterior: number; proposto: number }[];
};
const ordem = (c: Competencia) => c.ano * 12 + c.mes;
const igual = (a: Competencia, b: Competencia) => a.ano === b.ano && a.mes === b.mes;
const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const hoje = () => new Date().toISOString();
const registrar = (acao: AuditoriaBeneficio['acao'], autorId: string, referencia: string): AuditoriaBeneficio =>
  ({ acao, autorId, referencia, criadoEm: hoje() });
const garantirDp = (perfil: Perfil) => {
  if (perfil !== 'ADMIN' && perfil !== 'DP') throw new Error('Somente DP/ADMIN administra benefícios');
};
const garantirVersao = (catalogo: CatalogoBeneficios, esperada: number) => {
  if (catalogo.versao !== esperada) throw new Error('Conflito: benefício alterado por outra pessoa');
};
const validarCampo = (estado: EstadoCompetencia, campoId: string, funcionarioId: string) => {
  const campo = estado.campos.find(c => c.id === campoId);
  if (!campo || campo.origem !== 'BENEFICIO') throw new Error('Benefício não encontrado na competência');
  if (!estado.funcionarios.some(f => f.id === funcionarioId))
    throw new Error('Funcionário não encontrado na competência');
  if (!estado.vinculos.some(v => v.campoId === campoId && v.funcionarioId === funcionarioId))
    throw new Error('Funcionário não vinculado ao benefício');
  return campo;
};
const validarValor = (tipo: string, valor: number | string): void => {
  if (tipo === 'moeda' || tipo === 'percentual') {
    if (typeof valor !== 'number' || !Number.isFinite(valor) ||
      (tipo === 'moeda' && valor < 0))
      throw new Error('O valor deve ser numérico válido e não negativo quando monetário');
  } else if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error('O valor deve ser textual');
  }
};
export function catalogoVazio(): CatalogoBeneficios {
  return { versao: 0, bases: [], excecoes: [], auditoria: [] };
}
/** Retorna base vigente mais recente ou exceção da competência, se presente. */
export function obterBeneficio(
  catalogo: CatalogoBeneficios, funcionarioId: string, campoId: string, competencia: Competencia,
): number | string | null {
  const excecao = [...catalogo.excecoes].reverse().find(e => e.funcionarioId === funcionarioId &&
    e.campoId === campoId && igual(e.competencia, competencia));
  if (excecao) return excecao.valor;
  const base = [...catalogo.bases].reverse().find(e => e.funcionarioId === funcionarioId &&
    e.campoId === campoId && ordem(e.inicio) <= ordem(competencia));
  return base?.valor ?? null;
}
export function atualizarBaseRecorrente(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia, funcionarioId: string,
  campoId: string, valor: number | string, ator: AtorFolha, versaoEsperada: number,
): CatalogoBeneficios {
  garantirDp(ator.perfil);
  garantirVersao(catalogo, versaoEsperada);
  const campo = validarCampo(estado, campoId, funcionarioId);
  validarValor(campo.tipo, valor);
  const evento: VersaoBeneficio = { id: crypto.randomUUID(), funcionarioId, campoId,
    inicio: estado.competencia, valor, criadaEm: hoje(), autorId: ator.id };
  return { versao: catalogo.versao + 1, bases: [...catalogo.bases, evento],
    excecoes: catalogo.excecoes,
    auditoria: [...catalogo.auditoria, registrar('BASE_ATUALIZADA', ator.id, evento.id)] };
}
/** Exceção não reescreve base nem altera meses futuros. */
export function definirExcecaoMensal(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia, funcionarioId: string,
  campoId: string, valor: number | string, ator: AtorFolha, versaoEsperada: number,
): CatalogoBeneficios {
  garantirDp(ator.perfil);
  garantirVersao(catalogo, versaoEsperada);
  const campo = validarCampo(estado, campoId, funcionarioId);
  validarValor(campo.tipo, valor);
  const evento: ExcecaoBeneficio = { id: crypto.randomUUID(), funcionarioId, campoId,
    competencia: estado.competencia, valor, criadaEm: hoje(), autorId: ator.id };
  return { versao: catalogo.versao + 1, bases: catalogo.bases,
    excecoes: [...catalogo.excecoes, evento],
    auditoria: [...catalogo.auditoria, registrar('EXCECAO_MENSAL', ator.id, evento.id)] };
}
/** Prévia exigida antes de confirmar reajuste por campo, em grupo ou subconjunto. */
export function preverReajuste(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia, campoId: string,
  funcionariosIds: string[], ajuste: AjusteBeneficio,
): PreviaReajuste {
  const campo = estado.campos.find(c => c.id === campoId);
  if (!campo || campo.origem !== 'BENEFICIO' || campo.tipo !== 'moeda')
    throw new Error('Reajuste disponível apenas em campo de benefício monetário');
  if (!Number.isFinite(ajuste.variacao) || !funcionariosIds.length)
    throw new Error('Informe variação e pelo menos um funcionário');
  const ids = [...new Set(funcionariosIds)];
  const linhas = ids.map(funcionarioId => {
    validarCampo(estado, campoId, funcionarioId);
    const valor = obterBeneficio(catalogo, funcionarioId, campoId, estado.competencia);
    if (typeof valor !== 'number') throw new Error('Funcionário sem base monetária vigente');
    const proposto = centavos(ajuste.modo === 'percentual'
      ? valor * (1 + ajuste.variacao / 100) : valor + ajuste.variacao);
    if (proposto < 0) throw new Error('Reajuste não pode gerar valor negativo');
    return { funcionarioId, anterior: valor, proposto };
  });
  return { versaoCatalogo: catalogo.versao, competencia: estado.competencia,
    campoId, modo: ajuste.modo, variacao: ajuste.variacao, linhas };
}
export function confirmarReajuste(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia,
  previa: PreviaReajuste, ator: AtorFolha,
): CatalogoBeneficios {
  garantirDp(ator.perfil);
  garantirVersao(catalogo, previa.versaoCatalogo);
  if (!igual(estado.competencia, previa.competencia))
    throw new Error('Prévia pertence a outra competência');
  const verificada = preverReajuste(catalogo, estado, previa.campoId,
    previa.linhas.map(l => l.funcionarioId),
    { modo: previa.modo, variacao: previa.variacao });
  if (JSON.stringify(verificada.linhas) !== JSON.stringify(previa.linhas))
    throw new Error('Prévia desatualizada: revise os valores antes de confirmar');
  const eventos = previa.linhas.map(l => ({ id: crypto.randomUUID(),
    funcionarioId: l.funcionarioId, campoId: previa.campoId,
    inicio: estado.competencia, valor: l.proposto, criadaEm: hoje(), autorId: ator.id }));
  return { versao: catalogo.versao + 1, bases: [...catalogo.bases, ...eventos],
    excecoes: catalogo.excecoes,
    auditoria: [...catalogo.auditoria,
      registrar('REAJUSTE_CONFIRMADO', ator.id, previa.campoId)] };
}
/**
 * Valores recorrentes são calculados na leitura da competência: nenhum registro
 * de meses anteriores é reescrito. Edição explícita do DP prevalece sobre a base.
 * Não se replica comissão entre competências.
 */
export function consolidarComBeneficios(
  estado: EstadoCompetencia, catalogo: CatalogoBeneficios,
  funcionariosAtualmenteAtivos: ReadonlySet<string>,
) {
  const artificiais = estado.vinculos.flatMap(v => {
    const campo = estado.campos.find(c => c.id === v.campoId);
    if (!campo || campo.origem !== 'BENEFICIO') return [];
    if (estado.lancamentos.some(l => l.vigente && l.funcionarioId === v.funcionarioId &&
      l.campoId === v.campoId)) return [];
    const valor = obterBeneficio(catalogo, v.funcionarioId, v.campoId, estado.competencia);
    if (valor === null) return [];
    return [{ id: 'base:' + estado.competencia.ano + ':' + estado.competencia.mes + ':' +
      v.funcionarioId + ':' + v.campoId, funcionarioId: v.funcionarioId,
      campoId: v.campoId, valor, modo: 'total' as const, vigente: true }];
  });
  return gerarConsolidacao({
    competencia: estado.competencia,
    funcionarios: estado.funcionarios.map(f => ({ ...f,
      ativo: f.ativo && funcionariosAtualmenteAtivos.has(f.id) })),
    camposDaCompetencia: estado.campos, vinculosDaCompetencia: estado.vinculos,
    lancamentosDaCompetencia: [...estado.lancamentos, ...artificiais],
  });
}
