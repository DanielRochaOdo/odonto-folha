import { eq, sql, tabelas, type ConexaoFolha } from '@odontofolha/database';

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

  async function listarBasesBeneficio(grupoId: string, ano: number, mes: number) {
    const [grupo] = await db.select().from(t.gruposDinamicos)
      .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
    if (!grupo || grupo.origem !== 'BENEFICIO') return null;

    const [campos, vinculados, bases, excecoes] = await Promise.all([
      db.select().from(t.camposDinamicos)
        .where(eq(t.camposDinamicos.grupoId, grupoId))
        .orderBy(t.camposDinamicos.ordemGlobal),
      db.select({ id: t.vinculosEmpregaticios.id,
        nome: t.pessoas.nome, ativo: t.vinculosEmpregaticios.ativo })
        .from(t.vinculosGrupos)
        .innerJoin(t.vinculosEmpregaticios,
          eq(t.vinculosGrupos.vinculoId, t.vinculosEmpregaticios.id))
        .innerJoin(t.pessoas,
          eq(t.vinculosEmpregaticios.pessoaId, t.pessoas.id))
        .where(eq(t.vinculosGrupos.grupoId, grupoId)),
      db.select().from(t.basesBeneficio),
      db.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio),
    ]);
    const camposAtivos = campos.filter(c => c.ativo);
    const idsCampos = new Set(camposAtivos.map(c => c.id));
    const idsFuncionarios = new Set(vinculados.map(f => f.id));
    const vigencia = ano * 12 + mes;
    const basesVigentes = bases.filter(b => idsCampos.has(b.campoId) &&
      idsFuncionarios.has(b.vinculoId) && b.anoInicio * 12 + b.mesInicio <= vigencia);
    const camposResposta = camposAtivos.map(c => ({
      id: c.id, nome: c.nome, tipo: c.tipo,
      anoCriacao: c.anoCriacao, mesCriacao: c.mesCriacao,
    }));
    const funcionariosResposta = vinculados
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(f => {
        const valores: Record<string, number | string | null> = {};
        for (const campo of camposResposta) {
          const base = basesVigentes
            .filter(b => b.vinculoId === f.id && b.campoId === campo.id)
            .reduce<typeof basesVigentes[number] | undefined>((maisRecente, candidata) => {
              if (!maisRecente) return candidata;
              const mesAtual = candidata.anoInicio * 12 + candidata.mesInicio;
              const mesAnterior = maisRecente.anoInicio * 12 + maisRecente.mesInicio;
              return mesAtual > mesAnterior ||
                (mesAtual === mesAnterior &&
                  candidata.criadoEm.getTime() > maisRecente.criadoEm.getTime())
                ? candidata : maisRecente;
            }, undefined);
          valores[campo.id] = base
            ? base.valorNumerico === null ? (base.valorTextual ?? '') : Number(base.valorNumerico)
            : null;
        }
        return { id: f.id, nome: f.nome, ativo: f.ativo, valores };
      });
    return {
      grupo: { id: grupo.id, nome: grupo.nome },
      versao: bases.length + excecoes.length,
      campos: camposResposta,
      funcionarios: funcionariosResposta,
    };
  }

  async function salvarBasesBeneficio(
    grupoId: string, ano: number, mes: number,
    entradas: { funcionarioId: string; campoId: string; valor: number | string }[],
    versaoEsperada: number, autor: string,
  ) {
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(9724101)`);
      const [grupo] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!grupo || grupo.origem !== 'BENEFICIO') throw new Error('Benefício inexistente');

      const [campos, associados, basesAtuais, excecoesAtuais] = await Promise.all([
        tx.select().from(t.camposDinamicos).where(eq(t.camposDinamicos.grupoId, grupoId)),
        tx.select({ vinculoId: t.vinculosGrupos.vinculoId })
          .from(t.vinculosGrupos).where(eq(t.vinculosGrupos.grupoId, grupoId)),
        tx.select().from(t.basesBeneficio),
        tx.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio),
      ]);
      if (basesAtuais.length + excecoesAtuais.length !== versaoEsperada)
        throw new Error('Conflito: valores alterados por outra pessoa');

      const campoPorId = new Map(campos.map(c => [c.id, c]));
      const idsFuncionarios = new Set(associados.map(v => v.vinculoId));
      const pares = new Set<string>();
      const vigencia = ano * 12 + mes;
      const novas: typeof entradas = [];
      for (const entrada of entradas) {
        const chave = entrada.funcionarioId + ':' + entrada.campoId;
        if (pares.has(chave)) throw new Error('Funcionário e campo repetidos na solicitação');
        pares.add(chave);
        const campo = campoPorId.get(entrada.campoId);
        if (!campo || !campo.ativo || !idsFuncionarios.has(entrada.funcionarioId))
          throw new Error('Funcionário ou campo fora do benefício');
        if (campo.anoCriacao * 12 + campo.mesCriacao > vigencia)
          throw new Error('A vigência do valor é anterior à criação do campo');
        if (campo.tipo === 'moeda' || campo.tipo === 'percentual') {
          if (typeof entrada.valor !== 'number' || !Number.isFinite(entrada.valor) ||
            (campo.tipo === 'moeda' && entrada.valor < 0))
            throw new Error('Informe um valor numérico válido para o campo');
        } else if (typeof entrada.valor !== 'string' || !entrada.valor.trim()) {
          throw new Error('Informe um valor para o campo');
        } else if (campo.tipo === 'data') {
          const data = new Date(entrada.valor + 'T00:00:00.000Z');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.valor) ||
            Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== entrada.valor)
            throw new Error('Informe uma data válida');
        } else if (campo.tipo === 'horario' &&
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entrada.valor)) {
          throw new Error('Informe um horário válido');
        }
        const anteriores = basesAtuais.filter(b => b.vinculoId === entrada.funcionarioId &&
          b.campoId === entrada.campoId && b.anoInicio * 12 + b.mesInicio <= vigencia);
        const maisRecente = anteriores.reduce<typeof basesAtuais[number] | undefined>(
          (atual, candidata) => {
            if (!atual) return candidata;
            const mesAtual = candidata.anoInicio * 12 + candidata.mesInicio;
            const mesAnterior = atual.anoInicio * 12 + atual.mesInicio;
            return mesAtual > mesAnterior ||
              (mesAtual === mesAnterior && candidata.criadoEm.getTime() > atual.criadoEm.getTime())
              ? candidata : atual;
          }, undefined);
        const valorAtual = maisRecente
          ? maisRecente.valorNumerico === null ? maisRecente.valorTextual
            : Number(maisRecente.valorNumerico)
          : null;
        if (valorAtual !== entrada.valor) novas.push(entrada);
      }
      if (!novas.length) return { versao: versaoEsperada, salvos: 0 };

      await tx.insert(t.basesBeneficio).values(novas.map(entrada => ({
        vinculoId: entrada.funcionarioId, campoId: entrada.campoId,
        anoInicio: ano, mesInicio: mes,
        valorNumerico: typeof entrada.valor === 'number' ? String(entrada.valor) : null,
        valorTextual: typeof entrada.valor === 'string' ? entrada.valor : null,
        autorId: autor,
      })));
      await tx.insert(t.auditoria).values(novas.map(entrada => ({
        usuarioId: autor, entidade: 'BENEFICIO', entidadeId: entrada.campoId,
        acao: 'BASE_ATUALIZADA', detalhes: {
          funcionarioId: entrada.funcionarioId, anoInicio: ano, mesInicio: mes,
        },
      })));
      return { versao: versaoEsperada + novas.length, salvos: novas.length };
    });
  }

  async function vincularFuncionariosBeneficio(
    grupoId: string, funcionariosIds: string[], autor: string,
  ) {
    return db.transaction(async tx => {
      const [grupo] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!grupo || grupo.origem !== 'BENEFICIO') throw new Error('Benefício inexistente');
      const ids = [...new Set(funcionariosIds)];
      const cadastrados = await tx.select({ id: t.vinculosEmpregaticios.id })
        .from(t.vinculosEmpregaticios);
      const existentes = new Set(cadastrados.map(f => f.id));
      if (ids.some(id => !existentes.has(id)))
        throw new Error('Há funcionários que não estão cadastrados no sistema');
      const associados = await tx.select({ vinculoId: t.vinculosGrupos.vinculoId })
        .from(t.vinculosGrupos).where(eq(t.vinculosGrupos.grupoId, grupoId));
      const associadosIds = new Set(associados.map(v => v.vinculoId));
      const novos = ids.filter(id => !associadosIds.has(id));
      if (!novos.length) return { vinculados: 0 };
      const vinculados = await tx.insert(t.vinculosGrupos).values(novos.map(vinculoId => ({
        grupoId, vinculoId,
      }))).onConflictDoNothing().returning({ vinculoId: t.vinculosGrupos.vinculoId });
      if (!vinculados.length) return { vinculados: 0 };
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: grupoId,
        acao: 'FUNCIONARIOS_VINCULADOS', detalhes: { quantidade: vinculados.length },
      });
      return { vinculados: vinculados.length };
    });
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
  return { listar, criarGrupo, criarCompleto, criarCampo, ativarCampo,
    listarBasesBeneficio, salvarBasesBeneficio, vincularFuncionariosBeneficio };
}
