import { Hono } from 'hono';
import { z } from '@odontofolha/contracts';
import type { DependenciasOperacionais, SessaoOperacional } from './operacionais';
import type { criarCadastroPostgres } from '../repositorios/cadastros-postgres';

type Cadastro = ReturnType<typeof criarCadastroPostgres>;
const uuid = z.uuid();
const titulo = z.string().trim().min(1).max(160);
const funcionario = z.object({
  cpf: z.string().regex(/^\d{11}$/), nome: titulo,
  cargo: titulo, empresaContratanteId: uuid, empresaLotadoId: uuid,
  setorLotacaoId: uuid, admissao: z.iso.date(),
  salarioContratual: z.number().finite().nonnegative(),
  gruposIds: z.array(uuid).max(10000).default([]),
  competenciaId: uuid.nullable().optional(),
}).strict();
const competenciaSincronizacao = z.object({
  competenciaId: uuid.nullable().optional(),
}).strict();
const movimento = z.object({
  vinculoId: uuid, ano: z.number().int().min(2000).max(2200),
  mes: z.number().int().min(1).max(12),
  empresaContratanteId: uuid, empresaLotadoId: uuid, setorLotacaoId: uuid,
  cargo: titulo, salarioContratual: z.number().finite().nonnegative(),
}).strict();

export function criarRotasCadastros(
  deps: Pick<DependenciasOperacionais, 'autenticar'> & { cadastro: Cadastro },
) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.use('/cadastros/*', async (c, next) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    if (sessao.perfil !== 'ADMIN' && sessao.perfil !== 'DP')
      return c.json({ erro: 'Perfil não autorizado' }, 403);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/cadastros/geral', async c => c.json(await deps.cadastro.listar()));

  app.get('/cadastros/estrutura', async c =>
    c.json(await deps.cadastro.listarEstrutura()));

  app.get('/cadastros/grupos-vinculaveis', async c =>
    c.json(await deps.cadastro.listarGruposVinculaveis()));

  app.post('/cadastros/empresas', async c => {
    const body = z.object({ nome: titulo }).strict().safeParse(
      await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Nome inválido' }, 400);
    try {
      return c.json(await deps.cadastro.cadastrarEmpresa(
        body.data.nome, c.get('sessao').usuarioId), 201);
    } catch { return c.json({ erro: 'Não foi possível cadastrar a empresa' }, 400); }
  });

  app.post('/cadastros/setores', async c => {
    const body = z.object({ nome: titulo }).strict().safeParse(
      await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Nome inválido' }, 400);
    try {
      return c.json(await deps.cadastro.cadastrarSetor(
        body.data.nome, c.get('sessao').usuarioId), 201);
    } catch { return c.json({ erro: 'Não foi possível cadastrar o setor' }, 400); }
  });

  app.patch('/cadastros/empresas/:id', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ erro: 'Identificador inválido' }, 400);
    const body = z.object({ nome: titulo }).strict().safeParse(
      await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Nome inválido' }, 400);
    try {
      const empresa = await deps.cadastro.atualizarEmpresa(
        id.data, body.data.nome, c.get('sessao').usuarioId);
      return empresa ? c.json(empresa) : c.json({ erro: 'Empresa não encontrada' }, 404);
    } catch { return c.json({ erro: 'Não foi possível atualizar a empresa; confira se o nome já existe.' }, 400); }
  });

  app.patch('/cadastros/setores/:id', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ erro: 'Identificador inválido' }, 400);
    const body = z.object({ nome: titulo }).strict().safeParse(
      await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Nome inválido' }, 400);
    try {
      const setor = await deps.cadastro.atualizarSetor(
        id.data, body.data.nome, c.get('sessao').usuarioId);
      return setor ? c.json(setor) : c.json({ erro: 'Setor não encontrado' }, 404);
    } catch { return c.json({ erro: 'Não foi possível atualizar o setor; confira se o nome já existe.' }, 400); }
  });

  app.delete('/cadastros/empresas/:id', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ erro: 'Identificador inválido' }, 400);
    try {
      const empresa = await deps.cadastro.excluirEmpresa(id.data, c.get('sessao').usuarioId);
      return empresa ? c.json({ sucesso: true }) : c.json({ erro: 'Empresa não encontrada' }, 404);
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'EMPRESA_EM_USO')
        return c.json({ erro: 'Esta empresa possui funcionários, histórico ou usuários vinculados e não pode ser excluída.' }, 409);
      return c.json({ erro: 'Não foi possível excluir a empresa' }, 400);
    }
  });

  app.delete('/cadastros/setores/:id', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ erro: 'Identificador inválido' }, 400);
    try {
      const setor = await deps.cadastro.excluirSetor(id.data, c.get('sessao').usuarioId);
      return setor ? c.json({ sucesso: true }) : c.json({ erro: 'Setor não encontrado' }, 404);
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'SETOR_EM_USO')
        return c.json({ erro: 'Este setor possui funcionários ou histórico vinculado e não pode ser excluído.' }, 409);
      return c.json({ erro: 'Não foi possível excluir o setor' }, 400);
    }
  });

  app.post('/cadastros/funcionarios', async c => {
    const body = funcionario.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Dados inválidos' }, 400);
    try {
      return c.json(await deps.cadastro.contratar(
        body.data, c.get('sessao').usuarioId, body.data.gruposIds,
        body.data.competenciaId), 201);
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'CPF inválido')
        return c.json({ erro: 'CPF inválido. Confira os dígitos informados.' }, 400);
      if (erro instanceof Error && erro.message.startsWith('Um ou mais'))
        return c.json({ erro: erro.message }, 400);
      if (erro instanceof Error && erro.message === 'CONFLITO_COMPETENCIA')
        return c.json({ erro: 'Uma competência mudou durante a sincronização. Tente novamente.' }, 409);
      const banco = erro as { code?: unknown; constraint?: unknown };
      if (banco?.code === '23505' && banco.constraint === 'vinculo_ativo_pessoa_unico')
        return c.json({ erro: 'Este CPF já possui um vínculo ativo.' }, 400);
      console.error('Falha ao cadastrar funcionário', {
        tipo: erro instanceof Error ? erro.name : typeof erro,
        codigo: banco?.code,
        restricao: banco?.constraint,
      });
      return c.json({ erro: 'Não foi possível cadastrar o funcionário' }, 400);
    }
  });

  app.post('/cadastros/funcionarios/:id/desligar', async c => {
    const parsed = uuid.safeParse(c.req.param('id'));
    if (!parsed.success) return c.json({ erro: 'Identificador inválido' }, 400);
    try {
      const ok = await deps.cadastro.desligar(parsed.data, c.get('sessao').usuarioId);
      return ok ? c.json({ sucesso: true }) : c.json({ erro: 'Vínculo inativo ou inexistente' }, 404);
    } catch { return c.json({ erro: 'Não foi possível desligar o vínculo' }, 400); }
  });

  app.post('/cadastros/funcionarios/:id/sincronizar', async c => {
    const parsed = uuid.safeParse(c.req.param('id'));
    if (!parsed.success) return c.json({ erro: 'Identificador inválido' }, 400);
    const body = competenciaSincronizacao.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Competência inválida' }, 400);
    try {
      const competencia = await deps.cadastro.sincronizarFuncionario(
        parsed.data, c.get('sessao').usuarioId, body.data.competenciaId);
      if (!competencia) return c.json({ erro: 'Não há competência aberta compatível com a admissão deste funcionário.' }, 409);
      return c.json({ competencia });
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'CONFLITO_COMPETENCIA')
        return c.json({ erro: 'A competência foi alterada por outra operação. Atualize e tente novamente.' }, 409);
      return c.json({ erro: 'Não foi possível sincronizar o funcionário' }, 400);
    }
  });

  app.post('/cadastros/movimentacoes', async c => {
    const body = movimento.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ erro: 'Dados inválidos' }, 400);
    try {
      return c.json(await deps.cadastro.movimentar(
        body.data, c.get('sessao').usuarioId), 201);
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'CONFLITO_COMPETENCIA')
        return c.json({ erro: 'Uma competência mudou durante a sincronização. A movimentação não foi salva; atualize e tente novamente.' }, 409);
      return c.json({ erro: 'Não foi possível registrar a movimentação' }, 400);
    }
  });
  return app;
}
