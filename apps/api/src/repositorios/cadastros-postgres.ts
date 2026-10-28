import { and, desc, eq, inArray, isNull, or, tabelas, type ConexaoFolha } from '@odontofolha/database';
import type { Perfil } from '@odontofolha/contracts';
import { validarCpf } from '../dominio/cadastros';

/**
 * Cadastro operacional: todas as mudanças exigem perfil DP/ADMIN no controller.
 * Repositório audita cada escrita na mesma transação e nunca usa dados do cliente
 * para determinar autor/perfil. Nenhuma consulta é executada ao criar a instância.
 */
export function criarCadastroPostgres(conexao: ConexaoFolha) {
  const { db } = conexao, t = tabelas;
  type TransacaoCadastro = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const auditar = (autorId: string, entidade: string, entidadeId: string, acao: string) =>
    ({ usuarioId: autorId, entidade, entidadeId, acao });

  async function listarEstrutura() {
    const [empresas, setores] = await Promise.all([
      db.select().from(t.empresas).orderBy(t.empresas.nome),
      db.select().from(t.setores).orderBy(t.setores.nome),
    ]);
    return {
      empresas: empresas.map(e => ({ id: e.id, nome: e.nome, ativa: e.ativa })),
      setores: setores.map(s => ({ id: s.id, nome: s.nome, ativo: s.ativo })),
    };
  }

  async function listar() {
    const partesData = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit',
    }).formatToParts(new Date());
    const anoAtual = Number(partesData.find(parte => parte.type === 'year')?.value);
    const mesAtual = Number(partesData.find(parte => parte.type === 'month')?.value);
    const [empresas, setores, vinculos, pessoas, movimentos] = await Promise.all([
      db.select().from(t.empresas).orderBy(t.empresas.nome),
      db.select().from(t.setores).orderBy(t.setores.nome),
      db.select().from(t.vinculosEmpregaticios).orderBy(desc(t.vinculosEmpregaticios.criadoEm)),
      db.select().from(t.pessoas),
      db.select().from(t.movimentacoesVinculo)
        .orderBy(desc(t.movimentacoesVinculo.anoVigencia),
          desc(t.movimentacoesVinculo.mesVigencia), desc(t.movimentacoesVinculo.criadoEm)),
    ]);
    const competenciasAbertas = await db.select().from(t.competencias)
      .where(isNull(t.competencias.fechadaEm))
      .orderBy(desc(t.competencias.ano), desc(t.competencias.mes));
    const fotografados = competenciasAbertas.length
      ? await db.select().from(t.funcionariosCompetencia)
        .where(inArray(t.funcionariosCompetencia.competenciaId,
          competenciasAbertas.map(competencia => competencia.id)))
      : [];
    const fotografiaPorChave = new Map(fotografados.map(item =>
      [item.competenciaId + ':' + item.vinculoId, item]));
    const pessoaPorId = new Map(pessoas.map(p => [p.id, p]));
    const movimentoVigentePorVinculo = new Map<string, typeof movimentos[number]>();
    for (const movimento of movimentos) {
      if (movimento.anoVigencia * 12 + movimento.mesVigencia <= anoAtual * 12 + mesAtual &&
        !movimentoVigentePorVinculo.has(movimento.vinculoId))
        movimentoVigentePorVinculo.set(movimento.vinculoId, movimento);
    }
    return {
      empresas: empresas.map(e => ({ id: e.id, nome: e.nome, ativa: e.ativa })),
      setores: setores.map(s => ({ id: s.id, nome: s.nome, ativo: s.ativo })),
      funcionarios: vinculos.map(v => {
        const movimento = movimentoVigentePorVinculo.get(v.id);
        return {
          id: v.id, cpf: pessoaPorId.get(v.pessoaId)?.cpf ?? '',
          nome: pessoaPorId.get(v.pessoaId)?.nome ?? '',
          empresaContratanteId: movimento?.empresaContratanteId ?? v.empresaContratanteId,
          empresaLotadoId: movimento?.empresaLotadoId ?? v.empresaLotadoId,
          setorLotacaoId: movimento?.setorLotacaoId ?? v.setorLotacaoId,
          cargo: movimento?.cargo ?? v.cargo, admissao: v.admissao,
          salarioContratual: Number(movimento?.salarioContratual ?? v.salarioContratual),
          ativo: v.ativo,
          competenciaPendente: v.ativo && competenciasAbertas.some(competencia => {
            if (Number(v.admissao.slice(0, 4)) * 12 +
              Number(v.admissao.slice(5, 7)) > competencia.ano * 12 + competencia.mes)
              return false;
            const fotografia = fotografiaPorChave.get(competencia.id + ':' + v.id);
            const movimentoVigente = movimentos.find(m => m.vinculoId === v.id &&
              m.anoVigencia * 12 + m.mesVigencia <= competencia.ano * 12 + competencia.mes);
            return !fotografia || fotografia.cpf !== (pessoaPorId.get(v.pessoaId)?.cpf ?? '') ||
              fotografia.nome !== (pessoaPorId.get(v.pessoaId)?.nome ?? '') ||
              fotografia.admissao !== v.admissao ||
              fotografia.empresaContratanteId !==
                (movimentoVigente?.empresaContratanteId ?? v.empresaContratanteId) ||
              fotografia.empresaLotadoId !==
                (movimentoVigente?.empresaLotadoId ?? v.empresaLotadoId) ||
              fotografia.setorLotacaoId !==
                (movimentoVigente?.setorLotacaoId ?? v.setorLotacaoId) ||
              fotografia.cargo !== (movimentoVigente?.cargo ?? v.cargo) ||
              String(fotografia.salarioContratual) !==
                String(movimentoVigente?.salarioContratual ?? v.salarioContratual);
          }),
        };
      }),
    };
  }

  /**
   * Materializa o cadastro e a movimentação vigente nas competências abertas.
   * Idempotente: só incrementa a revisão quando uma fotografia precisa mudar.
   * Competências fechadas são registros históricos e nunca são reescritas aqui.
   */
  async function sincronizarFotografias(tx: TransacaoCadastro, vinculoId: string,
    autorId: string, competenciaId?: string | null) {
    const [registro] = await tx.select({ vinculo: t.vinculosEmpregaticios,
      pessoa: t.pessoas }).from(t.vinculosEmpregaticios)
      .innerJoin(t.pessoas, eq(t.vinculosEmpregaticios.pessoaId, t.pessoas.id))
      .where(eq(t.vinculosEmpregaticios.id, vinculoId)).limit(1);
    if (!registro) return [];

    const filtros = [isNull(t.competencias.fechadaEm)];
    if (competenciaId) filtros.push(eq(t.competencias.id, competenciaId));
    const competencias = await tx.select().from(t.competencias)
      .where(and(...filtros)).orderBy(t.competencias.ano, t.competencias.mes);
    const competenciasElegiveis = competencias.filter(competencia =>
      Number(registro.vinculo.admissao.slice(0, 4)) * 12 +
        Number(registro.vinculo.admissao.slice(5, 7)) <= competencia.ano * 12 + competencia.mes);
    if (!competenciasElegiveis.length) return [];

    const [movimentos, gruposVinculo] = await Promise.all([
      tx.select().from(t.movimentacoesVinculo)
        .where(eq(t.movimentacoesVinculo.vinculoId, vinculoId))
        .orderBy(desc(t.movimentacoesVinculo.anoVigencia),
          desc(t.movimentacoesVinculo.mesVigencia), desc(t.movimentacoesVinculo.criadoEm)),
      tx.select({ grupoId: t.vinculosGrupos.grupoId }).from(t.vinculosGrupos)
        .where(eq(t.vinculosGrupos.vinculoId, vinculoId)),
    ]);
    const grupoIds = gruposVinculo.map(grupo => grupo.grupoId);
    const sincronizadas: { id: string; ano: number; mes: number }[] = [];

    for (const competencia of competenciasElegiveis) {
      const vigente = movimentos.find(movimento =>
        movimento.anoVigencia * 12 + movimento.mesVigencia <=
          competencia.ano * 12 + competencia.mes);
      const esperado = {
        cpf: registro.pessoa.cpf,
        nome: registro.pessoa.nome,
        admissao: registro.vinculo.admissao,
        empresaContratanteId: vigente?.empresaContratanteId ?? registro.vinculo.empresaContratanteId,
        empresaLotadoId: vigente?.empresaLotadoId ?? registro.vinculo.empresaLotadoId,
        setorLotacaoId: vigente?.setorLotacaoId ?? registro.vinculo.setorLotacaoId,
        cargo: vigente?.cargo ?? registro.vinculo.cargo,
        salarioContratual: vigente?.salarioContratual ?? registro.vinculo.salarioContratual,
      };
      const [fotografia] = await tx.select().from(t.funcionariosCompetencia)
        .where(and(eq(t.funcionariosCompetencia.competenciaId, competencia.id),
          eq(t.funcionariosCompetencia.vinculoId, vinculoId))).limit(1);
      const mudou = !fotografia || fotografia.cpf !== esperado.cpf ||
        fotografia.nome !== esperado.nome || fotografia.admissao !== esperado.admissao ||
        fotografia.empresaContratanteId !== esperado.empresaContratanteId ||
        fotografia.empresaLotadoId !== esperado.empresaLotadoId ||
        fotografia.setorLotacaoId !== esperado.setorLotacaoId ||
        fotografia.cargo !== esperado.cargo ||
        String(fotografia.salarioContratual) !== String(esperado.salarioContratual);
      if (!mudou) continue;

      const [atualizada] = await tx.update(t.competencias)
        .set({ revisao: competencia.revisao + 1 })
        .where(and(eq(t.competencias.id, competencia.id),
          eq(t.competencias.revisao, competencia.revisao),
          isNull(t.competencias.fechadaEm)))
        .returning({ id: t.competencias.id });
      if (!atualizada) throw new Error('CONFLITO_COMPETENCIA');

      if (fotografia) {
        await tx.update(t.funcionariosCompetencia).set(esperado)
          .where(and(eq(t.funcionariosCompetencia.competenciaId, competencia.id),
            eq(t.funcionariosCompetencia.vinculoId, vinculoId)));
      } else {
        await tx.insert(t.funcionariosCompetencia).values({
          ...esperado, competenciaId: competencia.id, vinculoId,
        });
        if (grupoIds.length) {
          const campos = await tx.select({ campoId: t.camposCompetencia.campoId })
            .from(t.camposCompetencia)
            .innerJoin(t.camposDinamicos, eq(t.camposCompetencia.campoId, t.camposDinamicos.id))
            .where(and(eq(t.camposCompetencia.competenciaId, competencia.id),
              inArray(t.camposDinamicos.grupoId, grupoIds)));
          if (campos.length) await tx.insert(t.vinculosCamposCompetencia).values(
            campos.map(campo => ({ competenciaId: competencia.id, vinculoId,
              campoId: campo.campoId, ativo: true }))).onConflictDoNothing();
        }
      }
      await tx.insert(t.auditoria).values({
        ...auditar(autorId, 'COMPETENCIA', competencia.id,
          fotografia ? 'FUNCIONARIO_ATUALIZADO' : 'FUNCIONARIO_ADICIONADO'),
        competenciaId: competencia.id,
      });
      sincronizadas.push({ id: competencia.id, ano: competencia.ano, mes: competencia.mes });
    }
    return sincronizadas;
  }

  async function sincronizarFuncionario(vinculoId: string, autorId: string,
    competenciaId?: string | null) {
    return db.transaction(async tx => {
      const [vinculo] = await tx.select().from(t.vinculosEmpregaticios)
        .where(and(eq(t.vinculosEmpregaticios.id, vinculoId),
          eq(t.vinculosEmpregaticios.ativo, true))).limit(1);
      if (!vinculo) return null;
      const competencias = await tx.select().from(t.competencias)
        .where(isNull(t.competencias.fechadaEm))
        .orderBy(desc(t.competencias.ano), desc(t.competencias.mes));
      const elegiveis = competencias.filter(competencia =>
        Number(vinculo.admissao.slice(0, 4)) * 12 +
          Number(vinculo.admissao.slice(5, 7)) <= competencia.ano * 12 + competencia.mes);
      if (!elegiveis.length) return null;
      const competencia = elegiveis.find(item => item.id === competenciaId) ?? elegiveis[0];
      const sincronizadas = await sincronizarFotografias(tx, vinculoId, autorId);
      return { id: competencia.id, ano: competencia.ano, mes: competencia.mes,
        jaSincronizado: !sincronizadas.some(item => item.id === competencia.id) };
    });
  }

  async function listarGruposVinculaveis() {
    return db.select({ id: t.gruposDinamicos.id, nome: t.gruposDinamicos.nome,
      origem: t.gruposDinamicos.origem })
      .from(t.gruposDinamicos).where(eq(t.gruposDinamicos.ativo, true))
      .orderBy(t.gruposDinamicos.origem, t.gruposDinamicos.nome);
  }

  async function cadastrarEmpresa(nome: string, autorId: string) {
    return db.transaction(async tx => {
      const [empresa] = await tx.insert(t.empresas).values({ nome: nome.trim() })
        .returning({ id: t.empresas.id, nome: t.empresas.nome });
      await tx.insert(t.auditoria).values(auditar(autorId, 'EMPRESA', empresa.id, 'CRIADA'));
      return empresa;
    });
  }
  async function cadastrarSetor(nome: string, autorId: string) {
    return db.transaction(async tx => {
      const [setor] = await tx.insert(t.setores).values({ nome: nome.trim() })
        .returning({ id: t.setores.id, nome: t.setores.nome });
      await tx.insert(t.auditoria).values(auditar(autorId, 'SETOR', setor.id, 'CRIADO'));
      return setor;
    });
  }

  async function atualizarEmpresa(id: string, nome: string, autorId: string) {
    return db.transaction(async tx => {
      const [empresa] = await tx.update(t.empresas).set({ nome: nome.trim() })
        .where(eq(t.empresas.id, id)).returning({ id: t.empresas.id, nome: t.empresas.nome });
      if (!empresa) return null;
      await tx.insert(t.auditoria).values({
        ...auditar(autorId, 'EMPRESA', id, 'NOME_ALTERADO'), detalhes: { nome: empresa.nome },
      });
      return empresa;
    });
  }

  async function atualizarSetor(id: string, nome: string, autorId: string) {
    return db.transaction(async tx => {
      const [setor] = await tx.update(t.setores).set({ nome: nome.trim() })
        .where(eq(t.setores.id, id)).returning({ id: t.setores.id, nome: t.setores.nome });
      if (!setor) return null;
      await tx.insert(t.auditoria).values({
        ...auditar(autorId, 'SETOR', id, 'NOME_ALTERADO'), detalhes: { nome: setor.nome },
      });
      return setor;
    });
  }

  async function excluirEmpresa(id: string, autorId: string) {
    return db.transaction(async tx => {
      const [empresa] = await tx.select({ id: t.empresas.id }).from(t.empresas)
        .where(eq(t.empresas.id, id)).limit(1);
      if (!empresa) return null;
      const [vinculo, movimento, fotografia, escopo] = await Promise.all([
        tx.select({ id: t.vinculosEmpregaticios.id }).from(t.vinculosEmpregaticios)
          .where(or(eq(t.vinculosEmpregaticios.empresaContratanteId, id),
            eq(t.vinculosEmpregaticios.empresaLotadoId, id))).limit(1),
        tx.select({ id: t.movimentacoesVinculo.id }).from(t.movimentacoesVinculo)
          .where(or(eq(t.movimentacoesVinculo.empresaContratanteId, id),
            eq(t.movimentacoesVinculo.empresaLotadoId, id))).limit(1),
        tx.select({ vinculoId: t.funcionariosCompetencia.vinculoId }).from(t.funcionariosCompetencia)
          .where(or(eq(t.funcionariosCompetencia.empresaContratanteId, id),
            eq(t.funcionariosCompetencia.empresaLotadoId, id))).limit(1),
        tx.select({ usuarioId: t.usuariosEmpresas.usuarioId }).from(t.usuariosEmpresas)
          .where(eq(t.usuariosEmpresas.empresaId, id)).limit(1),
      ]);
      if (vinculo.length || movimento.length || fotografia.length || escopo.length)
        throw new Error('EMPRESA_EM_USO');
      await tx.delete(t.empresas).where(eq(t.empresas.id, id));
      await tx.insert(t.auditoria).values(auditar(autorId, 'EMPRESA', id, 'EXCLUIDA'));
      return { id };
    });
  }

  async function excluirSetor(id: string, autorId: string) {
    return db.transaction(async tx => {
      const [setor] = await tx.select({ id: t.setores.id }).from(t.setores)
        .where(eq(t.setores.id, id)).limit(1);
      if (!setor) return null;
      const [vinculo, movimento, fotografia] = await Promise.all([
        tx.select({ id: t.vinculosEmpregaticios.id }).from(t.vinculosEmpregaticios)
          .where(eq(t.vinculosEmpregaticios.setorLotacaoId, id)).limit(1),
        tx.select({ id: t.movimentacoesVinculo.id }).from(t.movimentacoesVinculo)
          .where(eq(t.movimentacoesVinculo.setorLotacaoId, id)).limit(1),
        tx.select({ vinculoId: t.funcionariosCompetencia.vinculoId }).from(t.funcionariosCompetencia)
          .where(eq(t.funcionariosCompetencia.setorLotacaoId, id)).limit(1),
      ]);
      if (vinculo.length || movimento.length || fotografia.length)
        throw new Error('SETOR_EM_USO');
      await tx.delete(t.setores).where(eq(t.setores.id, id));
      await tx.insert(t.auditoria).values(auditar(autorId, 'SETOR', id, 'EXCLUIDO'));
      return { id };
    });
  }

  type NovoFuncionario = {
    cpf: string; nome: string; empresaContratanteId: string;
    empresaLotadoId: string; setorLotacaoId: string; cargo: string;
    admissao: string; salarioContratual: number;
  };
  async function contratar(dados: NovoFuncionario, autorId: string, gruposIds: string[] = [],
    competenciaId?: string | null) {
    if (!validarCpf(dados.cpf)) throw new Error('CPF inválido');
    return db.transaction(async tx => {
      const gruposSelecionados = [...new Set(gruposIds)];
      if (gruposSelecionados.length) {
        const gruposAtivos = await tx.select({ id: t.gruposDinamicos.id })
          .from(t.gruposDinamicos).where(eq(t.gruposDinamicos.ativo, true));
        const gruposAtivosIds = new Set(gruposAtivos.map(grupo => grupo.id));
        if (gruposSelecionados.some(grupoId => !gruposAtivosIds.has(grupoId)))
          throw new Error('Um ou mais benefícios ou comissões selecionados não estão ativos.');
      }
      const [anterior] = await tx.select().from(t.pessoas)
        .where(eq(t.pessoas.cpf, dados.cpf)).limit(1);
      if (anterior && anterior.nome !== dados.nome.trim())
        await tx.update(t.pessoas).set({ nome: dados.nome.trim() })
          .where(eq(t.pessoas.id, anterior.id));
      const pessoaId = anterior?.id ?? (await tx.insert(t.pessoas)
        .values({ cpf: dados.cpf, nome: dados.nome.trim() })
        .returning({ id: t.pessoas.id }))[0].id;
      const [vinculo] = await tx.insert(t.vinculosEmpregaticios).values({
        pessoaId, empresaContratanteId: dados.empresaContratanteId,
        empresaLotadoId: dados.empresaLotadoId,
        setorLotacaoId: dados.setorLotacaoId,
        cargo: dados.cargo.trim(), admissao: dados.admissao,
        salarioContratual: String(dados.salarioContratual),
      }).returning({ id: t.vinculosEmpregaticios.id });
      await tx.insert(t.auditoria).values(auditar(autorId, 'VINCULO', vinculo.id,
        anterior ? 'RECONTRATADO' : 'CONTRATADO'));
      if (gruposSelecionados.length) {
        await tx.insert(t.vinculosGrupos).values(gruposSelecionados.map(grupoId => ({
          grupoId, vinculoId: vinculo.id,
        })));
        await tx.insert(t.auditoria).values(gruposSelecionados.map(grupoId => ({
          ...auditar(autorId, 'GRUPO', grupoId, 'FUNCIONARIO_VINCULADO'),
          detalhes: { vinculoId: vinculo.id },
        })));
      }

      // A consolidação lê uma fotografia por competência. Incluir o novo vínculo
      // somente na competência aberta mais recente, sem reescrever meses anteriores.
      const competenciasSincronizadas = await sincronizarFotografias(tx, vinculo.id, autorId);
      const competenciaSincronizada = competenciasSincronizadas.find(c => c.id === competenciaId) ??
        competenciasSincronizadas.at(-1) ?? null;
      return { id: vinculo.id, gruposVinculados: gruposSelecionados.length,
        competenciaSincronizada, competenciasSincronizadas };
    });
  }

  async function desligar(vinculoId: string, autorId: string) {
    return db.transaction(async tx => {
      const [alterado] = await tx.update(t.vinculosEmpregaticios)
        .set({ ativo: false }).where(and(
          eq(t.vinculosEmpregaticios.id, vinculoId),
          eq(t.vinculosEmpregaticios.ativo, true),
        )).returning({ id: t.vinculosEmpregaticios.id });
      if (!alterado) return false;
      await tx.insert(t.auditoria).values(auditar(autorId, 'VINCULO', vinculoId, 'DESLIGADO'));
      return true;
    });
  }

  type Movimentacao = {
    vinculoId: string; ano: number; mes: number;
    empresaContratanteId: string; empresaLotadoId: string;
    setorLotacaoId: string; cargo: string; salarioContratual: number;
  };
  async function movimentar(dados: Movimentacao, autorId: string) {
    return db.transaction(async tx => {
      const [vinculo] = await tx.select().from(t.vinculosEmpregaticios)
        .where(and(eq(t.vinculosEmpregaticios.id, dados.vinculoId),
          eq(t.vinculosEmpregaticios.ativo, true))).limit(1);
      if (!vinculo) throw new Error('Vínculo inativo ou inexistente');
      if (dados.ano * 12 + dados.mes <
        Number(vinculo.admissao.slice(0, 4)) * 12 + Number(vinculo.admissao.slice(5, 7)))
        throw new Error('Vigência anterior à admissão');
      const [evento] = await tx.insert(t.movimentacoesVinculo).values({
        vinculoId: dados.vinculoId, anoVigencia: dados.ano, mesVigencia: dados.mes,
        empresaContratanteId: dados.empresaContratanteId,
        empresaLotadoId: dados.empresaLotadoId, setorLotacaoId: dados.setorLotacaoId,
        cargo: dados.cargo.trim(), salarioContratual: String(dados.salarioContratual),
        autorId,
      }).returning({ id: t.movimentacoesVinculo.id });
      const competenciasAtualizadas = await sincronizarFotografias(
        tx, dados.vinculoId, autorId);
      await tx.insert(t.auditoria).values(auditar(autorId, 'VINCULO',
        dados.vinculoId, 'MOVIMENTACAO:' + evento.id));
      return { id: evento.id, competenciasAtualizadas };
    });
  }

  /**
   * Para habilitar/desabilitar o usuário, apenas ADMIN decide papel/escopo.
   * Identidade e credenciais são criadas separadamente pelo Better Auth.
   */
  async function listarUsuarios() {
    const perfis = await db.select().from(t.usuariosPerfis).orderBy(t.usuariosPerfis.usuarioId);
    const escopos = await db.select().from(t.usuariosEmpresas);
    return perfis.map(p => ({
      usuarioId: p.usuarioId, perfil: p.perfil, ativo: p.ativo,
      empresas: escopos.filter(e => e.usuarioId === p.usuarioId).map(e => e.empresaId),
    }));
  }
  async function definirPerfil(usuarioId: string, perfil: Perfil, ativo: boolean,
    empresas: string[], autorId: string) {
    if (usuarioId === autorId && (perfil !== 'ADMIN' || !ativo))
      throw new Error('ADMIN não pode remover seu próprio acesso administrativo');
    return db.transaction(async tx => {
      const [existente] = await tx.select().from(t.usuariosPerfis)
        .where(eq(t.usuariosPerfis.usuarioId, usuarioId)).limit(1);
      if (existente) {
        await tx.update(t.usuariosPerfis).set({ perfil, ativo })
          .where(eq(t.usuariosPerfis.usuarioId, usuarioId));
      } else {
        await tx.insert(t.usuariosPerfis).values({ usuarioId, perfil, ativo });
      }
      await tx.delete(t.usuariosEmpresas)
        .where(eq(t.usuariosEmpresas.usuarioId, usuarioId));
      for (const empresaId of new Set(empresas)) {
        await tx.insert(t.usuariosEmpresas).values({ usuarioId, empresaId });
      }
      await tx.insert(t.auditoria).values(auditar(autorId, 'USUARIO', usuarioId, 'PERFIL_ALTERADO'));
      return { usuarioId, perfil, ativo };
    });
  }

  return { listar, listarEstrutura, listarGruposVinculaveis, cadastrarEmpresa, cadastrarSetor,
    atualizarEmpresa, atualizarSetor, excluirEmpresa, excluirSetor, contratar,
    sincronizarFuncionario, desligar, movimentar, listarUsuarios, definirPerfil };
}
