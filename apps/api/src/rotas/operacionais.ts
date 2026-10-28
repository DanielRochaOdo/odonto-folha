import { Hono } from 'hono';
import { z } from '@odontofolha/contracts';
import type { Perfil } from '@odontofolha/contracts';
import type { EstadoCompetencia } from '../dominio/competencias';
import { salvarLancamento, salvarLancamentosEmMassa, concluirComissao, reabrirComissao,
  definirVinculo, fecharCompetencia, reabrirCompetencia } from '../dominio/competencias';
import { consolidarComBeneficios, type CatalogoBeneficios } from '../dominio/beneficios';
import { gerarXlsx, type NomesExportacao } from '../dominio/exportacao-xlsx';
import { podeEditarConsolidacao } from '../dominio/permissoes';

export type SessaoOperacional = {
  usuarioId: string;
  perfil: Perfil;
  centrosCustoIds: string[];
};
export type DependenciasOperacionais = {
  /**
   * Recebe cabeçalhos e valida a sessão no provedor real; não inferir papel
   * de cabeçalho controlado pelo cliente. null sempre retorna HTTP 401.
   */
  autenticar: (cabecalhos: Headers) => Promise<SessaoOperacional | null>;
  buscarCompetencia: (id: string) => Promise<EstadoCompetencia | null>;
  /** Compare-and-swap ATÔMICO por competência; false = conflito HTTP 409. */
  salvarSeRevisao: (id: string, revisaoAnterior: number, estado: EstadoCompetencia) => Promise<boolean>;
  funcionariosAtivos: () => Promise<ReadonlySet<string>>;
  nomesExportacao: () => Promise<NomesExportacao>;
  obterBeneficios: () => Promise<CatalogoBeneficios>;
  listarCompetencias: () => Promise<{ id: string; ano: number; mes: number; revisao: number;
    criadaEm?: string; fechadaEm: string | null; fechadaComPendencias: boolean }[]>;
  abrirNovaCompetencia: (ano: number, mes: number, autorId: string) => Promise<{
    id: string; ano: number; mes: number; revisao: number;
  } | null>;
};

const atorFolha = (sessao: SessaoOperacional) => ({
  id: sessao.usuarioId, perfil: sessao.perfil, centrosCustoIds: sessao.centrosCustoIds,
});

const schemaNovaCompetencia = z.object({
  ano: z.number().int().min(2000).max(2200),
  mes: z.number().int().min(1).max(12),
}).strict();
const schemaVinculo = z.object({
  funcionarioId: z.string().min(1),
  campoId: z.string().min(1),
  vinculado: z.boolean(),
  versaoEsperada: z.number().int().nonnegative(),
}).strict();

const schemaLancamento = z.object({
  funcionarioId: z.string().min(1),
  campoId: z.string().min(1),
  valor: z.union([z.number().finite(), z.string().min(1)]),
  modo: z.enum(['total', 'parcela']),
  versaoEsperada: z.number().int().nonnegative(),
  confirmarSubstituicao: z.boolean().optional(),
}).strict();
const schemaLancamentosEmMassa = z.object({
  funcionariosIds: z.array(z.string().min(1)).min(1).max(10000),
  campoId: z.string().min(1),
  valor: z.union([z.number().finite(), z.string().min(1)]),
  modo: z.enum(['total', 'parcela']),
  versaoEsperada: z.number().int().nonnegative(),
  confirmarSubstituicao: z.boolean().optional(),
}).strict();
const schemaEnvio = z.object({
  versaoEsperada: z.number().int().nonnegative(),
  confirmarPendentes: z.boolean().optional(),
}).strict();
const schemaFechamento = z.object({
  versaoEsperada: z.number().int().nonnegative(),
  confirmarPendencias: z.boolean().optional(),
}).strict();

type PendenciaSetor = { responsavel: string; quantidade: number;
  grupos: { nome: string; quantidade: number }[] };
function agruparPendencias(
  estado: EstadoCompetencia, catalogo: CatalogoBeneficios, funcionariosAtivos: ReadonlySet<string>,
): PendenciaSetor[] {
  const consolidado = consolidarComBeneficios(estado, catalogo, funcionariosAtivos);
  const campos = new Map(consolidado.colunas.map(campo => [campo.id, campo]));
  const responsaveis = new Map(estado.envios.map(envio => [envio.grupoId, envio.responsavel]));
  const setores = new Map<string, Map<string, number>>();
  for (const aba of consolidado.abas) for (const linha of aba.funcionarios) {
    for (const [campoId, celula] of Object.entries(linha.celulas)) {
      if (celula.situacao !== 'pendente') continue;
      const campo = campos.get(campoId);
      if (!campo) continue;
      const responsavel = campo.origem === 'BENEFICIO' ? 'DP'
        : responsaveis.get(campo.grupoId) === 'NENHUM'
          ? 'DP/ADMIN (comissão sem setor definido)'
          : responsaveis.get(campo.grupoId) ?? 'DP/ADMIN (responsável não definido)';
      const grupos = setores.get(responsavel) ?? new Map<string, number>();
      grupos.set(campo.grupoNome, (grupos.get(campo.grupoNome) ?? 0) + 1);
      setores.set(responsavel, grupos);
    }
  }
  return [...setores].map(([responsavel, grupos]) => ({ responsavel,
    quantidade: [...grupos.values()].reduce((total, quantidade) => total + quantidade, 0),
    grupos: [...grupos].map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  })).sort((a, b) => a.responsavel.localeCompare(b.responsavel, 'pt-BR'));
}

function erroDominio(e: unknown): { status: 400 | 403 | 409; mensagem: string } {
  const m = e instanceof Error ? e.message : 'Operação não permitida';
  if (/Conflito|Competência fechada/.test(m))
    return { status: 409, mensagem: /Competência fechada/.test(m) ? m
      : 'Conflito de edição: atualize a competência' };
  if (/Sem permissão|Somente DP|Perfil não autorizado|fora do escopo|bloqueada/.test(m))
    return { status: 403, mensagem: 'Operação não autorizada para este perfil' };
  return { status: 400, mensagem: m };
}

/** Rotas só são montadas depois de conectar Better Auth e repositório transacional. */
export function criarRotasOperacionais(deps: DependenciasOperacionais) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.use('/competencias', async (c, proximo) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await proximo();
  });
  app.use('/competencias/*', async (c, proximo) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await proximo();
  });

  app.get('/competencias', async c => {
    const sessao = c.get('sessao');
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN visualiza todas as competências' }, 403);
    return c.json({ competencias: await deps.listarCompetencias() });
  });

  app.post('/competencias', async c => {
    const sessao = c.get('sessao');
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN abre competências' }, 403);
    const corpo = schemaNovaCompetencia.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return c.json({ erro: 'Competência inválida' }, 400);
    const nova = await deps.abrirNovaCompetencia(
      corpo.data.ano, corpo.data.mes, sessao.usuarioId);
    if (!nova) return c.json({ erro: 'Competência já existe' }, 409);
    return c.json(nova, 201);
  });

  app.post('/competencias/:id/vinculos', async c => {
    const sessao = c.get('sessao');
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN altera vínculos' }, 403);
    const corpo = schemaVinculo.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return c.json({ erro: 'Dados de vínculo inválidos' }, 400);
    const id = c.req.param('id');
    const estado = await deps.buscarCompetencia(id);
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const novo = definirVinculo(estado, corpo.data.funcionarioId, corpo.data.campoId,
        corpo.data.vinculado, atorFolha(sessao),
        corpo.data.versaoEsperada);
      if (novo === estado) return c.json({ revisao: estado.revisao });
      if (!(await deps.salvarSeRevisao(id, estado.revisao, novo)))
        return c.json({ erro: 'Conflito de edição' }, 409);
      return c.json({ revisao: novo.revisao });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });

  app.get('/competencias/:id/consolidacao', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Sem permissão para consolidação geral' }, 403);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    return c.json({ ...consolidarComBeneficios(estado, await deps.obterBeneficios(), await deps.funcionariosAtivos()),
      revisao: estado.revisao, versaoBeneficios: (await deps.obterBeneficios()).versao,
      envios: estado.envios, nomes: await deps.nomesExportacao(),
      fechadaEm: estado.fechadaEm, fechadaPor: estado.fechadaPor,
      fechadaComPendencias: estado.fechadaComPendencias });
  });

  app.post('/competencias/:id/fechar', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN pode fechar competência' }, 403);
    const parsed = schemaFechamento.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de fechamento inválidos' }, 400);
    const id = c.req.param('id');
    const estado = await deps.buscarCompetencia(id);
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    if (estado.fechadaEm) return c.json({ erro: 'Competência já está fechada' }, 409);
    const pendencias = agruparPendencias(estado, await deps.obterBeneficios(),
      await deps.funcionariosAtivos());
    if (pendencias.length && !parsed.data.confirmarPendencias)
      return c.json({ codigo: 'PENDENCIAS', revisao: estado.revisao, pendencias }, 409);
    try {
      const novo = fecharCompetencia(estado, atorFolha(sessao),
        parsed.data.versaoEsperada, pendencias.length > 0);
      if (!(await deps.salvarSeRevisao(id, estado.revisao, novo)))
        return c.json({ codigo: 'CONFLITO', erro: 'A competência mudou. Atualize antes de fechar.' }, 409);
      return c.json({ revisao: novo.revisao, fechadaEm: novo.fechadaEm,
        fechadaComPendencias: novo.fechadaComPendencias });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });

  app.post('/competencias/:id/reabrir', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN pode reabrir competência' }, 403);
    const parsed = schemaFechamento.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de reabertura inválidos' }, 400);
    const id = c.req.param('id');
    const estado = await deps.buscarCompetencia(id);
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const novo = reabrirCompetencia(estado, atorFolha(sessao),
        parsed.data.versaoEsperada);
      if (novo === estado) return c.json({ revisao: estado.revisao, fechadaEm: null });
      if (!(await deps.salvarSeRevisao(id, estado.revisao, novo)))
        return c.json({ codigo: 'CONFLITO', erro: 'A competência mudou. Atualize antes de reabrir.' }, 409);
      return c.json({ revisao: novo.revisao, fechadaEm: null });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });

  app.get('/competencias/:id/comissoes/:grupo', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    const envio = estado.envios.find(e => e.grupoId === c.req.param('grupo'));
    if (!envio) return c.json({ erro: 'Comissão não encontrada' }, 404);
    if (!podeEditarConsolidacao(sessao.perfil) &&
      (!envio.centroCustoId || !sessao.centrosCustoIds.includes(envio.centroCustoId)))
      return c.json({ erro: 'Comissão fora do escopo' }, 403);
    const campos = estado.campos.filter(campo => campo.origem === 'COMISSAO' &&
      campo.grupoId === envio.grupoId);
    const idsCampo = new Set(campos.map(campo => campo.id));
    const vinculados = estado.vinculos.filter(v => idsCampo.has(v.campoId));
    const idsPessoa = new Set(vinculados.map(v => v.funcionarioId));
    const funcionarios = estado.funcionarios
      .filter(f => idsPessoa.has(f.id))
      .map(f => ({
        id: f.id, nome: f.nome,
        campos: campos.filter(campo => vinculados.some(v =>
          v.funcionarioId === f.id && v.campoId === campo.id))
          .map(campo => {
            const registros = estado.lancamentos.filter(l => l.vigente &&
              l.funcionarioId === f.id && l.campoId === campo.id);
            return { id: campo.id, nome: campo.nome, tipo: campo.tipo,
              quantidadeParcelas: registros.filter(l => l.modo === 'parcela').length,
              valor: registros.length === 0 ? null
                : registros[0].modo === 'total' ? registros[0].valor
                  : registros.reduce((s, l) => s + (typeof l.valor === 'number' ? l.valor : 0), 0),
              pendente: registros.length === 0 };
          }),
      }));
    // Nenhum CPF, salário ou outras comissões é retornado ao setor.
    return c.json({ grupoId: envio.grupoId, responsavel: envio.responsavel,
      concluido: envio.concluido, revisao: estado.revisao, funcionarios });
  });

  app.post('/competencias/:id/lancamentos', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const parsed = schemaLancamento.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de lançamento inválidos' }, 400);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const resultado = salvarLancamento(estado, parsed.data,
        atorFolha(sessao));
      if (!(await deps.salvarSeRevisao(c.req.param('id'), estado.revisao, resultado.estado)))
        return c.json({ erro: 'Conflito de edição: atualize a competência' }, 409);
      return c.json({ revisao: resultado.estado.revisao, avisos: resultado.avisos });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });

  app.post('/competencias/:id/lancamentos-em-massa', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const parsed = schemaLancamentosEmMassa.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de lançamento em massa inválidos' }, 400);
    const id = c.req.param('id');
    const estado = await deps.buscarCompetencia(id);
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const resultado = salvarLancamentosEmMassa(estado, parsed.data,
        atorFolha(sessao));
      if (!(await deps.salvarSeRevisao(id, estado.revisao, resultado.estado)))
        return c.json({ erro: 'Conflito de edição: atualize a competência' }, 409);
      return c.json({ revisao: resultado.estado.revisao, avisos: resultado.avisos,
        salvos: parsed.data.funcionariosIds.length });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });

  app.post('/competencias/:id/comissoes/:grupo/concluir', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const parsed = schemaEnvio.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de envio inválidos' }, 400);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const novo = concluirComissao(estado, c.req.param('grupo'),
        atorFolha(sessao),
        parsed.data.versaoEsperada, parsed.data.confirmarPendentes);
      if (!(await deps.salvarSeRevisao(c.req.param('id'), estado.revisao, novo)))
        return c.json({ erro: 'Conflito de edição' }, 409);
      return c.json({ revisao: novo.revisao, concluido: true });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });
  app.post('/competencias/:id/comissoes/:grupo/reabrir', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const parsed = schemaEnvio.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados de envio inválidos' }, 400);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    try {
      const novo = reabrirComissao(estado, c.req.param('grupo'),
        atorFolha(sessao), parsed.data.versaoEsperada);
      if (!(await deps.salvarSeRevisao(c.req.param('id'), estado.revisao, novo)))
        return c.json({ erro: 'Conflito de edição' }, 409);
      return c.json({ revisao: novo.revisao, concluido: false });
    } catch (e) {
      const erro = erroDominio(e);
      return c.json({ erro: erro.mensagem }, erro.status);
    }
  });
  app.get('/competencias/:id/exportacao.xlsx', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Somente DP/ADMIN pode exportar a consolidação' }, 403);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    const dados = consolidarComBeneficios(estado, await deps.obterBeneficios(), await deps.funcionariosAtivos());
    try {
      const arquivo = gerarXlsx(dados, await deps.nomesExportacao());
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      c.header('Content-Disposition', 'attachment; filename="odontofolha-' +
        dados.competencia.ano + '-' + String(dados.competencia.mes).padStart(2, '0') + '.xlsx"');
      return c.body(new Uint8Array(arquivo));
    } catch {
      return c.json({ erro: 'Não foi possível gerar a planilha desta competência' }, 422);
    }
  });
  return app;
}
