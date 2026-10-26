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
type CampoEdicaoCompleta = CampoNovo & { id: string; ativo: boolean };

/** Vínculos de grupo são permanentes, independentes de qualquer competência. */
export function criarConfiguracaoPostgres(conexao: ConexaoFolha) {
  const db = conexao.db, t = tabelas;
  const numeroMes = (ano: number, mes: number) => ano * 12 + mes;
  const competenciaAtual = () => new Date().getUTCFullYear() * 12 + new Date().getUTCMonth() + 1;
  let ultimoInstanteRegra = 0;
  const instanteRegra = () => {
    ultimoInstanteRegra = Math.max(Date.now(), ultimoInstanteRegra + 1);
    return new Date(ultimoInstanteRegra);
  };

  async function listar() {
    const [grupos, campos, vinculos, regrasDesconto] = await Promise.all([
      db.select().from(t.gruposDinamicos).orderBy(t.gruposDinamicos.nome),
      db.select().from(t.camposDinamicos).orderBy(t.camposDinamicos.ordemGlobal),
      db.select({ grupoId: t.vinculosGrupos.grupoId, vinculoId: t.vinculosGrupos.vinculoId })
        .from(t.vinculosGrupos),
      db.select().from(t.regrasDescontoBeneficio).orderBy(t.regrasDescontoBeneficio.criadoEm),
    ]);
    const funcionariosPorGrupo: Record<string, string[]> = {};
    for (const item of vinculos) {
      (funcionariosPorGrupo[item.grupoId] ??= []).push(item.vinculoId);
    }
    return { grupos, campos, funcionariosPorGrupo, regrasDesconto };
  }

  async function listarBasesBeneficio(grupoId: string, ano: number, mes: number) {
    const [grupo] = await db.select().from(t.gruposDinamicos)
      .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
    if (!grupo || grupo.origem !== 'BENEFICIO') return null;

    const [campos, vinculados, bases, excecoes, regras, percentuais] = await Promise.all([
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
      db.select().from(t.regrasDescontoBeneficio),
      db.select().from(t.percentuaisDescontoBeneficio),
    ]);
    const camposAtivos = campos.filter(c => c.ativo);
    const idsCampos = new Set(camposAtivos.map(c => c.id));
    const camposMoeda = new Set(camposAtivos.filter(c => c.tipo === 'moeda').map(c => c.id));
    const idsFuncionarios = new Set(vinculados.map(f => f.id));
    const vigencia = ano * 12 + mes;
    const basesVigentes = bases.filter(b => idsCampos.has(b.campoId) &&
      idsFuncionarios.has(b.vinculoId) && b.anoInicio * 12 + b.mesInicio <= vigencia);
    const camposResposta = camposAtivos.map(c => ({
      id: c.id, nome: c.nome, tipo: c.tipo,
      anoCriacao: c.anoCriacao, mesCriacao: c.mesCriacao,
    }));
    const regrasPorCampo = new Map<string, typeof regras[number]>();
    for (const regra of regras.filter(item => item.anoInicio * 12 + item.mesInicio <= vigencia)) {
      const atual = regrasPorCampo.get(regra.campoOrigemId);
      if (!atual || regra.anoInicio * 12 + regra.mesInicio > atual.anoInicio * 12 + atual.mesInicio ||
        (regra.anoInicio === atual.anoInicio && regra.mesInicio === atual.mesInicio &&
          regra.criadoEm > atual.criadoEm)) regrasPorCampo.set(regra.campoOrigemId, regra);
    }
    const descontosResposta = [...regrasPorCampo.values()].filter(regra => regra.ativo &&
      camposMoeda.has(regra.campoOrigemId)).map(regra => ({
        campoOrigemId: regra.campoOrigemId, campoDescontoId: regra.campoDescontoId,
        nomeColuna: regra.nomeColuna, percentualPadrao: Number(regra.percentualPadrao),
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
        const percentuaisDesconto: Record<string, number> = {};
        for (const regra of descontosResposta) {
          const taxa = percentuais.filter(item => item.campoOrigemId === regra.campoOrigemId &&
            item.vinculoId === f.id && item.anoInicio * 12 + item.mesInicio <= vigencia)
            .reduce<typeof percentuais[number] | undefined>((maisRecente, candidata) => {
              if (!maisRecente) return candidata;
              const mesCandidata = candidata.anoInicio * 12 + candidata.mesInicio;
              const mesAtual = maisRecente.anoInicio * 12 + maisRecente.mesInicio;
              return mesCandidata > mesAtual || (mesCandidata === mesAtual &&
                candidata.criadoEm > maisRecente.criadoEm) ? candidata : maisRecente;
            }, undefined);
          percentuaisDesconto[regra.campoOrigemId] = taxa ? Number(taxa.percentual) : regra.percentualPadrao;
        }
        return { id: f.id, nome: f.nome, ativo: f.ativo, valores, percentuaisDesconto };
      });
    return {
      grupo: { id: grupo.id, nome: grupo.nome },
      versao: bases.length + excecoes.length + regras.length + percentuais.length,
      campos: camposResposta,
      descontos: descontosResposta,
      funcionarios: funcionariosResposta,
    };
  }

  async function salvarRegraDescontoBeneficio(
    campoOrigemId: string, nomeColuna: string, percentualPadrao: number,
    ano: number, mes: number, ativo: boolean, autor: string,
  ) {
    if (numeroMes(ano, mes) < competenciaAtual())
      throw new Error('A regra só pode iniciar na competência atual ou em uma futura.');
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(9724101)`);
      const [competencia] = await tx.select({ id: t.competencias.id,
        fechadaEm: t.competencias.fechadaEm }).from(t.competencias)
        .where(and(eq(t.competencias.ano, ano), eq(t.competencias.mes, mes))).limit(1);
      if (competencia?.fechadaEm)
        throw new Error('Selecione uma competência aberta para iniciar a regra.');
      const [campo] = await tx.select({ id: t.camposDinamicos.id,
        grupoId: t.camposDinamicos.grupoId, tipo: t.camposDinamicos.tipo,
        origem: t.gruposDinamicos.origem })
        .from(t.camposDinamicos).innerJoin(t.gruposDinamicos,
          eq(t.camposDinamicos.grupoId, t.gruposDinamicos.id))
        .where(eq(t.camposDinamicos.id, campoOrigemId)).limit(1);
      if (!campo || campo.origem !== 'BENEFICIO' || (ativo && campo.tipo !== 'moeda'))
        throw new Error('O desconto automático exige um campo monetário de benefício.');
      const existentes = await tx.select().from(t.regrasDescontoBeneficio)
        .where(eq(t.regrasDescontoBeneficio.campoOrigemId, campoOrigemId));
      if (!ativo && !existentes.length)
        throw new Error('Não existe regra de desconto ativa para desativar.');
      const regraAnterior = existentes.filter(item => item.anoInicio * 12 + item.mesInicio <= ano * 12 + mes)
        .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
          a.criadoEm.getTime() - b.criadoEm.getTime()).at(-1);
      const campoDescontoId = regraAnterior?.campoDescontoId ?? crypto.randomUUID();
      const valoresRegra = { nomeColuna: nomeColuna.trim(), percentualPadrao: String(percentualPadrao),
        ativo, autorId: autor, criadoEm: instanteRegra() };
      const [regra] = await tx.insert(t.regrasDescontoBeneficio).values({
        campoOrigemId, campoDescontoId, ...valoresRegra, anoInicio: ano, mesInicio: mes,
      }).returning();
      await tx.insert(t.auditoria).values({ usuarioId: autor, competenciaId: competencia?.id ?? null,
        entidade: 'BENEFICIO', entidadeId: campoOrigemId,
        acao: ativo ? 'DESCONTO_AUTOMATICO_CONFIGURADO' : 'DESCONTO_AUTOMATICO_DESATIVADO',
        detalhes: { campoDescontoId, nomeColuna: nomeColuna.trim(), percentualPadrao,
          anoInicio: ano, mesInicio: mes } });
      return regra;
    });
  }

  async function salvarBasesBeneficio(
    grupoId: string, ano: number, mes: number,
    entradas: { funcionarioId: string; campoId: string; valor: number | string }[],
    versaoEsperada: number, autor: string,
    entradasPercentuais: { funcionarioId: string; campoOrigemId: string; percentual: number }[] = [],
  ) {
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(9724101)`);
      const [grupo] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!grupo || grupo.origem !== 'BENEFICIO') throw new Error('Benefício inexistente');

      const [campos, associados, basesAtuais, excecoesAtuais, regrasAtuais, percentuaisAtuais] = await Promise.all([
        tx.select().from(t.camposDinamicos).where(eq(t.camposDinamicos.grupoId, grupoId)),
        tx.select({ vinculoId: t.vinculosGrupos.vinculoId })
          .from(t.vinculosGrupos).where(eq(t.vinculosGrupos.grupoId, grupoId)),
        tx.select().from(t.basesBeneficio),
        tx.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio),
        tx.select().from(t.regrasDescontoBeneficio),
        tx.select().from(t.percentuaisDescontoBeneficio),
      ]);
      if (basesAtuais.length + excecoesAtuais.length + regrasAtuais.length +
        percentuaisAtuais.length !== versaoEsperada)
        throw new Error('Conflito: valores alterados por outra pessoa');

      const campoPorId = new Map(campos.map(c => [c.id, c]));
      const idsFuncionarios = new Set(associados.map(v => v.vinculoId));
      const pares = new Set<string>();
      const vigencia = ano * 12 + mes;
      if (entradasPercentuais.length && vigencia < competenciaAtual())
        throw new Error('Percentuais individuais só podem mudar da competência atual em diante.');
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
      const idsAssociados = new Set(associados.map(item => item.vinculoId));
      const paresPercentuais = new Set<string>();
      const novosPercentuais: typeof entradasPercentuais = [];
      for (const entrada of entradasPercentuais) {
        const chave = `${entrada.funcionarioId}:${entrada.campoOrigemId}`;
        if (paresPercentuais.has(chave)) throw new Error('Funcionário e desconto repetidos na solicitação');
        paresPercentuais.add(chave);
        if (!idsAssociados.has(entrada.funcionarioId) || !Number.isFinite(entrada.percentual) ||
          entrada.percentual < 0 || entrada.percentual > 100)
          throw new Error('Informe funcionário vinculado e percentual entre 0 e 100.');
        const regraVigente = regrasAtuais.filter(regra => regra.campoOrigemId === entrada.campoOrigemId &&
          regra.anoInicio * 12 + regra.mesInicio <= vigencia)
          .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
            a.criadoEm.getTime() - b.criadoEm.getTime()).at(-1);
        if (!regraVigente?.ativo || campoPorId.get(entrada.campoOrigemId)?.tipo !== 'moeda')
          throw new Error('Regra de desconto não está ativa para o campo informado.');
        const taxaAtual = percentuaisAtuais.filter(item => item.campoOrigemId === entrada.campoOrigemId &&
          item.vinculoId === entrada.funcionarioId && item.anoInicio * 12 + item.mesInicio <= vigencia)
          .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
            a.criadoEm.getTime() - b.criadoEm.getTime()).at(-1);
        const percentualAtual = taxaAtual ? Number(taxaAtual.percentual)
          : Number(regraVigente.percentualPadrao);
        if (percentualAtual !== entrada.percentual) novosPercentuais.push(entrada);
      }
      if (!novas.length && !novosPercentuais.length)
        return { versao: versaoEsperada, salvos: 0 };

      if (novas.length) await tx.insert(t.basesBeneficio).values(novas.map(entrada => ({
        vinculoId: entrada.funcionarioId, campoId: entrada.campoId,
        anoInicio: ano, mesInicio: mes,
        valorNumerico: typeof entrada.valor === 'number' ? String(entrada.valor) : null,
        valorTextual: typeof entrada.valor === 'string' ? entrada.valor : null,
        autorId: autor,
      })));
      if (novosPercentuais.length) await tx.insert(t.percentuaisDescontoBeneficio).values(
        novosPercentuais.map(entrada => ({ campoOrigemId: entrada.campoOrigemId,
          vinculoId: entrada.funcionarioId, percentual: String(entrada.percentual),
          anoInicio: ano, mesInicio: mes, autorId: autor, criadoEm: new Date() })));
      await tx.insert(t.auditoria).values(novas.map(entrada => ({
        usuarioId: autor, entidade: 'BENEFICIO', entidadeId: entrada.campoId,
        acao: 'BASE_ATUALIZADA', detalhes: {
          funcionarioId: entrada.funcionarioId, anoInicio: ano, mesInicio: mes,
        },
      })));
      if (novosPercentuais.length) await tx.insert(t.auditoria).values(novosPercentuais.map(entrada => ({
        usuarioId: autor, entidade: 'BENEFICIO', entidadeId: entrada.campoOrigemId,
        acao: 'PERCENTUAL_DESCONTO_ATUALIZADO', detalhes: {
          funcionarioId: entrada.funcionarioId, percentual: entrada.percentual,
          anoInicio: ano, mesInicio: mes,
        },
      })));
      return { versao: versaoEsperada + novas.length + novosPercentuais.length,
        salvos: novas.length + novosPercentuais.length };
    });
  }

  async function vincularFuncionariosGrupo(
    grupoId: string, funcionariosIds: string[], autor: string,
  ) {
    return db.transaction(async tx => {
      const [grupo] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!grupo || !grupo.ativo) throw new Error('Cadastro inexistente ou inativo');
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

  async function editarGrupo(id: string, dados: { nome: string; responsavel: Responsavel }, autor: string) {
    return db.transaction(async tx => {
      const [existente] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, id)).limit(1);
      if (!existente) return false;
      if (existente.origem === 'BENEFICIO' && dados.responsavel !== 'NENHUM')
        throw new Error('Benefícios não têm responsável ADM/CENTRAL.');
      const [grupo] = await tx.update(t.gruposDinamicos).set({
        nome: dados.nome.trim(), responsavel: dados.responsavel,
      }).where(eq(t.gruposDinamicos.id, id)).returning({ id: t.gruposDinamicos.id });
      if (!grupo) return false;
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: id, acao: 'EDITADO',
      });
      return true;
    });
  }

  async function editarGrupoCompleto(id: string, dados: {
    nome: string; responsavel: Responsavel; campos: CampoEdicaoCompleta[];
    funcionariosIds: string[];
  }, autor: string) {
    return db.transaction(async tx => {
      const [grupo] = await tx.select().from(t.gruposDinamicos)
        .where(eq(t.gruposDinamicos.id, id)).limit(1);
      if (!grupo) return false;
      if (grupo.origem === 'BENEFICIO' && dados.responsavel !== 'NENHUM')
        throw new Error('Benefícios não têm responsável ADM/CENTRAL.');

      const existentes = await tx.select().from(t.camposDinamicos)
        .where(eq(t.camposDinamicos.grupoId, id));
      const camposPorId = new Map(existentes.map(campo => [campo.id, campo]));
      const idsCampos = dados.campos.map(campo => campo.id);
      if (new Set(idsCampos).size !== idsCampos.length || idsCampos.length !== existentes.length ||
        idsCampos.some(campoId => !camposPorId.has(campoId)))
        throw new Error('A lista de campos mudou. Atualize a tela e tente novamente.');
      const camposAlterados = dados.campos.filter(novo => {
        const anterior = camposPorId.get(novo.id);
        return anterior && (anterior.nome !== novo.nome.trim() || anterior.tipo !== novo.tipo ||
          anterior.classificacao !== novo.classificacao || anterior.anoCriacao !== novo.ano ||
          anterior.mesCriacao !== novo.mes || anterior.ativo !== novo.ativo);
      });

      const idsFuncionarios = [...new Set(dados.funcionariosIds)];
      const funcionarios = idsFuncionarios.length
        ? await tx.select({ id: t.vinculosEmpregaticios.id }).from(t.vinculosEmpregaticios)
        : [];
      const idsCadastrados = new Set(funcionarios.map(funcionario => funcionario.id));
      if (idsFuncionarios.some(funcionarioId => !idsCadastrados.has(funcionarioId)))
        throw new Error('Há funcionários que não estão cadastrados no sistema.');

      for (const novo of camposAlterados) {
        const anterior = camposPorId.get(novo.id);
        if (!anterior) continue;
        const mudouTipoOuClassificacao = anterior.tipo !== novo.tipo ||
          anterior.classificacao !== novo.classificacao;
        if (mudouTipoOuClassificacao) {
          const [lancamentos, bases, excecoes] = await Promise.all([
            tx.select({ id: t.lancamentosCompetencia.id }).from(t.lancamentosCompetencia)
              .innerJoin(t.celulasCompetencia,
                eq(t.lancamentosCompetencia.celulaId, t.celulasCompetencia.id))
              .where(eq(t.celulasCompetencia.campoId, novo.id)).limit(1),
            tx.select({ id: t.basesBeneficio.id }).from(t.basesBeneficio)
              .where(eq(t.basesBeneficio.campoId, novo.id)).limit(1),
            tx.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio)
              .where(eq(t.excecoesBeneficio.campoId, novo.id)).limit(1),
          ]);
          if (lancamentos.length || bases.length || excecoes.length)
            throw new Error(`O tipo ou a classificação de “${anterior.nome}” não pode mudar após valores históricos ou recorrentes.`);
        }
        if (anterior.anoCriacao !== novo.ano || anterior.mesCriacao !== novo.mes) {
          const [snapshot] = await tx.select({ campoId: t.camposCompetencia.campoId })
            .from(t.camposCompetencia).where(eq(t.camposCompetencia.campoId, novo.id)).limit(1);
          if (snapshot)
            throw new Error(`A vigência de “${anterior.nome}” não pode mudar depois que entrou em competências.`);
        }
      }

      const grupoMudou = grupo.nome !== dados.nome.trim() || grupo.responsavel !== dados.responsavel;
      if (grupoMudou) await tx.update(t.gruposDinamicos).set({
        nome: dados.nome.trim(), responsavel: dados.responsavel,
      }).where(eq(t.gruposDinamicos.id, id));
      for (const campo of camposAlterados) {
        await tx.update(t.camposDinamicos).set({
          nome: campo.nome.trim(), tipo: campo.tipo, classificacao: campo.classificacao,
          anoCriacao: campo.ano, mesCriacao: campo.mes, ativo: campo.ativo,
        }).where(and(eq(t.camposDinamicos.id, campo.id), eq(t.camposDinamicos.grupoId, id)));
      }

      const vinculosAtuais = await tx.select({ vinculoId: t.vinculosGrupos.vinculoId })
        .from(t.vinculosGrupos).where(eq(t.vinculosGrupos.grupoId, id));
      const atuais = new Set(vinculosAtuais.map(item => item.vinculoId));
      const desejados = new Set(idsFuncionarios);
      let removidos = 0;
      for (const funcionarioId of atuais) {
        if (!desejados.has(funcionarioId)) {
          await tx.delete(t.vinculosGrupos).where(and(
            eq(t.vinculosGrupos.grupoId, id), eq(t.vinculosGrupos.vinculoId, funcionarioId),
          ));
          removidos++;
        }
      }
      const novos = idsFuncionarios.filter(funcionarioId => !atuais.has(funcionarioId));
      if (novos.length) await tx.insert(t.vinculosGrupos).values(
        novos.map(vinculoId => ({ grupoId: id, vinculoId })));

      const eventos = [
        ...(grupoMudou ? [{ usuarioId: autor, entidade: 'GRUPO', entidadeId: id, acao: 'EDITADO' }] : []),
        ...camposAlterados.map(campo => ({
          usuarioId: autor, entidade: 'CAMPO', entidadeId: campo.id, acao: 'EDITADO',
        })),
        ...(novos.length || removidos ? [{
          usuarioId: autor, entidade: 'GRUPO', entidadeId: id,
          acao: 'FUNCIONARIOS_ATUALIZADOS',
          detalhes: { quantidade: idsFuncionarios.length, adicionados: novos.length, removidos },
        }] : []),
      ];
      if (eventos.length) await tx.insert(t.auditoria).values(eventos);
      return true;
    });
  }

  async function ativarGrupo(id: string, ativo: boolean, autor: string) {
    return db.transaction(async tx => {
      const [grupo] = await tx.update(t.gruposDinamicos).set({ ativo })
        .where(eq(t.gruposDinamicos.id, id)).returning({ id: t.gruposDinamicos.id });
      if (!grupo) return false;
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: id,
        acao: ativo ? 'REATIVADO' : 'ARQUIVADO',
      });
      return true;
    });
  }

  async function editarCampo(id: string, dados: CampoNovo, autor: string) {
    return db.transaction(async tx => {
      const [campo] = await tx.select().from(t.camposDinamicos)
        .where(eq(t.camposDinamicos.id, id)).limit(1);
      if (!campo) return false;

      const alterouTipoOuClassificacao = campo.tipo !== dados.tipo ||
        campo.classificacao !== dados.classificacao;
      if (alterouTipoOuClassificacao) {
        const [lancamento, base, excecao] = await Promise.all([
          tx.select({ id: t.lancamentosCompetencia.id }).from(t.lancamentosCompetencia)
            .innerJoin(t.celulasCompetencia,
              eq(t.lancamentosCompetencia.celulaId, t.celulasCompetencia.id))
            .where(eq(t.celulasCompetencia.campoId, id)).limit(1),
          tx.select({ id: t.basesBeneficio.id }).from(t.basesBeneficio)
            .where(eq(t.basesBeneficio.campoId, id)).limit(1),
          tx.select({ id: t.excecoesBeneficio.id }).from(t.excecoesBeneficio)
            .where(eq(t.excecoesBeneficio.campoId, id)).limit(1),
        ]);
        if (lancamento.length || base.length || excecao.length)
          throw new Error('Tipo e classificação não podem mudar após haver valores históricos ou recorrentes.');
      }

      const alterouVigencia = campo.anoCriacao !== dados.ano || campo.mesCriacao !== dados.mes;
      if (alterouVigencia) {
        const [snapshot] = await tx.select({ campoId: t.camposCompetencia.campoId })
          .from(t.camposCompetencia).where(eq(t.camposCompetencia.campoId, id)).limit(1);
        if (snapshot)
          throw new Error('A vigência não pode mudar depois que o campo entrou em competências.');
      }

      await tx.update(t.camposDinamicos).set({
        nome: dados.nome.trim(), tipo: dados.tipo, classificacao: dados.classificacao,
        anoCriacao: dados.ano, mesCriacao: dados.mes,
      }).where(eq(t.camposDinamicos.id, id));
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'CAMPO', entidadeId: id, acao: 'EDITADO',
      });
      return true;
    });
  }

  async function removerVinculoFuncionario(grupoId: string, vinculoId: string, autor: string) {
    return db.transaction(async tx => {
      const [grupo] = await tx.select({ ativo: t.gruposDinamicos.ativo })
        .from(t.gruposDinamicos).where(eq(t.gruposDinamicos.id, grupoId)).limit(1);
      if (!grupo || !grupo.ativo) throw new Error('Cadastro inexistente ou inativo');
      const removidos = await tx.delete(t.vinculosGrupos).where(and(
        eq(t.vinculosGrupos.grupoId, grupoId), eq(t.vinculosGrupos.vinculoId, vinculoId),
      ))
        .returning({ grupoId: t.vinculosGrupos.grupoId });
      if (!removidos.length) return false;
      await tx.insert(t.auditoria).values({
        usuarioId: autor, entidade: 'GRUPO', entidadeId: grupoId,
        acao: 'FUNCIONARIO_DESVINCULADO', detalhes: { vinculoId },
      });
      return true;
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
      campo: CampoNovo; funcionariosIds: string[];
      descontoBeneficio?: { nomeColuna: string; percentualPadrao: number; ano: number; mes: number } },
    autor: string,
  ) {
    return db.transaction(async tx => {
      if (dados.descontoBeneficio) {
        const regra = dados.descontoBeneficio;
        if (dados.origem !== 'BENEFICIO' || dados.campo.tipo !== 'moeda')
          throw new Error('Desconto automático exige um campo monetário de benefício.');
        if (numeroMes(regra.ano, regra.mes) < competenciaAtual())
          throw new Error('A regra de desconto só pode iniciar na competência atual ou em uma futura.');
        const [competenciaDesconto] = await tx.select({ fechadaEm: t.competencias.fechadaEm })
          .from(t.competencias)
          .where(and(eq(t.competencias.ano, regra.ano), eq(t.competencias.mes, regra.mes)))
          .limit(1);
        if (competenciaDesconto?.fechadaEm)
          throw new Error('Selecione uma competência aberta para iniciar a regra de desconto.');
      }

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

      if (dados.descontoBeneficio) {
        const regra = dados.descontoBeneficio;
        const campoDescontoId = crypto.randomUUID();
        await tx.insert(t.regrasDescontoBeneficio).values({
          campoOrigemId: campo.id, campoDescontoId,
          nomeColuna: regra.nomeColuna.trim(),
          percentualPadrao: String(regra.percentualPadrao),
          anoInicio: regra.ano, mesInicio: regra.mes, ativo: true,
          autorId: autor, criadoEm: instanteRegra(),
        });
        await tx.insert(t.auditoria).values({
          usuarioId: autor, entidade: 'BENEFICIO', entidadeId: campo.id,
          acao: 'DESCONTO_AUTOMATICO_CONFIGURADO',
          detalhes: { campoDescontoId, nomeColuna: regra.nomeColuna.trim(),
            percentualPadrao: regra.percentualPadrao,
            anoInicio: regra.ano, mesInicio: regra.mes },
        });
      }

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
  return { listar, criarGrupo, criarCompleto, criarCampo, ativarCampo, editarGrupo,
    editarGrupoCompleto, ativarGrupo,
    editarCampo, removerVinculoFuncionario,
    listarBasesBeneficio, salvarBasesBeneficio, salvarRegraDescontoBeneficio,
    vincularFuncionariosGrupo };
}
