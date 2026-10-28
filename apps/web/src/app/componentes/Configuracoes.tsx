'use client';

import { useEffect, useState, type FormEvent } from 'react';
import EstruturaOrganizacional from './EstruturaOrganizacional';
import CentrosCusto from './CentrosCusto';
import Usuarios from './Usuarios';

type DadosAuth = { user?: { email?: string } } | null;

async function mensagemResposta(resposta: Response): Promise<string> {
  try {
    const dados: unknown = await resposta.json();
    if (dados && typeof dados === 'object') {
      if ('erro' in dados && typeof dados.erro === 'string') return dados.erro;
      if ('message' in dados && typeof dados.message === 'string') return dados.message;
      if ('error' in dados && typeof dados.error === 'object' && dados.error !== null &&
        'message' in dados.error && typeof dados.error.message === 'string')
        return dados.error.message;
    }
  } catch { /* Usa mensagem genérica para respostas não JSON. */ }
  return 'Não foi possível concluir a alteração.';
}

export default function Configuracoes({ perfil, aoSincronizarCadastro }: {
  perfil: 'ADMIN' | 'DP' | 'CENTRO_CUSTO'; aoSincronizarCadastro: () => Promise<void>;
}) {
  const [aba, setAba] = useState<'meus-dados' | 'usuarios' | 'estrutura-organizacional' |
    'centros-custo'>('meus-dados');
  const [emailAtual, setEmailAtual] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [confirmarEmail, setConfirmarEmail] = useState('');
  const [senhaEmail, setSenhaEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/auth/get-session', {
      cache: 'no-store', credentials: 'include', signal: controle.signal,
    }).then(async resposta => {
      if (!resposta.ok) throw new Error('Não foi possível carregar os dados da conta.');
      return resposta.json() as Promise<DadosAuth>;
    }).then(dados => {
      if (!controle.signal.aborted) setEmailAtual(dados?.user?.email ?? '');
    }).catch(e => {
      if (!controle.signal.aborted) setErro(e instanceof Error
        ? e.message : 'Não foi possível carregar os dados da conta.');
    }).finally(() => {
      if (!controle.signal.aborted) setCarregando(false);
    });
    return () => controle.abort();
  }, []);

  async function alterarEmail(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(''); setAviso('');
    if (novoEmail.trim().toLowerCase() !== confirmarEmail.trim().toLowerCase()) {
      setErro('Os e-mails informados não conferem.');
      return;
    }
    setOcupado(true);
    try {
      const resposta = await fetch('/api/conta/email', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novoEmail: novoEmail.trim(), senhaAtual: senhaEmail }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      const dados = await resposta.json() as { email: string };
      setEmailAtual(dados.email);
      setNovoEmail(''); setConfirmarEmail(''); setSenhaEmail('');
      setAviso('E-mail atualizado. Como medida de segurança, confirme novamente o acesso nas outras sessões.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar o e-mail.');
    } finally { setOcupado(false); }
  }

  async function alterarSenha(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(''); setAviso('');
    if (novaSenha !== confirmarSenha) {
      setErro('A nova senha e a confirmação não conferem.');
      return;
    }
    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setOcupado(true);
    try {
      const resposta = await fetch('/api/auth/change-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: senhaAtual, newPassword: novaSenha, revokeOtherSessions: true,
        }),
      });
      if (!resposta.ok) throw new Error(await mensagemResposta(resposta));
      setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
      setAviso('Senha alterada. As outras sessões da sua conta foram encerradas.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar a senha.');
    } finally { setOcupado(false); }
  }

  return <section className="painel-app configuracoes-conta">
    <div className="abas-configuracao" role="tablist" aria-label="Abas de configurações">
      <button type="button" id="aba-meus-dados" role="tab" aria-selected={aba === 'meus-dados'}
        aria-controls="painel-meus-dados"
        className={'aba-configuracao' + (aba === 'meus-dados' ? ' selecionada' : '')}
        onClick={() => setAba('meus-dados')}>Meus Dados</button>
      {(perfil === 'ADMIN' || perfil === 'DP') && <button type="button" id="aba-usuarios" role="tab"
        aria-selected={aba === 'usuarios'} aria-controls="painel-usuarios"
        className={'aba-configuracao' + (aba === 'usuarios' ? ' selecionada' : '')}
        onClick={() => setAba('usuarios')}>Usuários</button>}
      {(perfil === 'ADMIN' || perfil === 'DP') && <button type="button" id="aba-estrutura" role="tab"
        aria-selected={aba === 'estrutura-organizacional'} aria-controls="painel-estrutura"
        className={'aba-configuracao' + (aba === 'estrutura-organizacional' ? ' selecionada' : '')}
        onClick={() => setAba('estrutura-organizacional')}>Estrutura organizacional</button>}
      {(perfil === 'ADMIN' || perfil === 'DP') && <button type="button" id="aba-centros-custo" role="tab"
        aria-selected={aba === 'centros-custo'} aria-controls="painel-centros-custo"
        className={'aba-configuracao' + (aba === 'centros-custo' ? ' selecionada' : '')}
        onClick={() => setAba('centros-custo')}>Centros de custo</button>}
    </div>
    {aba === 'meus-dados' ? <div id="painel-meus-dados" role="tabpanel"
      aria-labelledby="aba-meus-dados" className="painel-configuracao">
      {erro && <p className="erro" role="alert">{erro}</p>}
      {aviso && <p className="feedback" role="status">{aviso}</p>}
      <section className="config-conta-secao" aria-labelledby="titulo-email-conta">
        <div>
          <h3 id="titulo-email-conta">E-mail</h3>
          <p>Após confirmar a senha atual, o novo endereço será ativado sem envio de confirmação por e-mail.</p>
        </div>
        <form className="formulario-conta" onSubmit={evento => void alterarEmail(evento)}>
          <label>E-mail atual
            <input type="email" value={carregando ? '' : emailAtual} readOnly
              placeholder={carregando ? 'Carregando...' : ''} autoComplete="username" />
          </label>
          <label>Novo e-mail
            <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
              required maxLength={320} autoComplete="email" disabled={ocupado || carregando} />
          </label>
          <label>Confirme o novo e-mail
            <input type="email" value={confirmarEmail}
              onChange={e => setConfirmarEmail(e.target.value)} required maxLength={320}
              autoComplete="email" disabled={ocupado || carregando} />
          </label>
          <label>Senha atual
            <input type="password" value={senhaEmail} onChange={e => setSenhaEmail(e.target.value)}
              required autoComplete="current-password" disabled={ocupado || carregando} />
          </label>
          <button className="acao-principal" type="submit" disabled={ocupado || carregando || !emailAtual}>
            {ocupado ? 'Salvando...' : 'Atualizar e-mail'}
          </button>
        </form>
      </section>

      <section className="config-conta-secao" aria-labelledby="titulo-senha-conta">
        <div>
          <h3 id="titulo-senha-conta">Senha</h3>
          <p>Use pelo menos 6 caracteres. A alteração encerra as outras sessões da conta.</p>
        </div>
        <form className="formulario-conta" onSubmit={evento => void alterarSenha(evento)}>
          <label>Senha atual
            <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)}
              required autoComplete="current-password" disabled={ocupado} />
          </label>
          <label>Nova senha
            <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
              required minLength={6} maxLength={128} autoComplete="new-password" disabled={ocupado} />
          </label>
          <label>Confirme a nova senha
            <input type="password" value={confirmarSenha}
              onChange={e => setConfirmarSenha(e.target.value)} required minLength={6} maxLength={128}
              autoComplete="new-password" disabled={ocupado} />
          </label>
          <button className="acao-principal" type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando...' : 'Atualizar senha'}
          </button>
        </form>
      </section>
    </div> : aba === 'usuarios' ? <div id="painel-usuarios" role="tabpanel"
      aria-labelledby="aba-usuarios" className="painel-configuracao"><Usuarios /></div>
      : aba === 'estrutura-organizacional' ? <EstruturaOrganizacional aoSincronizar={aoSincronizarCadastro} />
        : aba === 'centros-custo' ? <div id="painel-centros-custo" role="tabpanel"
          aria-labelledby="aba-centros-custo" className="painel-configuracao"><CentrosCusto /></div>
          : null}
  </section>;
}
