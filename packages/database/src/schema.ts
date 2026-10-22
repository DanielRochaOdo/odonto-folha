import {
  pgTable, uuid, text, varchar, boolean, integer, bigint, timestamp,
  date, numeric, jsonb, primaryKey, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Esquema do domínio. Better Auth gera suas tabelas separadamente. */
export const empresas = pgTable('empresas', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull().unique(),
  ativa: boolean('ativa').notNull().default(true),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
});
export const setores = pgTable('setores', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull().unique(),
  ativo: boolean('ativo').notNull().default(true),
});
export const pessoas = pgTable('pessoas', {
  id: uuid('id').defaultRandom().primaryKey(),
  cpf: varchar('cpf', { length: 11 }).notNull().unique(),
  nome: text('nome').notNull(),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
}, () => [check('pessoas_cpf_formato', sql.raw("cpf ~ '^[0-9]{11}$'"))]);
export const vinculosEmpregaticios = pgTable('vinculos_empregaticios', {
  id: uuid('id').defaultRandom().primaryKey(),
  pessoaId: uuid('pessoa_id').notNull().references(() => pessoas.id),
  empresaContratanteId: uuid('empresa_contratante_id').notNull().references(() => empresas.id),
  empresaLotadoId: uuid('empresa_lotado_id').notNull().references(() => empresas.id),
  setorLotacaoId: uuid('setor_lotacao_id').notNull().references(() => setores.id),
  cargo: text('cargo').notNull(),
  admissao: date('admissao').notNull(),
  salarioContratual: numeric('salario_contratual', { precision: 18, scale: 2 }).notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('vinculos_pessoa_idx').on(t.pessoaId),
  check('vinculos_salario_valido', sql.raw('salario_contratual >= 0')),
  uniqueIndex('vinculo_ativo_pessoa_unico').on(t.pessoaId).where(sql`${t.ativo} = true`)]);
export const movimentacoesVinculo = pgTable('movimentacoes_vinculo', {
  id: uuid('id').defaultRandom().primaryKey(),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  anoVigencia: integer('ano_vigencia').notNull(),
  mesVigencia: integer('mes_vigencia').notNull(),
  empresaContratanteId: uuid('empresa_contratante_id').notNull().references(() => empresas.id),
  empresaLotadoId: uuid('empresa_lotado_id').notNull().references(() => empresas.id),
  setorLotacaoId: uuid('setor_lotacao_id').notNull().references(() => setores.id),
  cargo: text('cargo').notNull(),
  salarioContratual: numeric('salario_contratual', { precision: 18, scale: 2 }).notNull(),
  autorId: text('autor_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('movimentacoes_vigencia_idx').on(t.vinculoId, t.anoVigencia, t.mesVigencia)]);
export const competencias = pgTable('competencias', {
  id: uuid('id').defaultRandom().primaryKey(),
  ano: integer('ano').notNull(),
  mes: integer('mes').notNull(),
  revisao: bigint('revisao', { mode: 'number' }).notNull().default(0),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  criadaPor: text('criada_por').notNull(),
}, t => [uniqueIndex('competencias_ano_mes').on(t.ano, t.mes),
  check('competencias_mes_valido', sql.raw('mes BETWEEN 1 AND 12'))]);
export const funcionariosCompetencia = pgTable('funcionarios_competencia', {
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  empresaContratanteId: uuid('empresa_contratante_id').notNull().references(() => empresas.id),
  empresaLotadoId: uuid('empresa_lotado_id').notNull().references(() => empresas.id),
  setorLotacaoId: uuid('setor_lotacao_id').notNull().references(() => setores.id),
  cpf: varchar('cpf', { length: 11 }).notNull(),
  nome: text('nome').notNull(),
  cargo: text('cargo').notNull(),
  admissao: date('admissao').notNull(),
  salarioContratual: numeric('salario_contratual', { precision: 18, scale: 2 }).notNull(),
}, t => [primaryKey({ columns: [t.competenciaId, t.vinculoId] })]);
export const gruposDinamicos = pgTable('grupos_dinamicos', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  origem: text('origem', { enum: ['BENEFICIO', 'COMISSAO'] }).notNull(),
  responsavel: text('responsavel', { enum: ['ADM', 'CENTRAL', 'NENHUM'] }).notNull().default('NENHUM'),
  ativo: boolean('ativo').notNull().default(true),
});
export const camposDinamicos = pgTable('campos_dinamicos', {
  id: uuid('id').defaultRandom().primaryKey(),
  grupoId: uuid('grupo_id').notNull().references(() => gruposDinamicos.id),
  nome: text('nome').notNull(),
  tipo: text('tipo', { enum: ['moeda', 'percentual', 'data', 'horario'] }).notNull(),
  classificacao: text('classificacao', { enum: ['provento', 'desconto', 'informativo'] }).notNull(),
  ordemGlobal: bigint('ordem_global', { mode: 'number' }).generatedAlwaysAsIdentity().notNull().unique(),
  anoCriacao: integer('ano_criacao').notNull(),
  mesCriacao: integer('mes_criacao').notNull(),
  ativo: boolean('ativo').notNull().default(true),
});
export const camposCompetencia = pgTable('campos_competencia', {
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  campoId: uuid('campo_id').notNull().references(() => camposDinamicos.id),
  visivelHistorico: boolean('visivel_historico').notNull().default(true),
  edicaoBloqueada: boolean('edicao_bloqueada').notNull().default(false),
}, t => [primaryKey({ columns: [t.competenciaId, t.campoId] })]);
export const vinculosCamposCompetencia = pgTable('vinculos_campos_competencia', {
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  campoId: uuid('campo_id').notNull().references(() => camposDinamicos.id),
  ativo: boolean('ativo').notNull().default(true),
}, t => [primaryKey({ columns: [t.competenciaId, t.vinculoId, t.campoId] })]);
export const celulasCompetencia = pgTable('celulas_competencia', {
  id: uuid('id').defaultRandom().primaryKey(),
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  campoId: uuid('campo_id').notNull().references(() => camposDinamicos.id),
  modo: text('modo', { enum: ['total', 'parcela'] }),
  versao: bigint('versao', { mode: 'number' }).notNull().default(0),
}, t => [uniqueIndex('celulas_uma_por_funcionario').on(t.competenciaId, t.vinculoId, t.campoId)]);
export const lancamentosCompetencia = pgTable('lancamentos_competencia', {
  id: uuid('id').defaultRandom().primaryKey(),
  celulaId: uuid('celula_id').notNull().references(() => celulasCompetencia.id),
  modo: text('modo', { enum: ['total', 'parcela'] }).notNull(),
  valorNumerico: numeric('valor_numerico', { precision: 18, scale: 4 }),
  valorTextual: text('valor_textual'),
  vigente: boolean('vigente').notNull().default(true),
  autorId: text('autor_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('lancamentos_celula_idx').on(t.celulaId, t.vigente),
  check('lancamentos_um_valor', sql.raw('num_nonnulls(valor_numerico, valor_textual) = 1'))]);
export const basesBeneficio = pgTable('bases_beneficio', {
  id: uuid('id').defaultRandom().primaryKey(),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  campoId: uuid('campo_id').notNull().references(() => camposDinamicos.id),
  anoInicio: integer('ano_inicio').notNull(),
  mesInicio: integer('mes_inicio').notNull(),
  valorNumerico: numeric('valor_numerico', { precision: 18, scale: 4 }),
  valorTextual: text('valor_textual'),
  autorId: text('autor_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('bases_beneficio_vigencia_idx').on(t.vinculoId, t.campoId, t.anoInicio, t.mesInicio)]);
export const excecoesBeneficio = pgTable('excecoes_beneficio', {
  id: uuid('id').defaultRandom().primaryKey(),
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosEmpregaticios.id),
  campoId: uuid('campo_id').notNull().references(() => camposDinamicos.id),
  valorNumerico: numeric('valor_numerico', { precision: 18, scale: 4 }),
  valorTextual: text('valor_textual'),
  autorId: text('autor_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('excecoes_beneficio_competencia_idx').on(t.competenciaId, t.vinculoId, t.campoId)]);
export const enviosComissoes = pgTable('envios_comissoes', {
  competenciaId: uuid('competencia_id').notNull().references(() => competencias.id),
  grupoId: uuid('grupo_id').notNull().references(() => gruposDinamicos.id),
  responsavel: text('responsavel', { enum: ['ADM', 'CENTRAL', 'NENHUM'] }).notNull(),
  concluido: boolean('concluido').notNull().default(false),
  concluidoEm: timestamp('concluido_em', { withTimezone: true }),
  concluidoPor: text('concluido_por'),
}, t => [primaryKey({ columns: [t.competenciaId, t.grupoId] })]);
export const usuariosPerfis = pgTable('usuarios_perfis', {
  usuarioId: text('usuario_id').primaryKey(),
  perfil: text('perfil', { enum: ['ADMIN', 'DP', 'ADM', 'CENTRAL'] }).notNull(),
  ativo: boolean('ativo').notNull().default(true),
});
export const usuariosEmpresas = pgTable('usuarios_empresas', {
  usuarioId: text('usuario_id').notNull().references(() => usuariosPerfis.usuarioId),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
}, t => [primaryKey({ columns: [t.usuarioId, t.empresaId] })]);
export const auditoria = pgTable('auditoria', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: text('usuario_id').notNull(),
  competenciaId: uuid('competencia_id').references(() => competencias.id),
  entidade: text('entidade').notNull(),
  entidadeId: text('entidade_id').notNull(),
  acao: text('acao').notNull(),
  detalhes: jsonb('detalhes').notNull().default(sql.raw("'{}'::jsonb")),
  ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('auditoria_competencia_idx').on(t.competenciaId, t.ocorridoEm)]);
