import type { Perfil, ResponsavelComissao } from '@odontofolha/contracts';

/** Atribuições de rotina pertencem a perfis e setores, nunca ao usuário individual. */
export function podeGerenciarCadastros(perfil: Perfil): boolean {
  return perfil === 'ADMIN' || perfil === 'DP';
}

export function podeEditarConsolidacao(perfil: Perfil): boolean {
  return perfil === 'ADMIN' || perfil === 'DP';
}

/** A comissão concluída bloqueia novos lançamentos dos setores até reabertura pelo DP. */
export function podePreencherComissao(
  perfil: Perfil,
  responsavel: ResponsavelComissao,
  concluida: boolean,
  funcionarioVinculado: boolean,
): boolean {
  if (perfil === 'ADMIN' || perfil === 'DP') return true;
  if (concluida || !funcionarioVinculado) return false;
  return perfil === responsavel;
}
