import { eq, sql, tabelas, type ConexaoFolha } from '@odontofolha/database';
import type { CatalogoBeneficios } from '../dominio/beneficios';

export function criarBeneficiosPostgres(conexao: ConexaoFolha) {
  const db = conexao.db, t = tabelas;
  async function carregar(): Promise<CatalogoBeneficios> {
    const [bases, excecoes, regras, percentuais] = await Promise.all([
      db.select().from(t.basesBeneficio).orderBy(t.basesBeneficio.criadoEm),
      db.select({
        id: t.excecoesBeneficio.id,
        funcionarioId: t.excecoesBeneficio.vinculoId,
        campoId: t.excecoesBeneficio.campoId,
        valorNumerico: t.excecoesBeneficio.valorNumerico,
        valorTextual: t.excecoesBeneficio.valorTextual,
        criadaEm: t.excecoesBeneficio.criadoEm,
        autorId: t.excecoesBeneficio.autorId,
        ano: t.competencias.ano, mes: t.competencias.mes,
      }).from(t.excecoesBeneficio)
        .innerJoin(t.competencias,
          eq(t.excecoesBeneficio.competenciaId, t.competencias.id))
        .orderBy(t.excecoesBeneficio.criadoEm),
      db.select().from(t.regrasDescontoBeneficio).orderBy(t.regrasDescontoBeneficio.criadoEm),
      db.select().from(t.percentuaisDescontoBeneficio)
        .orderBy(t.percentuaisDescontoBeneficio.criadoEm),
    ]);
    return {
      versao: bases.length + excecoes.length + regras.length + percentuais.length,
      bases: bases.map(v => ({
        id: v.id, funcionarioId: v.vinculoId, campoId: v.campoId,
        inicio: { ano: v.anoInicio, mes: v.mesInicio },
        valor: v.valorNumerico === null ? (v.valorTextual ?? '') : Number(v.valorNumerico),
        criadaEm: v.criadoEm.toISOString(), autorId: v.autorId,
      })),
      excecoes: excecoes.map(v => ({
        id: v.id, funcionarioId: v.funcionarioId, campoId: v.campoId,
        competencia: { ano: v.ano, mes: v.mes },
        valor: v.valorNumerico === null ? (v.valorTextual ?? '') : Number(v.valorNumerico),
        criadaEm: v.criadaEm.toISOString(), autorId: v.autorId,
      })),
      regrasDesconto: regras.map(v => ({
        id: v.id, campoOrigemId: v.campoOrigemId, campoDescontoId: v.campoDescontoId,
        nomeColuna: v.nomeColuna, percentualPadrao: Number(v.percentualPadrao),
        inicio: { ano: v.anoInicio, mes: v.mesInicio }, ativo: v.ativo,
        criadaEm: v.criadoEm.toISOString(), autorId: v.autorId,
      })),
      percentuaisDesconto: percentuais.map(v => ({
        id: v.id, funcionarioId: v.vinculoId, campoOrigemId: v.campoOrigemId,
        percentual: Number(v.percentual), inicio: { ano: v.anoInicio, mes: v.mesInicio },
        criadaEm: v.criadoEm.toISOString(), autorId: v.autorId,
      })),
      auditoria: [],
    };
  }

  async function persistir(
    anterior: CatalogoBeneficios, novo: CatalogoBeneficios,
    competenciaId: string, autorId: string,
  ): Promise<boolean> {
    const idsBase = new Set(anterior.bases.map(v => v.id));
    const idsExcecao = new Set(anterior.excecoes.map(v => v.id));
    const idsPercentuais = new Set(anterior.percentuaisDesconto.map(v => v.id));
    const basesNovas = novo.bases.filter(v => !idsBase.has(v.id));
    const excecoesNovas = novo.excecoes.filter(v => !idsExcecao.has(v.id));
    const percentuaisNovos = novo.percentuaisDesconto.filter(v => !idsPercentuais.has(v.id));
    if (basesNovas.length + excecoesNovas.length + percentuaisNovos.length === 0) return true;
    return db.transaction(async tx => {
      // Serialização simples para alterações do catálogo, sem perda silenciosa.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(9724101)`);
      const competenciaAberta = await tx.execute(sql`
        SELECT id FROM competencias
        WHERE id = ${competenciaId} AND fechada_em IS NULL
        FOR UPDATE
      `);
      if (!competenciaAberta.rows.length) return false;
      const [basesAtuais, excecoesAtuais, regrasAtuais, percentuaisAtuais] = await Promise.all([
        tx.select({ id: t.basesBeneficio.id }).from(t.basesBeneficio),
        tx.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio),
        tx.select({ id: t.regrasDescontoBeneficio.id }).from(t.regrasDescontoBeneficio),
        tx.select({ id: t.percentuaisDescontoBeneficio.id }).from(t.percentuaisDescontoBeneficio),
      ]);
      if (basesAtuais.length + excecoesAtuais.length + regrasAtuais.length +
        percentuaisAtuais.length !== anterior.versao)
        return false;
      for (const v of basesNovas) {
        await tx.insert(t.basesBeneficio).values({
          id: v.id, vinculoId: v.funcionarioId, campoId: v.campoId,
          anoInicio: v.inicio.ano, mesInicio: v.inicio.mes,
          valorNumerico: typeof v.valor === 'number' ? String(v.valor) : null,
          valorTextual: typeof v.valor === 'string' ? v.valor : null,
          autorId,
        });
      }
      for (const v of excecoesNovas) {
        await tx.insert(t.excecoesBeneficio).values({
          id: v.id, competenciaId, vinculoId: v.funcionarioId, campoId: v.campoId,
          valorNumerico: typeof v.valor === 'number' ? String(v.valor) : null,
          valorTextual: typeof v.valor === 'string' ? v.valor : null,
          autorId,
        });
      }
      for (const v of percentuaisNovos) {
        await tx.insert(t.percentuaisDescontoBeneficio).values({
          id: v.id, campoOrigemId: v.campoOrigemId, vinculoId: v.funcionarioId,
          percentual: String(v.percentual), anoInicio: v.inicio.ano,
          mesInicio: v.inicio.mes, autorId, criadoEm: new Date(v.criadaEm),
        });
      }
      await tx.insert(t.auditoria).values({
        usuarioId: autorId, competenciaId, entidade: 'BENEFICIO',
        entidadeId: basesNovas[0]?.campoId ?? excecoesNovas[0]?.campoId ??
          percentuaisNovos[0]?.campoOrigemId ?? '',
        acao: basesNovas.length > 1 ? 'REAJUSTE_CONFIRMADO'
          : percentuaisNovos.length ? 'PERCENTUAL_DESCONTO_ATUALIZADO'
            : basesNovas.length ? 'BASE_ATUALIZADA' : 'EXCECAO_MENSAL',
      });
      return true;
    });
  }

  return { carregar, persistir };
}
