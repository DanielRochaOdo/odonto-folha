'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent,
  type KeyboardEvent } from 'react';
import { PencilSquareIcon, UserMinusIcon } from '@heroicons/react/24/outline';
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
};
type Cadastro = {
  empresas: Empresa[]; setores: Setor[]; funcionarios: Funcionario[];
};
type NovoFuncionario = Omit<Funcionario, 'id' | 'ativo'>;
const vazio: NovoFuncionario = {
  nome: '', cpf: '', cargo: '', admissao: '',
  salarioContratual: 0, empresaContratanteId: '', empresaLotadoId: '', setorLotacaoId: '',
};
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
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

export default function Cadastros() {
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
  const dialogoNovoRef = useRef<HTMLDivElement>(null);
  const botaoNovoRef = useRef<HTMLButtonElement>(null);
  const [filtro, setFiltro] = useState('');
  const [incluiInativos, setIncluiInativos] = useState(false);
  const [editandoMovimentacao, setEditandoMovimentacao] = useState<Funcionario | null>(null);
  const [mesMovimento, setMesMovimento] = useState(new Date().toISOString().slice(0, 7));
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
      await atualizar();
      setAviso(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
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
    setMostrarNovo(true);
    void carregarGruposNovo();
  }
  function fecharNovoFuncionario() {
    if (ocupadoNovo) return;
    setMostrarNovo(false);
    setNovoFuncionario(vazio);
    setSalarioNovoTexto('');
    setGruposSelecionadosNovo([]);
    setBuscaGrupoNovo('');
    setPassoNovoFuncionario(1);
    setErroNovo('');
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
      const resultado = await enviar<{ id: string; gruposVinculados: number }>(
        '/api/cadastros/funcionarios', {
          ...novoFuncionario, cpf, salarioContratual, gruposIds: gruposSelecionadosNovo,
        });
      setMostrarNovo(false);
      setNovoFuncionario(vazio);
      setSalarioNovoTexto('');
      setGruposSelecionadosNovo([]);
      setAviso(`Vínculo empregatício criado com ${resultado.gruposVinculados} benefício(s) ou comissão(ões) vinculado(s).`);
      try { await atualizar(); }
      catch { setErro('Funcionário salvo, mas a atualização da lista falhou. Recarregue a página.'); }
      window.requestAnimationFrame(() => botaoNovoRef.current?.focus());
    } catch (e) {
      setErroNovo(e instanceof Error ? e.message : 'Não foi possível salvar o funcionário.');
    } finally {
      setOcupadoNovo(false);
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
  function iniciarMovimentacao(f: Funcionario) {
    setEditandoMovimentacao(f);
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
    await executar(() => enviar('/api/cadastros/movimentacoes',
      { vinculoId: editandoMovimentacao.id, ano, mes, ...movimento }),
      'Movimentação registrada com vigência ' + mesMovimento);
    setEditandoMovimentacao(null);
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
            <p className="config-modal-etapa">Etapa {passoNovoFuncionario} de 2</p>
            <h3 id="novo-funcionario-titulo">Novo vínculo empregatício</h3>
            <p id="novo-funcionario-ajuda">{passoNovoFuncionario === 1
              ? 'Dados do funcionário' : 'Benefícios e comissões vinculados'}</p>
          </div>
          <button type="button" className="config-modal-fechar" onClick={fecharNovoFuncionario}
            aria-label="Fechar cadastro" disabled={ocupadoNovo}>×</button>
        </div>
        <ol className="config-progresso config-progresso-duas-etapas" aria-label="Etapas do cadastro">
          <li className={passoNovoFuncionario === 1 ? 'atual' : 'feito'}
            aria-current={passoNovoFuncionario === 1 ? 'step' : undefined}>
            <span>1</span><small>Dados do funcionário</small>
          </li>
          <li className={passoNovoFuncionario === 2 ? 'atual' : ''}
            aria-current={passoNovoFuncionario === 2 ? 'step' : undefined}>
            <span>2</span><small>Benefícios e comissões</small>
          </li>
        </ol>
        <form onSubmit={e => void cadastrarFuncionario(e)}>
          <div className="config-modal-corpo">
            {passoNovoFuncionario === 1 ? <>
              <p>Preencha os dados básicos. Recontratações reutilizam a pessoa identificada pelo CPF.</p>
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
