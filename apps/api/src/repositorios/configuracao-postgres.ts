import { and, desc, eq, sql, tabelas, type ConexaoFolha } from '@odontofolha/database';

type Origem = 'BENEFICIO' | 'COMISSAO';
type Responsavel = 'ADM' | 'CENTRAL' | 'NENHUM';
type CampoNovo = {
  nome: string;
  tipo: 'moeda' | 'percentual' | 'data' | 'horario';
  classificacao: 'provento' | 'desconto' | 'informativo';
  ano: number;
  mes: number;
};

export function criarConfiguracaoPostgres(conexao: ConexaoFolha) {
  const db = conexao.db, t = tabelas;
  const numeroMes = (ano: number, mes: number) => ano * 12 + mes;

  async function listar() {
    const [grupos, campos, competencias] = await Promise.all([
      db.select().from(t.gruposDinamicos).orderBy(t.gruposDinamicos.nome),
      db.select().from(t.camposDinamicos).orderBy(t.camposDinamicos.ordemGlobal),
      db.select({ id: t.competencias.id, ano: t.competencias.ano, mes: t.competencias.mes })
        .from(t.competencias).orderBy(desc(t.competencias.ano), desc(t.competencias.mes)),
    ]);
    const referencia = competencias[0];
    const associados = referencia ? await db.select({
      grupoId: t.camposDinamicos.grupoId,
      vinculoId: t.vinculosCamposCompetencia.vinculoId,
    }).from(t.vinculosCamposCompetencia)
      .innerJoin(t.camposDinamicos,
        eq(t.vinculosCamposCompetencia.campoId, t.camposDinamicos.id))
      .where(and(eq(t.vinculosCamposCompetencia.competenciaId, referencia.id),
        eq(t.vinculosCamposCompetencia.ativo, true))) : [];
    const porGrupo: Record<string, string[]> = {};
    for (const associado of associados) {
      const ids = porGrupo[associado.grupoId] ?? [];
      if (!ids.includes(associado.vinculoId)) ids.push(associado.vinculoId);
      porGrupo[associado.grupoId] = ids;
    }
    const elegiveis = referencia ? await db.select({
      id: t.funcionariosCompetencia.vinculoId,
    }).from(t.funcionariosCompetencia)
      .where(eq(t.funcionariosCompetencia.competenciaId, referencia.id)) : [];
    return {
      grupos, campos, funcionariosPorGrupo: porGrupo,
      funcionariosElegiveisIds: elegiveis.map(f => f.id),
      competenciaReferencia: referencia
        ? { ano: referencia.ano, mes: referencia.mes } : null,
    };
  }

  async function criarGrupo(nome: string, origem: Origem,
    responsavel: Responsavel, autor: string) {
    return db.transaction(async tx => {
      const [g] = await tx.insert(t.gruposDinamicos)
        .values({ nome, origem, responsavel }).returning({ id: t.gruposDinamicos.id });
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: g.id, acao: 'CRIADO',
      });
      return g;
    });
  }

  /**
   * O fluxo guiado grava grupo, primeiro campo e vínculos na mesma transação.
   * A base atual usa vínculos por competência: sem competência elegível não
   * existem registros onde persistir associações. Nunca simular vínculo salvo.
   */
  async function criarCompleto(
    dados: { nome: string; origem: Origem; responsavel: Responsavel;
      campo: CampoNovo; funcionariosIds: string[] }, autor: string,
  ) {
    return db.transaction(async tx => {
      const meses = await tx.select().from(t.competencias);
      const elegiveis = meses.filter(m => numeroMes(m.ano, m.mes) >=
        numeroMes(dados.campo.ano, dados.campo.mes));
      const ids = [...new Set(dados.funcionariosIds)];
      if (ids.length && elegiveis.length === 0)
        throw new Error('Abra uma competência igual ou posterior à vigência do campo antes de vincular funcionários.');
      const pessoasAtivas = ids.length ? await tx.select({ id: t.vinculosEmpregaticios.id })
        .from(t.vinculosEmpregaticios)
        .where(eq(t.vinculosEmpregaticios.ativo, true)) : [];
      const ativos = new Set(pessoasAtivas.map(p => p.id));
      if (ids.some(id => !ativos.has(id)))
        throw new Error('Há funcionários inexistentes ou inativos na seleção.');

      const pessoasPorCompetencia = new Map<string, Set<string>>();
      for (const m of elegiveis) {
        const presentes = await tx.select({ id: t.funcionariosCompetencia.vinculoId })
          .from(t.funcionariosCompetencia)
          .where(eq(t.funcionariosCompetencia.competenciaId, m.id));
        pessoasPorCompetencia.set(m.id, new Set(presentes.map(p => p.id)));
      }
      if (ids.some(id => !elegiveis.some(m => pessoasPorCompetencia.get(m.id)?.has(id))))
        throw new Error('Há funcionários sem vínculo na competência informada.');

      const [grupo] = await tx.insert(t.gruposDinamicos).values({
        nome: dados.nome, origem: dados.origem, responsavel: dados.responsavel,
      }).returning({ id: t.gruposDinamicos.id });
      const [campo] = await tx.insert(t.camposDinamicos).values({
        grupoId: grupo.id, nome: dados.campo.nome,
        tipo: dados.campo.tipo, classificacao: dados.campo.classificacao,
        anoCriacao: dados.campo.ano, mesCriacao: dados.campo.mes,
      }).returning({ id: t.camposDinamicos.id });
      for (const competencia of elegiveis) {
        await tx.insert(t.camposCompetencia).values({
          competenciaId: competencia.id, campoId: campo.id,
        }).onConflictDoNothing();
        if (dados.origem === 'COMISSAO') {
          await tx.insert(t.enviosComissoes).values({
            competenciaId: competencia.id, grupoId: grupo.id,
            responsavel: dados.responsavel,
          }).onConflictDoNothing();
        }
        for (const id of ids) {
          if (!pessoasPorCompetencia.get(competencia.id)?.has(id)) continue;
          await tx.insert(t.vinculosCamposCompetencia).values({
            competenciaId: competencia.id, vinculoId: id, campoId: campo.id, ativo: true,
          }).onConflictDoNothing();
        }
        await tx.update(t.competencias)
          .set({ revisao: sql`${t.competencias.revisao} + 1` })
          .where(eq(t.competencias.id, competencia.id));
      }
      await tx.insert(t.auditoria).values([
        { usuarioId: autor, entidade: 'GRUPO', entidadeId: grupo.id, acao: 'CRIADO' },
        { usuarioId: autor, entidade: 'CAMPO', entidadeId: campo.id, acao: 'CRIADO' },
        { usuarioId: autor, entidade: 'GRUPO', entidadeId: grupo.id,
          acao: 'FUNCIONARIOS_VINCULADOS', detalhes: { quantidade: ids.length } },
      ]);
      return { id: grupo.id };
    });
  }

  async function criarCampo(grupoId: string, nome: string,
    tipo: CampoNovo['tipo'], classificacao: CampoNovo['classificacao'],
    ano: number, mes: number, autor: string) {
    return db.transaction(async tx => {
      const [g] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!g || !g.ativo) throw new Error('Grupo inativo');
      const camposAnteriores = await tx.select({ id: t.camposDinamicos.id })
        .from(t.camposDinamicos).where(eq(t.camposDinamicos.grupoId, grupoId));
      const anteriores = new Set(camposAnteriores.map(c => c.id));
      const [c] = await tx.insert(t.camposDinamicos)
        .values({ grupoId, nome, tipo, classificacao, anoCriacao: ano, mesCriacao: mes })
        .returning({ id: t.camposDinamicos.id });
      const meses = await tx.select().from(t.competencias);
      for (const competencia of meses) {
        if (numeroMes(competencia.ano, competencia.mes) < numeroMes(ano, mes)) continue;
        await tx.insert(t.camposCompetencia)
          .values({ competenciaId: competencia.id, campoId: c.id }).onConflictDoNothing();
        if (g.origem === 'COMISSAO')
          await tx.insert(t.enviosComissoes).values({
            competenciaId: competencia.id, grupoId, responsavel: g.responsavel,
          }).onConflictDoNothing();
        // O campo adicionado herda os colaboradores já vinculados ao grupo no mês.
        const associados = await tx.select().from(t.vinculosCamposCompetencia)
          .where(and(eq(t.vinculosCamposCompetencia.competenciaId, competencia.id),
            eq(t.vinculosCamposCompetencia.ativo, true)));
        for (const id of new Set(associados
          .filter(v => anteriores.has(v.campoId)).map(v => v.vinculoId))) {
          await tx.insert(t.vinculosCamposCompetencia).values({
            competenciaId: competencia.id, campoId: c.id, vinculoId: id, ativo: true,
          }).onConflictDoNothing();
        }
        await tx.update(t.competencias)
          .set({ revisao: sql`${t.competencias.revisao} + 1` })
          .where(eq(t.competencias.id, competencia.id));
      }
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'CAMPO', entidadeId: c.id, acao: 'CRIADO',
      });
      return c;
    });
  }

  async function ativarCampo(id: string, ativo: boolean, autor: string) {
    return db.transaction(async tx => {
      const [c] = await tx.update(t.camposDinamicos).set({ ativo })
        .where(eq(t.camposDinamicos.id, id)).returning({ id: t.camposDinamicos.id });
      if (!c) return false;
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'CAMPO', entidadeId: id, acao: ativo ? 'ATIVADO' : 'DESATIVADO',
      });
      return true;
    });
  }
  return { listar, criarGrupo, criarCompleto, criarCampo, ativarCampo };
}
