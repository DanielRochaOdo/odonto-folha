'use client';

import { useEffect, useMemo, useState } from 'react';

type Funcionario = { id: string; contratante: string; lotado: string; setor: string; cpf: string; nome: string; cargo: string; admissao: string; salario: number; ativo: boolean };
type Campo = { id: string; nome: string; modulo: 'Benefício' | 'Comissão'; natureza: 'Provento' | 'Desconto'; ativo: boolean };
type Dados = { funcionarios: Funcionario[]; campos: Campo[]; valores: Record<string, string> };
type Aba = 'Visão geral' | 'Funcionários' | 'Benefícios' | 'Comissões' | 'Consolidação';
const CHAVE = 'odontofolha-prototipo-v1';
const moeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const id = () => crypto.randomUUID();
const inicial: Dados = {
  funcionarios: [
    { id: 'f1', contratante: 'Odontoart Serviços', lotado: 'Odontoart Centro', setor: 'Clínica', cpf: '00000000000', nome: 'Ana Oliveira (fictícia)', cargo: 'Recepcionista', admissao: '2025-02-10', salario: 2200, ativo: true },
    { id: 'f2', contratante: 'Odontoart Serviços', lotado: 'Odontoart Centro', setor: 'Administrativo', cpf: '11111111111', nome: 'Bruno Santos (fictício)', cargo: 'Assistente', admissao: '2024-08-01', salario: 2800, ativo: true },
    { id: 'f3', contratante: 'Odontoart Clínicas', lotado: 'Odontoart Sul', setor: 'Atendimento', cpf: '22222222222', nome: 'Carla Lima (fictícia)', cargo: 'Atendente', admissao: '2026-01-15', salario: 2400, ativo: true },
  ],
  campos: [
    { id: 'c1', nome: 'Vale-alimentação', modulo: 'Benefício', natureza: 'Provento', ativo: true },
    { id: 'c2', nome: 'Desconto transporte', modulo: 'Benefício', natureza: 'Desconto', ativo: true },
    { id: 'c3', nome: 'Comissão de atendimento', modulo: 'Comissão', natureza: 'Provento', ativo: true },
  ],
  valores: {},
};
const abas: Aba[] = ['Visão geral', 'Funcionários', 'Benefícios', 'Comissões', 'Consolidação'];
const valorChave = (competencia: string, funcionario: string, campo: string) => [competencia, funcionario, campo].join(':');
function exportarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = '\uFEFF' + linhas.map(linha => linha.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function PaginaInicial() {
  const [dados, setDados] = useState<Dados>(inicial);
  const [carregado, setCarregado] = useState(false);
  const [aba, setAba] = useState<Aba>('Visão geral');
  const [competencia, setCompetencia] = useState('2026-10');
  const [busca, setBusca] = useState('');
  const [mostrarFuncionario, setMostrarFuncionario] = useState(false);
  const [mostrarCampo, setMostrarCampo] = useState<'Benefício' | 'Comissão' | null>(null);
  const [func, setFunc] = useState({ nome: '', cpf: '', cargo: '', contratante: '', lotado: '', setor: '', admissao: '', salario: '' });
  const [campo, setCampo] = useState({ nome: '', natureza: 'Provento' as 'Provento' | 'Desconto' });
  useEffect(() => {
    try { const salvo = localStorage.getItem(CHAVE); if (salvo) setDados(JSON.parse(salvo) as Dados); } catch { /* dados locais inválidos: manter demonstração */ }
    setCarregado(true);
  }, []);
  useEffect(() => { if (carregado) localStorage.setItem(CHAVE, JSON.stringify(dados)); }, [dados, carregado]);
  const ativos = useMemo(() => dados.funcionarios.filter(f => f.ativo && (f.nome + f.cpf + f.setor).toLowerCase().includes(busca.toLowerCase())), [dados.funcionarios, busca]);
  const camposAtivos = dados.campos.filter(c => c.ativo);
  const obter = (f: string, c: string) => dados.valores[valorChave(competencia, f, c)] ?? '';
  const alterar = (f: string, c: string, valor: string) => setDados(d => ({ ...d, valores: { ...d.valores, [valorChave(competencia, f, c)]: valor } }));
  const total = (f: Funcionario) => f.salario + camposAtivos.reduce((s, c) => s + (c.natureza === 'Provento' ? 1 : -1) * (Number(obter(f.id, c.id)) || 0), 0);
  const massa = ativos.reduce((s, f) => s + total(f), 0);
  const exportar = () => {
    const cabecalho = ['Empresa Contratante', 'Empresa Lotado', 'Setor de Lotação', 'CPF', 'Nome', 'Cargo', 'Admissão', 'Salário Contratual', ...camposAtivos.map(c => c.nome), 'Total aritmético'];
    const empresas = [...new Set(ativos.map(f => f.contratante))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const linhas: (string | number)[][] = [cabecalho];
    for (const empresa of empresas) {
      for (const f of ativos.filter(x => x.contratante === empresa)) {
        linhas.push([f.contratante, f.lotado, f.setor, f.cpf, f.nome, f.cargo, f.admissao, f.salario, ...camposAtivos.map(c => obter(f.id, c.id)), total(f)]);
      }
    }
    exportarCsv('odontofolha-' + competencia + '-PREVIA.csv', linhas);
  };
  const salvarFuncionario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!func.nome.trim() || !func.cpf.match(/^\d{11}$/) || !func.contratante.trim() || !func.salario) return;
    setDados(d => ({ ...d, funcionarios: [...d.funcionarios, { id: id(), nome: func.nome, cpf: func.cpf, cargo: func.cargo, contratante: func.contratante, lotado: func.lotado || func.contratante, setor: func.setor, admissao: func.admissao, salario: Number(func.salario), ativo: true }] }));
    setMostrarFuncionario(false); setFunc({ nome: '', cpf: '', cargo: '', contratante: '', lotado: '', setor: '', admissao: '', salario: '' });
  };
  const salvarCampo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campo.nome.trim() || !mostrarCampo) return;
    setDados(d => ({ ...d, campos: [...d.campos, { id: id(), nome: campo.nome, modulo: mostrarCampo, natureza: campo.natureza, ativo: true }] }));
    setMostrarCampo(null); setCampo({ nome: '', natureza: 'Provento' });
  };
  return <div className="app">
    <aside className="lateral">
      <div className="identidade"><span className="logo">O</span><div><strong>OdontoFolha</strong><small>Grupo Odontoart</small></div></div>
      <p className="menu-legenda">ESPAÇO DE TRABALHO</p>
      <nav>{abas.map(a => <button key={a} className={'nav ' + (aba === a ? 'selecionado' : '')} onClick={() => setAba(a)}>{a === 'Visão geral' ? '◫' : a === 'Funcionários' ? '♙' : a === 'Benefícios' ? '◇' : a === 'Comissões' ? '◎' : '▦'} <span>{a}</span></button>)}</nav>
      <div className="rodape-lateral"><span className="avatar">AD</span><div><strong>Ambiente de prévia</strong><small>Sem autenticação real</small></div></div>
    </aside>
    <main className="principal">
      <header className="cabecalho"><div><span className="sobretitulo">PAINEL DE GESTÃO</span><h1>{aba}</h1></div><div className="acoes"><label className="competencia-label">Competência <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} /></label></div></header>
      <div className="aviso-preview"><strong>PRÉVIA FUNCIONAL · DADOS FICTÍCIOS</strong><span>Salvamento somente neste navegador. Sem login, banco Neon ou exportação XLSX. Não insira dados pessoais reais.</span></div>
      {aba === 'Visão geral' && <><section className="indicadores">
        <article className="indicador"><span>Colaboradores ativos</span><strong>{dados.funcionarios.filter(f => f.ativo).length}</strong><small>Vínculos na prévia</small></article>
        <article className="indicador"><span>Salários contratuais</span><strong>{moeda(dados.funcionarios.filter(f => f.ativo).reduce((s, f) => s + f.salario, 0))}</strong><small>Base da competência</small></article>
        <article className="indicador"><span>Total aritmético</span><strong>{moeda(massa)}</strong><small>Salários + proventos − descontos</small></article>
        <article className="indicador"><span>Campos configurados</span><strong>{camposAtivos.length}</strong><small>Benefícios e comissões</small></article>
      </section><section className="painel"><div className="painel-titulo"><div><h2>Competência {competencia.split('-').reverse().join('/')}</h2><p>Registre lançamentos e confira os valores consolidados.</p></div><button className="primario" onClick={() => setAba('Consolidação')}>Abrir consolidação →</button></div><div className="atalhos"><button onClick={() => setAba('Funcionários')}>♙ Gerenciar funcionários <span>→</span></button><button onClick={() => setAba('Benefícios')}>◇ Configurar benefícios <span>→</span></button><button onClick={() => setAba('Comissões')}>◎ Registrar comissões <span>→</span></button></div></section></>}
      {aba === 'Funcionários' && <section className="painel"><div className="painel-titulo"><div><h2>Cadastro de funcionários</h2><p>Gerencie os vínculos ativos da demonstração.</p></div><button className="primario" onClick={() => setMostrarFuncionario(true)}>+ Novo funcionário</button></div><div className="filtros"><input placeholder="Buscar por nome, CPF ou setor" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="tabela-scroll"><table><thead><tr><th>Nome</th><th>CPF</th><th>Empresa contratante</th><th>Lotação</th><th>Cargo</th><th>Salário</th><th>Ação</th></tr></thead><tbody>{ativos.map(f => <tr key={f.id}><td><strong>{f.nome}</strong></td><td>{f.cpf}</td><td>{f.contratante}</td><td>{f.setor}</td><td>{f.cargo}</td><td>{moeda(f.salario)}</td><td><button className="texto-botao" onClick={() => setDados(d => ({ ...d, funcionarios: d.funcionarios.map(x => x.id === f.id ? { ...x, ativo: false } : x) }))}>Inativar</button></td></tr>)}</tbody></table></div></section>}
      {(aba === 'Benefícios' || aba === 'Comissões') && <section className="painel"><div className="painel-titulo"><div><h2>Campos de {aba.toLowerCase()}</h2><p>Crie campos e registre valores por funcionário e competência.</p></div><button className="primario" onClick={() => setMostrarCampo(aba === 'Benefícios' ? 'Benefício' : 'Comissão')}>+ Novo campo</button></div><div className="campos-lista">{dados.campos.filter(c => c.modulo === (aba === 'Benefícios' ? 'Benefício' : 'Comissão')).map(c => <div className="campo-item" key={c.id}><div><strong>{c.nome}</strong><small>{c.natureza} · {c.ativo ? 'Ativo' : 'Inativo'}</small></div><button className="secundario" onClick={() => setDados(d => ({ ...d, campos: d.campos.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x) }))}>{c.ativo ? 'Desativar' : 'Ativar'}</button></div>)}</div><div className="painel-titulo"><div><h2>Lançamentos da competência</h2><p>Valores são salvos automaticamente neste navegador.</p></div></div><div className="tabela-scroll"><table><thead><tr><th>Funcionário</th>{dados.campos.filter(c => c.ativo && c.modulo === (aba === 'Benefícios' ? 'Benefício' : 'Comissão')).map(c => <th key={c.id}>{c.nome}</th>)}</tr></thead><tbody>{ativos.map(f => <tr key={f.id}><td><strong>{f.nome}</strong></td>{dados.campos.filter(c => c.ativo && c.modulo === (aba === 'Benefícios' ? 'Benefício' : 'Comissão')).map(c => <td key={c.id}><input className="valor" type="number" step="0.01" placeholder="Pendente" value={obter(f.id, c.id)} onChange={e => alterar(f.id, c.id, e.target.value)} /></td>)}</tr>)}</tbody></table></div></section>}
      {aba === 'Consolidação' && <section className="painel"><div className="painel-titulo"><div><h2>Consolidado mensal</h2><p>Salário + proventos − descontos. Não representa salário líquido oficial.</p></div><button className="primario" onClick={exportar}>↓ Exportar CSV de prévia</button></div><div className="filtros"><input placeholder="Buscar funcionário" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="tabela-scroll"><table><thead><tr><th>Empresa</th><th>Funcionário</th><th>Salário</th>{camposAtivos.map(c => <th key={c.id}>{c.nome}<small>{c.natureza}</small></th>)}<th>Total</th></tr></thead><tbody>{ativos.map(f => <tr key={f.id}><td>{f.contratante}</td><td><strong>{f.nome}</strong></td><td>{moeda(f.salario)}</td>{camposAtivos.map(c => <td key={c.id}><input aria-label={c.nome + ' de ' + f.nome} className="valor" type="number" step="0.01" placeholder="Pendente" value={obter(f.id, c.id)} onChange={e => alterar(f.id, c.id, e.target.value)} /></td>)}<td><strong>{moeda(total(f))}</strong></td></tr>)}</tbody><tfoot><tr><td colSpan={3 + camposAtivos.length}>Total da competência</td><td>{moeda(massa)}</td></tr></tfoot></table></div></section>}
      <footer className="rodape">OdontoFolha · Prévia navegável local · Não utilizar para folha real</footer>
    </main>
    {(mostrarFuncionario || mostrarCampo) && <div className="overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true"><div className="painel-titulo"><h2>{mostrarFuncionario ? 'Novo funcionário' : 'Novo campo'}</h2><button className="texto-botao" onClick={() => { setMostrarFuncionario(false); setMostrarCampo(null); }}>Fechar ×</button></div>{mostrarFuncionario ? <form onSubmit={salvarFuncionario} className="formulario">{([['nome','Nome completo'],['cpf','CPF (11 dígitos)'],['cargo','Cargo'],['contratante','Empresa contratante'],['lotado','Empresa lotado'],['setor','Setor de lotação'],['admissao','Data de admissão'],['salario','Salário contratual']] as const).map(([k, titulo]) => <label key={k}>{titulo}<input required={['nome','cpf','contratante','salario'].includes(k)} type={k === 'admissao' ? 'date' : k === 'salario' ? 'number' : 'text'} min={k === 'salario' ? '0' : undefined} step={k === 'salario' ? '0.01' : undefined} value={func[k]} onChange={e => setFunc(x => ({ ...x, [k]: e.target.value }))} /></label>)}<button className="primario" type="submit">Salvar funcionário</button></form> : <form onSubmit={salvarCampo} className="formulario"><label>Nome do campo<input required value={campo.nome} onChange={e => setCampo(x => ({ ...x, nome: e.target.value }))} /></label><label>Natureza<select value={campo.natureza} onChange={e => setCampo(x => ({ ...x, natureza: e.target.value as 'Provento' | 'Desconto' }))}><option>Provento</option><option>Desconto</option></select></label><button className="primario" type="submit">Salvar campo</button></form>}</div></div>}
  </div>;
}
