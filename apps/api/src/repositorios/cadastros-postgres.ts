import { and, desc, eq, tabelas, type ConexaoFolha } from '@odontofolha/database';
import type { Perfil } from '@odontofolha/contracts';
import { validarCpf } from '../dominio/cadastros';

/**
 * Cadastro operacional: todas as mudanças exigem perfil DP/ADMIN no controller.
 * Repositório audita cada escrita na mesma transação e nunca usa dados do cliente
 * para determinar autor/perfil. Nenhuma consulta é executada ao criar a instância.
 */
export function criarCadastroPostgres(conexao: ConexaoFolha) {
  const { db } = conexao, t = tabelas;

  const auditar = (autorId: string, entidade: string, entidadeId: string, acao: string) =>
    ({ usuarioId: autorId, entidade, entidadeId, acao });

  async function listar() {
    const [empresas, setores, vinculos, pessoas] = await Promise.all([
      db.select().from(t.empresas).orderBy(t.empresas.nome),
      db.select().from(t.setores).orderBy(t.setores.nome),
      db.select().from(t.vinculosEmpregaticios).orderBy(desc(t.vinculosEmpregaticios.criadoEm)),
      db.select().from(t.pessoas),
    ]);
    const pessoaPorId = new Map(pessoas.map(p => [p.id, p]));
    return {
      empresas: empresas.map(e => ({ id: e.id, nome: e.nome, ativa: e.ativa })),
      setores: setores.map(s => ({ id: s.id, nome: s.nome, ativo: s.ativo })),
      funcionarios: vinculos.map(v => ({
        id: v.id, cpf: pessoaPorId.get(v.pessoaId)?.cpf ?? '',
        nome: pessoaPorId.get(v.pessoaId)?.nome ?? '',
        empresaContratanteId: v.empresaContratanteId, empresaLotadoId: v.empresaLotadoId,
        setorLotacaoId: v.setorLotacaoId, cargo: v.cargo, admissao: v.admissao,
        salarioContratual: Number(v.salarioContratual), ativo: v.ativo,
      })),
    };
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

  type NovoFuncionario = {
    cpf: string; nome: string; empresaContratanteId: string;
    empresaLotadoId: string; setorLotacaoId: string; cargo: string;
    admissao: string; salarioContratual: number;
  };
  async function contratar(dados: NovoFuncionario, autorId: string) {
    if (!validarCpf(dados.cpf)) throw new Error('CPF inválido');
    return db.transaction(async tx => {
      const [anterior] = await tx.select().from(t.pessoas)
        .where(eq(t.pessoas.cpf, dados.cpf)).limit(1);
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
      return { id: vinculo.id };
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
      await tx.insert(t.auditoria).values(auditar(autorId, 'VINCULO',
        dados.vinculoId, 'MOVIMENTACAO:' + evento.id));
      return { id: evento.id };
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

  return { listar, cadastrarEmpresa, cadastrarSetor, contratar,
    desligar, movimentar, listarUsuarios, definirPerfil };
}
