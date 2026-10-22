import type { Competencia, Funcionario, Perfil } from '@odontofolha/contracts';
import type { AtorFolha } from './competencias';

export type EmpresaCadastro = { id: string; nome: string; ativa: boolean };
export type SetorCadastro = { id: string; nome: string; ativo: boolean };
export type PessoaCadastro = { id: string; cpf: string; nome: string };
export type MovimentacaoCadastro = {
  id: string; vinculoId: string; aPartir: Competencia;
  empresaContratanteId: string; empresaLotadoId: string; setorLotacaoId: string;
  cargo: string; salarioContratual: number; autorId: string; criadaEm: string;
};
export type EventoCadastro = {
  id: string; acao: string; entidadeId: string; autorId: string; criadaEm: string;
};
export type CadastroFolha = {
  revisao: number;
  empresas: EmpresaCadastro[];
  setores: SetorCadastro[];
  pessoas: PessoaCadastro[];
  vinculos: Funcionario[];
  movimentacoes: MovimentacaoCadastro[];
  auditoria: EventoCadastro[];
};
export type NovoVinculo = Omit<Funcionario, 'id' | 'ativo'>;

export function cadastroVazio(): CadastroFolha {
  return { revisao: 0, empresas: [], setores: [], pessoas: [], vinculos: [],
    movimentacoes: [], auditoria: [] };
}
export function validarCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (tamanho: number) => {
    const soma = [...cpf.slice(0, tamanho)].reduce((total, num, indice) =>
      total + Number(num) * (tamanho + 1 - indice), 0);
    const resto = 11 - (soma % 11);
    return resto >= 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}
const conferir = (cadastro: CadastroFolha, ator: AtorFolha, revisao: number): void => {
  if (ator.perfil !== 'ADMIN' && ator.perfil !== 'DP')
    throw new Error('Somente ADMIN/DP pode gerenciar cadastros');
  if (cadastro.revisao !== revisao) throw new Error('Conflito: cadastro editado por outra sessão');
};
const auditar = (ator: AtorFolha, acao: string, entidadeId: string): EventoCadastro => ({
  id: crypto.randomUUID(), autorId: ator.id, acao, entidadeId, criadaEm: new Date().toISOString(),
});
const proximo = (cadastro: CadastroFolha, evento: EventoCadastro): Pick<CadastroFolha, 'revisao' | 'auditoria'> => ({
  revisao: cadastro.revisao + 1, auditoria: [...cadastro.auditoria, evento],
});
const ordem = (c: Competencia) => c.ano * 12 + c.mes;
const mesAdmissao = (admissao: string): number =>
  Number(admissao.slice(0, 4)) * 12 + Number(admissao.slice(5, 7));

function texto(valor: string, nome: string): string {
  const t = valor.trim();
  if (!t) throw new Error(nome + ' é obrigatório');
  return t;
}
function empresaValida(cadastro: CadastroFolha, id: string): void {
  if (!cadastro.empresas.some(e => e.id === id && e.ativa))
    throw new Error('Empresa inexistente ou inativa');
}
function setorValido(cadastro: CadastroFolha, id: string): void {
  if (!cadastro.setores.some(s => s.id === id && s.ativo))
    throw new Error('Setor inexistente ou inativo');
}
function salarioValido(valor: number): void {
  if (!Number.isFinite(valor) || valor < 0)
    throw new Error('Salário contratual deve ser numérico e não negativo');
}
/** Identidade da pessoa (CPF) é reutilizada em recontratação; vínculo ID é novo. */
export function cadastrarEmpresa(
  cadastro: CadastroFolha, nome: string, ator: AtorFolha, versaoEsperada: number,
): CadastroFolha {
  conferir(cadastro, ator, versaoEsperada);
  const valor = texto(nome, 'Nome da empresa');
  if (cadastro.empresas.some(e => e.nome.toLocaleLowerCase('pt-BR') === valor.toLocaleLowerCase('pt-BR')))
    throw new Error('Empresa já cadastrada');
  const empresa = { id: crypto.randomUUID(), nome: valor, ativa: true };
  return { ...cadastro, empresas: [...cadastro.empresas, empresa],
    ...proximo(cadastro, auditar(ator, 'EMPRESA_CRIADA', empresa.id)) };
}
export function cadastrarSetor(
  cadastro: CadastroFolha, nome: string, ator: AtorFolha, versaoEsperada: number,
): CadastroFolha {
  conferir(cadastro, ator, versaoEsperada);
  const valor = texto(nome, 'Nome do setor');
  if (cadastro.setores.some(s => s.nome.toLocaleLowerCase('pt-BR') === valor.toLocaleLowerCase('pt-BR')))
    throw new Error('Setor já cadastrado');
  const setor = { id: crypto.randomUUID(), nome: valor, ativo: true };
  return { ...cadastro, setores: [...cadastro.setores, setor],
    ...proximo(cadastro, auditar(ator, 'SETOR_CRIADO', setor.id)) };
}
export function contratar(
  cadastro: CadastroFolha, entrada: NovoVinculo, ator: AtorFolha, versaoEsperada: number,
): CadastroFolha {
  conferir(cadastro, ator, versaoEsperada);
  if (!validarCpf(entrada.cpf)) throw new Error('CPF inválido');
  empresaValida(cadastro, entrada.empresaContratanteId);
  empresaValida(cadastro, entrada.empresaLotadoId);
  setorValido(cadastro, entrada.setorLotacaoId);
  texto(entrada.nome, 'Nome');
  texto(entrada.cargo, 'Cargo');
  salarioValido(entrada.salarioContratual);
  if (!/^\d{4}-\d\d-\d\d$/.test(entrada.admissao) ||
    Number.isNaN(Date.parse(entrada.admissao)) ||
    new Date(entrada.admissao).toISOString().slice(0, 10) !== entrada.admissao)
    throw new Error('Data de admissão inválida');
  if (cadastro.vinculos.some(v => v.cpf === entrada.cpf && v.ativo))
    throw new Error('Pessoa já possui vínculo ativo: encerre antes de recontratar');
  const pessoaAnterior = cadastro.pessoas.find(p => p.cpf === entrada.cpf);
  const pessoa = pessoaAnterior ?? { id: crypto.randomUUID(), cpf: entrada.cpf, nome: entrada.nome.trim() };
  const vinculo: Funcionario = { ...entrada, id: crypto.randomUUID(), ativo: true,
    nome: pessoa.nome, cargo: entrada.cargo.trim() };
  return { ...cadastro, pessoas: pessoaAnterior ? cadastro.pessoas : [...cadastro.pessoas, pessoa],
    vinculos: [...cadastro.vinculos, vinculo],
    ...proximo(cadastro, auditar(ator, pessoaAnterior ? 'RECONTRATADO' : 'CONTRATADO', vinculo.id)) };
}
export function desligar(
  cadastro: CadastroFolha, vinculoId: string, ator: AtorFolha, versaoEsperada: number,
): CadastroFolha {
  conferir(cadastro, ator, versaoEsperada);
  const atual = cadastro.vinculos.find(v => v.id === vinculoId);
  if (!atual) throw new Error('Vínculo empregatício inexistente');
  if (!atual.ativo) return cadastro;
  return { ...cadastro, vinculos: cadastro.vinculos.map(v => v.id === vinculoId ? { ...v, ativo: false } : v),
    ...proximo(cadastro, auditar(ator, 'DESLIGADO', vinculoId)) };
}
/**
 * Alterações com vigência mensal ficam em eventos; snapshots anteriores não
 * são mutados. A chamada que abre competência usa fotografarFuncionarios().
 */
export function movimentar(
  cadastro: CadastroFolha,
  dados: Omit<MovimentacaoCadastro, 'id' | 'autorId' | 'criadaEm'>,
  ator: AtorFolha, versaoEsperada: number,
): CadastroFolha {
  conferir(cadastro, ator, versaoEsperada);
  const vinculo = cadastro.vinculos.find(v => v.id === dados.vinculoId && v.ativo);
  if (!vinculo) throw new Error('Movimentação exige vínculo ativo');
  empresaValida(cadastro, dados.empresaContratanteId);
  empresaValida(cadastro, dados.empresaLotadoId);
  setorValido(cadastro, dados.setorLotacaoId);
  salarioValido(dados.salarioContratual);
  texto(dados.cargo, 'Cargo');
  if (ordem(dados.aPartir) < mesAdmissao(vinculo.admissao))
    throw new Error('Vigência anterior à admissão');
  const nova = { ...dados, id: crypto.randomUUID(),
    autorId: ator.id, criadaEm: new Date().toISOString() };
  return { ...cadastro, movimentacoes: [...cadastro.movimentacoes, nova],
    ...proximo(cadastro, auditar(ator, 'MOVIMENTACAO', nova.id)) };
}
export function fotografarFuncionarios(
  cadastro: CadastroFolha, competencia: Competencia,
): Funcionario[] {
  const mes = ordem(competencia);
  return cadastro.vinculos.filter(v => v.ativo && mesAdmissao(v.admissao) <= mes).map(v => {
    const evento = [...cadastro.movimentacoes].reverse()
      .filter(m => m.vinculoId === v.id && ordem(m.aPartir) <= mes)
      .sort((a, b) => ordem(b.aPartir) - ordem(a.aPartir))[0];
    return evento ? { ...v, empresaContratanteId: evento.empresaContratanteId,
      empresaLotadoId: evento.empresaLotadoId, setorLotacaoId: evento.setorLotacaoId,
      cargo: evento.cargo, salarioContratual: evento.salarioContratual } : { ...v };
  });
}
/** Os atuais ativos determinam quem aparece em novo download de competência antiga. */
export function idsVinculosAtivos(cadastro: CadastroFolha): ReadonlySet<string> {
  return new Set(cadastro.vinculos.filter(v => v.ativo).map(v => v.id));
}
export function podeGerenciarCadastroPorPerfil(perfil: Perfil): boolean {
  return perfil === 'ADMIN' || perfil === 'DP';
}
