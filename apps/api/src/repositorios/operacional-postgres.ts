import type { EstadoCompetencia } from '../dominio/competencias';
import type { Funcionario, CampoDinamico, VinculoCampo, Lancamento } from '@odontofolha/contracts';
import { and, desc, eq, tabelas, type ConexaoFolha } from '@odontofolha/database';
import type { DependenciasOperacionais } from '../rotas/operacionais';

/**
 * Repositório transacional do domínio.
 *
 * A criação da instância NÃO faz queries. Toda atualização efetiva possui
 * revisão otimista da competência, preserva lançamentos antigos e grava
 * auditoria na MESMA transação. Este adaptador não executa migrations.
 */
export function criarRepositorioPostgres(
  conexao: ConexaoFolha,
): Omit<DependenciasOperacionais, 'autenticar' | 'obterBeneficios'> {
  const { db } = conexao;
  const t = tabelas;

  async function buscarCompetencia(id: string): Promise<EstadoCompetencia | null> {
    const [competencia] = await db.select().from(t.competencias)
      .where(eq(t.competencias.id, id)).limit(1);
    if (!competencia) return null;

    const [pessoas, colunas, vinculos, lancamentos, envios, eventos] = await Promise.all([
      db.select().from(t.funcionariosCompetencia)
        .where(eq(t.funcionariosCompetencia.competenciaId, id)),
      db.select({
        id: t.camposDinamicos.id,
        grupoId: t.camposDinamicos.grupoId,
        grupoNome: t.gruposDinamicos.nome,
        nome: t.camposDinamicos.nome,
        origem: t.gruposDinamicos.origem,
        tipo: t.camposDinamicos.tipo,
        classificacao: t.camposDinamicos.classificacao,
        ordemGlobal: t.camposDinamicos.ordemGlobal,
        anoCriacao: t.camposDinamicos.anoCriacao,
        mesCriacao: t.camposDinamicos.mesCriacao,
        bloqueado: t.camposCompetencia.edicaoBloqueada,
      }).from(t.camposCompetencia)
        .innerJoin(t.camposDinamicos, eq(t.camposCompetencia.campoId, t.camposDinamicos.id))
        .innerJoin(t.gruposDinamicos, eq(t.camposDinamicos.grupoId, t.gruposDinamicos.id))
        .where(eq(t.camposCompetencia.competenciaId, id))
        .orderBy(t.camposDinamicos.ordemGlobal),
      db.select().from(t.vinculosCamposCompetencia)
        .where(and(eq(t.vinculosCamposCompetencia.competenciaId, id),
          eq(t.vinculosCamposCompetencia.ativo, true))),
      db.select({
        id: t.lancamentosCompetencia.id,
        funcionarioId: t.celulasCompetencia.vinculoId,
        campoId: t.celulasCompetencia.campoId,
        modo: t.lancamentosCompetencia.modo,
        valorNumerico: t.lancamentosCompetencia.valorNumerico,
        valorTextual: t.lancamentosCompetencia.valorTextual,
        vigente: t.lancamentosCompetencia.vigente,
      }).from(t.lancamentosCompetencia)
        .innerJoin(t.celulasCompetencia, eq(t.lancamentosCompetencia.celulaId, t.celulasCompetencia.id))
        .where(eq(t.celulasCompetencia.competenciaId, id))
        .orderBy(t.lancamentosCompetencia.criadoEm),
      db.select().from(t.enviosComissoes).where(eq(t.enviosComissoes.competenciaId, id)),
      db.select().from(t.auditoria).where(eq(t.auditoria.competenciaId, id))
        .orderBy(t.auditoria.ocorridoEm),
    ]);

    const funcionarios: Funcionario[] = pessoas.map(f => ({
      id: f.vinculoId,
      empresaContratanteId: f.empresaContratanteId,
      empresaLotadoId: f.empresaLotadoId,
      setorLotacaoId: f.setorLotacaoId,
      cpf: f.cpf,
      nome: f.nome,
      cargo: f.cargo,
      admissao: f.admissao,
      salarioContratual: Number(f.salarioContratual),
      ativo: true, // status atual é aplicado separadamente a cada exportação
    }));
    const campos: CampoDinamico[] = colunas.map(c => ({
      id: c.id, grupoId: c.grupoId, grupoNome: c.grupoNome, nome: c.nome,
      origem: c.origem, tipo: c.tipo, classificacao: c.classificacao,
      ordemGlobal: c.ordemGlobal, criadoEm: { ano: c.anoCriacao, mes: c.mesCriacao },
    }));
    const vinculosDaCompetencia: VinculoCampo[] = vinculos.map(v => ({
      funcionarioId: v.vinculoId, campoId: v.campoId,
    }));
    const registros: Lancamento[] = lancamentos.map(l => ({
      id: l.id, funcionarioId: l.funcionarioId, campoId: l.campoId,
      modo: l.modo, valor: l.valorNumerico !== null
        ? Number(l.valorNumerico) : l.valorTextual ?? '',
      vigente: l.vigente,
    }));
    return {
      competencia: { ano: competencia.ano, mes: competencia.mes },
      funcionarios, campos, vinculos: vinculosDaCompetencia, lancamentos: registros,
      camposBloqueados: colunas.filter(c => c.bloqueado).map(c => c.id),
      envios: envios.map(e => ({
        grupoId: e.grupoId, responsavel: e.responsavel,
        concluido: e.concluido, concluidoEm: e.concluidoEm?.toISOString() ?? null,
        concluidoPor: e.concluidoPor,
      })),
      revisao: competencia.revisao,
      auditoria: eventos.map(e => ({
        id: e.id, autorId: e.usuarioId, acao: e.acao, entidadeId: e.entidadeId,
        competencia: { ano: competencia.ano, mes: competencia.mes },
        ocorridoEm: e.ocorridoEm.toISOString(),
      })),
    };
  }

  async function salvarSeRevisao(
    id: string, revisaoAnterior: number, estado: EstadoCompetencia,
  ): Promise<boolean> {
    if (estado.revisao !== revisaoAnterior + 1)
      throw new Error('Revisão resultante inválida para persistência');
    return db.transaction(async tx => {
      const atualizado = await tx.update(t.competencias)
        .set({ revisao: estado.revisao })
        .where(and(eq(t.competencias.id, id),
          eq(t.competencias.revisao, revisaoAnterior)))
        .returning({ id: t.competencias.id });
      if (!atualizado.length) return false;

      // Desativar vínculos só os oculta da lista: os lançamentos não são apagados.
      const anterioresVinculos = await tx.select().from(t.vinculosCamposCompetencia)
        .where(eq(t.vinculosCamposCompetencia.competenciaId, id));
      const idsVinculados = new Set(estado.vinculos.map(v =>
        v.funcionarioId + ':' + v.campoId));
      for (const anterior of anterioresVinculos) {
        const ativo = idsVinculados.has(anterior.vinculoId + ':' + anterior.campoId);
        if (anterior.ativo !== ativo) {
          await tx.update(t.vinculosCamposCompetencia).set({ ativo })
            .where(and(eq(t.vinculosCamposCompetencia.competenciaId, id),
              eq(t.vinculosCamposCompetencia.vinculoId, anterior.vinculoId),
              eq(t.vinculosCamposCompetencia.campoId, anterior.campoId)));
        }
      }
      const chavesAntigas = new Set(anterioresVinculos.map(v => v.vinculoId + ':' + v.campoId));
      for (const vinculo of estado.vinculos) {
        if (chavesAntigas.has(vinculo.funcionarioId + ':' + vinculo.campoId)) continue;
        await tx.insert(t.vinculosCamposCompetencia).values({
          competenciaId: id, vinculoId: vinculo.funcionarioId,
          campoId: vinculo.campoId, ativo: true,
        });
      }

      // Inclusão e bloqueio das colunas não reescrevem períodos anteriores.
      for (const campo of estado.campos) {
        await tx.insert(t.camposCompetencia).values({
          competenciaId: id, campoId: campo.id,
          visivelHistorico: true,
          edicaoBloqueada: estado.camposBloqueados.includes(campo.id),
        }).onConflictDoUpdate({
          target: [t.camposCompetencia.competenciaId, t.camposCompetencia.campoId],
          set: { edicaoBloqueada: estado.camposBloqueados.includes(campo.id) },
        });
      }

      // Envios têm bloqueio por grupo; cada comissão é independente.
      for (const envio of estado.envios) {
        await tx.insert(t.enviosComissoes).values({
          competenciaId: id, grupoId: envio.grupoId, responsavel: envio.responsavel,
          concluido: envio.concluido,
          concluidoEm: envio.concluidoEm ? new Date(envio.concluidoEm) : null,
          concluidoPor: envio.concluidoPor,
        }).onConflictDoUpdate({
          target: [t.enviosComissoes.competenciaId, t.enviosComissoes.grupoId],
          set: {
            concluido: envio.concluido,
            concluidoEm: envio.concluidoEm ? new Date(envio.concluidoEm) : null,
            concluidoPor: envio.concluidoPor,
          },
        });
      }

      const anteriores = await tx.select({
        id: t.lancamentosCompetencia.id,
        vigente: t.lancamentosCompetencia.vigente,
        celulaId: t.lancamentosCompetencia.celulaId,
      }).from(t.lancamentosCompetencia)
        .innerJoin(t.celulasCompetencia, eq(t.lancamentosCompetencia.celulaId, t.celulasCompetencia.id))
        .where(eq(t.celulasCompetencia.competenciaId, id));
      const existentes = new Set(anteriores.map(l => l.id));
      const vigentes = new Map(estado.lancamentos.map(l => [l.id, l.vigente]));
      for (const anterior of anteriores) {
        if (anterior.vigente && vigentes.get(anterior.id) === false) {
          await tx.update(t.lancamentosCompetencia).set({ vigente: false })
            .where(eq(t.lancamentosCompetencia.id, anterior.id));
        }
      }

      const novos = estado.lancamentos.filter(l => !existentes.has(l.id));
      if (novos.length) {
        const autorId = estado.auditoria.at(-1)?.autorId;
        if (!autorId) throw new Error('Lançamento sem identificação de autoria');
        const celulas = await tx.select().from(t.celulasCompetencia)
          .where(eq(t.celulasCompetencia.competenciaId, id));
        const mapaCelulas = new Map(celulas.map(c =>
          [c.vinculoId + ':' + c.campoId, c.id]));
        for (const l of novos) {
          const chave = l.funcionarioId + ':' + l.campoId;
          let celulaId = mapaCelulas.get(chave);
          if (!celulaId) {
            const [celula] = await tx.insert(t.celulasCompetencia).values({
              competenciaId: id, vinculoId: l.funcionarioId,
              campoId: l.campoId, modo: l.modo,
            }).returning({ id: t.celulasCompetencia.id });
            celulaId = celula.id;
            mapaCelulas.set(chave, celulaId);
          }
          await tx.insert(t.lancamentosCompetencia).values({
            id: l.id, celulaId, modo: l.modo,
            valorNumerico: typeof l.valor === 'number' ? String(l.valor) : null,
            valorTextual: typeof l.valor === 'string' ? l.valor : null,
            vigente: l.vigente, autorId,
          });
        }
      }

      // Append-only. Nunca gravar CPF, salário, cookies ou token na auditoria.
      for (const evento of estado.auditoria) {
        await tx.insert(t.auditoria).values({
          id: evento.id, usuarioId: evento.autorId,
          competenciaId: id, entidade: 'COMPETENCIA',
          entidadeId: evento.entidadeId, acao: evento.acao,
        }).onConflictDoNothing();
      }
      return true;
    });
  }

  async function funcionariosAtivos(): Promise<ReadonlySet<string>> {
    const vinculos = await db.select({ id: t.vinculosEmpregaticios.id })
      .from(t.vinculosEmpregaticios)
      .where(eq(t.vinculosEmpregaticios.ativo, true));
    return new Set(vinculos.map(v => v.id));
  }

  async function nomesExportacao() {
    const [empresas, setores] = await Promise.all([
      db.select({ id: t.empresas.id, nome: t.empresas.nome }).from(t.empresas),
      db.select({ id: t.setores.id, nome: t.setores.nome }).from(t.setores),
    ]);
    return {
      empresas: Object.fromEntries(empresas.map(e => [e.id, e.nome])),
      setores: Object.fromEntries(setores.map(s => [s.id, s.nome])),
    };
  }
  async function listarCompetencias() {
    const registros = await db.select({
      id: t.competencias.id,
      ano: t.competencias.ano,
      mes: t.competencias.mes,
      revisao: t.competencias.revisao,
    }).from(t.competencias)
      .orderBy(desc(t.competencias.ano), desc(t.competencias.mes));
    return registros;
  }

  /**
   * Abertura do mês é indivisível: fotografia salarial, colunas existentes,
   * vínculos do mês anterior e comissões novas pendentes. Nunca copia valores
   * de comissões anteriores. Bases de benefício ficam versionadas em tabela própria.
   */
  async function abrirNovaCompetencia(ano: number, mes: number, autorId: string) {
    return db.transaction(async tx => {
      const [nova] = await tx.insert(t.competencias)
        .values({ ano, mes, criadaPor: autorId, revisao: 0 })
        .onConflictDoNothing({ target: [t.competencias.ano, t.competencias.mes] })
        .returning({ id: t.competencias.id });
      if (!nova) return null;

      const atual = ano * 12 + mes;
      const [vinculosAtivos, movimentos, camposAtivos, grupos, meses] = await Promise.all([
        tx.select({
          vinculo: t.vinculosEmpregaticios,
          pessoa: t.pessoas,
        }).from(t.vinculosEmpregaticios)
          .innerJoin(t.pessoas, eq(t.vinculosEmpregaticios.pessoaId, t.pessoas.id))
          .where(eq(t.vinculosEmpregaticios.ativo, true)),
        tx.select().from(t.movimentacoesVinculo)
          .orderBy(desc(t.movimentacoesVinculo.anoVigencia),
            desc(t.movimentacoesVinculo.mesVigencia),
            desc(t.movimentacoesVinculo.criadoEm)),
        tx.select().from(t.camposDinamicos)
          .where(eq(t.camposDinamicos.ativo, true)),
        tx.select().from(t.gruposDinamicos)
          .where(eq(t.gruposDinamicos.ativo, true)),
        tx.select().from(t.competencias)
          .orderBy(desc(t.competencias.ano), desc(t.competencias.mes)),
      ]);
      const contratos = vinculosAtivos.filter(({ vinculo }) =>
        Number(vinculo.admissao.slice(0, 4)) * 12 +
        Number(vinculo.admissao.slice(5, 7)) <= atual);
      for (const { vinculo, pessoa } of contratos) {
        const movimento = movimentos.find(m => m.vinculoId === vinculo.id &&
          m.anoVigencia * 12 + m.mesVigencia <= atual);
        await tx.insert(t.funcionariosCompetencia).values({
          competenciaId: nova.id, vinculoId: vinculo.id, cpf: pessoa.cpf,
          nome: pessoa.nome, admissao: vinculo.admissao,
          empresaContratanteId: movimento?.empresaContratanteId ?? vinculo.empresaContratanteId,
          empresaLotadoId: movimento?.empresaLotadoId ?? vinculo.empresaLotadoId,
          setorLotacaoId: movimento?.setorLotacaoId ?? vinculo.setorLotacaoId,
          cargo: movimento?.cargo ?? vinculo.cargo,
          salarioContratual: movimento?.salarioContratual ?? vinculo.salarioContratual,
        });
      }
      const grupoPorId = new Map(grupos.map(g => [g.id, g]));
      const campos = camposAtivos.filter(c => grupoPorId.has(c.grupoId) &&
        c.anoCriacao * 12 + c.mesCriacao <= atual);
      for (const campo of campos) {
        await tx.insert(t.camposCompetencia).values({
          competenciaId: nova.id, campoId: campo.id,
          visivelHistorico: true, edicaoBloqueada: false,
        });
      }
      const camposIds = new Set(campos.map(c => c.id));
      const funcionariosIds = new Set(contratos.map(v => v.vinculo.id));
      const anterior = meses.find(m => m.id !== nova.id &&
        m.ano * 12 + m.mes < atual);
      if (anterior) {
        const copiados = await tx.select().from(t.vinculosCamposCompetencia)
          .where(and(eq(t.vinculosCamposCompetencia.competenciaId, anterior.id),
            eq(t.vinculosCamposCompetencia.ativo, true)));
        for (const vinculo of copiados) {
          if (!camposIds.has(vinculo.campoId) || !funcionariosIds.has(vinculo.vinculoId))
            continue;
          await tx.insert(t.vinculosCamposCompetencia).values({
            competenciaId: nova.id, vinculoId: vinculo.vinculoId,
            campoId: vinculo.campoId, ativo: true,
          });
        }
      }
      const gruposComissao = new Set(campos.flatMap(c =>
        grupoPorId.get(c.grupoId)?.origem === 'COMISSAO' ? [c.grupoId] : []));
      for (const grupoId of gruposComissao) {
        const grupo = grupoPorId.get(grupoId);
        if (!grupo) continue;
        await tx.insert(t.enviosComissoes).values({
          competenciaId: nova.id, grupoId,
          responsavel: grupo.responsavel,
          concluido: false, concluidoEm: null, concluidoPor: null,
        });
      }
      await tx.insert(t.auditoria).values({
        usuarioId: autorId, competenciaId: nova.id,
        entidade: 'COMPETENCIA', entidadeId: nova.id, acao: 'COMPETENCIA_ABERTA',
      });
      return { id: nova.id, ano, mes, revisao: 0 };
    });
  }

  return { buscarCompetencia, salvarSeRevisao, funcionariosAtivos, nomesExportacao,
    listarCompetencias, abrirNovaCompetencia };
}
