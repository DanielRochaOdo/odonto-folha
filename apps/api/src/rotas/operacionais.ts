import { Hono } from 'hono';
import { z } from '@odontofolha/contracts';
import type { Perfil } from '@odontofolha/contracts';
import type { EstadoCompetencia } from '../dominio/competencias';
import { salvarLancamento, concluirComissao, reabrirComissao, consolidarEstado } from '../dominio/competencias';
import { gerarXlsx, type NomesExportacao } from '../dominio/exportacao-xlsx';
import { podeEditarConsolidacao } from '../dominio/permissoes';

export type SessaoOperacional = {
  usuarioId: string;
  perfil: Perfil;
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
};

const schemaLancamento = z.object({
  funcionarioId: z.string().min(1),
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

function erroDominio(e: unknown): { status: 400 | 403 | 409; mensagem: string } {
  const m = e instanceof Error ? e.message : 'Operação não permitida';
  if (/Conflito/.test(m)) return { status: 409, mensagem: 'Conflito de edição: atualize a competência' };
  if (/Sem permissão|Somente DP|Perfil não autorizado|fora do escopo|bloqueada/.test(m))
    return { status: 403, mensagem: 'Operação não autorizada para este perfil' };
  return { status: 400, mensagem: m };
}

/** Rotas só são montadas depois de conectar Better Auth e repositório transacional. */
export function criarRotasOperacionais(deps: DependenciasOperacionais) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.use('/competencias/*', async (c, proximo) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await proximo();
  });

  app.get('/competencias/:id/consolidacao', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    if (!podeEditarConsolidacao(sessao.perfil))
      return c.json({ erro: 'Sem permissão para consolidação geral' }, 403);
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    return c.json(consolidarEstado(estado, await deps.funcionariosAtivos()));
  });

  app.get('/competencias/:id/comissoes/:grupo', async c => {
    const sessao = c.get('sessao') as SessaoOperacional;
    const estado = await deps.buscarCompetencia(c.req.param('id'));
    if (!estado) return c.json({ erro: 'Competência não encontrada' }, 404);
    const envio = estado.envios.find(e => e.grupoId === c.req.param('grupo'));
    if (!envio) return c.json({ erro: 'Comissão não encontrada' }, 404);
    if (!podeEditarConsolidacao(sessao.perfil) && sessao.perfil !== envio.responsavel)
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
            return { id: campo.id, nome: campo.nome,
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
        { id: sessao.usuarioId, perfil: sessao.perfil });
      if (!(await deps.salvarSeRevisao(c.req.param('id'), estado.revisao, resultado.estado)))
        return c.json({ erro: 'Conflito de edição: atualize a competência' }, 409);
      return c.json({ revisao: resultado.estado.revisao, avisos: resultado.avisos });
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
        { id: sessao.usuarioId, perfil: sessao.perfil },
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
        { id: sessao.usuarioId, perfil: sessao.perfil }, parsed.data.versaoEsperada);
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
    const dados = consolidarEstado(estado, await deps.funcionariosAtivos());
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
