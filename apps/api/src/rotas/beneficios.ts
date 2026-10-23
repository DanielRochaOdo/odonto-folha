import { Hono } from 'hono';
import { z } from '@odontofolha/contracts';
import type { DependenciasOperacionais, SessaoOperacional } from './operacionais';
import type { criarBeneficiosPostgres } from '../repositorios/beneficios-postgres';
import {
  atualizarBaseRecorrente, definirExcecaoMensal, preverReajuste, confirmarReajuste,
} from '../dominio/beneficios';

type Beneficios = ReturnType<typeof criarBeneficiosPostgres>;
const uuid = z.uuid();
const valorSchema = z.object({
  funcionarioId: uuid, campoId: uuid,
  valor: z.union([z.number().finite(), z.string().min(1)]),
  versaoEsperada: z.number().int().nonnegative(),
}).strict();
const valorMassaSchema = z.object({
  funcionariosIds: z.array(uuid).min(1).max(10000), campoId: uuid,
  valor: z.union([z.number().finite(), z.string().min(1)]),
  acao: z.enum(['base', 'excecao']), versaoEsperada: z.number().int().nonnegative(),
}).strict();
const previaSchema = z.object({
  campoId: uuid,
  funcionariosIds: z.array(uuid).min(1).max(10000),
  modo: z.enum(['percentual', 'moeda']),
  variacao: z.number().finite(),
}).strict();
const confirmarSchema = z.object({
  previa: z.object({
    versaoCatalogo: z.number().int().nonnegative(),
    competencia: z.object({
      ano: z.number().int(), mes: z.number().int(),
    }).strict(),
    campoId: uuid, modo: z.enum(['percentual', 'moeda']),
    variacao: z.number().finite(),
    linhas: z.array(z.object({
      funcionarioId: uuid, anterior: z.number().finite(),
      proposto: z.number().finite(),
    }).strict()).min(1).max(10000),
  }).strict(),
}).strict();

function motivo(error: unknown): { status: 400 | 409; texto: string } {
  const mensagem = error instanceof Error ? error.message : 'Operação inválida';
  return /Conflito|desatualizada|Competência fechada/.test(mensagem)
    ? { status: 409, texto: 'Valores alterados; atualize a prévia antes de confirmar.' }
    : { status: 400, texto: mensagem };
}

export function criarRotasBeneficios(
  deps: Pick<DependenciasOperacionais, 'autenticar' | 'buscarCompetencia'> & {
    beneficios: Beneficios;
  },
) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.use('/beneficios/*', async (c, next) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    if (sessao.perfil !== 'ADMIN' && sessao.perfil !== 'DP')
      return c.json({ erro: 'Somente DP/ADMIN' }, 403);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.get('/beneficios/catalogo', async c => {
    const catalogo = await deps.beneficios.carregar();
    return c.json({ versao: catalogo.versao });
  });
  app.post('/beneficios/:competenciaId/base', async c => {
    const parsed = valorSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Valor inválido' }, 400);
    const competenciaId = c.req.param('competenciaId');
    const estado = await deps.buscarCompetencia(competenciaId);
    if (!estado) return c.json({ erro: 'Competência inexistente' }, 404);
    try {
      const anterior = await deps.beneficios.carregar();
      const { funcionarioId, campoId, valor, versaoEsperada } = parsed.data;
      const novo = atualizarBaseRecorrente(anterior, estado, funcionarioId, campoId,
        valor, { id: c.get('sessao').usuarioId, perfil: c.get('sessao').perfil },
        versaoEsperada);
      const ok = await deps.beneficios.persistir(
        anterior, novo, competenciaId, c.get('sessao').usuarioId);
      return ok ? c.json({ versao: novo.versao, recorrente: true })
        : c.json({ erro: 'Competência fechada ou catálogo alterado; atualize e tente novamente.' }, 409);
    } catch (e) {
      const m = motivo(e); return c.json({ erro: m.texto }, m.status);
    }
  });
  app.post('/beneficios/:competenciaId/excecao', async c => {
    const parsed = valorSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Valor inválido' }, 400);
    const competenciaId = c.req.param('competenciaId');
    const estado = await deps.buscarCompetencia(competenciaId);
    if (!estado) return c.json({ erro: 'Competência inexistente' }, 404);
    try {
      const anterior = await deps.beneficios.carregar();
      const { funcionarioId, campoId, valor, versaoEsperada } = parsed.data;
      const novo = definirExcecaoMensal(anterior, estado, funcionarioId, campoId,
        valor, { id: c.get('sessao').usuarioId, perfil: c.get('sessao').perfil },
        versaoEsperada);
      const ok = await deps.beneficios.persistir(
        anterior, novo, competenciaId, c.get('sessao').usuarioId);
      return ok ? c.json({ versao: novo.versao, recorrente: false })
        : c.json({ erro: 'Competência fechada ou catálogo alterado; atualize e tente novamente.' }, 409);
    } catch (e) {
      const m = motivo(e); return c.json({ erro: m.texto }, m.status);
    }
  });
  app.post('/beneficios/:competenciaId/valores-em-massa', async c => {
    const parsed = valorMassaSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Dados invÃ¡lidos para aplicaÃ§Ã£o em massa' }, 400);
    const competenciaId = c.req.param('competenciaId');
    const estado = await deps.buscarCompetencia(competenciaId);
    if (!estado) return c.json({ erro: 'CompetÃªncia inexistente' }, 404);
    try {
      const anterior = await deps.beneficios.carregar();
      if (anterior.versao !== parsed.data.versaoEsperada)
        return c.json({ erro: 'Valores alterados; atualize a competÃªncia.' }, 409);
      let novo = anterior;
      for (const funcionarioId of [...new Set(parsed.data.funcionariosIds)]) {
        novo = parsed.data.acao === 'base'
          ? atualizarBaseRecorrente(novo, estado, funcionarioId, parsed.data.campoId,
            parsed.data.valor, { id: c.get('sessao').usuarioId, perfil: c.get('sessao').perfil }, novo.versao)
          : definirExcecaoMensal(novo, estado, funcionarioId, parsed.data.campoId,
            parsed.data.valor, { id: c.get('sessao').usuarioId, perfil: c.get('sessao').perfil }, novo.versao);
      }
      const ok = await deps.beneficios.persistir(anterior, novo, competenciaId,
        c.get('sessao').usuarioId);
      return ok ? c.json({ versao: novo.versao, salvos: novo.versao - anterior.versao })
        : c.json({ erro: 'Competência fechada ou catálogo alterado; atualize e tente novamente.' }, 409);
    } catch (e) {
      const m = motivo(e); return c.json({ erro: m.texto }, m.status);
    }
  });
  app.post('/beneficios/:competenciaId/reajuste/previa', async c => {
    const parsed = previaSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Parâmetros de reajuste inválidos' }, 400);
    const estado = await deps.buscarCompetencia(c.req.param('competenciaId'));
    if (!estado) return c.json({ erro: 'Competência inexistente' }, 404);
    try {
      const anterior = await deps.beneficios.carregar();
      return c.json(preverReajuste(anterior, estado, parsed.data.campoId,
        parsed.data.funcionariosIds,
        { modo: parsed.data.modo, variacao: parsed.data.variacao }));
    } catch (e) {
      const m = motivo(e); return c.json({ erro: m.texto }, m.status);
    }
  });
  app.post('/beneficios/:competenciaId/reajuste/confirmar', async c => {
    const parsed = confirmarSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ erro: 'Prévia de reajuste inválida' }, 400);
    const competenciaId = c.req.param('competenciaId');
    const estado = await deps.buscarCompetencia(competenciaId);
    if (!estado) return c.json({ erro: 'Competência inexistente' }, 404);
    try {
      const anterior = await deps.beneficios.carregar();
      const novo = confirmarReajuste(anterior, estado, parsed.data.previa,
        { id: c.get('sessao').usuarioId, perfil: c.get('sessao').perfil });
      const ok = await deps.beneficios.persistir(
        anterior, novo, competenciaId, c.get('sessao').usuarioId);
      return ok ? c.json({ versao: novo.versao, afetados: parsed.data.previa.linhas.length })
        : c.json({ erro: 'Competência fechada ou catálogo alterado; atualize e tente novamente.' }, 409);
    } catch (e) {
      const m = motivo(e); return c.json({ erro: m.texto }, m.status);
    }
  });
  return app;
}
