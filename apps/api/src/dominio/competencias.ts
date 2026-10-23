import type {
  CampoDinamico, Competencia, Funcionario, Lancamento, Perfil,
  ResponsavelComissao, VinculoCampo,
} from '@odontofolha/contracts';
import { gerarConsolidacao } from './consolidacao';
import { podeEditarConsolidacao, podePreencherComissao } from './permissoes';

export type AtorFolha = { id: string; perfil: Perfil };
export type EnvioComissao = {
  grupoId: string;
  responsavel: ResponsavelComissao;
  concluido: boolean;
  concluidoEm: string | null;
  concluidoPor: string | null;
};
export type EventoAuditoria = {
  id: string; autorId: string; acao: string; entidadeId: string;
  competencia: Competencia; ocorridoEm: string;
};
export type EstadoCompetencia = {
  competencia: Competencia;
  funcionarios: Funcionario[];
  campos: CampoDinamico[];
  vinculos: VinculoCampo[];
  lancamentos: Lancamento[];
  envios: EnvioComissao[];
  /** Campo já visível que foi desativado durante a competência: setor não edita. */
  camposBloqueados: string[];
  revisao: number;
  auditoria: EventoAuditoria[];
};
export type CampoResponsavel = { grupoId: string; responsavel: ResponsavelComissao };
export type OpcaoLancamento = {
  funcionarioId: string;
  campoId: string;
  valor: number | string;
  modo: Lancamento['modo'];
  versaoEsperada: number;
  confirmarSubstituicao?: boolean;
};
export type ResultadoEdicao = { estado: EstadoCompetencia; avisos: string[] };

function chaveMes(c: Competencia): number { return c.ano * 12 + c.mes; }
function registro(estado: EstadoCompetencia, acao: string, entidadeId: string, ator: AtorFolha): EventoAuditoria {
  return { id: crypto.randomUUID(), autorId: ator.id, acao, entidadeId,
    competencia: estado.competencia, ocorridoEm: new Date().toISOString() };
}
function verificarRevisao(estado: EstadoCompetencia, revisao: number): void {
  if (estado.revisao !== revisao) throw new Error('Conflito de edição: recarregue a competência');
}
function aplicado(estado: EstadoCompetencia, funcionarioId: string, campoId: string): boolean {
  return estado.vinculos.some(v => v.funcionarioId === funcionarioId && v.campoId === campoId);
}
function registrosVigentes(estado: EstadoCompetencia, funcionarioId: string, campoId: string): Lancamento[] {
  return estado.lancamentos.filter(l => l.funcionarioId === funcionarioId &&
    l.campoId === campoId && l.vigente);
}
function alterar(estado: EstadoCompetencia, lancamentos: Lancamento[], evento: EventoAuditoria): EstadoCompetencia {
  return { ...estado, lancamentos, revisao: estado.revisao + 1,
    auditoria: [...estado.auditoria, evento] };
}
function conferirValor(campo: CampoDinamico, valor: number | string, modo: Lancamento['modo']): void {
  if (modo === 'parcela' && campo.tipo !== 'moeda') {
    throw new Error('Parcelas exigem campo monetário');
  }
  if (campo.tipo === 'moeda' || campo.tipo === 'percentual') {
    if (typeof valor !== 'number' || !Number.isFinite(valor))
      throw new Error('Campo numérico exige valor finito');
    return;
  }
  if (typeof valor !== 'string') throw new Error('Campo textual exige texto');
  if (campo.tipo === 'data' && !/^\d{4}-\d\d-\d\d$/.test(valor))
    throw new Error('Data deve estar em AAAA-MM-DD');
  if (campo.tipo === 'horario' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor))
    throw new Error('Horário deve estar em HH:MM');
}
/**
 * Fotografia de uma competência. As colunas criadas depois e os funcionários
 * desligados não entram; nunca modificar os snapshots de meses anteriores.
 * Vinculações são fotografadas na abertura e podem ser alteradas com auditoria.
 */
export function abrirCompetencia(dados: {
  competencia: Competencia;
  funcionarios: Funcionario[];
  campos: CampoDinamico[];
  vinculos: VinculoCampo[];
  gruposComissao: CampoResponsavel[];
}): EstadoCompetencia {
  const ativos = dados.funcionarios.filter(f => f.ativo).map(f => ({ ...f }));
  const colunas = dados.campos.filter(c => chaveMes(c.criadoEm) <= chaveMes(dados.competencia))
    .map(c => ({ ...c })).sort((a, b) => a.ordemGlobal - b.ordemGlobal);
  const idsFuncionario = new Set(ativos.map(f => f.id));
  const idsCampo = new Set(colunas.map(c => c.id));
  return {
    competencia: { ...dados.competencia }, funcionarios: ativos, campos: colunas,
    vinculos: dados.vinculos.filter(v => idsFuncionario.has(v.funcionarioId) && idsCampo.has(v.campoId)),
    lancamentos: [], camposBloqueados: [], envios: dados.gruposComissao
      .filter(g => colunas.some(c => c.origem === 'COMISSAO' && c.grupoId === g.grupoId))
      .map(g => ({ grupoId: g.grupoId, responsavel: g.responsavel, concluido: false,
        concluidoEm: null, concluidoPor: null })),
    revisao: 0, auditoria: [],
  };
}

/** Atualiza a competência corrente, sem adicionar campos a competências anteriores. */
export function incluirCampoNaCompetencia(
  estado: EstadoCompetencia, campo: CampoDinamico, ator: AtorFolha,
  versaoEsperada: number,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  if (!podeEditarConsolidacao(ator.perfil)) throw new Error('Sem permissão para alterar colunas');
  if (chaveMes(campo.criadoEm) > chaveMes(estado.competencia))
    throw new Error('Campo não pertence a esta competência');
  if (estado.campos.some(c => c.id === campo.id)) return estado;
  return { ...estado, campos: [...estado.campos, campo].sort((a, b) => a.ordemGlobal - b.ordemGlobal),
    revisao: estado.revisao + 1,
    auditoria: [...estado.auditoria, registro(estado, 'CAMPO_INCLUIDO', campo.id, ator)] };
}

/**
 * Vinculação atualiza a lista do setor, mas nunca apaga históricos de lançamento.
 * Uma célula desvinculada e preenchida permanece no consolidado.
 */
export function definirVinculo(
  estado: EstadoCompetencia, funcionarioId: string, campoId: string,
  vinculado: boolean, ator: AtorFolha, versaoEsperada: number,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  if (!podeEditarConsolidacao(ator.perfil)) throw new Error('Sem permissão para vínculos');
  if (!estado.funcionarios.some(f => f.id === funcionarioId) ||
    !estado.campos.some(c => c.id === campoId)) throw new Error('Funcionário ou campo inexistente');
  const anterior = aplicado(estado, funcionarioId, campoId);
  if (anterior === vinculado) return estado;
  const novo = estado.vinculos.filter(v => v.funcionarioId !== funcionarioId || v.campoId !== campoId);
  if (vinculado) novo.push({ funcionarioId, campoId });
  return { ...estado, vinculos: novo, revisao: estado.revisao + 1,
    auditoria: [...estado.auditoria, registro(estado, vinculado ? 'VINCULADO' : 'DESVINCULADO',
      funcionarioId + ':' + campoId, ator)] };
}

/**
 * Edição do módulo ou tabela principal compartilha o mesmo registro.
 * Troca total/parcela exige confirmação, preservando entradas substituídas.
 * Zero é sempre um lançamento preenchido; ausência é pendência.
 */
export function salvarLancamento(
  estado: EstadoCompetencia, opcao: OpcaoLancamento, ator: AtorFolha,
): ResultadoEdicao {
  verificarRevisao(estado, opcao.versaoEsperada);
  const campo = estado.campos.find(c => c.id === opcao.campoId);
  const funcionario = estado.funcionarios.find(f => f.id === opcao.funcionarioId);
  if (!campo || !funcionario) throw new Error('Funcionário ou campo inexistente');
  const associado = aplicado(estado, opcao.funcionarioId, campo.id);
  const anteriores = registrosVigentes(estado, opcao.funcionarioId, campo.id);
  if (!associado && anteriores.length === 0)
    throw new Error('Funcionário não vinculado ao campo');
  if (campo.origem === 'BENEFICIO') {
    if (!podeEditarConsolidacao(ator.perfil))
      throw new Error('Somente DP/ADMIN pode editar benefícios');
  } else {
    const envio = estado.envios.find(e => e.grupoId === campo.grupoId);
    if (!envio) throw new Error('Responsável da comissão não configurado');
    if (!podePreencherComissao(ator.perfil, envio.responsavel, envio.concluido, associado))
      throw new Error('Comissão bloqueada ou fora do escopo do perfil');
  }
  if (estado.camposBloqueados.includes(campo.id) && !podeEditarConsolidacao(ator.perfil))
    throw new Error('Campo desativado: edição de setor bloqueada');
  conferirValor(campo, opcao.valor, opcao.modo);
  const modosAnteriores = new Set(anteriores.map(l => l.modo));
  const substitui = modosAnteriores.size > 0 &&
    (opcao.modo === 'total' || modosAnteriores.has('total'));
  if (substitui && !opcao.confirmarSubstituicao)
    throw new Error('Confirme a substituição de lançamentos anteriores');
  const avisos: string[] = [];
  if (opcao.modo === 'parcela' && anteriores.some(l => l.valor === opcao.valor))
    avisos.push('Possível parcela duplicada: confira antes de prosseguir');
  const historico = estado.lancamentos.map(l =>
    substitui && l.vigente && l.funcionarioId === opcao.funcionarioId && l.campoId === campo.id
      ? { ...l, vigente: false } : l);
  const novo: Lancamento = {
    id: crypto.randomUUID(), funcionarioId: opcao.funcionarioId,
    campoId: campo.id, modo: opcao.modo, valor: opcao.valor, vigente: true,
  };
  return { estado: alterar(estado, [...historico, novo],
    registro(estado, substitui ? 'LANCAMENTO_SUBSTITUIDO' : 'LANCAMENTO_CRIADO', novo.id, ator)),
    avisos };
}

/** Salva o mesmo valor em vÃ¡rios funcionÃ¡rios como uma Ãºnica revisÃ£o lÃ³gica. */
export function salvarLancamentosEmMassa(
  estado: EstadoCompetencia,
  opcao: Omit<OpcaoLancamento, 'funcionarioId'> & { funcionariosIds: string[] },
  ator: AtorFolha,
): ResultadoEdicao {
  const ids = [...new Set(opcao.funcionariosIds)];
  if (!ids.length) throw new Error('Selecione pelo menos um funcionÃ¡rio');
  let atual = estado;
  const avisos: string[] = [];
  for (const funcionarioId of ids) {
    const resultado = salvarLancamento(atual, {
      ...opcao, funcionarioId, versaoEsperada: atual.revisao,
    }, ator);
    atual = resultado.estado;
    avisos.push(...resultado.avisos);
  }
  return { estado: { ...atual, revisao: estado.revisao + 1 }, avisos: [...new Set(avisos)] };
}
/** Desativação no mês preserva coluna/valores, mas bloqueia novos envios do setor. */
export function definirBloqueioCampo(
  estado: EstadoCompetencia, campoId: string, bloqueado: boolean,
  ator: AtorFolha, versaoEsperada: number,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  if (!podeEditarConsolidacao(ator.perfil)) throw new Error('Somente DP/ADMIN altera bloqueio');
  if (!estado.campos.some(c => c.id === campoId)) throw new Error('Campo não pertence ao mês');
  const bloqueios = new Set(estado.camposBloqueados);
  if (bloqueado) bloqueios.add(campoId);
  else bloqueios.delete(campoId);
  return { ...estado, camposBloqueados: [...bloqueios], revisao: estado.revisao + 1,
    auditoria: [...estado.auditoria, registro(estado, bloqueado ? 'CAMPO_BLOQUEADO' : 'CAMPO_REATIVADO',
      campoId, ator)] };
}
/** Apaga valores vigentes, preservando eventos substituídos para auditoria. */
export function limparLancamentos(
  estado: EstadoCompetencia, funcionarioId: string, campoId: string,
  ator: AtorFolha, versaoEsperada: number,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  if (!podeEditarConsolidacao(ator.perfil)) throw new Error('Somente DP/ADMIN pode limpar valores');
  const existentes = registrosVigentes(estado, funcionarioId, campoId);
  if (!existentes.length) return estado;
  return alterar(estado, estado.lancamentos.map(l => l.vigente && l.funcionarioId === funcionarioId &&
    l.campoId === campoId ? { ...l, vigente: false } : l),
    registro(estado, 'LANCAMENTO_LIMPO', funcionarioId + ':' + campoId, ator));
}
function validarGrupo(estado: EstadoCompetencia, grupoId: string, ator: AtorFolha): EnvioComissao {
  const envio = estado.envios.find(e => e.grupoId === grupoId);
  if (!envio || envio.responsavel === 'NENHUM')
    throw new Error('Esta comissão não utiliza conclusão de envio');
  if (!podeEditarConsolidacao(ator.perfil) && ator.perfil !== envio.responsavel)
    throw new Error('Perfil não autorizado para a comissão');
  return envio;
}
export function pendenciasComissao(estado: EstadoCompetencia, grupoId: string): string[] {
  const campos = estado.campos.filter(c => c.origem === 'COMISSAO' && c.grupoId === grupoId);
  return estado.vinculos.filter(v => campos.some(c => c.id === v.campoId) &&
    registrosVigentes(estado, v.funcionarioId, v.campoId).length === 0)
    .map(v => v.funcionarioId + ':' + v.campoId);
}
export function concluirComissao(
  estado: EstadoCompetencia, grupoId: string, ator: AtorFolha,
  versaoEsperada: number, confirmarPendentes = false,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  const envio = validarGrupo(estado, grupoId, ator);
  if (envio.concluido) return estado;
  if (pendenciasComissao(estado, grupoId).length && !confirmarPendentes)
    throw new Error('Comissão possui pendências; confirme a conclusão parcial');
  const data = new Date().toISOString();
  return { ...estado, envios: estado.envios.map(e => e.grupoId === grupoId
    ? { ...e, concluido: true, concluidoEm: data, concluidoPor: ator.id } : e),
  revisao: estado.revisao + 1,
  auditoria: [...estado.auditoria, registro(estado, 'COMISSAO_CONCLUIDA', grupoId, ator)] };
}
export function reabrirComissao(
  estado: EstadoCompetencia, grupoId: string, ator: AtorFolha, versaoEsperada: number,
): EstadoCompetencia {
  verificarRevisao(estado, versaoEsperada);
  if (!podeEditarConsolidacao(ator.perfil)) throw new Error('Somente DP/ADMIN pode reabrir comissão');
  const envio = estado.envios.find(e => e.grupoId === grupoId);
  if (!envio) throw new Error('Comissão inexistente');
  if (!envio.concluido) return estado;
  return { ...estado, envios: estado.envios.map(e => e.grupoId === grupoId
    ? { ...e, concluido: false, concluidoEm: null, concluidoPor: null } : e),
  revisao: estado.revisao + 1,
  auditoria: [...estado.auditoria, registro(estado, 'COMISSAO_REABERTA', grupoId, ator)] };
}
/**
 * Usa a fotografia salarial e as colunas do mês. O estado atual dos desligamentos
 * é aplicado no momento da exportação, inclusive ao reexportar meses antigos.
 */
export function consolidarEstado(
  estado: EstadoCompetencia, funcionariosAtualmenteAtivos: ReadonlySet<string>,
) {
  return gerarConsolidacao({
    competencia: estado.competencia,
    funcionarios: estado.funcionarios.map(f => ({
      ...f, ativo: f.ativo && funcionariosAtualmenteAtivos.has(f.id),
    })),
    camposDaCompetencia: estado.campos,
    vinculosDaCompetencia: estado.vinculos,
    lancamentosDaCompetencia: estado.lancamentos,
  });
}
