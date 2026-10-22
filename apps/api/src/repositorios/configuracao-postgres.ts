import { eq, tabelas, type ConexaoFolha } from '@odontofolha/database';
export function criarConfiguracaoPostgres(conexao: ConexaoFolha) {
  const db = conexao.db, t = tabelas;
  async function listar() {
    const [grupos, campos] = await Promise.all([
      db.select().from(t.gruposDinamicos).orderBy(t.gruposDinamicos.nome),
      db.select().from(t.camposDinamicos).orderBy(t.camposDinamicos.ordemGlobal),
    ]);
    return { grupos, campos };
  }
  async function criarGrupo(nome: string, origem: 'BENEFICIO' | 'COMISSAO',
    responsavel: 'ADM' | 'CENTRAL' | 'NENHUM', autor: string) {
    return db.transaction(async tx => {
      const [g] = await tx.insert(t.gruposDinamicos)
        .values({ nome, origem, responsavel }).returning({ id: t.gruposDinamicos.id });
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: g.id, acao: 'CRIADO',
      });
      return g;
    });
  }
  async function criarCampo(grupoId: string, nome: string,
    tipo: 'moeda' | 'percentual' | 'data' | 'horario',
    classificacao: 'provento' | 'desconto' | 'informativo',
    ano: number, mes: number, autor: string) {
    return db.transaction(async tx => {
      const [g] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!g || !g.ativo) throw new Error('Grupo inativo');
      const [c] = await tx.insert(t.camposDinamicos)
        .values({ grupoId, nome, tipo, classificacao, anoCriacao: ano, mesCriacao: mes })
        .returning({ id: t.camposDinamicos.id });
      const meses = await tx.select().from(t.competencias);
      for (const competencia of meses) {
        if (competencia.ano * 12 + competencia.mes < ano * 12 + mes) continue;
        await tx.insert(t.camposCompetencia)
          .values({ competenciaId: competencia.id, campoId: c.id }).onConflictDoNothing();
        if (g.origem === 'COMISSAO')
          await tx.insert(t.enviosComissoes).values({
            competenciaId: competencia.id, grupoId, responsavel: g.responsavel,
          }).onConflictDoNothing();
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
  return { listar, criarGrupo, criarCampo, ativarCampo };
}
