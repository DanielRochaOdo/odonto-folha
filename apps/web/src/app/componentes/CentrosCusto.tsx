'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type CentroCusto = { id: string; nome: string; ativo: boolean };

async function mensagemResposta(resposta: Response): Promise<string> {
  try {
    const dados: unknown = await resposta.json();
    if (dados && typeof dados === 'object' && 'erro' in dados && typeof dados.erro === 'string')
      return dados.erro;
  } catch { /* Usa a mensagem padrão. */ }
  return 'Não foi possível concluir a operação.';
}

export default function CentrosCusto() {
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [nomeNovo, setNomeNovo] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async (signal?: AbortSignal) => {
    const resposta = await fetch('/api/configuracao/centros-custo', {
      cache: 'no-store', credentials: 'include', signal,
    });
    if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
    const dados = await resposta.json() as { centrosCusto: CentroCusto[] };
    setCentros(dados.centrosCusto);
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    void fetch('/api/configuracao/centros-custo', {
      cache: 'no-store', credentials: 'include', signal: controle.signal,
    }).then(async resposta => {
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      return resposta.json() as Promise<{ centrosCusto: CentroCusto[] }>;
    }).then(dados => {
      if (!controle.signal.aborted) setCentros(dados.centrosCusto);
    }).catch(e => {
      if (!controle.signal.aborted) setErro(e instanceof Error ? e.message : 'Falha ao carregar centros.');
    }).finally(() => { if (!controle.signal.aborted) setCarregando(false); });
    return () => controle.abort();
  }, []);

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro(''); setAviso(''); setOcupado('novo');
    try {
      const resposta = await fetch('/api/configuracao/centros-custo', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeNovo.trim() }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      setNomeNovo(''); await carregar(); setAviso('Centro de custo criado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o centro.');
    } finally { setOcupado(''); }
  }

  async function salvar(centro: CentroCusto) {
    setErro(''); setAviso(''); setOcupado(centro.id);
    try {
      const resposta = await fetch('/api/configuracao/centros-custo/' + encodeURIComponent(centro.id), {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: centro.nome.trim(), ativo: centro.ativo }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      await carregar(); setAviso('Centro de custo atualizado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar o centro.');
    } finally { setOcupado(''); }
  }

  return <section className="usuarios-configuracao">
    <div className="config-linha-acoes">
      <div><h3>Centros de custo</h3>
        <p>Cadastre os departamentos que enviarão comissões para o DP. Cada usuário operacional pertence a um centro.</p>
      </div>
    </div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {aviso && <p className="feedback" role="status">{aviso}</p>}
    <form className="formulario-conta" onSubmit={evento => void criar(evento)}>
      <label htmlFor="novo-centro-custo">Nome do centro de custo
        <input id="novo-centro-custo" required minLength={2} maxLength={160} value={nomeNovo}
          onChange={evento => setNomeNovo(evento.target.value)} disabled={Boolean(ocupado)} />
      </label>
      <button className="acao-principal" type="submit" disabled={Boolean(ocupado) || !nomeNovo.trim()}>
        {ocupado === 'novo' ? 'Criando...' : 'Criar centro de custo'}
      </button>
    </form>
    {carregando ? <p className="config-vazio">Carregando centros de custo...</p> : !centros.length ? (
      <p className="config-vazio">Nenhum centro de custo cadastrado.</p>
    ) : <div className="rolagem-tabela"><table className="tabela-principal tabela-usuarios">
      <thead><tr><th>Nome</th><th>Situação</th><th>Ação</th></tr></thead>
      <tbody>{centros.map(centro => <tr key={centro.id}>
        <td><input aria-label={'Nome do centro ' + centro.nome} value={centro.nome}
          disabled={Boolean(ocupado)} onChange={evento => setCentros(atual => atual.map(item =>
            item.id === centro.id ? { ...item, nome: evento.target.value } : item))} /></td>
        <td><label className="usuario-ativo"><input type="checkbox" checked={centro.ativo}
          disabled={Boolean(ocupado)} onChange={evento => setCentros(atual => atual.map(item =>
            item.id === centro.id ? { ...item, ativo: evento.target.checked } : item))} />
          {centro.ativo ? 'Ativo' : 'Inativo'}</label></td>
        <td><button type="button" className="botao-secundario" disabled={Boolean(ocupado)}
          onClick={() => void salvar(centro)}>Salvar</button></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
