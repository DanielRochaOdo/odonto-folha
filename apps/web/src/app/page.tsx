'use client';

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import Cadastros from './componentes/Cadastros';
import ConfigCampos from './componentes/ConfigCampos';
import Configuracoes from './componentes/Configuracoes';
import PainelSetor from './componentes/PainelSetor';
import { atualizarMascaraComCursor, mascaraFinal,
  numeroDaMascara, prepararMascaraParaEdicao } from './mascaras';

type Perfil = 'ADMIN' | 'DP' | 'ADM' | 'CENTRAL';
type Sessao = { usuarioId: string; perfil: Perfil };
type CompetenciaResumo = { id: string; ano: number; mes: number; revisao: number };
type CampoDinamico = {
  id: string; grupoId: string; grupoNome: string; nome: string;
  origem: 'BENEFICIO' | 'COMISSAO';
  tipo: 'moeda' | 'percentual' | 'data' | 'horario';
  classificacao: 'provento' | 'desconto' | 'informativo';
  ordemGlobal: number;
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
  envios: {
    grupoId: string; responsavel: 'ADM' | 'CENTRAL' | 'NENHUM';
    concluido: boolean; concluidoEm: string | null; concluidoPor: string | null;
  }[];
  colunas: CampoDinamico[];
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
  const [campoMassaId, setCampoMassaId] = useState('');
  const [valorMassa, setValorMassa] = useState('');
  const [buscaFuncionarioConsolidacao, setBuscaFuncionarioConsolidacao] = useState('');
  const termoFuncionarioConsolidacao = buscaFuncionarioConsolidacao.trim().toLocaleLowerCase('pt-BR');
  const linhasConsolidacaoFiltradas = consolidado?.abas.flatMap(empresa =>
    empresa.funcionarios.map(linha => ({ empresa, linha })))
    .filter(({ linha }) => !termoFuncionarioConsolidacao ||
      linha.funcionario.nome.toLocaleLowerCase('pt-BR').includes(termoFuncionarioConsolidacao) ||
      linha.funcionario.cpf.includes(buscaFuncionarioConsolidacao.trim())) ?? [];

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
    const valorAnterior = anterior?.valor === null || anterior?.valor === undefined
      ? '' : String(anterior.valor);
    if (entrada === valorAnterior || anterior?.situacao === 'nao_aplicavel') return;
    if (!entrada.trim()) { setErro('Para limpar use a ação específica de remover valor.'); return; }
    if ((campo.tipo === 'moeda' || campo.tipo === 'percentual') && valorAnterior !== '' &&
      numeroApi(entrada) === Number(valorAnterior)) return;
    if (anterior?.quantidadeParcelas && !window.confirm(
      'Substituir as parcelas pelo total direto, preservando o histórico?')) return;
    const valor = campo.tipo === 'moeda' || campo.tipo === 'percentual'
      ? numeroApi(entrada) : entrada;
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      setErro('Valor numérico inválido'); return;
    }
    let caminho = '/api/competencias/' + encodeURIComponent(competenciaSelecionada) + '/lancamentos';
    let corpo: object = {
      funcionarioId: linha.funcionario.id, campoId: campo.id, valor,
      modo: 'total', versaoEsperada: consolidado.revisao, confirmarSubstituicao: true,
    };
    if (campo.origem === 'BENEFICIO') {
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
    if (!resposta.ok) throw new Error(await lerErro(resposta));
    setConsolidado(await resposta.json() as Consolidacao);
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
    <main className="tela-acesso">
      <div className="cartao-acesso"><span className="logo-acesso">OF</span>
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
          <h1>Organização e clareza em cada competência.</h1>
          <p>Cadastros, benefícios, comissões e consolidação em um único ambiente protegido.</p>
        </div>
        <span className="rodape-acesso">Acesso restrito aos profissionais autorizados</span>
      </section>
      <section className="direita-acesso">
        <div className="caixa-login">
          <span className="sobre">ACESSO CORPORATIVO</span>
          <h2>Entrar no OdontoFolha</h2>
          <p>Utilize as credenciais fornecidas pela administração do sistema.</p>
          <form className="formulario-login" onSubmit={entrar}>
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com.br"/>
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" autoComplete="current-password" required
              value={senha} onChange={e => setSenha(e.target.value)}/>
            {erro && <p role="alert" className="erro">{erro}</p>}
            <button className="acao-principal" disabled={entrando} type="submit">
              {entrando ? 'Autenticando...' : 'Entrar no sistema →'}
            </button>
          </form>
          <p className="nota-seguranca">Sua sessão é validada pela API. Não há dados de folha armazenados neste navegador.</p>
        </div>
      </section>
    </main>
  );

  return (
    <div className="aplicacao">
      <aside className="barra-lateral">
        <div className="marca"><span className="logo-marca">OF</span>
          <span><strong>OdontoFolha</strong><small>Grupo Odontoart</small></span>
        </div>
        <div className="grupo-navegacao">
          <p>ESPAÇO DE TRABALHO</p>
          <button className={aba === 'Painel' ? 'ativo' : ''}
            onClick={() => navegar('Painel')}>▤ <span>Competências</span></button>
          {permiteDp(sessao!.perfil) && <button className={aba === 'Cadastros' ? 'ativo' : ''}
            onClick={() => navegar('Cadastros')}>♙ <span>Cadastros</span></button>}
          {permiteDp(sessao!.perfil) && <button className={aba === 'Configuração' ? 'ativo' : ''}
            onClick={() => navegar('Configuração')}>◇ <span>Benefícios e comissões</span></button>}
          {permiteDp(sessao!.perfil) &&
            <button className={aba === 'Consolidação' ? 'ativo' : ''}
              onClick={() => navegar('Consolidação')}>▦ <span>Consolidação</span></button>}
          <button className={aba === 'Configurações' ? 'ativo' : ''}
            onClick={() => navegar('Configurações')}>⚙ <span>Configurações</span></button>
        </div>
        <div className="rodape-lateral">
          <div className="perfil-atual">
            <div className="circulo-perfil">{sessao!.perfil.slice(0, 2)}</div>
            <span><strong>Perfil {sessao!.perfil}</strong><small>Sessão autenticada</small></span>
          </div>
          <button type="button" className="sair-lateral" onClick={() => void sair()}
            aria-label="Sair da conta" title="Sair da conta">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3"/>
              <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>
            </svg>
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

        </header>
        <div className="conteudo-app">
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
                    <small>Revisão {c.revisao} · Abrir detalhes</small>
                    <span className="seta-competencia">↗</span>
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
                <div><span className="sobre">CONSOLIDADO · {consolidado.revisao}ª REVISÃO</span>
                  <h2>{nomeMes(consolidado.competencia.ano, consolidado.competencia.mes)}</h2>
                  <p>Salário contratual + proventos monetários − descontos monetários.</p>
                </div>
                <div className="acoes-secao consolidacao-acoes">
                  <label className="filtro-funcionario busca-cabecalho">Buscar funcionário
                    <input type="search" value={buscaFuncionarioConsolidacao}
                      onChange={evento => setBuscaFuncionarioConsolidacao(evento.target.value)}
                      placeholder="Digite o nome ou CPF" autoComplete="off" />
                  </label>
                  <button className="botao-secundario" onClick={() => navegar('Painel')}>← Voltar</button>
                  <a className="acao-principal" href={'/api/competencias/' +
                    encodeURIComponent(competenciaSelecionada ?? '') + '/exportacao.xlsx'}>
                    ↓ Exportar XLSX
                  </a>
                </div>
              </div>
              {!!(consolidado.envios ?? []).filter(envio => envio.responsavel !== 'NENHUM').length &&
                <details className="envios-consolidacao">
                  <summary>Envios de comissões · {(consolidado.envios ?? []).filter(envio =>
                    envio.responsavel !== 'NENHUM').length}</summary>
                  <div className="lista-envios-consolidacao">
                    {(consolidado.envios ?? []).filter(envio => envio.responsavel !== 'NENHUM')
                      .map(envio => <div key={envio.grupoId} className="feedback">
                        <strong>{consolidado.colunas.find(c => c.grupoId === envio.grupoId)?.grupoNome ?? 'Comissão'}</strong>
                        {' · '}{envio.responsavel} · {envio.concluido ? 'Concluída' : 'Pendente'}
                        {envio.concluido && <button className="botao-secundario" disabled={salvando}
                          onClick={() => void reabrirComissao(envio.grupoId)}>Reabrir comissão</button>}
                      </div>)}
                  </div>
                </details>}
              <p className="orientacao-tabela">Edição: use o lápis. Enter/Tab salva; Esc desfaz. Pendências ficam em branco; zero é explícito.</p>
              <details className="edicao-massa" aria-label="Aplicar o mesmo valor a vários funcionários">
                <summary className="edicao-massa-resumo">
                  <strong>Edição em massa</strong>
                  <span>{selecionadosMassa.length} funcionário(s) selecionado(s)</span>
                </summary>
                <div className="edicao-massa-conteudo">
                <div className="edicao-massa-topo">
                  <button type="button" className="botao-secundario" disabled={salvando}
                    onClick={() => setSelecionadosMassa(consolidado.abas.flatMap(a =>
                      a.funcionarios.filter(l => !campoMassaId ||
                        l.celulas[campoMassaId]?.situacao !== 'nao_aplicavel')
                        .map(l => l.funcionario.id)))}>Selecionar todos</button>
                  <button type="button" className="botao-secundario" disabled={salvando}
                    onClick={() => setSelecionadosMassa([])}>Limpar selecao</button>
                </div>
                <label>Campo
                  <select value={campoMassaId} disabled={salvando}
                    onChange={evento => { setCampoMassaId(evento.target.value); setValorMassa(''); }}>
                    <option value="">Selecione beneficio ou comissao</option>
                    {consolidado.colunas.map(c => <option key={c.id} value={c.id}>{c.grupoNome} - {c.nome}</option>)}
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
              </details>
              <div className="rolagem-tabela"><table className="tabela-principal">
                <thead><tr>
                  <th scope="col"><span className="sr-only">Selecionar funcionarios</span></th>
                  <th>Empresa Contratante</th><th>Empresa Lotado</th>
                  <th>Setor de Lotação</th><th>CPF</th><th>Nome</th>
                  <th>Cargo</th><th>Admissão</th><th>Salário Contratual</th>
                  {consolidado.colunas.map(c => <th key={c.id}
                    className={c.origem === 'BENEFICIO' ? 'th-beneficio' : 'th-comissao'}>
                    {c.grupoNome}<span>{c.nome}</span></th>)}
                  <th>Total aritmético</th><th>Ação</th>
                </tr></thead>
                <tbody>{linhasConsolidacaoFiltradas.map(({ linha }) => (
                    <tr key={linha.funcionario.id}>
                      <td><input type="checkbox" aria-label={'Selecionar ' + linha.funcionario.nome}
                        checked={selecionadosMassa.includes(linha.funcionario.id)} disabled={salvando}
                        onChange={evento => setSelecionadosMassa(atual => evento.target.checked
                          ? [...atual, linha.funcionario.id] : atual.filter(id => id !== linha.funcionario.id))} /></td>
                      <td>{consolidado.nomes.empresas[linha.funcionario.empresaContratanteId] ?? 'Empresa não identificada'}</td>
                      <td>{consolidado.nomes.empresas[linha.funcionario.empresaLotadoId] ?? 'Empresa não identificada'}</td>
                      <td>{consolidado.nomes.setores[linha.funcionario.setorLotacaoId] ?? 'Setor não identificado'}</td>
                      <td className="codigo">{linha.funcionario.cpf}</td>
                      <td className="nome-pessoa">{linha.funcionario.nome}</td>
                      <td>{linha.funcionario.cargo}</td>
                      <td>{linha.funcionario.admissao}</td>
                      <td className="moeda">{dinheiro(linha.funcionario.salarioContratual)}</td>
                      {consolidado.colunas.map(c => {
                        const cel = linha.celulas[c.id];
                        const valor = cel?.valor === null || cel?.valor === undefined
                          ? '' : String(cel.valor);
                        const alteravel = editando === linha.funcionario.id &&
                          cel?.situacao !== 'nao_aplicavel';
                        return <td key={c.id} className="celula-dinamica">
                          {alteravel ? (
                            <span className="editor-valor-mascarado">
                            <input aria-label={c.nome + ' de ' + linha.funcionario.nome}
                              className="editor-celula" key={consolidado.revisao + ':' + c.id}
                              type={c.tipo === 'data' ? 'date' : c.tipo === 'horario' ? 'time' : 'text'}
                              inputMode={c.tipo === 'moeda' || c.tipo === 'percentual' ? 'decimal' : undefined}
                              defaultValue={c.tipo === 'moeda' || c.tipo === 'percentual'
                                ? mascaraFinal(valor, c.tipo) : valor} disabled={salvando}
                              onFocus={e => {
                                if (c.tipo === 'moeda' || c.tipo === 'percentual')
                                  prepararMascaraParaEdicao(e.currentTarget);
                              }}
                              onChange={e => {
                                if (c.tipo === 'moeda' || c.tipo === 'percentual')
                                  atualizarMascaraComCursor(e.currentTarget,
                                    c.tipo as 'moeda' | 'percentual');
                              }}
                              onBlur={e => {
                                const entrada = c.tipo === 'moeda' || c.tipo === 'percentual'
                                  ? mascaraFinal(e.currentTarget.value, c.tipo) : e.currentTarget.value;
                                e.currentTarget.value = entrada;
                                void salvarCelula(linha, c, entrada);
                              }}
                              onKeyDown={e => teclaCelula(e, valor)} />
                            </span>
                          ) : cel?.situacao === 'nao_aplicavel'
                            ? (editando === linha.funcionario.id
                              ? <button className="botao-secundario" disabled={salvando}
                                onClick={() => void vincularCelula(linha.funcionario.id, c.id)}>
                                Vincular
                              </button>
                              : <span className="nao-aplicavel">—</span>)
                            : cel?.situacao === 'pendente' ? <span className="pendente">Pendente</span>
                              : c.tipo === 'moeda' && typeof cel.valor === 'number'
                                ? dinheiro(cel.valor) : String(cel?.valor ?? '')}
                        </td>;
                      })}
                      <td className="moeda forte">{dinheiro(linha.totalAritmetico)}
                        {linha.parcial && <span className="parcial">Parcial</span>}</td>
                      <td><button className="botao-editar" disabled={salvando}
                        aria-label={'Editar linha de ' + linha.funcionario.nome}
                        onClick={() => setEditando(editando === linha.funcionario.id
                          ? null : linha.funcionario.id)}>
                        {editando === linha.funcionario.id ? 'Concluir' : '✎'}
                      </button></td>
                    </tr>))}
                  {!linhasConsolidacaoFiltradas.length && <tr>
                    <td colSpan={11 + consolidado.colunas.length} className="config-linha-vazia">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>}
                </tbody>
                <tfoot>{consolidado.abas.map(empresa => <tr key={empresa.empresaContratanteId}>
                  <td colSpan={9 + consolidado.colunas.length}>Total por empresa {consolidado.nomes.empresas[empresa.empresaContratanteId] ?? 'Não identificada'}
                    {empresa.parcial ? ' (parcial)' : ''}</td>
                  <td className="moeda forte">{dinheiro(empresa.totalAritmetico)}</td>
                  <td></td>
                </tr>)}</tfoot>
              </table></div>
              <p className="legenda-rodape">Resultado exclusivamente aritmético. Não representa salário líquido oficial.</p>
            </section>
          )}
        </div>
        <footer className="rodape-app">OdontoFolha · Grupo Odontoart · Uso interno e restrito</footer>
      </div>
    </div>
  );
}
