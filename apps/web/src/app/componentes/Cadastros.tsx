'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PencilSquareIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import { formatarData } from '../datas';

type Empresa = { id: string; nome: string; ativa: boolean };
type Setor = { id: string; nome: string; ativo: boolean };
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
  const [mostrarNovo, setMostrarNovo] = useState(false);
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
  async function cadastrarFuncionario(evento: FormEvent) {
    evento.preventDefault();
    if (!/^\d{11}$/.test(novoFuncionario.cpf)) {
      setErro('CPF deve conter 11 dígitos, com os dígitos verificadores corretos.');
      return;
    }
    await executar(() => enviar('/api/cadastros/funcionarios', novoFuncionario),
      'Vínculo empregatício criado');
    setMostrarNovo(false); setNovoFuncionario(vazio);
  }
  const filtrar = dados.funcionarios.filter(f => (incluiInativos || f.ativo) &&
    (f.nome + ' ' + f.cpf + ' ' + f.cargo).toLowerCase().includes(filtro.toLowerCase()));
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
      <button className="acao-principal" onClick={() => setMostrarNovo(!mostrarNovo)}>
        {mostrarNovo ? 'Cancelar' : '+ Novo funcionário'}
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
    {mostrarNovo && <form className="painel-app formulario-cadastro"
      onSubmit={e => void cadastrarFuncionario(e)}>
      <h3>Novo vínculo empregatício</h3>
      <p>Recontratações reutilizam a pessoa identificada pelo CPF e criam um vínculo novo.</p>
      <div className="grade-formulario">
        {([
          ['nome', 'Nome completo', 'text'],
          ['cpf', 'CPF (somente números)', 'text'],
          ['cargo', 'Cargo', 'text'],
          ['admissao', 'Data de admissão', 'date'],
          ['salarioContratual', 'Salário contratual (R$)', 'number'],
        ] as const).map(([chave, rotulo, tipo]) => <label key={chave}>{rotulo}
          <input required type={tipo} value={novoFuncionario[chave]}
            maxLength={chave === 'cpf' ? 11 : undefined}
            step={tipo === 'number' ? '0.01' : undefined}
            min={tipo === 'number' ? '0' : undefined}
            onChange={e => setNovoFuncionario(s => ({
              ...s, [chave]: tipo === 'number' ? Number(e.target.value) : e.target.value,
            }))} />
        </label>)}
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
      <button type="submit" className="acao-principal">Salvar vínculo</button>
    </form>}
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
        <div className="rolagem-tabela"><table className="tabela-principal">
          <thead><tr><th>Nome</th><th>CPF</th><th>Empresa contratante</th>
            <th>Empresa lotado</th><th>Setor</th><th>Cargo</th><th>Admissão</th>
            <th>Salário</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{filtrar.map(f => <tr key={f.id}>
            <td className="nome-pessoa">{f.nome}</td><td className="codigo">{f.cpf}</td>
            <td>{nomeDa(dados.empresas, f.empresaContratanteId)}</td>
            <td>{nomeDa(dados.empresas, f.empresaLotadoId)}</td>
            <td>{nomeDa(dados.setores, f.setorLotacaoId)}</td>
            <td>{f.cargo}</td><td>{formatarData(f.admissao)}</td>
            <td className="moeda">{reais.format(f.salarioContratual)}</td>
            <td>{f.ativo ? 'Ativo' : 'Inativo'}</td>
            <td className="celula-acoes-cadastro"><div className="acoes-cadastro">
              {f.ativo && <>
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
              </>}
            </div></td></tr>)}</tbody>
        </table></div>}
    </section>
  </section>;
}
