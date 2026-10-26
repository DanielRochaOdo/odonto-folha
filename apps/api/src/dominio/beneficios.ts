import type { Competencia, Lancamento, Perfil, VinculoCampo } from '@odontofolha/contracts';
import { exigirCompetenciaAberta, type AtorFolha, type EstadoCompetencia } from './competencias';
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
export type RegraDescontoBeneficio = {
  id: string; campoOrigemId: string; campoDescontoId: string; nomeColuna: string;
  percentualPadrao: number; inicio: Competencia; ativo: boolean; criadaEm: string;
  autorId: string;
};
export type PercentualDescontoBeneficio = {
  id: string; funcionarioId: string; campoOrigemId: string; percentual: number;
  inicio: Competencia; criadaEm: string; autorId: string;
};
export type CatalogoBeneficios = {
  versao: number;
  bases: VersaoBeneficio[];
  excecoes: ExcecaoBeneficio[];
  regrasDesconto: RegraDescontoBeneficio[];
  percentuaisDesconto: PercentualDescontoBeneficio[];
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
const competenciaAtual = () => new Date().getUTCFullYear() * 12 + new Date().getUTCMonth() + 1;
const igual = (a: Competencia, b: Competencia) => a.ano === b.ano && a.mes === b.mes;
const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
let ultimoInstante = 0;
const hoje = () => {
  ultimoInstante = Math.max(Date.now(), ultimoInstante + 1);
  return new Date(ultimoInstante).toISOString();
};
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
  return { versao: 0, bases: [], excecoes: [], regrasDesconto: [],
    percentuaisDesconto: [], auditoria: [] };
}
/** Retorna base vigente mais recente ou exceção da competência, se presente. */
export function obterBeneficio(
  catalogo: CatalogoBeneficios, funcionarioId: string, campoId: string, competencia: Competencia,
): number | string | null {
  const excecao = [...catalogo.excecoes].reverse().find(e => e.funcionarioId === funcionarioId &&
    e.campoId === campoId && igual(e.competencia, competencia));
  if (excecao) return excecao.valor;
  const base = catalogo.bases
    .filter(e => e.funcionarioId === funcionarioId && e.campoId === campoId &&
      ordem(e.inicio) <= ordem(competencia))
    .reduce<VersaoBeneficio | undefined>((maisRecente, candidata) => {
      if (!maisRecente) return candidata;
      const inicioCandidata = ordem(candidata.inicio);
      const inicioAtual = ordem(maisRecente.inicio);
      return inicioCandidata > inicioAtual ||
        (inicioCandidata === inicioAtual && candidata.criadaEm > maisRecente.criadaEm)
        ? candidata : maisRecente;
    }, undefined);
  return base?.valor ?? null;
}
export function atualizarBaseRecorrente(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia, funcionarioId: string,
  campoId: string, valor: number | string, ator: AtorFolha, versaoEsperada: number,
): CatalogoBeneficios {
  exigirCompetenciaAberta(estado);
  garantirDp(ator.perfil);
  garantirVersao(catalogo, versaoEsperada);
  const campo = validarCampo(estado, campoId, funcionarioId);
  validarValor(campo.tipo, valor);
  const evento: VersaoBeneficio = { id: crypto.randomUUID(), funcionarioId, campoId,
    inicio: estado.competencia, valor, criadaEm: hoje(), autorId: ator.id };
  return { ...catalogo, versao: catalogo.versao + 1, bases: [...catalogo.bases, evento],
    excecoes: catalogo.excecoes,
    auditoria: [...catalogo.auditoria, registrar('BASE_ATUALIZADA', ator.id, evento.id)] };
}
/** Ajuste individual recorrente do percentual do desconto automático. */
export function atualizarPercentualDescontoRecorrente(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia,
  funcionarioId: string, campoOrigemId: string, percentual: number,
  ator: AtorFolha, versaoEsperada: number,
): CatalogoBeneficios {
  exigirCompetenciaAberta(estado);
  garantirDp(ator.perfil);
  garantirVersao(catalogo, versaoEsperada);
  const campo = validarCampo(estado, campoOrigemId, funcionarioId);
  if (campo.tipo !== 'moeda' || !catalogo.regrasDesconto.some(regra =>
    regra.campoOrigemId === campoOrigemId && regra.ativo &&
    ordem(regra.inicio) <= ordem(estado.competencia)))
    throw new Error('Desconto automático não está ativo para este campo');
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100)
    throw new Error('O percentual deve estar entre 0 e 100');
  if (ordem(estado.competencia) < competenciaAtual())
    throw new Error('Percentuais de desconto só podem ser alterados da competência atual em diante');
  const evento: PercentualDescontoBeneficio = {
    id: crypto.randomUUID(), funcionarioId, campoOrigemId, percentual,
    inicio: estado.competencia, criadaEm: hoje(), autorId: ator.id,
  };
  return { ...catalogo, versao: catalogo.versao + 1,
    percentuaisDesconto: [...catalogo.percentuaisDesconto, evento] };
}
/** Exceção não reescreve base nem altera meses futuros. */
export function definirExcecaoMensal(
  catalogo: CatalogoBeneficios, estado: EstadoCompetencia, funcionarioId: string,
  campoId: string, valor: number | string, ator: AtorFolha, versaoEsperada: number,
): CatalogoBeneficios {
  exigirCompetenciaAberta(estado);
  garantirDp(ator.perfil);
  garantirVersao(catalogo, versaoEsperada);
  const campo = validarCampo(estado, campoId, funcionarioId);
  validarValor(campo.tipo, valor);
  const evento: ExcecaoBeneficio = { id: crypto.randomUUID(), funcionarioId, campoId,
    competencia: estado.competencia, valor, criadaEm: hoje(), autorId: ator.id };
  return { ...catalogo, versao: catalogo.versao + 1, bases: catalogo.bases,
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
  exigirCompetenciaAberta(estado);
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
  return { ...catalogo, versao: catalogo.versao + 1, bases: [...catalogo.bases, ...eventos],
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
  const dados = {
    competencia: estado.competencia,
    funcionarios: estado.funcionarios.map(f => ({ ...f,
      ativo: f.ativo && funcionariosAtualmenteAtivos.has(f.id) })),
    camposDaCompetencia: estado.campos, vinculosDaCompetencia: estado.vinculos,
    lancamentosDaCompetencia: [...estado.lancamentos, ...artificiais],
  };
  const consolidacaoBase = gerarConsolidacao(dados);
  const vigencia = ordem(estado.competencia);
  const regras = catalogo.regrasDesconto.filter(regra => ordem(regra.inicio) <= vigencia)
    .reduce<RegraDescontoBeneficio[]>((atuais, regra) => {
      const indice = atuais.findIndex(item => item.campoOrigemId === regra.campoOrigemId);
      if (indice < 0) return [...atuais, regra];
      const anterior = atuais[indice];
      if (anterior && (ordem(regra.inicio) > ordem(anterior.inicio) ||
        (ordem(regra.inicio) === ordem(anterior.inicio) && regra.criadaEm > anterior.criadaEm)))
        return atuais.map((item, i) => i === indice ? regra : item);
      return atuais;
    }, []).filter(regra => regra.ativo);
  const colunasDesconto = regras.flatMap(regra => {
    const origem = estado.campos.find(campo => campo.id === regra.campoOrigemId &&
      campo.origem === 'BENEFICIO' && campo.tipo === 'moeda');
    if (!origem) return [];
    return [{ ...origem, id: regra.campoDescontoId, nome: regra.nomeColuna,
      tipo: 'moeda' as const, classificacao: 'desconto' as const,
      campoOrigemDesconto: regra.campoOrigemId,
      ordemGlobal: Math.max(0, ...estado.campos.map(campo => campo.ordemGlobal)) +
        regras.indexOf(regra) + 1 }];
  });
  if (!colunasDesconto.length)
    return { ...consolidacaoBase, percentuaisDesconto: {} as Record<string, number> };

  const linhasBase = consolidacaoBase.abas.flatMap(aba => aba.funcionarios);
  const vinculosDesconto: VinculoCampo[] = [];
  const lancamentosDesconto: Lancamento[] = [];
  const taxas: Record<string, number> = {};
  for (const coluna of colunasDesconto) {
    const regra = regras.find(item => item.campoDescontoId === coluna.id);
    if (!regra) continue;
    for (const vinculo of estado.vinculos.filter(item => item.campoId === regra.campoOrigemId)) {
      const linha = linhasBase.find(item => item.funcionario.id === vinculo.funcionarioId);
      const celulaOrigem = linha?.celulas[regra.campoOrigemId];
      // A coluna calculada só se aplica quando existe valor para usar como base.
      if (!linha || celulaOrigem?.situacao !== 'preenchido' ||
        typeof celulaOrigem.valor !== 'number') continue;
      const percentual = catalogo.percentuaisDesconto
        .filter(item => item.campoOrigemId === regra.campoOrigemId &&
          item.funcionarioId === vinculo.funcionarioId && ordem(item.inicio) <= vigencia)
        .reduce<PercentualDescontoBeneficio | undefined>((atual, item) =>
          !atual || ordem(item.inicio) > ordem(atual.inicio) ||
          (ordem(item.inicio) === ordem(atual.inicio) && item.criadaEm > atual.criadaEm)
            ? item : atual, undefined)?.percentual ?? regra.percentualPadrao;
      const desconto = centavos(celulaOrigem.valor * percentual / 100);
      vinculosDesconto.push({ funcionarioId: vinculo.funcionarioId, campoId: coluna.id });
      lancamentosDesconto.push({ id: 'desconto:' + estado.competencia.ano + ':' +
        estado.competencia.mes + ':' + vinculo.funcionarioId + ':' + coluna.id,
        funcionarioId: vinculo.funcionarioId, campoId: coluna.id, valor: desconto,
        modo: 'total', vigente: true });
      taxas[`${vinculo.funcionarioId}:${coluna.id}`] = percentual;
    }
  }
  const consolidacao = gerarConsolidacao({
    ...dados,
    camposDaCompetencia: [...dados.camposDaCompetencia, ...colunasDesconto],
    vinculosDaCompetencia: [...dados.vinculosDaCompetencia, ...vinculosDesconto],
    lancamentosDaCompetencia: [...dados.lancamentosDaCompetencia, ...lancamentosDesconto],
  });
  return { ...consolidacao, percentuaisDesconto: taxas };
}
