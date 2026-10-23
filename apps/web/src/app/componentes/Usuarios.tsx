'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type PerfilUsuario = 'DP' | 'ADM' | 'CENTRAL';
type Usuario = { id: string; nome: string; email: string; perfil: PerfilUsuario; ativo: boolean };
type RascunhoUsuario = Omit<Usuario, 'id'>;
const novoUsuarioVazio: RascunhoUsuario = { nome: '', email: '', perfil: 'DP', ativo: true };

async function mensagemResposta(resposta: Response): Promise<string> {
  try {
    const dados: unknown = await resposta.json();
    if (dados && typeof dados === 'object' && 'erro' in dados && typeof dados.erro === 'string')
      return dados.erro;
  } catch { /* Usa mensagem genérica para respostas não JSON. */ }
  return 'Não foi possível concluir a operação.';
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [rascunho, setRascunho] = useState<RascunhoUsuario>(novoUsuarioVazio);
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [usuarioSenha, setUsuarioSenha] = useState<Usuario | null>(null);
  const [modal, setModal] = useState<'criar' | 'senha' | null>(null);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const dialogoRef = useRef<HTMLDialogElement>(null);

  const carregarUsuarios = useCallback(async (signal?: AbortSignal) => {
    const resposta = await fetch('/api/usuarios', {
      cache: 'no-store', credentials: 'include', signal,
    });
    if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
    const dados = await resposta.json() as { usuarios: Usuario[] };
    setUsuarios(dados.usuarios);
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    void carregarUsuarios(controle.signal).catch(e => {
      if (!controle.signal.aborted) setErro(e instanceof Error
        ? e.message : 'Não foi possível carregar os usuários.');
    }).finally(() => {
      if (!controle.signal.aborted) setCarregando(false);
    });
    return () => controle.abort();
  }, [carregarUsuarios]);

  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (modal && dialogo && !dialogo.open) dialogo.showModal();
    else if (!modal && dialogo?.open) dialogo.close();
  }, [modal]);

  function fecharModal() {
    setModal(null); setPasso(1); setUsuarioSenha(null);
    setRascunho(novoUsuarioVazio); setSenhaNova(''); setConfirmacaoSenha('');
  }

  function atualizarRascunho<K extends keyof RascunhoUsuario>(campo: K, valor: RascunhoUsuario[K]) {
    setRascunho(atual => ({ ...atual, [campo]: valor }));
  }

  function atualizarUsuario<K extends keyof Usuario>(id: string, campo: K, valor: Usuario[K]) {
    setUsuarios(atual => atual.map(usuario => usuario.id === id
      ? { ...usuario, [campo]: valor } : usuario));
  }

  async function criarUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (passo === 1) {
      if (rascunho.nome.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rascunho.email.trim())) {
        setErro('Informe o nome e um e-mail válido para continuar.');
        return;
      }
      setErro(''); setPasso(2); return;
    }
    const formulario = evento.currentTarget;
    if (!formulario.reportValidity()) return;
    if (senhaNova !== confirmacaoSenha) {
      setErro('A senha e a confirmação não conferem.'); return;
    }
    setOcupado('criar'); setErro(''); setAviso('');
    try {
      const resposta = await fetch('/api/usuarios', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: rascunho.nome.trim(),
          email: rascunho.email.trim(), perfil: rascunho.perfil, senha: senhaNova }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      fecharModal(); setAviso('Usuário criado. A senha não será exibida novamente.');
      try { await carregarUsuarios(); }
      catch { setErro('Usuário criado, mas a lista não foi atualizada. Recarregue esta aba.'); }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o usuário.');
    } finally { setOcupado(''); }
  }

  async function salvarUsuario(usuario: Usuario) {
    setOcupado(usuario.id); setErro(''); setAviso('');
    try {
      const resposta = await fetch('/api/usuarios/' + encodeURIComponent(usuario.id), {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: usuario.nome, email: usuario.email,
          perfil: usuario.perfil, ativo: usuario.ativo }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      setAviso('Dados do usuário atualizados.');
      try { await carregarUsuarios(); }
      catch { setErro('Alteração salva, mas a lista não foi atualizada. Recarregue esta aba.'); }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar o usuário.');
    } finally { setOcupado(''); }
  }

  async function redefinirSenha(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!usuarioSenha) return;
    if (senhaNova !== confirmacaoSenha) {
      setErro('A senha e a confirmação não conferem.'); return;
    }
    setOcupado('senha'); setErro(''); setAviso('');
    try {
      const resposta = await fetch('/api/usuarios/' + encodeURIComponent(usuarioSenha.id) + '/senha', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: senhaNova }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      const nome = usuarioSenha.nome;
      fecharModal(); setAviso(`Senha redefinida para ${nome}. As sessões anteriores foram encerradas.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível redefinir a senha.');
    } finally { setOcupado(''); }
  }

  return <section className="usuarios-configuracao">
    <div className="config-linha-acoes">
      <div><h3>Usuários</h3><p>Crie contas e gerencie perfil, acesso e credenciais. A troca de e-mail é imediata e encerra as sessões atuais; não há confirmação por e-mail.</p></div>
      <button type="button" className="acao-principal" onClick={() => {
        setErro(''); setRascunho(novoUsuarioVazio); setPasso(1); setModal('criar');
      }}>+ Criar usuário</button>
    </div>
    {erro && !modal && <p className="erro" role="alert">{erro}</p>}
    {aviso && <p className="feedback" role="status">{aviso}</p>}
    {carregando ? <p className="config-vazio">Carregando usuários...</p> : !usuarios.length ? (
      <p className="config-vazio">Nenhum usuário de DP, ADM ou Central cadastrado.</p>
    ) : <div className="rolagem-tabela">
      <table className="tabela-principal tabela-usuarios">
        <thead><tr><th>Nome</th><th>E-mail de acesso</th><th>Setor</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>{usuarios.map(usuario => <tr key={usuario.id}>
          <td><input aria-label={'Nome de ' + usuario.nome} value={usuario.nome}
            disabled={Boolean(ocupado)} onChange={e => atualizarUsuario(usuario.id, 'nome', e.target.value)} /></td>
          <td><input aria-label={'E-mail de ' + usuario.nome} type="email" value={usuario.email}
            disabled={Boolean(ocupado)} onChange={e => atualizarUsuario(usuario.id, 'email', e.target.value)} /></td>
          <td><select aria-label={'Setor de ' + usuario.nome} value={usuario.perfil}
            disabled={Boolean(ocupado)} onChange={e => atualizarUsuario(usuario.id, 'perfil', e.target.value as PerfilUsuario)}>
            <option value="DP">DP</option><option value="ADM">ADM</option><option value="CENTRAL">Central</option>
          </select></td>
          <td><label className="usuario-ativo"><input type="checkbox" checked={usuario.ativo}
            disabled={Boolean(ocupado)} onChange={e => atualizarUsuario(usuario.id, 'ativo', e.target.checked)} />
            {usuario.ativo ? 'Ativo' : 'Inativo'}</label></td>
          <td><div className="acoes-usuario">
            <button type="button" className="botao-secundario" disabled={Boolean(ocupado)}
              onClick={() => void salvarUsuario(usuario)}>Salvar</button>
            <button type="button" className="botao-secundario" disabled={Boolean(ocupado)}
              onClick={() => {
                setErro(''); setUsuarioSenha(usuario); setSenhaNova(''); setConfirmacaoSenha('');
                setModal('senha');
              }}>Redefinir senha</button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}

    <dialog ref={dialogoRef} className="modal-usuarios" aria-labelledby="modal-usuarios-titulo"
      onCancel={evento => { evento.preventDefault(); fecharModal(); }} onClose={() => setModal(null)}>
      {modal === 'criar' ? <form onSubmit={evento => void criarUsuario(evento)}>
        <p className="config-modal-etapa">Etapa {passo} de 2</p>
        <h3 id="modal-usuarios-titulo">Criar usuário</h3>
        {passo === 1 ? <div className="formulario-conta">
          <label>Nome completo
            <input autoFocus required minLength={2} maxLength={160} value={rascunho.nome}
              onChange={e => atualizarRascunho('nome', e.target.value)} />
          </label>
          <label>E-mail de acesso
            <input type="email" required maxLength={320} autoComplete="email" value={rascunho.email}
              onChange={e => atualizarRascunho('email', e.target.value)} />
          </label>
        </div> : <div className="formulario-conta">
          <label>Setor
            <select value={rascunho.perfil} onChange={e => atualizarRascunho('perfil', e.target.value as PerfilUsuario)}>
              <option value="DP">DP</option><option value="ADM">ADM</option><option value="CENTRAL">Central</option>
            </select>
          </label>
          <label>Senha inicial
            <input type="password" required minLength={6} maxLength={128} autoComplete="new-password"
              value={senhaNova} onChange={e => setSenhaNova(e.target.value)} />
          </label>
          <label>Confirme a senha
            <input type="password" required minLength={6} maxLength={128} autoComplete="new-password"
              value={confirmacaoSenha} onChange={e => setConfirmacaoSenha(e.target.value)} />
          </label>
        </div>}
        {erro && <p role="alert" className="erro">{erro}</p>}
        <div className="config-acoes-form">
          <button type="button" className="botao-secundario" disabled={Boolean(ocupado)}
            onClick={fecharModal}>Cancelar</button>
          {passo === 2 && <button type="button" className="botao-secundario"
            onClick={() => { setErro(''); setPasso(1); }}>Voltar</button>}
          {passo === 1 ? <button type="submit" className="acao-principal">Próximo</button>
            : <button type="submit" className="acao-principal" disabled={Boolean(ocupado)}>
              {ocupado === 'criar' ? 'Criando...' : 'Finalizar'}
            </button>}
        </div>
      </form> : modal === 'senha' && usuarioSenha ? <form onSubmit={evento => void redefinirSenha(evento)}>
        <h3 id="modal-usuarios-titulo">Redefinir senha</h3>
        <p>Conta de {usuarioSenha.nome}. A senha nova encerra todas as sessões anteriores.</p>
        <div className="formulario-conta">
          <label>Nova senha
            <input autoFocus type="password" required minLength={6} maxLength={128}
              autoComplete="new-password" value={senhaNova}
              onChange={e => setSenhaNova(e.target.value)} />
          </label>
          <label>Confirme a nova senha
            <input type="password" required minLength={6} maxLength={128}
              autoComplete="new-password" value={confirmacaoSenha}
              onChange={e => setConfirmacaoSenha(e.target.value)} />
          </label>
        </div>
        {erro && <p role="alert" className="erro">{erro}</p>}
        <div className="config-acoes-form">
          <button type="button" className="botao-secundario" disabled={Boolean(ocupado)}
            onClick={fecharModal}>Cancelar</button>
          <button type="submit" className="acao-principal" disabled={Boolean(ocupado)}>
            {ocupado === 'senha' ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </div>
      </form> : null}
    </dialog>
  </section>;
}
