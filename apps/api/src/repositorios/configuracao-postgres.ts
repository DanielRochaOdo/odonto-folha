import { and, eq, sql, tabelas, type ConexaoFolha } from '@odontofolha/database';

type Origem = 'BENEFICIO' | 'COMISSAO';
type Responsavel = 'ADM' | 'CENTRAL' | 'NENHUM';
type CampoNovo = {
  nome: string;
  tipo: 'moeda' | 'percentual' | 'data' | 'horario';
  classificacao: 'provento' | 'desconto' | 'informativo';
  ano: number;
  mes: number;
};

/** Vínculos de grupo são permanentes, independentes de qualquer competência. */
export function criarConfiguracaoPostgres(conexao: ConexaoFolha) {
  const db = conexao.db, t = tabelas;
  const numeroMes = (ano: number, mes: number) => ano * 12 + mes;

  async function listar() {
    const [grupos, campos, vinculos] = await Promise.all([
      db.select().from(t.gruposDinamicos).orderBy(t.gruposDinamicos.nome),
      db.select().from(t.camposDinamicos).orderBy(t.camposDinamicos.ordemGlobal),
      db.select({ grupoId: t.vinculosGrupos.grupoId, vinculoId: t.vinculosGrupos.vinculoId })
        .from(t.vinculosGrupos),
    ]);
    const funcionariosPorGrupo: Record<string, string[]> = {};
    for (const item of vinculos) {
      (funcionariosPorGrupo[item.grupoId] ??= []).push(item.vinculoId);
    }
    return { grupos, campos, funcionariosPorGrupo };
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
   * Finalizar assistente persiste grupo, campo e lista de funcionários de
   * forma atômica. Uma competência é necessária somente para lançamentos
   * mensais, NUNCA para cadastrar associação ao benefício/comissão.
   */
  async function criarCompleto(
    dados: { nome: string; origem: Origem; responsavel: Responsavel;
      campo: CampoNovo; funcionariosIds: string[] }, autor: string,
  ) {
    return db.transaction(async tx => {
      const ids = [...new Set(dados.funcionariosIds)];
      const existentes = ids.length ? await tx.select({ id: t.vinculosEmpregaticios.id })
        .from(t.vinculosEmpregaticios) : [];
      const cadastrados = new Set(existentes.map(f => f.id));
      if (ids.some(id => !cadastrados.has(id)))
        throw new Error('Há funcionários que não estão cadastrados no sistema.');

      const [grupo] = await tx.insert(t.gruposDinamicos).values({
        nome: dados.nome, origem: dados.origem, responsavel: dados.responsavel,
      }).returning({ id: t.gruposDinamicos.id });
      const [campo] = await tx.insert(t.camposDinamicos).values({
        grupoId: grupo.id, nome: dados.campo.nome,
        tipo: dados.campo.tipo, classificacao: dados.campo.classificacao,
        anoCriacao: dados.campo.ano, mesCriacao: dados.campo.mes,
      }).returning({ id: t.camposDinamicos.id });

      if (ids.length) await tx.insert(t.vinculosGrupos).values(
        ids.map(vinculoId => ({ grupoId: grupo.id, vinculoId })));

      const competencias = await tx.select().from(t.competencias);
      for (const competencia of competencias) {
        if (numeroMes(competencia.ano, competencia.mes) <
          numeroMes(dados.campo.ano, dados.campo.mes)) continue;
        await tx.insert(t.camposCompetencia)
          .values({ competenciaId: competencia.id, campoId: campo.id }).onConflictDoNothing();
        if (dados.origem === 'COMISSAO') {
          await tx.insert(t.enviosComissoes).values({
            competenciaId: competencia.id, grupoId: grupo.id,
            responsavel: dados.responsavel,
          }).onConflictDoNothing();
        }
        // Um funcionário cadastrado pode ser vinculado ao grupo mesmo que não
        // faça parte de nenhum snapshot mensal. Só o lançamento mensal o filtra.
        if (ids.length) {
          const presentes = await tx.select({ id: t.funcionariosCompetencia.vinculoId })
            .from(t.funcionariosCompetencia)
            .where(eq(t.funcionariosCompetencia.competenciaId, competencia.id));
          const presentesIds = new Set(presentes.map(p => p.id));
          for (const vinculoId of ids.filter(id => presentesIds.has(id))) {
            await tx.insert(t.vinculosCamposCompetencia).values({
              competenciaId: competencia.id, vinculoId, campoId: campo.id, ativo: true,
            }).onConflictDoNothing();
          }
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
      const [campo] = await tx.insert(t.camposDinamicos)
        .values({ grupoId, nome, tipo, classificacao, anoCriacao: ano, mesCriacao: mes })
        .returning({ id: t.camposDinamicos.id });
      const associados = await tx.select({ vinculoId: t.vinculosGrupos.vinculoId })
        .from(t.vinculosGrupos).where(eq(t.vinculosGrupos.grupoId, grupoId));
      const ids = new Set(associados.map(v => v.vinculoId));
      const competencias = await tx.select().from(t.competencias);
      for (const competencia of competencias) {
        if (numeroMes(competencia.ano, competencia.mes) < numeroMes(ano, mes)) continue;
        await tx.insert(t.camposCompetencia)
          .values({ competenciaId: competencia.id, campoId: campo.id }).onConflictDoNothing();
        if (g.origem === 'COMISSAO')
          await tx.insert(t.enviosComissoes).values({
            competenciaId: competencia.id, grupoId, responsavel: g.responsavel,
          }).onConflictDoNothing();
        if (ids.size) {
          const presentes = await tx.select({ id: t.funcionariosCompetencia.vinculoId })
            .from(t.funcionariosCompetencia)
            .where(eq(t.funcionariosCompetencia.competenciaId, competencia.id));
          for (const vinculoId of presentes.map(p => p.id).filter(id => ids.has(id))) {
            await tx.insert(t.vinculosCamposCompetencia).values({
              competenciaId: competencia.id, campoId: campo.id, vinculoId, ativo: true,
            }).onConflictDoNothing();
          }
        }
        await tx.update(t.competencias)
          .set({ revisao: sql`${t.competencias.revisao} + 1` })
          .where(eq(t.competencias.id, competencia.id));
      }
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'CAMPO', entidadeId: campo.id, acao: 'CRIADO',
      });
      return campo;
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
