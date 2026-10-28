'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent,
  type KeyboardEvent } from 'react';
import { ArrowPathIcon, ArrowUpTrayIcon, PencilSquareIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import { formatarData } from '../datas';
import { atualizarMascaraComCursor, mascaraFinal, numeroDaMascara,
  prepararMascaraParaEdicao } from '../mascaras';

type Empresa = { id: string; nome: string; ativa: boolean };
type Setor = { id: string; nome: string; ativo: boolean };
type GrupoVinculavel = { id: string; nome: string; origem: 'BENEFICIO' | 'COMISSAO' };
type Funcionario = {
  id: string; nome: string; cpf: string; cargo: string;
  empresaContratanteId: string; empresaLotadoId: string; setorLotacaoId: string;
  admissao: string; salarioContratual: number; ativo: boolean;
  competenciaPendente?: boolean;
};
type Cadastro = {
  empresas: Empresa[]; setores: Setor[]; funcionarios: Funcionario[];
};
type NovoFuncionario = Omit<Funcionario, 'id' | 'ativo'>;
type LinhaAdmissaoImportada = { linha: number; cpf: string; nome: string;
  funcionario?: NovoFuncionario; erro?: string };
type LinhaDesligamentoImportada = { linha: number; cpf: string; nome: string;
  funcionario?: Funcionario; erro?: string };
type ResultadoImportacao = { linha: number; nome: string; cpf: string;
  acao: 'Admissão' | 'Desligamento'; sucesso: boolean; detalhe: string };
const vazio: NovoFuncionario = {
  nome: '', cpf: '', cargo: '', admissao: '',
  salarioContratual: 0, empresaContratanteId: '', empresaLotadoId: '', setorLotacaoId: '',
};
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function mesAtualFortaleza() {
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find(parte => parte.type === 'year')?.value;
  const mes = partes.find(parte => parte.type === 'month')?.value;
  return `${ano}-${mes}`;
}
const nomeDa = (dados: { id: string; nome: string }[], id: string) =>
  dados.find(item => item.id === id)?.nome ?? 'Não identificado';
const consumir = async <T,>(url: string, opcoes?: RequestInit): Promise<T> => {
  const resposta = await fetch(url, { credentials: 'include', cache: 'no-store', ...opcoes });
  if (!resposta.ok) {
    let mensagem = 'Não foi possível completar a operação';
    try {
      const erro = await resposta.json() as { erro?: string };
      if (erro.erro) mensagem = erro.erro;
    } catch { /* resposta indisponível */ }
    throw new Error(mensagem);
  }
  return resposta.json() as Promise<T>;
};
const enviar = <T,>(url: string, corpo: object) =>
  consumir<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo) });

const cabecalhosAdmissao = ['NOME', 'CPF', 'CARGO', 'EMPRESA CONTRATANTE',
  'EMPRESA DE LOTAÇÃO', 'SETOR DE LOTAÇÃO', 'DATA DE ADMISSÃO', 'SALÁRIO CONTRATUAL'];
const cabecalhosDesligamento = ['CPF'];
const normalizarCabecalho = (valor: unknown) => String(valor ?? '').trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');
const normalizarNome = (valor: unknown) => String(valor ?? '').trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
function valorDaLinha(linha: Record<string, unknown>, nomes: string[]) {
  const chave = Object.keys(linha).find(item => nomes.includes(normalizarCabecalho(item)));
  return chave ? linha[chave] : undefined;
}
function dataDaPlanilha(valor: unknown): string {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
  }
  if (typeof valor === 'number') {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (partes) return `${partes.y}-${String(partes.m).padStart(2, '0')}-${String(partes.d).padStart(2, '0')}`;
  }
  const texto = String(valor ?? '').trim();
  const brasileira = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (brasileira) return `${brasileira[3]}-${brasileira[2].padStart(2, '0')}-${brasileira[1].padStart(2, '0')}`;
  return texto;
}
function salarioDaPlanilha(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  const texto = String(valor ?? '').trim().replace(/R\$|\s/g, '');
  if (!texto) return Number.NaN;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  return Number(normalizado);
}
function baixarModeloFuncionarios() {
  const livro = XLSX.utils.book_new();
  const admissoes = XLSX.utils.aoa_to_sheet([cabecalhosAdmissao]);
  const desligamentos = XLSX.utils.aoa_to_sheet([cabecalhosDesligamento]);
  admissoes['!cols'] = cabecalhosAdmissao.map((nome, indice) => ({
    wch: indice === 0 ? 28 : indice === 1 ? 18 : 23,
  }));
  desligamentos['!cols'] = [{ wch: 18 }];
  XLSX.utils.book_append_sheet(livro, admissoes, 'ADMISSOES');
  XLSX.utils.book_append_sheet(livro, desligamentos, 'DESLIGAMENTOS');
  XLSX.writeFile(livro, 'modelo-admissoes-desligamentos.xlsx');
}

export default function Cadastros({ competenciaId, competenciaVigencia, aoSincronizar }: {
  competenciaId: string | null; competenciaVigencia: string | null;
  aoSincronizar: () => Promise<void>;
}) {
  const [dados, setDados] = useState<Cadastro>({ empresas: [], setores: [], funcionarios: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [novoEmpresa, setNovoEmpresa] = useState('');
  const [novoSetor, setNovoSetor] = useState('');
  const [novoFuncionario, setNovoFuncionario] = useState<NovoFuncionario>(vazio);
  const [salarioNovoTexto, setSalarioNovoTexto] = useState('');
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [passoNovoFuncionario, setPassoNovoFuncionario] = useState<1 | 2>(1);
  const [gruposVinculaveis, setGruposVinculaveis] = useState<GrupoVinculavel[]>([]);
  const [gruposSelecionadosNovo, setGruposSelecionadosNovo] = useState<string[]>([]);
  const [buscaGrupoNovo, setBuscaGrupoNovo] = useState('');
  const [carregandoGruposNovo, setCarregandoGruposNovo] = useState(false);
  const [falhaGruposNovo, setFalhaGruposNovo] = useState('');
  const [ocupadoNovo, setOcupadoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState('');
  const [modoImportacao, setModoImportacao] = useState(false);
  const [etapaImportacao, setEtapaImportacao] = useState<'arquivo' | 'beneficios' | 'resumo'>('arquivo');
  const [arquivoImportacao, setArquivoImportacao] = useState('');
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [admissoesImportadas, setAdmissoesImportadas] = useState<LinhaAdmissaoImportada[]>([]);
  const [desligamentosImportados, setDesligamentosImportados] = useState<LinhaDesligamentoImportada[]>([]);
  const [resumoImportacao, setResumoImportacao] = useState<ResultadoImportacao[]>([]);
  const arquivoImportacaoRef = useRef<HTMLInputElement>(null);
  const dialogoNovoRef = useRef<HTMLDivElement>(null);
  const botaoNovoRef = useRef<HTMLButtonElement>(null);
  const [filtro, setFiltro] = useState('');
  const [incluiInativos, setIncluiInativos] = useState(false);
  const [editandoMovimentacao, setEditandoMovimentacao] = useState<Funcionario | null>(null);
  const [mesMovimento, setMesMovimento] = useState(mesAtualFortaleza);
  const [movimento, setMovimento] = useState({
    empresaContratanteId: '', empresaLotadoId: '', setorLotacaoId: '',
    cargo: '', salarioContratual: 0,
  });
  const atualizar = useCallback(async () => {
    const nova = await consumir<Cadastro>('/api/cadastros/geral');
    setDados(nova);
  }, []);
  useEffect(() => {
    const trabalho = window.setTimeout(() => {
      void atualizar().catch(e => setErro(e instanceof Error ? e.message : 'Falha no cadastro'))
        .finally(() => setCarregando(false));
    }, 0);
    return () => window.clearTimeout(trabalho);
  }, [atualizar]);
  async function executar(operacao: () => Promise<unknown>, mensagem: string) {
    setErro(''); setAviso('');
    try {
      await operacao();
      try {
        await atualizar();
        await aoSincronizar();
      } catch {
        setErro('A alteração foi salva, mas a lista ou a consolidação não atualizou. Recarregue a página para conferir os dados.');
        return true;
      }
      setAviso(mensagem);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
      return false;
    }
  }
  async function cadastrarNome(evento: FormEvent, tipo: 'empresas' | 'setores') {
    evento.preventDefault();
    const nome = tipo === 'empresas' ? novoEmpresa : novoSetor;
    await executar(() => enviar('/api/cadastros/' + tipo, { nome }),
      tipo === 'empresas' ? 'Empresa cadastrada' : 'Setor cadastrado');
    if (tipo === 'empresas') setNovoEmpresa(''); else setNovoSetor('');
  }
  async function carregarGruposNovo() {
    setCarregandoGruposNovo(true);
    setFalhaGruposNovo('');
    try {
      const grupos = await consumir<GrupoVinculavel[]>('/api/cadastros/grupos-vinculaveis');
      setGruposVinculaveis(grupos);
    } catch (e) {
      setFalhaGruposNovo(e instanceof Error ? e.message : 'Não foi possível carregar benefícios e comissões.');
    } finally {
      setCarregandoGruposNovo(false);
    }
  }
  async function abrirNovoFuncionario() {
    setNovoFuncionario(vazio);
    setSalarioNovoTexto('');
    setGruposSelecionadosNovo([]);
    setBuscaGrupoNovo('');
    setPassoNovoFuncionario(1);
    setErroNovo('');
    setModoImportacao(false);
    setEtapaImportacao('arquivo');
    setArquivoImportacao('');
    setAdmissoesImportadas([]);
    setDesligamentosImportados([]);
    setResumoImportacao([]);
    setMostrarNovo(true);
    void carregarGruposNovo();
  }
  function fecharNovoFuncionario() {
    if (ocupadoNovo || processandoImportacao) return;
    setMostrarNovo(false);
    setNovoFuncionario(vazio);
    setSalarioNovoTexto('');
    setGruposSelecionadosNovo([]);
    setBuscaGrupoNovo('');
    setPassoNovoFuncionario(1);
    setErroNovo('');
    setModoImportacao(false);
    setEtapaImportacao('arquivo');
    setArquivoImportacao('');
    setAdmissoesImportadas([]);
    setDesligamentosImportados([]);
    setResumoImportacao([]);
    window.requestAnimationFrame(() => botaoNovoRef.current?.focus());
  }
  function lidarComTecladoNovo(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      fecharNovoFuncionario();
      return;
    }
    const dialogo = dialogoNovoRef.current;
    if (evento.key !== 'Tab' || !dialogo) return;
    const elementos = Array.from(dialogo.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    )).filter(elemento => elemento.getClientRects().length > 0);
    if (!elementos.length) return;
    const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault(); ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault(); primeiro.focus();
    }
  }
  async function cadastrarFuncionario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroNovo('');
    if (passoNovoFuncionario === 1) {
      setPassoNovoFuncionario(2);
      return;
    }
    if (falhaGruposNovo) return;
    const cpf = novoFuncionario.cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf)) {
      setErroNovo('CPF deve conter 11 dígitos, com os dígitos verificadores corretos.');
      setPassoNovoFuncionario(1);
      return;
    }
    const salarioContratual = numeroDaMascara(salarioNovoTexto);
    if (!Number.isFinite(salarioContratual) || salarioContratual < 0) {
      setErroNovo('Informe um salário contratual válido.');
      setPassoNovoFuncionario(1);
      return;
    }
    setOcupadoNovo(true);
    try {
      const resultado = await enviar<{ id: string; gruposVinculados: number;
        competenciaSincronizada: { id: string; ano: number; mes: number } | null;
        competenciasSincronizadas: { id: string; ano: number; mes: number }[] }>(
        '/api/cadastros/funcionarios', {
          ...novoFuncionario, cpf, salarioContratual, gruposIds: gruposSelecionadosNovo,
          competenciaId,
        });
      setMostrarNovo(false);
      setNovoFuncionario(vazio);
      setSalarioNovoTexto('');
      setGruposSelecionadosNovo([]);
      const referenciaCompetencia = resultado.competenciasSincronizadas.length
        ? ` Sincronizado nas competências abertas: ${resultado.competenciasSincronizadas.map(c =>
          `${String(c.mes).padStart(2, '0')}/${c.ano}`).join(', ')}.`
        : ' Nenhuma competência aberta compatível foi sincronizada.';
      setAviso(`Vínculo empregatício criado com ${resultado.gruposVinculados} benefício(s) ou comissão(ões) vinculado(s).${referenciaCompetencia}`);
      try { await atualizar(); await aoSincronizar(); }
      catch { setErro('Funcionário salvo, mas a lista ou a consolidação não atualizou. Recarregue a página.'); }
      window.requestAnimationFrame(() => botaoNovoRef.current?.focus());
    } catch (e) {
      setErroNovo(e instanceof Error ? e.message : 'Não foi possível salvar o funcionário.');
    } finally {
      setOcupadoNovo(false);
    }
  }

  async function lerPlanilha(arquivo: File) {
    setErroNovo('');
    try {
      const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      const planilhaAdmissoes = livro.Sheets.ADMISSOES;
      const planilhaDesligamentos = livro.Sheets.DESLIGAMENTOS;
      if (!planilhaAdmissoes || !planilhaDesligamentos)
        throw new Error('O arquivo precisa conter as abas ADMISSOES e DESLIGAMENTOS. Baixe o modelo para conferir o formato.');
      const cabecalhoDaAdmissao = XLSX.utils.sheet_to_json<unknown[]>(planilhaAdmissoes,
        { header: 1, defval: '' })[0] ?? [];
      const cabecalhoDoDesligamento = XLSX.utils.sheet_to_json<unknown[]>(planilhaDesligamentos,
        { header: 1, defval: '' })[0] ?? [];
      const linhasAdmissoes = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilhaAdmissoes,
        { defval: '', raw: true });
      const linhasDesligamentos = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilhaDesligamentos,
        { defval: '', raw: true });
      const colunasAdmissao = cabecalhoDaAdmissao.map(normalizarCabecalho);
      const colunasDesligamento = cabecalhoDoDesligamento.map(normalizarCabecalho);
      const esperadasAdmissao = cabecalhosAdmissao.map(normalizarCabecalho);
      const esperadasDesligamento = cabecalhosDesligamento.map(normalizarCabecalho);
      if (esperadasAdmissao.some(c => !colunasAdmissao.includes(c)) ||
        esperadasDesligamento.some(c => !colunasDesligamento.includes(c)))
        throw new Error('Os cabeçalhos das abas não correspondem ao modelo. Baixe o modelo e mantenha os nomes das colunas.');

      const porNomeEmpresa = new Map(dados.empresas.filter(e => e.ativa)
        .map(e => [normalizarNome(e.nome), e.id]));
      const porNomeSetor = new Map(dados.setores.filter(s => s.ativo)
        .map(s => [normalizarNome(s.nome), s.id]));
      const cpfVistos = new Set<string>();
      const novasAdmissoes = linhasAdmissoes.map((linha, indice): LinhaAdmissaoImportada => {
        const cpfOriginal = String(valorDaLinha(linha, ['CPF']) ?? '').replace(/\D/g, '');
        const cpf = cpfOriginal ? cpfOriginal.padStart(11, '0') : '';
        const nome = String(valorDaLinha(linha, ['NOME']) ?? '').trim();
        const cargo = String(valorDaLinha(linha, ['CARGO']) ?? '').trim();
        const empresaContratante = String(valorDaLinha(linha, ['EMPRESA CONTRATANTE']) ?? '').trim();
        const empresaLotado = String(valorDaLinha(linha, ['EMPRESA DE LOTACAO', 'EMPRESA LOTADO', 'EMPRESA LOTADA']) ?? '').trim();
        const setor = String(valorDaLinha(linha, ['SETOR DE LOTACAO', 'SETOR']) ?? '').trim();
        const admissao = dataDaPlanilha(valorDaLinha(linha, ['DATA DE ADMISSAO', 'ADMISSAO']));
        const salarioContratual = salarioDaPlanilha(valorDaLinha(linha,
          ['SALARIO CONTRATUAL', 'SALARIO']));
        if (![cpf, nome, cargo, empresaContratante, empresaLotado, setor, admissao].some(Boolean) &&
          !Number.isFinite(salarioContratual)) return { linha: indice + 2, cpf, nome, erro: 'Linha vazia.' };
        const erros: string[] = [];
        if (!/^\d{11}$/.test(cpf)) erros.push('CPF deve ter 11 dígitos.');
        if (cpfVistos.has(cpf)) erros.push('CPF repetido na aba de admissões.');
        cpfVistos.add(cpf);
        if (!nome) erros.push('Nome obrigatório.');
        if (!cargo) erros.push('Cargo obrigatório.');
        if (!porNomeEmpresa.has(normalizarNome(empresaContratante))) erros.push('Empresa contratante não encontrada ou inativa.');
        if (!porNomeEmpresa.has(normalizarNome(empresaLotado))) erros.push('Empresa de lotação não encontrada ou inativa.');
        if (!porNomeSetor.has(normalizarNome(setor))) erros.push('Setor não encontrado ou inativo.');
        const dataAdmissao = new Date(`${admissao}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(admissao) || Number.isNaN(dataAdmissao.getTime()) ||
          dataAdmissao.toISOString().slice(0, 10) !== admissao)
          erros.push('Data de admissão inválida.');
        if (!Number.isFinite(salarioContratual) || salarioContratual < 0) erros.push('Salário contratual inválido.');
        return { linha: indice + 2, cpf, nome, erro: erros.join(' ') || undefined,
          funcionario: erros.length ? undefined : {
            cpf, nome, cargo, admissao, salarioContratual,
            empresaContratanteId: porNomeEmpresa.get(normalizarNome(empresaContratante))!,
            empresaLotadoId: porNomeEmpresa.get(normalizarNome(empresaLotado))!,
            setorLotacaoId: porNomeSetor.get(normalizarNome(setor))!,
          } };
      }).filter(linha => linha.erro !== 'Linha vazia.');
      const cpfDesligamentosVistos = new Set<string>();
      const novosDesligamentos = linhasDesligamentos.map((linha, indice): LinhaDesligamentoImportada => {
        const cpfOriginal = String(valorDaLinha(linha, ['CPF']) ?? '').replace(/\D/g, '');
        const cpf = cpfOriginal ? cpfOriginal.padStart(11, '0') : '';
        if (!cpf || cpf === '00000000000') return { linha: indice + 2, cpf, nome: '', erro: 'CPF obrigatório.' };
        if (!/^\d{11}$/.test(cpf)) return { linha: indice + 2, cpf, nome: '', erro: 'CPF deve ter 11 dígitos.' };
        if (cpfDesligamentosVistos.has(cpf)) return { linha: indice + 2, cpf, nome: '', erro: 'CPF repetido na aba de desligamentos.' };
        cpfDesligamentosVistos.add(cpf);
        const funcionario = dados.funcionarios.find(f => f.cpf.replace(/\D/g, '') === cpf && f.ativo);
        return funcionario ? { linha: indice + 2, cpf, nome: funcionario.nome, funcionario }
          : { linha: indice + 2, cpf, nome: '', erro: 'Nenhum vínculo ativo encontrado para este CPF.' };
      }).filter(linha => linha.erro !== 'CPF obrigatório.');
      if (!novasAdmissoes.length && !novosDesligamentos.length)
        throw new Error('As duas abas estão vazias. Preencha pelo menos uma linha para continuar.');
      setAdmissoesImportadas(novasAdmissoes);
      setDesligamentosImportados(novosDesligamentos);
      setArquivoImportacao(arquivo.name);
      setModoImportacao(true);
      setEtapaImportacao('beneficios');
    } catch (e) {
      setErroNovo(e instanceof Error ? e.message : 'Não foi possível ler este arquivo.');
    }
  }

  async function executarImportacao() {
    setErroNovo('');
    setProcessandoImportacao(true);
    const resumo: ResultadoImportacao[] = [];
    for (const linha of admissoesImportadas) {
      const acao: ResultadoImportacao['acao'] = 'Admissão';
      if (!linha.funcionario) {
        resumo.push({ linha: linha.linha, nome: linha.nome || 'Sem nome', cpf: linha.cpf,
          acao, sucesso: false, detalhe: linha.erro ?? 'Dados inválidos.' });
        continue;
      }
      try {
        const resultado = await enviar<{ gruposVinculados: number }>('/api/cadastros/funcionarios', {
          ...linha.funcionario, gruposIds: gruposSelecionadosNovo, competenciaId,
        });
        resumo.push({ linha: linha.linha, nome: linha.funcionario.nome, cpf: linha.cpf,
          acao, sucesso: true, detalhe: `${resultado.gruposVinculados} benefício(s)/comissão(ões) vinculado(s).` });
      } catch (e) {
        resumo.push({ linha: linha.linha, nome: linha.nome || 'Sem nome', cpf: linha.cpf,
          acao, sucesso: false, detalhe: e instanceof Error ? e.message : 'Não foi possível admitir.' });
      }
    }
    for (const linha of desligamentosImportados) {
      const acao: ResultadoImportacao['acao'] = 'Desligamento';
      if (!linha.funcionario) {
        resumo.push({ linha: linha.linha, nome: linha.nome || 'Sem nome', cpf: linha.cpf,
          acao, sucesso: false, detalhe: linha.erro ?? 'Vínculo não localizado.' });
        continue;
      }
      try {
        await enviar(`/api/cadastros/funcionarios/${encodeURIComponent(linha.funcionario.id)}/desligar`, {});
        resumo.push({ linha: linha.linha, nome: linha.funcionario.nome, cpf: linha.cpf,
          acao, sucesso: true, detalhe: 'Vínculo desligado; histórico preservado.' });
      } catch (e) {
        resumo.push({ linha: linha.linha, nome: linha.funcionario.nome, cpf: linha.cpf,
          acao, sucesso: false, detalhe: e instanceof Error ? e.message : 'Não foi possível desligar.' });
      }
    }
    setResumoImportacao(resumo);
    setEtapaImportacao('resumo');
    try {
      await atualizar();
      await aoSincronizar();
    } catch {
      setErroNovo('A importação terminou, mas a lista ou a consolidação não atualizou. Recarregue a página para conferir os dados.');
    } finally {
      setProcessandoImportacao(false);
    }
  }
  const filtrar = dados.funcionarios.filter(f => (incluiInativos || f.ativo) &&
    (f.nome + ' ' + f.cpf + ' ' + f.cargo).toLowerCase().includes(filtro.toLowerCase()));
  const gruposFiltradosNovo = gruposVinculaveis.filter(grupo =>
    grupo.nome.toLocaleLowerCase('pt-BR').includes(buscaGrupoNovo.trim().toLocaleLowerCase('pt-BR')));
  async function desligar(f: Funcionario) {
    if (!window.confirm('Desligar o vínculo de ' + f.nome +
      '? O histórico será preservado e o vínculo deixará de aparecer nas novas exportações.')) return;
    await executar(() => enviar('/api/cadastros/funcionarios/' + encodeURIComponent(f.id) +
      '/desligar', {}), 'Vínculo inativado. Histórico preservado.');
  }
  async function sincronizar(f: Funcionario) {
    await executar(() => enviar('/api/cadastros/funcionarios/' + encodeURIComponent(f.id) +
      '/sincronizar', { competenciaId }), 'Cadastro sincronizado com as competências abertas.');
  }
  function iniciarMovimentacao(f: Funcionario) {
    setEditandoMovimentacao(f);
    setMesMovimento(competenciaVigencia ?? mesAtualFortaleza());
    setMovimento({
      empresaContratanteId: f.empresaContratanteId,
      empresaLotadoId: f.empresaLotadoId,
      setorLotacaoId: f.setorLotacaoId, cargo: f.cargo,
      salarioContratual: f.salarioContratual,
    });
  }
  async function salvarMovimentacao(evento: FormEvent) {
    evento.preventDefault();
    if (!editandoMovimentacao) return;
    const [ano, mes] = mesMovimento.split('-').map(Number);
    const resultado: { valor?: { competenciasAtualizadas: {
      id: string; ano: number; mes: number }[] } } = {};
    const salva = await executar(async () => {
      resultado.valor = await enviar<{ competenciasAtualizadas: {
        id: string; ano: number; mes: number }[] }>(
        '/api/cadastros/movimentacoes',
        { vinculoId: editandoMovimentacao.id, ano, mes, ...movimento });
    }, 'Movimentação registrada com vigência ' + mesMovimento);
    if (salva) {
      setEditandoMovimentacao(null);
      const atualizadas = resultado.valor?.competenciasAtualizadas ?? [];
      setAviso(atualizadas.length
        ? `Movimentação aplicada às competências abertas: ${atualizadas.map(c =>
          `${String(c.mes).padStart(2, '0')}/${c.ano}`).join(', ')}.`
        : 'Movimentação salva, mas nenhuma competência aberta foi atualizada. Confira a vigência e se o funcionário está incluído na competência.');
    }
  }
  return <section className="area-cadastros modulo-cadastros">
    <div className="titulo-secao"><div><h2>Empresas, setores e funcionários</h2>
      <p>Os cadastros alimentam as competências e a exportação por empresa contratante.</p></div>
      <button ref={botaoNovoRef} type="button" className="acao-principal"
        onClick={() => void abrirNovoFuncionario()}>
        + Novo funcionário
      </button>
    </div>
    {erro && <p role="alert" className="erro">{erro}</p>}
    {aviso && <p role="status" className="feedback">{aviso}</p>}
    <div className="grade-cadastros">
      <form className="painel-app formulario-resumo" onSubmit={e => void cadastrarNome(e, 'empresas')}>
        <h3>Empresas <span>{dados.empresas.length}</span></h3>
        <label>Empresa contratante ou unidade de lotação
          <input required placeholder="Nome da empresa" maxLength={160}
            value={novoEmpresa} onChange={e => setNovoEmpresa(e.target.value)} /></label>
        <button className="botao-secundario" type="submit">Adicionar empresa</button>
        <div className="pequena-lista">{dados.empresas.map(e =>
          <span key={e.id}>{e.nome}{e.ativa ? '' : ' (inativa)'}</span>)}</div>
      </form>
      <form className="painel-app formulario-resumo" onSubmit={e => void cadastrarNome(e, 'setores')}>
        <h3>Setores <span>{dados.setores.length}</span></h3>
        <label>Nome do setor
          <input required placeholder="Nome do setor" maxLength={160}
            value={novoSetor} onChange={e => setNovoSetor(e.target.value)} /></label>
        <button className="botao-secundario" type="submit">Adicionar setor</button>
        <div className="pequena-lista">{dados.setores.map(s =>
          <span key={s.id}>{s.nome}{s.ativo ? '' : ' (inativo)'}</span>)}</div>
      </form>
    </div>
    {mostrarNovo && <div className="config-sobreposicao">
      <div ref={dialogoNovoRef} className="config-modal" role="dialog" aria-modal="true"
        aria-labelledby="novo-funcionario-titulo" aria-describedby="novo-funcionario-ajuda"
        onKeyDown={lidarComTecladoNovo}>
        <div className="config-modal-topo">
          <div>
            <p className="config-modal-etapa">{modoImportacao
              ? etapaImportacao === 'beneficios' ? 'Etapa 2 de 3' : 'Resumo da importação'
              : `Etapa ${passoNovoFuncionario} de 2`}</p>
            <h3 id="novo-funcionario-titulo">{modoImportacao ? 'Importar funcionários' : 'Novo vínculo empregatício'}</h3>
            <p id="novo-funcionario-ajuda">{modoImportacao
              ? etapaImportacao === 'beneficios' ? arquivoImportacao : 'Confira os resultados da planilha'
              : passoNovoFuncionario === 1 ? 'Dados do funcionário' : 'Benefícios e comissões vinculados'}</p>
          </div>
          <button type="button" className="config-modal-fechar" onClick={fecharNovoFuncionario}
            aria-label="Fechar cadastro" disabled={ocupadoNovo || processandoImportacao}>×</button>
        </div>
        {modoImportacao ? <ol className="config-progresso config-progresso-tres-etapas" aria-label="Etapas da importação">
          {(['Planilha', 'Benefícios e comissões', 'Resumo'] as const).map((nome, indice) => {
            const atual = etapaImportacao === 'beneficios' ? 1 : etapaImportacao === 'resumo' ? 2 : 0;
            return <li key={nome} className={atual === indice ? 'atual' : atual > indice ? 'feito' : ''}
              aria-current={atual === indice ? 'step' : undefined}>
              <span>{indice + 1}</span><small>{nome}</small>
            </li>;
          })}
        </ol> : <ol className="config-progresso config-progresso-duas-etapas" aria-label="Etapas do cadastro">
          <li className={passoNovoFuncionario === 1 ? 'atual' : 'feito'}
            aria-current={passoNovoFuncionario === 1 ? 'step' : undefined}>
            <span>1</span><small>Dados do funcionário</small>
          </li>
          <li className={passoNovoFuncionario === 2 ? 'atual' : ''}
            aria-current={passoNovoFuncionario === 2 ? 'step' : undefined}>
            <span>2</span><small>Benefícios e comissões</small>
          </li>
        </ol>}
        <form onSubmit={e => modoImportacao
          ? (e.preventDefault(), void executarImportacao()) : void cadastrarFuncionario(e)}>
          <div className="config-modal-corpo">
            {modoImportacao && etapaImportacao === 'resumo' ? <div className="cadastro-importacao-resumo">
              <p role="status">Importação concluída: {resumoImportacao.filter(item => item.sucesso).length} ação(ões) realizada(s) e {resumoImportacao.filter(item => !item.sucesso).length} linha(s) com pendência.</p>
              <div className="cadastro-importacao-lista" aria-label="Resultado por funcionário">
                {resumoImportacao.map((item, indice) => <article key={`${item.acao}-${item.linha}-${indice}`}
                  className={item.sucesso ? 'sucesso' : 'falha'}>
                  <div><strong>{item.nome}</strong><small>{item.acao} · linha {item.linha} · CPF {item.cpf || 'não informado'}</small></div>
                  <span>{item.sucesso ? 'Concluído' : item.detalhe}</span>
                </article>)}
              </div>
            </div> : modoImportacao ? <div className="config-etapa-funcionarios">
              <h4>Benefícios e comissões para as admissões</h4>
              <p>Os itens selecionados serão vinculados a todos os funcionários admitidos nesta planilha. Desligamentos não recebem novos vínculos.</p>
              <label htmlFor="novo-funcionario-busca-grupos">Buscar benefício ou comissão
                <input id="novo-funcionario-busca-grupos" autoFocus
                  placeholder="Digite o nome do benefício ou comissão"
                  value={buscaGrupoNovo} onChange={e => setBuscaGrupoNovo(e.target.value)} />
              </label>
              <div className="config-selecao-todos">
                <span>{admissoesImportadas.filter(linha => linha.funcionario).length} admissão(ões) válida(s) · {desligamentosImportados.filter(linha => linha.funcionario).length} desligamento(s) válido(s)</span>
                <button type="button" className="botao-secundario"
                  disabled={!gruposFiltradosNovo.length || carregandoGruposNovo}
                  onClick={() => setGruposSelecionadosNovo(atual => [...new Set([
                    ...atual, ...gruposFiltradosNovo.map(grupo => grupo.id),
                  ])])}>Selecionar exibidos</button>
                <button type="button" className="botao-secundario"
                  disabled={!gruposSelecionadosNovo.length}
                  onClick={() => setGruposSelecionadosNovo([])}>Limpar seleção</button>
              </div>
              {carregandoGruposNovo && <p role="status">Carregando benefícios e comissões...</p>}
              {falhaGruposNovo && <div className="config-aviso-vinculos" role="alert"><p>{falhaGruposNovo}</p>
                <button type="button" className="botao-secundario" onClick={() => void carregarGruposNovo()}>Tentar novamente</button></div>}
              {!carregandoGruposNovo && !falhaGruposNovo && <div className="config-checklist">
                {gruposFiltradosNovo.map(grupo => <label key={grupo.id} className="config-item-funcionario">
                  <input type="checkbox" checked={gruposSelecionadosNovo.includes(grupo.id)}
                    onChange={e => setGruposSelecionadosNovo(atual => e.target.checked
                      ? [...atual, grupo.id] : atual.filter(id => id !== grupo.id))} />
                  <span>{grupo.nome}<small>{grupo.origem === 'BENEFICIO' ? 'Benefício' : 'Comissão'}</small></span>
                </label>)}
                {gruposFiltradosNovo.length === 0 && <p className="config-sem-vinculos">Nenhum benefício ou comissão ativo para vincular.</p>}
              </div>}
            </div> : passoNovoFuncionario === 1 ? <>
              <p>Preencha os dados básicos. Recontratações reutilizam a pessoa identificada pelo CPF.</p>
              <div className={'cadastro-importacao-upload' + (arrastandoArquivo ? ' arrastando' : '')}
                role="button" tabIndex={0} aria-label="Solte a planilha aqui ou clique para escolher um arquivo"
                onClick={() => arquivoImportacaoRef.current?.click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); arquivoImportacaoRef.current?.click();
                  }
                }}
                onDragOver={e => { e.preventDefault(); setArrastandoArquivo(true); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastandoArquivo(false); }}
                onDrop={e => { e.preventDefault(); setArrastandoArquivo(false);
                  const arquivo = e.dataTransfer.files[0]; if (arquivo) void lerPlanilha(arquivo); }}>
                <ArrowUpTrayIcon aria-hidden="true" />
                <strong>{arrastandoArquivo ? 'Solte a planilha para carregar' : 'Solte sua planilha aqui'}</strong>
                <span>ou clique para escolher um arquivo</span>
                <small>Planilha Excel (.xlsx ou .xls)</small>
              </div>
              <div className="cadastro-importacao-legenda">
                <p className="cadastro-importacao-dica">Na aba ADMISSOES, informe os dados obrigatórios e os nomes de empresas e setores já cadastrados. Na aba DESLIGAMENTOS, informe o CPF de cada vínculo ativo.</p>
                <button type="button" className="botao-secundario" onClick={baixarModeloFuncionarios}>Baixar modelo Excel</button>
                <input ref={arquivoImportacaoRef} type="file" hidden
                  accept=".xlsx,.xls" aria-label="Selecionar planilha de admissões e desligamentos"
                  onChange={e => { const arquivo = e.currentTarget.files?.[0]; if (arquivo) void lerPlanilha(arquivo); e.currentTarget.value = ''; }} />
              </div>
              <div className="grade-formulario">
                <label>Nome completo
                  <input required autoFocus value={novoFuncionario.nome}
                    onChange={e => setNovoFuncionario(s => ({ ...s, nome: e.target.value }))} />
                </label>
                <label>CPF
                  <input required type="text" inputMode="numeric"
                    pattern="[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}"
                    title="Digite o CPF no formato 000.000.000-00" placeholder="000.000.000-00"
                    maxLength={14} value={novoFuncionario.cpf}
                    onChange={e => {
                      const digitos = e.target.value.replace(/\D/g, '').slice(0, 11);
                      const cpfFormatado = digitos
                        .replace(/^(\d{3})(\d)/, '$1.$2')
                        .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                      setNovoFuncionario(s => ({ ...s, cpf: cpfFormatado }));
                    }} />
                </label>
                <label>Cargo
                  <input required value={novoFuncionario.cargo}
                    onChange={e => setNovoFuncionario(s => ({ ...s, cargo: e.target.value }))} />
                </label>
                <label>Data de admissão
                  <input required type="date" value={novoFuncionario.admissao}
                    onChange={e => setNovoFuncionario(s => ({ ...s, admissao: e.target.value }))} />
                </label>
                <label>Salário contratual (R$)
                  <input required type="text" inputMode="decimal" placeholder="R$ 0,00"
                    value={salarioNovoTexto}
                    onFocus={e => setSalarioNovoTexto(prepararMascaraParaEdicao(e.currentTarget))}
                    onChange={e => setSalarioNovoTexto(atualizarMascaraComCursor(e.currentTarget, 'moeda'))}
                    onBlur={() => setSalarioNovoTexto(atual => mascaraFinal(atual, 'moeda'))} />
                </label>
                {([
                  ['empresaContratanteId', 'Empresa contratante', dados.empresas],
                  ['empresaLotadoId', 'Empresa lotado', dados.empresas],
                  ['setorLotacaoId', 'Setor de lotação', dados.setores],
                ] as const).map(([chave, rotulo, lista]) => <label key={chave}>{rotulo}
                  <select required value={novoFuncionario[chave]}
                    onChange={e => setNovoFuncionario(s => ({ ...s, [chave]: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {lista.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
                  </select>
                </label>)}
              </div>
            </> : <div className="config-etapa-funcionarios">
              <h4>O que será vinculado a este funcionário?</h4>
              <p>Escolha os benefícios e comissões aplicáveis. Você poderá ajustar os vínculos depois.</p>
              <label htmlFor="novo-funcionario-busca-grupos">Buscar benefício ou comissão
                <input id="novo-funcionario-busca-grupos" autoFocus
                  placeholder="Digite o nome do benefício ou comissão"
                  value={buscaGrupoNovo} onChange={e => setBuscaGrupoNovo(e.target.value)} />
              </label>
              <div className="config-selecao-todos">
                <span>{gruposSelecionadosNovo.length} selecionado(s)</span>
                <button type="button" className="botao-secundario"
                  disabled={!gruposFiltradosNovo.length || carregandoGruposNovo}
                  onClick={() => setGruposSelecionadosNovo(atual => [...new Set([
                    ...atual, ...gruposFiltradosNovo.map(grupo => grupo.id),
                  ])])}>Selecionar exibidos</button>
                <button type="button" className="botao-secundario"
                  disabled={!gruposSelecionadosNovo.length}
                  onClick={() => setGruposSelecionadosNovo([])}>Limpar seleção</button>
              </div>
              {carregandoGruposNovo && <p role="status">Carregando benefícios e comissões...</p>}
              {falhaGruposNovo && <div className="config-aviso-vinculos" role="alert">
                <p>{falhaGruposNovo}</p>
                <button type="button" className="botao-secundario"
                  onClick={() => void carregarGruposNovo()}>Tentar novamente</button>
              </div>}
              {!carregandoGruposNovo && !falhaGruposNovo && gruposVinculaveis.length === 0 &&
                <p className="config-sem-vinculos">Nenhum benefício ou comissão ativo para vincular.</p>}
              {!carregandoGruposNovo && !falhaGruposNovo && gruposVinculaveis.length > 0 &&
                <div className="config-checklist">
                  {gruposFiltradosNovo.map(grupo => <label key={grupo.id}
                    className="config-item-funcionario">
                    <input type="checkbox" checked={gruposSelecionadosNovo.includes(grupo.id)}
                      onChange={e => setGruposSelecionadosNovo(atual => e.target.checked
                        ? [...atual, grupo.id] : atual.filter(id => id !== grupo.id))} />
                    <span>{grupo.nome}<small>{grupo.origem === 'BENEFICIO' ? 'Benefício' : 'Comissão'}</small></span>
                  </label>)}
                  {gruposFiltradosNovo.length === 0 &&
                    <p className="config-sem-vinculos">Nenhum resultado para esta busca.</p>}
                </div>}
            </div>}
            {erroNovo && <p className="erro" role="alert">{erroNovo}</p>}
          </div>
          <div className="config-modal-acoes">
            {modoImportacao ? <>
              <button type="button" className="botao-secundario" disabled={processandoImportacao}
                onClick={() => etapaImportacao === 'resumo' ? fecharNovoFuncionario() :
                  (setModoImportacao(false), setEtapaImportacao('arquivo'), setErroNovo(''))}>
                {etapaImportacao === 'resumo' ? 'Fechar' : 'Voltar ao cadastro manual'}
              </button>
              {etapaImportacao === 'beneficios' && <button type="submit" className="acao-principal"
                disabled={processandoImportacao || carregandoGruposNovo || Boolean(falhaGruposNovo)}>
                {processandoImportacao ? 'Processando lista...' : 'Processar admissões e desligamentos'}
              </button>}
            </> : <>
              <button type="button" className="botao-secundario" disabled={ocupadoNovo}
                onClick={() => passoNovoFuncionario === 1
                  ? fecharNovoFuncionario() : (setPassoNovoFuncionario(1), setErroNovo(''))}>
                {passoNovoFuncionario === 1 ? 'Cancelar' : 'Voltar'}
              </button>
              <button type="submit" className="acao-principal"
                disabled={ocupadoNovo || (passoNovoFuncionario === 2 &&
                  (carregandoGruposNovo || Boolean(falhaGruposNovo)))}>
                {ocupadoNovo ? 'Salvando...' : passoNovoFuncionario === 1 ? 'Próximo' : 'Finalizar'}
              </button>
            </>}
          </div>
        </form>
      </div>
    </div>}
    {editandoMovimentacao && <form className="painel-app formulario-cadastro"
      onSubmit={e => void salvarMovimentacao(e)}>
      <div className="titulo-secao"><h3>Alteração de vínculo — {editandoMovimentacao.nome}</h3>
        <button type="button" className="botao-secundario" onClick={() => setEditandoMovimentacao(null)}>
          Cancelar
        </button></div>
      <div className="grade-formulario">
        <label>Vigência (mês e ano)<input type="month" required value={mesMovimento}
          onChange={e => setMesMovimento(e.target.value)} /></label>
        <label>Cargo<input required value={movimento.cargo}
          onChange={e => setMovimento(s => ({ ...s, cargo: e.target.value }))} /></label>
        <label>Salário<input required type="number" min="0" step="0.01"
          value={movimento.salarioContratual}
          onChange={e => setMovimento(s => ({ ...s, salarioContratual: Number(e.target.value) }))} /></label>
        {([
          ['empresaContratanteId', 'Empresa contratante', dados.empresas],
          ['empresaLotadoId', 'Empresa lotado', dados.empresas],
          ['setorLotacaoId', 'Setor', dados.setores],
        ] as const).map(([chave, rotulo, lista]) => <label key={chave}>{rotulo}
          <select value={movimento[chave]}
            onChange={e => setMovimento(s => ({ ...s, [chave]: e.target.value }))}>
            {lista.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select></label>)}
      </div>
      <button className="acao-principal">Registrar vigência</button>
    </form>}
    <section className="painel-app">
      <div className="titulo-secao">
        <div><h2>Funcionários</h2><p>{filtrar.length} vínculos exibidos</p></div>
        <div className="acoes-secao">
          <input className="filtro-cadastro" placeholder="Buscar funcionário ou CPF" value={filtro}
            onChange={e => setFiltro(e.target.value)} />
          <label className="toggle-inativos"><input type="checkbox" checked={incluiInativos}
            onChange={e => setIncluiInativos(e.target.checked)} /> Ver inativos</label>
        </div>
      </div>
      {carregando ? <p>Carregando cadastros...</p> :
        filtrar.length ? <div className="grade-cartoes-funcionarios">
          {filtrar.map(f => <article className="cartao-funcionario-cadastro" key={f.id}>
            <header className="cabecalho-cartao-funcionario">
              <div><span className="rotulo-cartao-funcionario">Funcionário</span>
                <h3>{f.nome}</h3></div>
              <div className="situacao-acoes-funcionario">
                <span className={'situacao-funcionario ' + (f.ativo ? 'ativo' : 'inativo')}>
                  {f.ativo ? 'Ativo' : 'Inativo'}
                </span>
                {f.ativo && <div className="acoes-cadastro">
                  {f.competenciaPendente && <button type="button" className="acao-cadastro-icone"
                    aria-label={'Sincronizar ' + f.nome + ' com o módulo principal'}
                    title="Sincronizar com o módulo principal" onClick={() => void sincronizar(f)}>
                    <ArrowPathIcon aria-hidden="true" />
                  </button>}
                  <button type="button" className="acao-cadastro-icone"
                    aria-label={'Alterar vínculo de ' + f.nome}
                    title={'Alterar vínculo de ' + f.nome}
                    onClick={() => iniciarMovimentacao(f)}>
                    <PencilSquareIcon aria-hidden="true" />
                  </button>
                  <button type="button" className="acao-cadastro-icone"
                    aria-label={'Desligar ' + f.nome}
                    title={'Desligar ' + f.nome}
                    onClick={() => void desligar(f)}>
                    <UserMinusIcon aria-hidden="true" />
                  </button>
                </div>}
              </div>
            </header>
            <dl className="dados-cartao-funcionario">
              <div><dt>CPF</dt><dd className="codigo">{f.cpf}</dd></div>
              <div><dt>Cargo</dt><dd>{f.cargo}</dd></div>
              <div><dt>Empresa contratante</dt><dd>{nomeDa(dados.empresas, f.empresaContratanteId)}</dd></div>
              <div><dt>Empresa lotado</dt><dd>{nomeDa(dados.empresas, f.empresaLotadoId)}</dd></div>
              <div><dt>Setor de lotação</dt><dd>{nomeDa(dados.setores, f.setorLotacaoId)}</dd></div>
              <div><dt>Admissão</dt><dd>{formatarData(f.admissao)}</dd></div>
              <div className="salario-cartao-funcionario"><dt>Salário contratual</dt>
                <dd className="moeda">{reais.format(f.salarioContratual)}</dd></div>
            </dl>
          </article>)}
        </div> : <p className="estado-vazio-cadastros">Nenhum funcionário encontrado para esta busca.</p>
      }
    </section>
  </section>;
}
