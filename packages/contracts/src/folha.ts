import { z } from 'zod';

/**
 * Contratos de domínio. Não contêm credenciais nem registros reais.
 * CPF identifica a pessoa; o ID identifica um vínculo empregatício específico.
 */
export const competenciaSchema = z.object({
  ano: z.number().int().min(2000).max(2200),
  mes: z.number().int().min(1).max(12),
});

export const perfilSchema = z.enum(['ADMIN', 'DP', 'ADM', 'CENTRAL']);
export const tipoCampoSchema = z.enum(['moeda', 'percentual', 'data', 'horario']);
export const classificacaoSchema = z.enum(['provento', 'desconto', 'informativo']);
export const origemCampoSchema = z.enum(['BENEFICIO', 'COMISSAO']);
export const responsavelComissaoSchema = z.enum(['ADM', 'CENTRAL', 'NENHUM']);

const textoObrigatorio = z.string().trim().min(1);

export const funcionarioSchema = z.object({
  id: textoObrigatorio,
  empresaContratanteId: textoObrigatorio,
  empresaLotadoId: textoObrigatorio,
  setorLotacaoId: textoObrigatorio,
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve conter 11 dígitos numéricos'),
  nome: textoObrigatorio,
  cargo: textoObrigatorio,
  admissao: z.iso.date(),
  salarioContratual: z.number().finite().nonnegative(),
  ativo: z.boolean(),
});

export const campoDinamicoSchema = z.object({
  id: textoObrigatorio,
  grupoId: textoObrigatorio,
  grupoNome: textoObrigatorio,
  nome: textoObrigatorio,
  origem: origemCampoSchema,
  tipo: tipoCampoSchema,
  classificacao: classificacaoSchema,
  ordemGlobal: z.number().int().nonnegative(),
  criadoEm: competenciaSchema,
});

/** Vínculos de funcionários aos campos válidos para a competência consultada. */
export const vinculoCampoSchema = z.object({
  funcionarioId: textoObrigatorio,
  campoId: textoObrigatorio,
});

/**
 * Cada lançamento conserva identidade; entradas substituídas ficam não vigentes.
 * Lançamento direto e parcelas vigentes não podem coexistir na mesma célula.
 */
export const lancamentoSchema = z.object({
  id: textoObrigatorio,
  funcionarioId: textoObrigatorio,
  campoId: textoObrigatorio,
  modo: z.enum(['parcela', 'total']),
  valor: z.union([z.number().finite(), textoObrigatorio]),
  vigente: z.boolean(),
});

export type Competencia = z.infer<typeof competenciaSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
export type Funcionario = z.infer<typeof funcionarioSchema>;
export type CampoDinamico = z.infer<typeof campoDinamicoSchema>;
export type VinculoCampo = z.infer<typeof vinculoCampoSchema>;
export type Lancamento = z.infer<typeof lancamentoSchema>;
export type ResponsavelComissao = z.infer<typeof responsavelComissaoSchema>;
