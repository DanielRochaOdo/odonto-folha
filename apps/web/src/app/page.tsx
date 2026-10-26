'use client';

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChevronDoubleLeftIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  RectangleGroupIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import Cadastros from './componentes/Cadastros';
import ConfigCampos from './componentes/ConfigCampos';
import Configuracoes from './componentes/Configuracoes';
import PainelSetor from './componentes/PainelSetor';
import { formatarData } from './datas';
import { atualizarMascaraComCursor, formatarCpf, mascaraFinal,
  numeroDaMascara, prepararMascaraParaEdicao } from './mascaras';

type Perfil = 'ADMIN' | 'DP' | 'ADM' | 'CENTRAL';
type Sessao = { usuarioId: string; perfil: Perfil };
type CompetenciaResumo = { id: string; ano: number; mes: number; revisao: number;
  criadaEm?: string; fechadaEm: string | null; fechadaComPendencias: boolean };
type PendenciaFechamento = { responsavel: string; quantidade: number;
  grupos: { nome: string; quantidade: number }[] };
type CampoDinamico = {
  id: string; grupoId: string; grupoNome: string; nome: string;
  origem: 'BENEFICIO' | 'COMISSAO';
  tipo: 'moeda' | 'percentual' | 'data' | 'horario';
  classificacao: 'provento' | 'desconto' | 'informativo';
  ordemGlobal: number;
  campoOrigemDesconto?: string;
};
type Celula = {
  situacao: 'preenchido' | 'pendente' | 'nao_aplicavel';
  valor: number | string | null;
  quantidadeParcelas: number;
};
type Funcionario = {
  id: string; empresaContratanteId: string; empresaLotadoId: string;
  setorLotacaoId: string; cpf: string; nome: string; cargo: string;
  admissao: string; salarioContratual: number; ativo: boolean;
};
type Linha = {
  funcionario: Funcionario; celulas: Record<string, Celula>;
  totalAritmetico: number; parcial: boolean;
};
type AbaEmpresa = {
  empresaContratanteId: string; funcionarios: Linha[];
  totalAritmetico: number; totalSalarios: number; parcial: boolean;
};
type Consolidacao = {
  competencia: { ano: number; mes: number };
  revisao: number;
  versaoBeneficios: number;
  fechadaEm: string | null;
  fechadaPor: string | null;
  fechadaComPendencias: boolean;
  envios: {
    grupoId: string; responsavel: 'ADM' | 'CENTRAL' | 'NENHUM';
    concluido: boolean; concluidoEm: string | null; concluidoPor: string | null;
  }[];
  colunas: CampoDinamico[];
  percentuaisDesconto: Record<string, number>;
  abas: AbaEmpresa[];
  nomes: { empresas: Record<string, string>; setores: Record<string, string> };
};
type AbaNavegacao = 'Painel' | 'Cadastros' | 'Configuração' | 'Consolidação' | 'Configurações';
const CHAVE_NAVEGACAO = 'odontofolha:navegacao';

const dinheiro = (v: number) => new Intl.NumberFormat('pt-BR',
  { style: 'currency', currency: 'BRL' }).format(v);
const mes = (ano: number, numero: number) => new Intl.DateTimeFormat('pt-BR',
  { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(ano, numero - 1, 1)));
const nomeMes = (ano: number, numero: number) => {
  const titulo = mes(ano, numero);
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
};
const dataAbertura = (valor?: string) => {
  if (!valor) return 'Data de abertura indisponível';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Data de abertura indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(data);
};

async function lerErro(resposta: Response): Promise<string> {
  if (resposta.status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (resposta.status === 403) return 'Seu perfil não permite esta operação.';
  if (resposta.status === 409) return 'Outra alteração foi registrada. Atualize os dados.';
  if (resposta.status >= 500) return 'O servidor não conseguiu concluir a operação.';
  try {
    const json: unknown = await resposta.json();
    if (json && typeof json === 'object' && 'erro' in json &&
      typeof json.erro === 'string') return json.erro;
  } catch { /* resposta não é JSON */ }
  return 'Não foi possível concluir a operação.';
}
const permiteDp = (perfil: Perfil) => perfil === 'ADMIN' || perfil === 'DP';
const numeroApi = numeroDaMascara;
const ITENS_POR_PAGINA = 20;

export default function PaginaInicial() {
  const [fase, setFase] = useState<'verificando' | 'visitante' | 'autenticado'>('verificando');
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<AbaNavegacao>('Painel');
  const [competencias, setCompetencias] = useState<CompetenciaResumo[]>([]);
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState<string | null>(null);
  const [consolidado, setConsolidado] = useState<Consolidacao | null>(null);
  const [aberta, setAberta] = useState<string>(new Date().toISOString().slice(0, 7));
  const [novoMes, setNovoMes] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selecionadosMassa, setSelecionadosMassa] = useState<string[]>([]);
  const [barraLateralColapsada, setBarraLateralColapsada] = useState(false);
  const [campoMassaId, setCampoMassaId] = useState('');
  const [valorMassa, setValorMassa] = useState('');
  const [buscaFuncionarioConsolidacao, setBuscaFuncionarioConsolidacao] = useState('');
  const [empresaFiltroId, setEmpresaFiltroId] = useState<string | null>(null);
  const [paginaConsolidacao, setPaginaConsolidacao] = useState(1);
  const [modalFechamento, setModalFechamento] = useState<{
    revisao: number; pendencias: PendenciaFechamento[];
  } | null>(null);
  const termoFuncionarioConsolidacao = buscaFuncionarioConsolidacao.trim().toLocaleLowerCase('pt-BR');
  const linhasConsolidacaoFiltradas = consolidado?.abas
    .filter(empresa => !empresaFiltroId || empresa.empresaContratanteId === empresaFiltroId)
    .flatMap(empresa => empresa.funcionarios.map(linha => ({ empresa, linha })))
    .filter(({ linha }) => !termoFuncionarioConsolidacao ||
      linha.funcionario.nome.toLocaleLowerCase('pt-BR').includes(termoFuncionarioConsolidacao) ||
      linha.funcionario.cpf.includes(buscaFuncionarioConsolidacao.trim())) ?? [];
  const totalPaginasConsolidacao = Math.max(1,
    Math.ceil(linhasConsolidacaoFiltradas.length / ITENS_POR_PAGINA));
  const paginaConsolidacaoAtual = Math.min(paginaConsolidacao, totalPaginasConsolidacao);
  const inicioPaginaConsolidacao = (paginaConsolidacaoAtual - 1) * ITENS_POR_PAGINA;
  const linhasConsolidacaoPagina = linhasConsolidacaoFiltradas.slice(
    inicioPaginaConsolidacao, inicioPaginaConsolidacao + ITENS_POR_PAGINA);

  function salvarNavegacao(abaAtual: AbaNavegacao, competenciaId = competenciaSelecionada) {
    try {
      window.localStorage.setItem(CHAVE_NAVEGACAO, JSON.stringify({
        aba: abaAtual, competenciaId,
      }));
    } catch { /* A navegação continua funcionando sem armazenamento local. */ }
  }

  function navegar(abaAtual: AbaNavegacao) {
    setAba(abaAtual);
    salvarNavegacao(abaAtual);
    if (abaAtual === 'Consolidação' && competenciaSelecionada) {
      setErro('');
      void atualizarConsolidacao(competenciaSelecionada).catch(e =>
        setErro(e instanceof Error ? e.message : 'Não foi possível atualizar a consolidação'));
    }
  }

  function idsSelecionadosAplicaveis(campoId: string) {
    if (!consolidado) return [];
    const linhas = consolidado.abas.flatMap(a => a.funcionarios);
    return selecionadosMassa.filter(id => linhas.some(linha =>
      linha.funcionario.id === id && linha.celulas[campoId]?.situacao !== 'nao_aplicavel'));
  }

  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/sessao', { cache: 'no-store', credentials: 'include', signal: controle.signal })
      .then(async resposta => {
        if (!resposta.ok) throw new Error('Sessão não disponível');
        return resposta.json() as Promise<Sessao>;
      })
      .then(s => {
        if (controle.signal.aborted) return;
        setSessao(s); setFase('autenticado');
        try {
          const salvo = window.localStorage.getItem(CHAVE_NAVEGACAO);
          if (!salvo) return;
          const contexto = JSON.parse(salvo) as {
            aba?: AbaNavegacao; competenciaId?: string | null;
          };
          const abasPermitidas: AbaNavegacao[] = [
            ...(permiteDp(s.perfil)
              ? ['Painel', 'Cadastros', 'Configuração', 'Consolidação'] as AbaNavegacao[]
              : []),
            'Configurações',
          ];
          if (!contexto.aba || !abasPermitidas.includes(contexto.aba)) return;
          setAba(contexto.aba);
          if (contexto.competenciaId) {
            setCompetenciaSelecionada(contexto.competenciaId);
            if (contexto.aba === 'Consolidação') {
              void atualizarConsolidacao(contexto.competenciaId).catch(e => {
                if (!controle.signal.aborted) setErro(e instanceof Error
                  ? e.message : 'Não foi possível restaurar a consolidação');
              });
            }
          }
        } catch { /* Estado salvo inválido: mantém o painel inicial. */ }
      })
      .catch(() => {
        if (!controle.signal.aborted) setFase('visitante');
      });
    return () => controle.abort();
  }, []);

  async function carregarCompetencias() {
    const resposta = await fetch('/api/competencias', { cache: 'no-store', credentials: 'include' });
    if (!resposta.ok) throw new Error(await lerErro(resposta));
    const corpo = await resposta.json() as { competencias: CompetenciaResumo[] };
    setCompetencias(corpo.competencias);
  }

  useEffect(() => {
    if (!sessao || !permiteDp(sessao.perfil)) return;
    const controle = new AbortController();
    fetch('/api/competencias', { cache: 'no-store', credentials: 'include', signal: controle.signal })
      .then(async resposta => {
        if (!resposta.ok) throw new Error(await lerErro(resposta));
        return resposta.json() as Promise<{ competencias: CompetenciaResumo[] }>;
      })
      .then(resultado => { if (!controle.signal.aborted) setCompetencias(resultado.competencias); })
      .catch(e => {
        if (!controle.signal.aborted) setErro(
          e instanceof Error ? e.message : 'Não foi possível carregar competências');
      });
    return () => controle.abort();
  }, [sessao]);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(''); setEntrando(true);
    try {
      const resposta = await fetch('/api/auth/sign-in/email', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: senha }),
      });
      if (!resposta.ok) {
        const mensagem = resposta.status === 401
          ? 'E-mail ou senha inválidos.'
          : resposta.status === 404
            ? 'A API de autenticação não está ativa nesta implantação. Verifique ODONTOFOLHA_API_REAL no ambiente de produção.'
            : resposta.status === 403
              ? 'A requisição de login foi recusada. Verifique a origem e a configuração da API.'
              : resposta.status >= 500
                ? 'A API apresentou um erro ao autenticar. Verifique os logs da implantação e as variáveis de ambiente da API.'
                : 'Não foi possível autenticar (HTTP ' + resposta.status + ').';
        throw new Error(mensagem);
      }
      const atual = await fetch('/api/sessao', { cache: 'no-store', credentials: 'include' });
      if (!atual.ok) throw new Error('Sua conta não possui perfil ativo. Consulte o ADMIN.');
      setSessao(await atual.json() as Sessao);
      setSenha(''); setFase('autenticado');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar');
    } finally {
      setEntrando(false);
    }
  }

  async function sair() {
    setErro('');
    try {
      const resposta = await fetch('/api/auth/sign-out', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({}),
      });
      if (!resposta.ok) throw new Error('Não foi possível encerrar a sessão');
      setSessao(null); setFase('visitante'); setCompetencias([]);
      setConsolidado(null); setCompetenciaSelecionada(null);
      setEditando(null);
      try { window.localStorage.removeItem(CHAVE_NAVEGACAO); } catch { /* Ignora armazenamento indisponível. */ }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao sair');
    }
  }

  async function abrirCompetencia(id: string) {
    setErro(''); setFeedback('');
    setEmpresaFiltroId(null); setPaginaConsolidacao(1);
    setEmpresaFiltroId(null);
    const resposta = await fetch('/api/competencias/' + encodeURIComponent(id) + '/consolidacao',
      { cache: 'no-store', credentials: 'include' });
    if (!resposta.ok) {
      setErro(await lerErro(resposta));
      return;
    }
    setConsolidado(await resposta.json() as Consolidacao);
    setCompetenciaSelecionada(id); setEditando(null); setAba('Consolidação');
    salvarNavegacao('Consolidação', id);
  }

  async function criarCompetencia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro(''); setFeedback('');
    const [ano, mesNumero] = aberta.split('-').map(Number);
    const resposta = await fetch('/api/competencias', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano, mes: mesNumero }),
    });
    if (!resposta.ok) { setErro(await lerErro(resposta)); return; }
    const nova = await resposta.json() as CompetenciaResumo;
    setNovoMes(false);
    await carregarCompetencias();
    await abrirCompetencia(nova.id);
  }

  async function salvarCelula(linha: Linha, campo: CampoDinamico, entrada: string) {
    if (!consolidado || !competenciaSelecionada || salvando) return;
    const anterior = linha.celulas[campo.id];
    const valorAnterior = campo.campoOrigemDesconto
      ? String(consolidado.percentuaisDesconto[`${linha.funcionario.id}:${campo.id}`] ?? '')
      : anterior?.valor === null || anterior?.valor === undefined ? '' : String(anterior.valor);
    if (entrada === valorAnterior || anterior?.situacao === 'nao_aplicavel') return;
    if (!entrada.trim()) { setErro('Para limpar use a ação específica de remover valor.'); return; }
    if ((campo.campoOrigemDesconto || campo.tipo === 'moeda' || campo.tipo === 'percentual') && valorAnterior !== '' &&
      numeroApi(entrada) === Number(valorAnterior)) return;
    if (anterior?.quantidadeParcelas && !window.confirm(
      'Substituir as parcelas pelo total direto, preservando o histórico?')) return;
    const valor = campo.campoOrigemDesconto || campo.tipo === 'moeda' || campo.tipo === 'percentual'
      ? numeroApi(entrada) : entrada;
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      setErro('Valor numérico inválido'); return;
    }
    let caminho = '/api/competencias/' + encodeURIComponent(competenciaSelecionada) + '/lancamentos';
    let corpo: object = {
      funcionarioId: linha.funcionario.id, campoId: campo.id, valor,
      modo: 'total', versaoEsperada: consolidado.revisao, confirmarSubstituicao: true,
    };
    if (campo.campoOrigemDesconto) {
      caminho = '/api/beneficios/' + encodeURIComponent(competenciaSelecionada) +
        '/percentual-desconto';
      corpo = { funcionarioId: linha.funcionario.id,
        campoOrigemId: campo.campoOrigemDesconto, percentual: valor,
        versaoEsperada: consolidado.versaoBeneficios };
    } else if (campo.origem === 'BENEFICIO') {
      const escolha = window.prompt(
        'Benefício recorrente: digite R para aplicar neste mês e nos próximos; M para exceção apenas neste mês. Cancelar não salva.',
        'R',
      );
      if (escolha === null) return;
      const acao = escolha.trim().toUpperCase() === 'R' ? 'base'
        : escolha.trim().toUpperCase() === 'M' ? 'excecao' : null;
      if (!acao) { setErro('Escolha R ou M para salvar o benefício.'); return; }
      caminho = '/api/beneficios/' + encodeURIComponent(competenciaSelecionada) + '/' + acao;
      corpo = {
        funcionarioId: linha.funcionario.id, campoId: campo.id, valor,
        versaoEsperada: consolidado.versaoBeneficios,
      };
    }
    setSalvando(true); setErro(''); setFeedback('Salvando...');
    try {
      const resposta = await fetch(caminho, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) throw new Error(await lerErro(resposta));
      await atualizarConsolidacao(competenciaSelecionada);
      setFeedback('Valor salvo com sucesso');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
      setFeedback('Alteração não salva');
    } finally { setSalvando(false); }
  }

  async function aplicarValorEmMassa() {
    if (!consolidado || !competenciaSelecionada || !campoMassaId ||
      !selecionadosMassa.length || salvando) return;
    const campo = consolidado.colunas.find(c => c.id === campoMassaId);
    if (!campo) return;
    const funcionariosAplicaveis = idsSelecionadosAplicaveis(campo.id);
    if (!funcionariosAplicaveis.length || funcionariosAplicaveis.length !== selecionadosMassa.length) {
      setErro('Selecione apenas funcionarios vinculados ao campo escolhido.'); return;
    }
    if (!valorMassa.trim()) { setErro('Informe o valor para aplicar aos funcionÃ¡rios selecionados.'); return; }
    const valor = campo.tipo === 'moeda' || campo.tipo === 'percentual'
      ? numeroApi(valorMassa) : valorMassa;
    if (typeof valor === 'number' && (!Number.isFinite(valor) ||
      (campo.tipo === 'moeda' && valor < 0))) {
      setErro('Informe um valor numÃ©rico vÃ¡lido. Moeda nÃ£o pode ser negativa.'); return;
    }
    const linhasSelecionadas = consolidado.abas.flatMap(a => a.funcionarios)
      .filter(linha => selecionadosMassa.includes(linha.funcionario.id));
    if (linhasSelecionadas.some(linha => (linha.celulas[campo.id]?.quantidadeParcelas ?? 0) > 0) &&
      !window.confirm('Alguns funcionÃ¡rios tÃªm parcelas neste campo. SubstituÃ­-las pelo mesmo valor total?')) return;
    setErro(''); setSalvando(true); setFeedback('Aplicando valor...');
    try {
      if (campo.origem === 'BENEFICIO') {
        const escolha = window.prompt(
          'BenefÃ­cio: digite R para aplicar como base recorrente ou M para exceÃ§Ã£o apenas neste mÃªs.', 'R');
        if (escolha === null) { setFeedback(''); return; }
        const acao = escolha.trim().toUpperCase() === 'R' ? 'base'
          : escolha.trim().toUpperCase() === 'M' ? 'excecao' : null;
        if (!acao) { setErro('Escolha R ou M para salvar o benefÃ­cio.'); setFeedback(''); return; }
        const respostaCatalogo = await fetch('/api/beneficios/catalogo',
          { cache: 'no-store', credentials: 'include' });
        if (!respostaCatalogo.ok) throw new Error(await lerErro(respostaCatalogo));
        const catalogo = await respostaCatalogo.json() as { versao: number };
        const resposta = await fetch('/api/beneficios/' + encodeURIComponent(competenciaSelecionada) +
          '/valores-em-massa', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funcionariosIds: funcionariosAplicaveis, campoId: campo.id,
            valor, acao, versaoEsperada: catalogo.versao }),
        });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
      } else {
        const resposta = await fetch('/api/competencias/' + encodeURIComponent(competenciaSelecionada) +
          '/lancamentos-em-massa', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funcionariosIds: funcionariosAplicaveis, campoId: campo.id, valor,
            modo: 'total', versaoEsperada: consolidado.revisao, confirmarSubstituicao: true }),
        });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
      }
      await atualizarConsolidacao(competenciaSelecionada);
      setFeedback(`Valor aplicado a ${selecionadosMassa.length} funcionÃ¡rio(s).`);
      setSelecionadosMassa([]); setValorMassa('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'NÃ£o foi possÃ­vel aplicar os valores.');
      setFeedback('AlteraÃ§Ã£o nÃ£o salva');
    } finally { setSalvando(false); }
  }

  async function atualizarConsolidacao(id: string) {
    const resposta = await fetch('/api/competencias/' + encodeURIComponent(id) +
      '/consolidacao', { cache: 'no-store', credentials: 'include' });
    if (!resposta.ok) {
      const mensagem = await lerErro(resposta);
      if (resposta.status === 404 && mensagem === 'Competência não encontrada') {
        setCompetenciaSelecionada(null); setConsolidado(null); setAba('Painel');
        setModalFechamento(null); setErro(''); setFeedback('');
        salvarNavegacao('Painel', null);
        return;
      }
      throw new Error(mensagem);
    }
    setConsolidado(await resposta.json() as Consolidacao);
    setModalFechamento(null);
  }

  async function fecharCompetencia(confirmarPendencias = false) {
    if (!competenciaSelecionada || !consolidado || salvando) return;
    const revisao = confirmarPendencias
      ? modalFechamento?.revisao : consolidado.revisao;
    if (revisao === undefined || revisao === null) return;
    setSalvando(true); setErro(''); setFeedback('');
    try {
      const resposta = await fetch('/api/competencias/' +
        encodeURIComponent(competenciaSelecionada) + '/fechar', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versaoEsperada: revisao, confirmarPendencias }),
      });
      const dados = await resposta.json() as {
        codigo?: string; erro?: string; revisao?: number; pendencias?: PendenciaFechamento[];
      };
      if (!resposta.ok && dados.codigo === 'PENDENCIAS' && dados.pendencias) {
        setModalFechamento({ revisao: dados.revisao ?? revisao, pendencias: dados.pendencias });
        return;
      }
      if (!resposta.ok) throw new Error(dados.erro ?? 'Não foi possível fechar a competência');
      setModalFechamento(null); setEditando(null); setSelecionadosMassa([]);
      await atualizarConsolidacao(competenciaSelecionada);
      await carregarCompetencias();
      setFeedback('Competência fechada. Os lançamentos estão bloqueados.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível fechar a competência');
      if (competenciaSelecionada) await atualizarConsolidacao(competenciaSelecionada).catch(() => undefined);
    } finally { setSalvando(false); }
  }

  async function reabrirCompetenciaAtual() {
    if (!competenciaSelecionada || !consolidado || salvando) return;
    if (!window.confirm('Reabrir a competência? Os setores poderão voltar a editar os lançamentos.')) return;
    setSalvando(true); setErro(''); setFeedback('');
    try {
      const resposta = await fetch('/api/competencias/' +
        encodeURIComponent(competenciaSelecionada) + '/reabrir', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versaoEsperada: consolidado.revisao }),
      });
      if (!resposta.ok) throw new Error(await lerErro(resposta));
      await atualizarConsolidacao(competenciaSelecionada);
      await carregarCompetencias();
      setFeedback('Competência reaberta para edição.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível reabrir a competência');
    } finally { setSalvando(false); }
  }

  async function vincularCelula(funcionarioId: string, campoId: string) {
    if (!competenciaSelecionada || !consolidado) return;
    setErro(''); setSalvando(true);
    try {
      const resposta = await fetch('/api/competencias/' +
        encodeURIComponent(competenciaSelecionada) + '/vinculos', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionarioId, campoId, vinculado: true,
          versaoEsperada: consolidado.revisao,
        }),
      });
      if (!resposta.ok) throw new Error(await lerErro(resposta));
      await atualizarConsolidacao(competenciaSelecionada);
      setFeedback('Funcionário vinculado ao campo.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível vincular o funcionário');
    } finally { setSalvando(false); }
  }

  async function reabrirComissao(grupoId: string) {
    if (!competenciaSelecionada || !consolidado) return;
    if (!window.confirm('Reabrir a comissão? O setor poderá voltar a lançar valores.')) return;
    setErro(''); setSalvando(true);
    try {
      const response = await fetch('/api/competencias/' +
        encodeURIComponent(competenciaSelecionada) + '/comissoes/' +
        encodeURIComponent(grupoId) + '/reabrir', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versaoEsperada: consolidado.revisao }),
      });
      if (!response.ok) throw new Error(await lerErro(response));
      await atualizarConsolidacao(competenciaSelecionada);
      setFeedback('Comissão reaberta para o setor.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao reabrir');
    } finally { setSalvando(false); }
  }

  function teclaCelula(e: KeyboardEvent<HTMLInputElement>, original: string) {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      e.currentTarget.value = original;
      e.currentTarget.blur();
    }
  }

  if (fase === 'verificando') return (
    <main className="tela-acesso tela-acesso-verificacao">
      <div className="cartao-acesso superficie-vidro"><span className="logo-acesso">OF</span>
        <h1>OdontoFolha</h1><p>Verificando a sessão...</p>
      </div>
    </main>
  );

  if (fase === 'visitante') return (
    <main className="tela-acesso">
      <section className="lateral-acesso" aria-label="Apresentação">
        <div className="marca-acesso"><span className="logo-acesso">OF</span>
          <strong>OdontoFolha</strong></div>
        <div className="mensagem-acesso">
          <span className="sobre">GRUPO ODONTOART</span>
          <h1>Organização e clareza mês a mês.</h1>
          <p>Cadastros, benefícios, comissões e consolidação em um único ambiente protegido.</p>
        </div>
        <span className="rodape-acesso">Acesso restrito aos profissionais autorizados</span>
      </section>
      <section className="direita-acesso">
        <div className="caixa-login superficie-vidro">
          <span className="sobre">ACESSO CORPORATIVO</span>
          <h2>Entrar no OdontoFolha</h2>
          <p>Utilize as credenciais fornecidas pela administração do sistema.</p>
          <form className="formulario-login" onSubmit={entrar}>
            <label htmlFor="email">E-mail</label>
            <input className="controle-vidro" id="email" type="email" autoComplete="username" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com.br"/>
            <label htmlFor="senha">Senha</label>
            <input className="controle-vidro" id="senha" type="password" autoComplete="current-password" required
              value={senha} onChange={e => setSenha(e.target.value)}/>
            {erro && <p role="alert" className="erro">{erro}</p>}
            <button className="acao-principal" disabled={entrando} type="submit">
              {entrando ? 'Autenticando...' : <>Entrar no sistema <ArrowRightIcon className="icone-inline" aria-hidden="true" /></>}
            </button>
          </form>
        </div>
      </section>
    </main>
  );

  const enviosComResponsavel = (consolidado?.envios ?? [])
    .filter(envio => envio.responsavel !== 'NENHUM');
  const quantidadeEnviosPendentes = enviosComResponsavel.filter(envio => !envio.concluido).length;
  const totalFuncionariosConsolidacao = consolidado?.abas.reduce(
    (total, empresa) => total + empresa.funcionarios.length, 0,
  ) ?? 0;
  const totalGeralConsolidacao = consolidado?.abas.reduce(
    (total, empresa) => total + empresa.totalAritmetico, 0,
  ) ?? 0;

  return (
    <div className={`aplicacao${barraLateralColapsada ? ' sidebar-recolhida' : ''}`}>
      <aside className="barra-lateral">
        <div className="marca"><span className="logo-marca" aria-label="OdontoFolha">OF</span>
          <span className="identidade-marca"><strong>OdontoFolha</strong><small>Grupo Odontoart</small></span>
          <button type="button" className="controle-barra-lateral"
            aria-label={barraLateralColapsada ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={barraLateralColapsada ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!barraLateralColapsada} aria-controls="navegacao-principal"
            onClick={() => setBarraLateralColapsada(atual => !atual)}>
            <ChevronDoubleLeftIcon className="icone-navegacao" aria-hidden="true" />
          </button>
        </div>
        <nav className="grupo-navegacao" id="navegacao-principal" aria-label="Navegação principal">
          <p>ESPAÇO DE TRABALHO</p>
          <button className={aba === 'Painel' ? 'ativo' : ''}
            aria-label="Competências" title="Competências"
            onClick={() => navegar('Painel')}><CalendarDaysIcon className="icone-navegacao" aria-hidden="true" /><span>Competências</span></button>
          {permiteDp(sessao!.perfil) && <button className={aba === 'Cadastros' ? 'ativo' : ''}
            aria-label="Cadastros" title="Cadastros"
            onClick={() => navegar('Cadastros')}><UserGroupIcon className="icone-navegacao" aria-hidden="true" /><span>Cadastros</span></button>}
          {permiteDp(sessao!.perfil) && <button className={aba === 'Configuração' ? 'ativo' : ''}
            aria-label="Benefícios e comissões" title="Benefícios e comissões"
            onClick={() => navegar('Configuração')}><BanknotesIcon className="icone-navegacao" aria-hidden="true" /><span>Benefícios e comissões</span></button>}
          {permiteDp(sessao!.perfil) &&
            <button className={aba === 'Consolidação' ? 'ativo' : ''}
              aria-label="Consolidação" title="Consolidação"
              onClick={() => navegar('Consolidação')}><RectangleGroupIcon className="icone-navegacao" aria-hidden="true" /><span>Consolidação</span></button>}
          <button className={aba === 'Configurações' ? 'ativo' : ''}
            aria-label="Configurações" title="Configurações"
            onClick={() => navegar('Configurações')}><Cog6ToothIcon className="icone-navegacao" aria-hidden="true" /><span>Configurações</span></button>
        </nav>
        <div className="rodape-lateral">
          <div className="perfil-atual">
            <div className="circulo-perfil">{sessao!.perfil.slice(0, 2)}</div>
            <span><strong>Perfil {sessao!.perfil}</strong><small>Sessão autenticada</small></span>
          </div>
          <button type="button" className="sair-lateral" onClick={() => void sair()}
            aria-label="Sair da conta" title="Sair da conta">
            <ArrowLeftOnRectangleIcon className="icone-navegacao" aria-hidden="true" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>
      <div className="corpo">
        <header className="cabecalho-app">
          <div><span className="sobre">GRUPO ODONTOART · ODONTOFOLHA</span>
            <h1>{aba === 'Painel' ? 'Competências' : aba === 'Cadastros' ? 'Cadastros'
              : aba === 'Configuração' ? 'Benefícios e comissões'
                : aba === 'Configurações' ? 'Configurações' : 'Consolidação mensal'}</h1></div>

          {aba === 'Consolidação' && consolidado && permiteDp(sessao!.perfil) &&
            (consolidado.fechadaEm ? <button type="button" className="botao-secundario controle-fechamento"
              disabled={salvando} onClick={() => void reabrirCompetenciaAtual()}>
              Reabrir competência
            </button> : <button type="button" className="acao-principal controle-fechamento"
              disabled={salvando} onClick={() => void fecharCompetencia()}>
              Fechar competência
            </button>)}
        </header>
        <div className={`conteudo-app${aba === 'Painel' ? ' modulo-competencias' : ''}`}>
          {erro && <p role="alert" className="erro alerta-app">{erro}</p>}
          {feedback && <p role="status" className="feedback">{feedback}</p>}
          {aba === 'Configurações' ? <Configuracoes perfil={sessao!.perfil} /> : !permiteDp(sessao!.perfil) ? (
            <PainelSetor perfil={sessao!.perfil as 'ADM' | 'CENTRAL'}/>
          ) : aba === 'Cadastros' ? <Cadastros /> : aba === 'Configuração' ? <ConfigCampos /> : aba === 'Painel' ? (
            <>
              <div className="titulo-secao">
                <div><h2>Visão geral</h2><p>Selecione uma competência para consultar os registros.</p></div>
                <button className="acao-principal" onClick={() => setNovoMes(!novoMes)}>
                  {novoMes ? 'Cancelar' : '+ Nova competência'}
                </button>
              </div>
              {novoMes && <form onSubmit={criarCompetencia} className="painel-app linha-criacao">
                <label htmlFor="mes-abertura">Mês e ano</label>
                <input id="mes-abertura" type="month" required value={aberta}
                  onChange={e => setAberta(e.target.value)} />
                <button className="acao-principal" type="submit">Criar competência</button>
              </form>}
              <div className="grade-competencias">
                {competencias.map(c => <button key={c.id} className="cartao-competencia"
                    onClick={() => void abrirCompetencia(c.id)}>
                    <span className="tag-competencia">COMPETÊNCIA</span>
                    <strong>{nomeMes(c.ano, c.mes)}</strong>
                    <span className="metadados-cartao-competencia">
                      <span className={'status-cartao-competencia ' + (c.fechadaEm ? 'fechada' : 'aberta')}>
                        {c.fechadaEm ? 'Fechada' : 'Aberta'}
                      </span>
                      <small>Aberta em {dataAbertura(c.criadaEm)}</small>
                    </span>
                    <small className="abrir-detalhes-competencia">Abrir detalhes</small>
                    <ArrowUpRightIcon className="seta-competencia" aria-hidden="true" />
                  </button>)}
              </div>
              {!competencias.length && <div className="painel-app estado-vazio">
                <h2>Nenhuma competência cadastrada</h2>
                <p>Crie a primeira competência após concluir os cadastros de empresas,
                  funcionários e campos dinâmicos.</p>
              </div>}
            </>
          ) : !consolidado ? (
            <section className="painel-app estado-vazio">
              <h2>Selecione uma competência</h2>
              <p>Volte ao painel e abra o mês que deseja consultar.</p>
              <button className="botao-secundario" onClick={() => navegar('Painel')}>Ver competências</button>
            </section>
          ) : (
            <section className="painel-app consolidacao-painel">
              <div className="titulo-secao consolidacao-cabecalho">
                <div><span className="sobre">CONSOLIDADO</span>
                  <h2>{nomeMes(consolidado.competencia.ano, consolidado.competencia.mes)}</h2>
                  <p>Salário contratual + proventos monetários − descontos monetários.</p>
                </div>
                <div className="acoes-secao consolidacao-acoes">
                  <label className="filtro-funcionario busca-cabecalho">Buscar funcionário
                    <input type="search" value={buscaFuncionarioConsolidacao}
                      onChange={evento => {
                        setBuscaFuncionarioConsolidacao(evento.target.value);
                        setPaginaConsolidacao(1);
                      }}
                      placeholder="Digite o nome ou CPF" autoComplete="off" />
                  </label>
                  <button className="botao-secundario" onClick={() => navegar('Painel')}><ArrowLeftIcon className="icone-inline" aria-hidden="true" /> Voltar</button>
                  <a className="acao-principal" href={'/api/competencias/' +
                    encodeURIComponent(competenciaSelecionada ?? '') + '/exportacao.xlsx'}>
                    <ArrowDownTrayIcon className="icone-inline" aria-hidden="true" /> Exportar XLSX
                  </a>
                </div>
              </div>
              {consolidado.fechadaEm && <p className="competencia-fechada-aviso" role="status">
                Competência fechada em {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short', timeStyle: 'short',
                }).format(new Date(consolidado.fechadaEm))}.
                {consolidado.fechadaComPendencias && ' Foi fechada com pendências.'}
                {' '}Os lançamentos estão bloqueados.
              </p>}
              <section className="totais-empresa" aria-label="Totais por empresa">
                {consolidado.abas.map(empresa => {
                  const selecionado = empresaFiltroId === empresa.empresaContratanteId;
                  const nomeEmpresa = consolidado.nomes.empresas[empresa.empresaContratanteId] ?? 'Não identificada';
                  return <button type="button" className="cartao-total-empresa"
                    aria-pressed={selecionado}
                    aria-label={`Filtrar funcionários da empresa ${nomeEmpresa}`}
                    key={empresa.empresaContratanteId}
                    onClick={() => {
                      setEmpresaFiltroId(atual =>
                        atual === empresa.empresaContratanteId ? null : empresa.empresaContratanteId);
                      setPaginaConsolidacao(1);
                    }}>
                  <strong className="nome-total-empresa">{nomeEmpresa} ({empresa.funcionarios.length})</strong>
                  <div className="valor-total-empresa">
                    <strong>{dinheiro(empresa.totalAritmetico)}</strong>
                    {empresa.parcial && <span className="selo-total-parcial">Parcial</span>}
                  </div>
                  </button>;
                })}
                <button type="button" className="cartao-total-empresa cartao-total-geral"
                  aria-pressed={!empresaFiltroId}
                  aria-label={`Exibir todos os ${totalFuncionariosConsolidacao} funcionários`}
                  onClick={() => {
                    setEmpresaFiltroId(null);
                    setPaginaConsolidacao(1);
                  }}>
                  <strong className="nome-total-empresa">Total ({totalFuncionariosConsolidacao})</strong>
                  <div className="valor-total-empresa">
                    <strong>{dinheiro(totalGeralConsolidacao)}</strong>
                    {consolidado.abas.some(empresa => empresa.parcial) &&
                      <span className="selo-total-parcial">Parcial</span>}
                  </div>
                </button>
              </section>
              {empresaFiltroId && <p className="filtro-empresa-ativo" role="status">
                Exibindo {linhasConsolidacaoFiltradas.length} funcionário(s) de{' '}
                {consolidado.nomes.empresas[empresaFiltroId] ?? 'empresa não identificada'}.
                {' '}Clique no card novamente para limpar o filtro.
              </p>}
              {!!enviosComResponsavel.length &&
                <details className="envios-consolidacao">
                  <summary>Envios de comissões · {(consolidado.envios ?? []).filter(envio =>
                    envio.responsavel !== 'NENHUM').length}{' | '}Pendentes · {quantidadeEnviosPendentes}</summary>
                  <div className="lista-envios-consolidacao">
                    {enviosComResponsavel.map(envio => <div key={envio.grupoId} className="feedback">
                        <strong>{consolidado.colunas.find(c => c.grupoId === envio.grupoId)?.grupoNome ?? 'Comissão'}</strong>
                        {' · '}{envio.responsavel} · {envio.concluido ? 'Concluída' : 'Pendente'}
                        {envio.concluido && <button className="botao-secundario"
                          disabled={salvando || !!consolidado.fechadaEm}
                          onClick={() => void reabrirComissao(envio.grupoId)}>Reabrir comissão</button>}
                      </div>)}
                  </div>
                </details>}
              <p className="orientacao-tabela">Edição: use o lápis. Enter/Tab salva; Esc desfaz. Pendências ficam em branco; zero é explícito.</p>
              {!consolidado.fechadaEm && <details className="edicao-massa" aria-label="Aplicar o mesmo valor a vários funcionários">
                <summary className="edicao-massa-resumo">
                  <strong>Edição em massa</strong>
                  <span>{selecionadosMassa.length} funcionário(s) selecionado(s)</span>
                </summary>
                <div className="edicao-massa-conteudo">
                  <div className="edicao-massa-selecao">
                    <button type="button" className="botao-secundario" disabled={salvando}
                      onClick={() => setSelecionadosMassa(consolidado.abas.flatMap(a =>
                        a.funcionarios.filter(l => !campoMassaId ||
                          l.celulas[campoMassaId]?.situacao !== 'nao_aplicavel')
                          .map(l => l.funcionario.id)))}>Selecionar todos</button>
                    <button type="button" className="botao-secundario" disabled={salvando}
                      onClick={() => setSelecionadosMassa([])}>Limpar selecao</button>
                  </div>
                  <div className="edicao-massa-campos">
                    <label>Campo
                      <select value={campoMassaId} disabled={salvando}
                        onChange={evento => { setCampoMassaId(evento.target.value); setValorMassa(''); }}>
                        <option value="">Selecione beneficio ou comissao</option>
                        {consolidado.colunas.filter(c => !c.campoOrigemDesconto)
                          .map(c => <option key={c.id} value={c.id}>{c.grupoNome} - {c.nome}</option>)}
                      </select>
                    </label>
                    {(() => {
                      const campo = consolidado.colunas.find(c => c.id === campoMassaId);
                      if (!campo) return null;
                      const numerico = campo.tipo === 'moeda' || campo.tipo === 'percentual';
                      return <label>Valor
                        <span className="entrada-com-mascara">
                          <input type={campo.tipo === 'data' ? 'date' : campo.tipo === 'horario' ? 'time' : 'text'}
                            inputMode={numerico ? 'decimal' : undefined} value={valorMassa} disabled={salvando}
                            onFocus={evento => {
                              if (numerico) setValorMassa(prepararMascaraParaEdicao(evento.currentTarget));
                            }}
                            onChange={evento => setValorMassa(numerico
                              ? atualizarMascaraComCursor(evento.currentTarget, campo.tipo as 'moeda' | 'percentual')
                              : evento.target.value)}
                            onBlur={() => { if (numerico) setValorMassa(atual =>
                              mascaraFinal(atual, campo.tipo as 'moeda' | 'percentual')); }} />
                        </span>
                      </label>;
                    })()}
                    <button type="button" className="acao-principal" disabled={salvando ||
                      !selecionadosMassa.length || !campoMassaId || !valorMassa.trim()}
                      onClick={() => void aplicarValorEmMassa()}>
                      {salvando ? 'Salvando...' : 'Aplicar aos selecionados'}
                    </button>
                    <p>Repita o mesmo valor em um campo de beneficio ou comissao. Datas e horarios usam o formato do navegador.</p>
                  </div>
                </div>
              </details>}
              <div className="rolagem-tabela"><table className="tabela-principal">
                <thead><tr>
                  <th scope="col">Funcionário</th>
                  {consolidado.colunas.map(c => <th key={c.id}
                    className={c.origem === 'BENEFICIO' ? 'th-beneficio' : 'th-comissao'}>
                    {c.grupoNome}<span>{c.nome}</span></th>)}
                  <th>Total aritmético</th><th>Ação</th>
                </tr></thead>
                <tbody>{linhasConsolidacaoPagina.map(({ linha }) => (
                    <tr key={linha.funcionario.id}>
                      <td className="celula-funcionario-fixa">
                        <article className="cartao-dados-funcionario">
                          <div className="cabecalho-dados-funcionario">
                            <input type="checkbox" aria-label={'Selecionar ' + linha.funcionario.nome}
                              checked={selecionadosMassa.includes(linha.funcionario.id)} disabled={salvando || !!consolidado.fechadaEm}
                              onChange={evento => setSelecionadosMassa(atual => evento.target.checked
                                ? [...atual, linha.funcionario.id] : atual.filter(id => id !== linha.funcionario.id))} />
                            <div className="dado-funcionario dado-nome-funcionario">
                              <span>Nome</span><strong title={linha.funcionario.nome}>{linha.funcionario.nome}</strong>
                            </div>
                          </div>
                          <dl className="grade-dados-funcionario">
                            <div className="dado-funcionario">
                              <dt>Empresa Contratante</dt>
                              <dd title={consolidado.nomes.empresas[linha.funcionario.empresaContratanteId]}>
                                {consolidado.nomes.empresas[linha.funcionario.empresaContratanteId] ?? 'Empresa não identificada'}
                              </dd>
                            </div>
                            <div className="dado-funcionario">
                              <dt>Empresa Lotado</dt>
                              <dd title={consolidado.nomes.empresas[linha.funcionario.empresaLotadoId]}>
                                {consolidado.nomes.empresas[linha.funcionario.empresaLotadoId] ?? 'Empresa não identificada'}
                              </dd>
                            </div>
                            <div className="dado-funcionario">
                              <dt>Setor de Lotação</dt>
                              <dd title={consolidado.nomes.setores[linha.funcionario.setorLotacaoId]}>
                                {consolidado.nomes.setores[linha.funcionario.setorLotacaoId] ?? 'Setor não identificado'}
                              </dd>
                            </div>
                            <div className="dado-funcionario">
                              <dt>Cargo</dt><dd title={linha.funcionario.cargo}>{linha.funcionario.cargo}</dd>
                            </div>
                            <div className="dado-funcionario">
                              <dt>CPF</dt><dd className="codigo">{formatarCpf(linha.funcionario.cpf)}</dd>
                            </div>
                            <div className="dado-funcionario">
                              <dt>Admissão</dt><dd>{formatarData(linha.funcionario.admissao)}</dd>
                            </div>
                            <div className="dado-funcionario dado-salario-funcionario">
                              <dt>Salário Contratual</dt><dd className="moeda">
                                {dinheiro(linha.funcionario.salarioContratual)}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      </td>
                      {consolidado.colunas.map(c => {
                        const cel = linha.celulas[c.id];
                        const valor = c.campoOrigemDesconto
                          ? String(consolidado.percentuaisDesconto[`${linha.funcionario.id}:${c.id}`] ?? '')
                          : cel?.valor === null || cel?.valor === undefined ? '' : String(cel.valor);
                        const alteravel = !consolidado.fechadaEm && editando === linha.funcionario.id &&
                          cel?.situacao !== 'nao_aplicavel';
                        return <td key={c.id} className="celula-dinamica">
                          {alteravel ? (
                            <span className="editor-valor-mascarado">
                            <input aria-label={(c.campoOrigemDesconto ? c.nome + ' percentual de ' : c.nome + ' de ') + linha.funcionario.nome}
                              className="editor-celula" key={consolidado.revisao + ':' + c.id}
                              type={c.tipo === 'data' ? 'date' : c.tipo === 'horario' ? 'time' : 'text'}
                              inputMode={c.campoOrigemDesconto || c.tipo === 'moeda' || c.tipo === 'percentual' ? 'decimal' : undefined}
                              defaultValue={c.campoOrigemDesconto ? mascaraFinal(valor, 'percentual')
                                : c.tipo === 'moeda' || c.tipo === 'percentual'
                                  ? mascaraFinal(valor, c.tipo) : valor} disabled={salvando}
                              onFocus={e => {
                                if (c.campoOrigemDesconto) prepararMascaraParaEdicao(e.currentTarget);
                                else if (c.tipo === 'moeda' || c.tipo === 'percentual')
                                  prepararMascaraParaEdicao(e.currentTarget);
                              }}
                              onChange={e => {
                                if (c.campoOrigemDesconto)
                                  atualizarMascaraComCursor(e.currentTarget, 'percentual');
                                else if (c.tipo === 'moeda' || c.tipo === 'percentual')
                                  atualizarMascaraComCursor(e.currentTarget,
                                    c.tipo as 'moeda' | 'percentual');
                              }}
                              onBlur={e => {
                                const entrada = c.campoOrigemDesconto
                                  ? mascaraFinal(e.currentTarget.value, 'percentual')
                                  : c.tipo === 'moeda' || c.tipo === 'percentual'
                                  ? mascaraFinal(e.currentTarget.value, c.tipo) : e.currentTarget.value;
                                e.currentTarget.value = entrada;
                                void salvarCelula(linha, c, entrada);
                              }}
                              onKeyDown={e => teclaCelula(e, valor)} />
                            </span>
                          ) : cel?.situacao === 'nao_aplicavel'
                            ? c.campoOrigemDesconto ? <span className="nao-aplicavel">—</span>
                              : (editando === linha.funcionario.id
                              ? <button className="botao-secundario" disabled={salvando || !!consolidado.fechadaEm}
                                onClick={() => void vincularCelula(linha.funcionario.id, c.id)}>
                                Vincular
                              </button>
                              : <span className="nao-aplicavel">—</span>)
                            : cel?.situacao === 'pendente' ? <span className="pendente">Pendente</span>
                              : c.tipo === 'moeda' && typeof cel.valor === 'number'
                                ? dinheiro(cel.valor) : c.tipo === 'data'
                                  ? formatarData(String(cel?.valor ?? ''))
                                  : String(cel?.valor ?? '')}
                        </td>;
                      })}
                      <td className="moeda forte">{dinheiro(linha.totalAritmetico)}
                        {linha.parcial && <span className="parcial">Parcial</span>}</td>
                      <td><button className="botao-editar" disabled={salvando || !!consolidado.fechadaEm}
                        aria-label={'Editar linha de ' + linha.funcionario.nome}
                        onClick={() => setEditando(editando === linha.funcionario.id
                          ? null : linha.funcionario.id)}>
                        {editando === linha.funcionario.id ? 'Concluir' : <PencilSquareIcon className="icone-inline" aria-hidden="true" />}
                      </button></td>
                    </tr>))}
                  {!linhasConsolidacaoFiltradas.length && <tr>
                    <td colSpan={3 + consolidado.colunas.length} className="config-linha-vazia">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>}
                </tbody>
              </table></div>
              {linhasConsolidacaoFiltradas.length > 0 && <nav className="paginacao-consolidacao"
                aria-label="Paginação de funcionários">
                <span aria-live="polite">
                  Exibindo {inicioPaginaConsolidacao + 1}–{Math.min(
                    inicioPaginaConsolidacao + ITENS_POR_PAGINA,
                    linhasConsolidacaoFiltradas.length)} de {linhasConsolidacaoFiltradas.length} funcionário(s)
                </span>
                {totalPaginasConsolidacao > 1 && <div>
                  <button type="button" className="botao-secundario"
                    aria-label="Página anterior" disabled={paginaConsolidacaoAtual <= 1}
                    onClick={() => setPaginaConsolidacao(paginaConsolidacaoAtual - 1)}>
                    Anterior
                  </button>
                  <span className="pagina-consolidacao-atual">
                    Página {paginaConsolidacaoAtual} de {totalPaginasConsolidacao}
                  </span>
                  <button type="button" className="botao-secundario"
                    aria-label="Próxima página" disabled={paginaConsolidacaoAtual >= totalPaginasConsolidacao}
                    onClick={() => setPaginaConsolidacao(paginaConsolidacaoAtual + 1)}>
                    Próxima
                  </button>
                </div>}
              </nav>}
              <p className="legenda-rodape">Resultado exclusivamente aritmético. Não representa salário líquido oficial.</p>
            </section>
          )}
        </div>
        <footer className="rodape-app">OdontoFolha · Grupo Odontoart · Uso interno e restrito</footer>
      </div>
      {modalFechamento && <div className="fechamento-sobreposicao"
        onKeyDown={evento => {
          if (evento.key === 'Escape' && !salvando) setModalFechamento(null);
        }}>
        <section className="fechamento-modal" role="dialog" aria-modal="true"
          aria-labelledby="titulo-modal-fechamento" aria-describedby="descricao-modal-fechamento">
          <header>
            <span className="sobre">PENDÊNCIAS DA COMPETÊNCIA</span>
            <h3 id="titulo-modal-fechamento">Ainda há lançamentos pendentes</h3>
            <p id="descricao-modal-fechamento">
              Confira os setores responsáveis. Você pode cancelar para solicitar os lançamentos
              ou fechar a competência mesmo assim.
            </p>
          </header>
          <ul className="fechamento-pendencias">
            {modalFechamento.pendencias.map(item => <li key={item.responsavel}>
              <div><strong>{item.responsavel}</strong>
                <span>{item.quantidade} pendência(s)</span></div>
              <ul>{item.grupos.map(grupo => <li key={grupo.nome}>
                {grupo.nome}: {grupo.quantidade}
              </li>)}</ul>
            </li>)}
          </ul>
          <div className="fechamento-acoes">
            <button type="button" className="botao-secundario" disabled={salvando}
              autoFocus onClick={() => setModalFechamento(null)}>Cancelar</button>
            <button type="button" className="acao-principal" disabled={salvando}
              onClick={() => void fecharCompetencia(true)}>
              {salvando ? 'Fechando...' : 'Fechar mesmo assim'}
            </button>
          </div>
        </section>
      </div>}
    </div>
  );
}
