'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Origem = 'BENEFICIO' | 'COMISSAO';
type Responsavel = 'ADM' | 'CENTRAL' | 'NENHUM';
type Grupo = {
  id: string; nome: string; origem: Origem; responsavel: Responsavel; ativo: boolean;
};
type Campo = {
  id: string; grupoId: string; nome: string; tipo: string;
  classificacao: string; ordemGlobal: number; ativo: boolean;
};
type Dados = { grupos: Grupo[]; campos: Campo[] };

const informacoes: Record<Origem, { titulo: string; singular: string; explicacao: string }> = {
  BENEFICIO: {
    titulo: 'Benefícios',
    singular: 'benefício',
    explicacao: 'Organize os benefícios e os campos usados no cálculo mensal.',
  },
  COMISSAO: {
    titulo: 'Comissões',
    singular: 'comissão',
    explicacao: 'Organize as comissões, seus responsáveis e os campos de lançamento.',
  },
};

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.';
}

export default function ConfigCampos() {
  const [dados, setDados] = useState<Dados>({ grupos: [], campos: [] });
  const [aba, setAba] = useState<Origem>('BENEFICIO');
  const [criacaoAberta, setCriacaoAberta] = useState(false);
  const [grupoId, setGrupoId] = useState('');
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState<Responsavel>('NENHUM');
  const [nomeCampo, setNomeCampo] = useState('');
  const [tipo, setTipo] = useState('moeda');
  const [classificacao, setClassificacao] = useState('provento');
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    const resposta = await fetch('/api/configuracao/campos', {
      credentials: 'include', cache: 'no-store',
    });
    if (!resposta.ok) throw new Error('Não foi possível carregar benefícios e comissões.');
    const atual = await resposta.json() as Dados;
    setDados(atual);
  }

  useEffect(() => {
    let ativo = true;
    fetch('/api/configuracao/campos', { credentials: 'include', cache: 'no-store' })
      .then(async resposta => {
        if (!resposta.ok) throw new Error('Não foi possível carregar os cadastros.');
        return resposta.json() as Promise<Dados>;
      })
      .then(resultado => { if (ativo) setDados(resultado); })
      .catch(e => { if (ativo) setErro(mensagemErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function enviar(caminho: string, corpo: object): Promise<Response> {
    const resposta = await fetch(caminho, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) {
      let mensagem = 'Não foi possível salvar. Confira os dados e tente novamente.';
      try {
        const resultado: unknown = await resposta.json();
        if (resultado && typeof resultado === 'object' && 'erro' in resultado &&
          typeof resultado.erro === 'string') mensagem = resultado.erro;
      } catch { /* Resposta sem corpo JSON. */ }
      throw new Error(mensagem);
    }
    return resposta;
  }

  function mudarAba(proxima: Origem) {
    if (proxima === aba) return;
    setAba(proxima);
    setCriacaoAberta(false);
    setNome('');
    setGrupoId('');
    setResponsavel('NENHUM');
    setNomeCampo('');
    setErro('');
    setAviso('');
  }

  async function criarGrupo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const resposta = await enviar('/api/configuracao/grupos', {
        nome: nome.trim(), origem: aba,
        responsavel: aba === 'BENEFICIO' ? 'NENHUM' : responsavel,
      });
      const criado = await resposta.json() as { id: string };
      await carregar();
      setGrupoId(criado.id);
      setNomeCampo('');
      setCriacaoAberta(false);
      setNome('');
      setResponsavel('NENHUM');
      setAviso(`Cadastro criado. Agora você pode adicionar os campos dessa ${informacoes[aba].singular}.`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function criarCampo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado || !grupoSelecionado) return;
    const [ano, mes] = competencia.split('-').map(Number);
    if (!ano || !mes || mes < 1 || mes > 12) {
      setErro('Escolha uma competência válida.');
      return;
    }
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await enviar('/api/configuracao/campos', {
        grupoId: grupoSelecionado.id, nome: nomeCampo.trim(),
        tipo, classificacao, ano, mes,
      });
      await carregar();
      setNomeCampo('');
      setAviso('Campo adicionado com sucesso.');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function alterarStatus(campo: Campo) {
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await enviar('/api/configuracao/campos/' + encodeURIComponent(campo.id) + '/status',
        { ativo: !campo.ativo });
      await carregar();
      setAviso(campo.ativo ? 'Campo desativado.' : 'Campo ativado.');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const grupos = dados.grupos.filter(item => item.origem === aba);
  const idsGrupos = new Set(grupos.map(item => item.id));
  const campos = dados.campos.filter(item => idsGrupos.has(item.grupoId));
  const grupoSelecionado = grupos.find(item => item.id === grupoId);
  const rotulo = informacoes[aba];

  return (
    <section className="painel-app configuracao-campos">
      <div className="config-cabecalho">
        <div>
          <h2>Gerenciar benefícios e comissões</h2>
          <p>Cadastre e configure cada categoria separadamente.</p>
        </div>
      </div>

      <div className="abas-configuracao" role="tablist" aria-label="Tipo de cadastro">
        {(['BENEFICIO', 'COMISSAO'] as const).map(item => (
          <button key={item} type="button" id={'aba-' + item.toLowerCase()}
            role="tab" aria-selected={aba === item}
            aria-controls="painel-configuracao"
            className={'aba-configuracao' + (aba === item ? ' selecionada' : '')}
            onClick={() => mudarAba(item)}>
            {informacoes[item].titulo}
          </button>
        ))}
      </div>

      <div id="painel-configuracao" role="tabpanel"
        aria-labelledby={'aba-' + aba.toLowerCase()} className="painel-configuracao">
        <div className="config-linha-acoes">
          <div>
            <h3>{rotulo.titulo}</h3>
            <p>{rotulo.explicacao}</p>
          </div>
          <button type="button" className="acao-principal" disabled={ocupado}
            aria-expanded={criacaoAberta} aria-controls="form-criacao-config"
            onClick={() => {
              setCriacaoAberta(aberta => !aberta);
              setNome('');
              setResponsavel('NENHUM');
              setErro('');
              setAviso('');
            }}>
            {criacaoAberta ? 'Cancelar' : '+ Criar ' + rotulo.singular}
          </button>
        </div>

        {criacaoAberta && (
          <form id="form-criacao-config" className="config-formulario"
            onSubmit={evento => void criarGrupo(evento)}>
            <h4>{'Nova ' + (aba === 'BENEFICIO' ? 'configuração de benefício' : 'comissão')}</h4>
            <div className="config-campos-form">
              <label htmlFor="config-nome">
                {'Nome ' + (aba === 'BENEFICIO' ? 'do benefício' : 'da comissão')}
                <input id="config-nome" autoFocus required maxLength={160} value={nome}
                  onChange={evento => setNome(evento.target.value)}
                  placeholder={aba === 'BENEFICIO' ? 'Ex.: Vale-transporte' : 'Ex.: Comissão comercial'}/>
              </label>
              {aba === 'COMISSAO' && (
                <label htmlFor="config-responsavel">
                  Responsável pelo lançamento
                  <select id="config-responsavel" value={responsavel}
                    onChange={evento => setResponsavel(evento.target.value as Responsavel)}>
                    <option value="NENHUM">Sem responsável definido</option>
                    <option value="ADM">Administrativo (ADM)</option>
                    <option value="CENTRAL">Central</option>
                  </select>
                </label>
              )}
            </div>
            <div className="config-acoes-form">
              <button type="submit" className="acao-principal" disabled={ocupado}>
                {'Salvar ' + rotulo.singular}
              </button>
              <button type="button" className="botao-secundario" disabled={ocupado}
                onClick={() => { setCriacaoAberta(false); setNome(''); setErro(''); }}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {erro && <p className="erro" role="alert">{erro}</p>}
        {aviso && <p className="feedback" role="status">{aviso}</p>}
        {carregando ? (
          <p className="config-vazio">Carregando cadastros...</p>
        ) : grupos.length === 0 ? (
          <div className="config-vazio">
            <strong>{'Nenhum ' + rotulo.singular + ' cadastrado.'}</strong>
            <p>{'Clique em “Criar ' + rotulo.singular + '” para começar.'}</p>
          </div>
        ) : (
          <>
            <div className="config-selecao">
              <h4>{'Cadastros de ' + rotulo.titulo.toLowerCase()}</h4>
              <p>Selecione um item para adicionar campos.</p>
              <div className="config-lista-grupos">
                {grupos.map(item => (
                  <button key={item.id} type="button"
                    className={'config-grupo' + (grupoId === item.id ? ' ativo' : '')}
                    aria-pressed={grupoId === item.id}
                    onClick={() => {
                      setGrupoId(item.id);
                      setNomeCampo('');
                      setErro('');
                      setAviso('');
                    }}>
                    <span>{item.nome}</span>
                    {item.origem === 'COMISSAO' && <small>{item.responsavel}</small>}
                    <small>{dados.campos.filter(campo => campo.grupoId === item.id).length} campos</small>
                  </button>
                ))}
              </div>
            </div>

            {grupoSelecionado && (
              <form className="config-formulario config-form-campo"
                onSubmit={evento => void criarCampo(evento)}>
                <h4>{'Adicionar campo em ' + grupoSelecionado.nome}</h4>
                <div className="config-campos-form">
                  <label htmlFor="config-campo-nome">
                    Nome do campo
                    <input id="config-campo-nome" required maxLength={160}
                      value={nomeCampo} onChange={evento => setNomeCampo(evento.target.value)}
                      placeholder="Ex.: Valor"/>
                  </label>
                  <label htmlFor="config-tipo">
                    Tipo
                    <select id="config-tipo" value={tipo}
                      onChange={evento => setTipo(evento.target.value)}>
                      <option value="moeda">Moeda (R$)</option>
                      <option value="percentual">Percentual (%)</option>
                      <option value="data">Data</option>
                      <option value="horario">Horário</option>
                    </select>
                  </label>
                  <label htmlFor="config-classificacao">
                    Classificação
                    <select id="config-classificacao" value={classificacao}
                      onChange={evento => setClassificacao(evento.target.value)}>
                      <option value="provento">Provento</option>
                      <option value="desconto">Desconto</option>
                      <option value="informativo">Informativo</option>
                    </select>
                  </label>
                  <label htmlFor="config-competencia">
                    A partir da competência
                    <input id="config-competencia" type="month" required
                      value={competencia}
                      onChange={evento => setCompetencia(evento.target.value)}/>
                  </label>
                </div>
                <div className="config-acoes-form">
                  <button className="acao-principal" type="submit" disabled={ocupado}>
                    + Adicionar campo
                  </button>
                </div>
              </form>
            )}

            <div className="config-tabela-titulo">
              <h4>{'Campos de ' + rotulo.titulo.toLowerCase()}</h4>
              <span>{campos.length} {campos.length === 1 ? 'campo' : 'campos'}</span>
            </div>
            <div className="rolagem-tabela">
              <table className="tabela-principal">
                <thead>
                  <tr>
                    <th scope="col">{aba === 'BENEFICIO' ? 'Benefício' : 'Comissão'}</th>
                    <th scope="col">Campo</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Ordem</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {campos.map(campo => (
                    <tr key={campo.id}>
                      <td>{grupos.find(g => g.id === campo.grupoId)?.nome}</td>
                      <td>{campo.nome}</td>
                      <td>{campo.tipo}</td>
                      <td>{campo.ordemGlobal}</td>
                      <td>{campo.ativo ? 'Ativo' : 'Inativo'}</td>
                      <td>
                        <button type="button" className="botao-secundario"
                          disabled={ocupado}
                          onClick={() => void alterarStatus(campo)}>
                          {campo.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {campos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="config-linha-vazia">
                        Nenhum campo cadastrado nesta aba. Selecione um item acima para adicionar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
