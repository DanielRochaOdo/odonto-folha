import { Hono } from 'hono';
import { z } from '@odontofolha/contracts';
import type { DependenciasOperacionais, SessaoOperacional } from './operacionais';
import type { criarConfiguracaoPostgres } from '../repositorios/configuracao-postgres';

type Configuracao = ReturnType<typeof criarConfiguracaoPostgres>;
const uuid = z.uuid(), nome = z.string().trim().min(1).max(160);
const grupoSchema = z.object({
  nome, origem: z.enum(['BENEFICIO', 'COMISSAO']),
  responsavel: z.enum(['ADM', 'CENTRAL', 'NENHUM']),
}).strict();
const campoSchema = z.object({
  grupoId: uuid, nome,
  tipo: z.enum(['moeda', 'percentual', 'data', 'horario']),
  classificacao: z.enum(['provento', 'desconto', 'informativo']),
  ano: z.number().int().min(2000).max(2200),
  mes: z.number().int().min(1).max(12),
}).strict();
const statusSchema = z.object({ ativo: z.boolean() }).strict();
const grupoEdicaoSchema = z.object({ nome, responsavel: z.enum(['ADM', 'CENTRAL', 'NENHUM']) }).strict();
const competenciaMes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(valor => Number(valor.slice(0, 4)) >= 2000 && Number(valor.slice(0, 4)) <= 2200);
const basesBeneficioSchema = z.object({
  competencia: competenciaMes,
  versaoEsperada: z.number().int().nonnegative(),
  valores: z.array(z.object({
    funcionarioId: uuid,
    campoId: uuid,
    valor: z.union([z.number().finite(), z.string().min(1)]),
  }).strict()).max(10000),
  percentuaisDesconto: z.array(z.object({
    funcionarioId: uuid, campoOrigemId: uuid,
    percentual: z.number().finite().min(0).max(100),
  }).strict()).max(10000).optional(),
}).strict();
const regraDescontoSchema = z.object({
  nomeColuna: nome,
  percentualPadrao: z.number().finite().min(0).max(100),
  competencia: competenciaMes,
  ativo: z.boolean(),
}).strict();
const vinculosBeneficioSchema = z.object({
  funcionariosIds: z.array(uuid).min(1).max(10000),
}).strict();

const criacaoCompletaSchema = z.object({
  nome, origem: z.enum(['BENEFICIO', 'COMISSAO']),
  responsavel: z.enum(['ADM', 'CENTRAL', 'NENHUM']),
  campo: z.object({
    nome,
    tipo: z.enum(['moeda', 'percentual', 'data', 'horario']),
    classificacao: z.enum(['provento', 'desconto', 'informativo']),
    ano: z.number().int().min(2000).max(2200),
    mes: z.number().int().min(1).max(12),
  }).strict(),
  descontoBeneficio: z.object({
    nomeColuna: nome,
    percentualPadrao: z.number().finite().min(0).max(100),
    ano: z.number().int().min(2000).max(2200),
    mes: z.number().int().min(1).max(12),
  }).strict().optional(),
  funcionariosIds: z.array(uuid).max(10000),
}).strict();
const grupoEdicaoCompletaSchema = z.object({
  nome, responsavel: z.enum(['ADM', 'CENTRAL', 'NENHUM']),
  campos: z.array(campoSchema.omit({ grupoId: true }).extend({ id: uuid, ativo: z.boolean() }))
    .max(500),
  funcionariosIds: z.array(uuid).max(10000),
}).strict();


export function criarRotasConfiguracao(
  deps: Pick<DependenciasOperacionais, 'autenticar'> & { configuracao: Configuracao },
) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.use('/configuracao/*', async (c, next) => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    if (sessao.perfil !== 'ADMIN' && sessao.perfil !== 'DP')
      return c.json({ erro: 'Sem permissão de configuração' }, 403);
    c.set('sessao', sessao);
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/configuracao/campos', async c =>
    c.json(await deps.configuracao.listar()));

  app.get('/configuracao/grupos/:id/bases-beneficios', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const competencia = competenciaMes.safeParse(c.req.query('competencia'));
    if (!id.success || !competencia.success)
      return c.json({ erro: 'Informe um benefício e uma competência válidos' }, 400);
    const [ano, mes] = competencia.data.split('-').map(Number);
    const dados = await deps.configuracao.listarBasesBeneficio(id.data, ano, mes);
    return dados ? c.json(dados) : c.json({ erro: 'Benefício inexistente' }, 404);
  });

  app.post('/configuracao/grupos/:id/bases-beneficios', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = basesBeneficioSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success)
      return c.json({ erro: 'Informe valores e vigência válidos' }, 400);
    const [ano, mes] = body.data.competencia.split('-').map(Number);
    try {
      const resultado = await deps.configuracao.salvarBasesBeneficio(
        id.data, ano, mes, body.data.valores,
        body.data.versaoEsperada, c.get('sessao').usuarioId,
        body.data.percentuaisDesconto,
      );
      return c.json(resultado);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : '';
      const conflito = mensagem.startsWith('Conflito:');
      return c.json({ erro: conflito
        ? 'Os valores foram alterados por outra pessoa. Atualize a grade.'
        : mensagem || 'Não foi possível salvar os valores recorrentes.' }, conflito ? 409 : 400);
    }
  });

  app.post('/configuracao/campos/:id/desconto-beneficio', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = regraDescontoSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success)
      return c.json({ erro: 'Informe o nome, percentual e competência da regra.' }, 400);
    const [ano, mes] = body.data.competencia.split('-').map(Number);
    try {
      const regra = await deps.configuracao.salvarRegraDescontoBeneficio(
        id.data, body.data.nomeColuna, body.data.percentualPadrao,
        ano, mes, body.data.ativo, c.get('sessao').usuarioId,
      );
      return c.json({ regra });
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : 'Não foi possível salvar a regra.' }, 400);
    }
  });

  app.post('/configuracao/grupos/:id/funcionarios', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = vinculosBeneficioSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success)
      return c.json({ erro: 'Selecione pelo menos um funcionário cadastrado' }, 400);
    try {
      return c.json(await deps.configuracao.vincularFuncionariosGrupo(
        id.data, body.data.funcionariosIds, c.get('sessao').usuarioId,
      ));
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : '';
      return c.json({ erro: mensagem || 'Não foi possível vincular os funcionários.' }, 400);
    }
  });

  app.post('/configuracao/grupos/:id/funcionarios/:funcionarioId/remover', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const funcionarioId = uuid.safeParse(c.req.param('funcionarioId'));
    if (!id.success || !funcionarioId.success)
      return c.json({ erro: 'Grupo ou funcionário inválido' }, 400);
    try {
      const removido = await deps.configuracao.removerVinculoFuncionario(
        id.data, funcionarioId.data, c.get('sessao').usuarioId,
      );
      return removido ? c.json({ sucesso: true }) : c.json({ erro: 'Vínculo não encontrado' }, 404);
    } catch { return c.json({ erro: 'Não foi possível remover o vínculo' }, 400); }
  });

  app.post('/configuracao/grupos/:id/editar', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = grupoEdicaoSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success)
      return c.json({ erro: 'Confira o nome e o responsável informado' }, 400);
    try {
      const atualizado = await deps.configuracao.editarGrupo(id.data, body.data,
        c.get('sessao').usuarioId);
      return atualizado ? c.json({ sucesso: true }) : c.json({ erro: 'Cadastro não encontrado' }, 404);
    } catch { return c.json({ erro: 'Não foi possível editar o cadastro' }, 400); }
  });

  app.post('/configuracao/grupos/:id/editar-completo', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = grupoEdicaoCompletaSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success)
      return c.json({ erro: 'Confira a identificação, os campos e os funcionários vinculados' }, 400);
    try {
      const atualizado = await deps.configuracao.editarGrupoCompleto(id.data, body.data,
        c.get('sessao').usuarioId);
      return atualizado ? c.json({ sucesso: true }) : c.json({ erro: 'Cadastro não encontrado' }, 404);
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : 'Não foi possível editar o cadastro' }, 400);
    }
  });

  app.post('/configuracao/grupos/:id/status', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = statusSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success) return c.json({ erro: 'Status inválido' }, 400);
    try {
      const atualizado = await deps.configuracao.ativarGrupo(
        id.data, body.data.ativo, c.get('sessao').usuarioId,
      );
      return atualizado ? c.json({ sucesso: true }) : c.json({ erro: 'Cadastro não encontrado' }, 404);
    } catch { return c.json({ erro: 'Não foi possível alterar o cadastro' }, 400); }
  });


  app.post('/configuracao/criacao', async c => {
    const parsed = criacaoCompletaSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || (parsed.data.origem === 'BENEFICIO' &&
      parsed.data.responsavel !== 'NENHUM') || (parsed.data.descontoBeneficio &&
      (parsed.data.origem !== 'BENEFICIO' || parsed.data.campo.tipo !== 'moeda')))
      return c.json({ erro: 'Verifique as informações da criação.' }, 400);
    try {
      const novo = await deps.configuracao.criarCompleto(parsed.data,
        c.get('sessao').usuarioId);
      return c.json(novo, 201);
    } catch (e) {
      const texto = e instanceof Error ? e.message : '';
      const conhecido = /competência|funcionários|vínculo/i.test(texto);
      return c.json({
        erro: conhecido ? texto : 'Não foi possível finalizar a criação. Tente novamente.',
      }, 400);
    }
  });

  app.post('/configuracao/grupos', async c => {
    const p = grupoSchema.safeParse(await c.req.json().catch(() => null));
    if (!p.success || (p.data.origem === 'BENEFICIO' && p.data.responsavel !== 'NENHUM'))
      return c.json({ erro: 'Grupo inválido' }, 400);
    try {
      return c.json(await deps.configuracao.criarGrupo(
        p.data.nome, p.data.origem, p.data.responsavel, c.get('sessao').usuarioId), 201);
    } catch { return c.json({ erro: 'Não foi possível criar o grupo' }, 400); }
  });

  app.post('/configuracao/campos', async c => {
    const p = campoSchema.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ erro: 'Campo inválido' }, 400);
    try {
      const x = p.data;
      return c.json(await deps.configuracao.criarCampo(
        x.grupoId, x.nome, x.tipo, x.classificacao,
        x.ano, x.mes, c.get('sessao').usuarioId), 201);
    } catch { return c.json({ erro: 'Não foi possível criar o campo' }, 400); }
  });

  app.post('/configuracao/campos/:id/status', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = statusSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success) return c.json({ erro: 'Status inválido' }, 400);
    try {
      const atualizado = await deps.configuracao.ativarCampo(
        id.data, body.data.ativo, c.get('sessao').usuarioId);
      return atualizado ? c.json({ sucesso: true }) : c.json({ erro: 'Campo inexistente' }, 404);
    } catch { return c.json({ erro: 'Falha ao alterar campo' }, 400); }
  });

  app.post('/configuracao/campos/:id/editar', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    const body = campoSchema.omit({ grupoId: true }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success) return c.json({ erro: 'Campo inválido' }, 400);
    try {
      const x = body.data;
      const atualizado = await deps.configuracao.editarCampo(id.data, {
        nome: x.nome, tipo: x.tipo, classificacao: x.classificacao,
        ano: x.ano, mes: x.mes,
      }, c.get('sessao').usuarioId);
      return atualizado ? c.json({ sucesso: true }) : c.json({ erro: 'Campo não encontrado' }, 404);
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : 'Não foi possível editar o campo' }, 400);
    }
  });

  return app;
}
