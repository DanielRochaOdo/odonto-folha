'use client';

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import Cadastros from './componentes/Cadastros';
import ConfigCampos from './componentes/ConfigCampos';
import PainelSetor from './componentes/PainelSetor';

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
type AbaNavegacao = 'Painel' | 'Cadastros' | 'Configuração' | 'Consolidação';

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
            ? 'A API de autenticação ainda não foi ativada na porta 3001.'
            : resposta.status === 403
              ? 'A requisição de login foi recusada. Verifique a origem e a configuração da API.'
              : resposta.status >= 500
                ? 'A API apresentou um erro ao autenticar. Confira o terminal da porta 3001.'
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
    if (anterior?.quantidadeParcelas && !window.confirm(
      'Substituir as parcelas pelo total direto, preservando o histórico?')) return;
    const valor = campo.tipo === 'moeda' || campo.tipo === 'percentual'
      ? Number(entrada) : entrada;
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
            onClick={() => setAba('Painel')}>▤ <span>Competências</span></button>
          {permiteDp(sessao!.perfil) && <button className={aba === 'Cadastros' ? 'ativo' : ''}
            onClick={() => setAba('Cadastros')}>♙ <span>Cadastros</span></button>}
          {permiteDp(sessao!.perfil) && <button className={aba === 'Configuração' ? 'ativo' : ''}
            onClick={() => setAba('Configuração')}>◇ <span>Benefícios e comissões</span></button>}
          {permiteDp(sessao!.perfil) &&
            <button className={aba === 'Consolidação' ? 'ativo' : ''}
              onClick={() => setAba('Consolidação')}>▦ <span>Consolidação</span></button>}
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
            <h1>{aba === 'Painel' ? 'Competências' : aba === 'Cadastros' ? 'Cadastros' : aba === 'Configuração' ? 'Benefícios e comissões' : 'Consolidação mensal'}</h1></div>

        </header>
        <div className="conteudo-app">
          {erro && <p role="alert" className="erro alerta-app">{erro}</p>}
          {feedback && <p role="status" className="feedback">{feedback}</p>}
          {!permiteDp(sessao!.perfil) ? (
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
              <button className="botao-secundario" onClick={() => setAba('Painel')}>Ver competências</button>
            </section>
          ) : (
            <section className="painel-app">
              <div className="titulo-secao">
                <div><span className="sobre">CONSOLIDADO · {consolidado.revisao}ª REVISÃO</span>
                  <h2>{nomeMes(consolidado.competencia.ano, consolidado.competencia.mes)}</h2>
                  <p>Salário contratual + proventos monetários − descontos monetários.</p>
                </div>
                <div className="acoes-secao">
                  <button className="botao-secundario" onClick={() => setAba('Painel')}>← Voltar</button>
                  <a className="acao-principal" href={'/api/competencias/' +
                    encodeURIComponent(competenciaSelecionada ?? '') + '/exportacao.xlsx'}>
                    ↓ Exportar XLSX
                  </a>
                </div>
              </div>
              {consolidado.envios?.filter(envio => envio.responsavel !== 'NENHUM')
                .map(envio => <div key={envio.grupoId} className="feedback">
                  <strong>{consolidado.colunas.find(c => c.grupoId === envio.grupoId)?.grupoNome ?? 'Comissão'}</strong>
                  {' · '}{envio.responsavel} · {envio.concluido ? 'Concluída' : 'Pendente'}
                  {envio.concluido && <button className="botao-secundario" disabled={salvando}
                    onClick={() => void reabrirComissao(envio.grupoId)}>Reabrir comissão</button>}
                </div>)}
              <p className="orientacao-tabela">Selecione o lápis ao final de uma linha para editar.
                Pressione Enter ou Tab para salvar e Esc para desfazer antes de sair do campo.
                Valores pendentes aparecem em branco; zero é informado explicitamente.</p>
              <div className="rolagem-tabela"><table className="tabela-principal">
                <thead><tr>
                  <th>Empresa Contratante</th><th>Empresa Lotado</th>
                  <th>Setor de Lotação</th><th>CPF</th><th>Nome</th>
                  <th>Cargo</th><th>Admissão</th><th>Salário Contratual</th>
                  {consolidado.colunas.map(c => <th key={c.id}
                    className={c.origem === 'BENEFICIO' ? 'th-beneficio' : 'th-comissao'}>
                    {c.grupoNome}<span>{c.nome}</span></th>)}
                  <th>Total aritmético</th><th>Ação</th>
                </tr></thead>
                <tbody>{consolidado.abas.flatMap(empresa =>
                  empresa.funcionarios.map(linha => (
                    <tr key={linha.funcionario.id}>
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
                            <input aria-label={c.nome + ' de ' + linha.funcionario.nome}
                              className="editor-celula" key={consolidado.revisao + ':' + c.id}
                              type={c.tipo === 'data' ? 'date' : c.tipo === 'horario' ? 'time'
                                : c.tipo === 'moeda' || c.tipo === 'percentual' ? 'number' : 'text'}
                              step="0.01" defaultValue={valor} disabled={salvando}
                              onBlur={e => void salvarCelula(linha, c, e.target.value)}
                              onKeyDown={e => teclaCelula(e, valor)} />
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
                    </tr>)))}
                </tbody>
                <tfoot>{consolidado.abas.map(empresa => <tr key={empresa.empresaContratanteId}>
                  <td colSpan={8 + consolidado.colunas.length}>Total por empresa {consolidado.nomes.empresas[empresa.empresaContratanteId] ?? 'Não identificada'}
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
