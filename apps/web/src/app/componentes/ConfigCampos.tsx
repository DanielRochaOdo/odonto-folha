'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type Origem = 'BENEFICIO' | 'COMISSAO';
type Responsavel = 'ADM' | 'CENTRAL' | 'NENHUM';
type Grupo = {
  id: string; nome: string; origem: Origem; responsavel: Responsavel; ativo: boolean;
};
type Campo = {
  id: string; grupoId: string; nome: string; tipo: string;
  classificacao: string; ordemGlobal: number; ativo: boolean;
};
type Dados = {
  grupos: Grupo[]; campos: Campo[];
  funcionariosPorGrupo: Record<string, string[]>;
  funcionariosElegiveisIds: string[];
  competenciaReferencia: { ano: number; mes: number } | null;
};
type Funcionario = { id: string; nome: string; ativo: boolean };
type Cadastro = { funcionarios: Funcionario[] };
type Passo = 1 | 2 | 3;

const inicio: Dados = {
  grupos: [], campos: [], funcionariosPorGrupo: {},
  funcionariosElegiveisIds: [], competenciaReferencia: null,
};
const informacoes: Record<Origem, { titulo: string; singular: string; explicacao: string }> = {
  BENEFICIO: {
    titulo: 'Benefícios',
    singular: 'benefício',
    explicacao: 'Organize benefícios, campos e funcionários vinculados.',
  },
  COMISSAO: {
    titulo: 'Comissões',
    singular: 'comissão',
    explicacao: 'Organize comissões, responsáveis, campos e funcionários vinculados.',
  },
};
const nomePasso = ['Nome e identificação', 'Configuração do campo', 'Funcionários vinculados'];
const mesAtual = () => new Date().toISOString().slice(0, 7);

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.';
}

async function lerResposta(resposta: Response) {
  if (resposta.ok) return resposta;
  let mensagem = 'Não foi possível salvar. Confira os dados e tente novamente.';
  try {
    const json: unknown = await resposta.json();
    if (json && typeof json === 'object' && 'erro' in json &&
      typeof json.erro === 'string') mensagem = json.erro;
  } catch { /* Resposta não JSON. */ }
  throw new Error(mensagem);
}

export default function ConfigCampos() {
  const [dados, setDados] = useState<Dados>(inicio);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [aba, setAba] = useState<Origem>('BENEFICIO');
  const [grupoId, setGrupoId] = useState('');
  const [criacaoAberta, setCriacaoAberta] = useState(false);
  const [passo, setPasso] = useState<Passo>(1);
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState<Responsavel>('NENHUM');
  const [nomeCampo, setNomeCampo] = useState('');
  const [tipo, setTipo] = useState('moeda');
  const [classificacao, setClassificacao] = useState('provento');
  const [competencia, setCompetencia] = useState(mesAtual);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [buscaFuncionario, setBuscaFuncionario] = useState('');
  const [campoAberto, setCampoAberto] = useState(false);
  const [erroCriacao, setErroCriacao] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  async function carregar() {
    const [resposta, cadastro] = await Promise.all([
      fetch('/api/configuracao/campos', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/cadastros/geral', { credentials: 'include', cache: 'no-store' }),
    ]);
    await Promise.all([lerResposta(resposta), lerResposta(cadastro)]);
    setDados(await resposta.json() as Dados);
    setFuncionarios((await cadastro.json() as Cadastro).funcionarios);
  }

  useEffect(() => {
    let ativo = true;
    Promise.all([
      fetch('/api/configuracao/campos', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/cadastros/geral', { credentials: 'include', cache: 'no-store' }),
    ]).then(async ([resposta, cadastro]) => {
      await Promise.all([lerResposta(resposta), lerResposta(cadastro)]);
      return [await resposta.json() as Dados, await cadastro.json() as Cadastro] as const;
    }).then(([configuracao, cadastro]) => {
      if (ativo) { setDados(configuracao); setFuncionarios(cadastro.funcionarios); }
    }).catch(e => { if (ativo) setErro(mensagemErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function enviar(caminho: string, corpo: object): Promise<Response> {
    return lerResposta(await fetch(caminho, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }));
  }

  function fecharCriacao() {
    if (ocupado) return;
    setCriacaoAberta(false);
    setErroCriacao('');
    gatilhoRef.current?.focus();
  }

  function abrirCriacao() {
    setNome('');
    setResponsavel('NENHUM');
    setNomeCampo('');
    setTipo('moeda');
    setClassificacao('provento');
    const referencia = dados.competenciaReferencia;
    setCompetencia(referencia
      ? referencia.ano + '-' + String(referencia.mes).padStart(2, '0') : mesAtual());
    setSelecionados([]);
    setBuscaFuncionario('');
    setPasso(1);
    setErroCriacao('');
    setErro('');
    setAviso('');
    setCriacaoAberta(true);
  }

  function mudarAba(proxima: Origem) {
    if (proxima === aba || ocupado) return;
    setAba(proxima);
    setGrupoId('');
    setCampoAberto(false);
    setCriacaoAberta(false);
    setNomeCampo('');
    setErro('');
    setAviso('');
  }

  function lidarComTeclado(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      fecharCriacao();
      return;
    }
    if (evento.key !== 'Tab' || !dialogoRef.current) return;
    const elementos = Array.from(dialogoRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    )).filter(elemento => elemento.getClientRects().length > 0);
    if (elementos.length === 0) return;
    const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault(); ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault(); primeiro.focus();
    }
  }

  function validarVigencia() {
    const [ano, mes] = competencia.split('-').map(Number);
    if (!ano || ano < 2000 || ano > 2200 || !mes || mes < 1 || mes > 12) {
      setErroCriacao('Escolha uma competência válida.');
      return null;
    }
    return { ano, mes };
  }

  function avancar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroCriacao('');
    if (passo === 1) {
      if (!nome.trim()) { setErroCriacao('Informe o nome para continuar.'); return; }
      setPasso(2);
    } else if (passo === 2) {
      if (!nomeCampo.trim()) { setErroCriacao('Informe o nome do campo.'); return; }
      if (!validarVigencia()) return;
      setPasso(3);
    } else {
      void finalizar();
    }
  }

  async function finalizar() {
    if (ocupado) return;
    const vigencia = validarVigencia();
    if (!vigencia || !nome.trim() || !nomeCampo.trim()) return;
    setOcupado(true);
    setErroCriacao('');
    try {
      const resposta = await enviar('/api/configuracao/criacao', {
        nome: nome.trim(), origem: aba,
        responsavel: aba === 'BENEFICIO' ? 'NENHUM' : responsavel,
        campo: { nome: nomeCampo.trim(), tipo, classificacao, ...vigencia },
        funcionariosIds: selecionados,
      });
      const criado = await resposta.json() as { id: string };
      setGrupoId(criado.id);
      setCampoAberto(false);
      setCriacaoAberta(false);
      setAviso('Cadastro criado com o campo inicial e ' +
        selecionados.length + ' funcionário(s) vinculado(s).');
      gatilhoRef.current?.focus();
      try { await carregar(); }
      catch { setErro('Cadastro salvo, mas a atualização da lista falhou. Reabra esta seção.'); }
    } catch (e) {
      setErroCriacao(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function criarCampo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado || !grupoSelecionado) return;
    const [ano, mes] = competencia.split('-').map(Number);
    if (!ano || ano < 2000 || ano > 2200 || !mes || mes < 1 || mes > 12) {
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
      setNomeCampo('');
      setCampoAberto(false);
      setAviso('Campo adicionado com sucesso.');
      try { await carregar(); }
      catch { setErro('Campo salvo, mas não foi possível atualizar a lista. Reabra esta seção.'); }
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
  const grupoSelecionado = grupos.find(item => item.id === grupoId);
  const campos = dados.campos.filter(item => item.grupoId === grupoId);
  const rotulo = informacoes[aba];
  const funcionariosAtivos = funcionarios.filter(item => item.ativo &&
    dados.funcionariosElegiveisIds.includes(item.id));
  const filtrados = funcionariosAtivos.filter(item =>
    item.nome.toLocaleLowerCase('pt-BR').includes(buscaFuncionario.toLocaleLowerCase('pt-BR')));
  const idsVinculados = dados.funcionariosPorGrupo[grupoId] ?? [];
  const vinculados = funcionarios.filter(item => idsVinculados.includes(item.id));
  const referencia = dados.competenciaReferencia;
  const mesReferencia = referencia
    ? referencia.ano + '-' + String(referencia.mes).padStart(2, '0') : null;
  const semCompetenciaElegivel = !mesReferencia || competencia > mesReferencia;

  return (
    <section className="painel-app configuracao-campos">
      <div className="config-cabecalho">
        <h2>Gerenciar benefícios e comissões</h2>
        <p>Crie cada cadastro em etapas e confira seus campos e funcionários.</p>
      </div>

      <div className="abas-configuracao" role="tablist" aria-label="Tipo de cadastro">
        {(['BENEFICIO', 'COMISSAO'] as const).map(item => (
          <button key={item} type="button" id={'aba-' + item.toLowerCase()}
            role="tab" aria-selected={aba === item} aria-controls="painel-configuracao"
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
          <button ref={gatilhoRef} type="button" className="acao-principal"
            aria-haspopup="dialog" disabled={ocupado} onClick={abrirCriacao}>
            + Criar {rotulo.singular}
          </button>
        </div>

        {erro && <p className="erro" role="alert">{erro}</p>}
        {aviso && <p className="feedback" role="status">{aviso}</p>}
        {carregando ? (
          <p className="config-vazio">Carregando cadastros...</p>
        ) : grupos.length === 0 ? (
          <div className="config-vazio">
            <strong>Nenhum {rotulo.singular} cadastrado.</strong>
            <p>Clique em “Criar {rotulo.singular}” para começar.</p>
          </div>
        ) : (
          <>
            <div className="config-selecao">
              <h4>Cadastros de {rotulo.titulo.toLowerCase()}</h4>
              <p>Selecione um item para consultar os vínculos e gerenciar os campos.</p>
              <div className="config-lista-grupos">
                {grupos.map(item => (
                  <button key={item.id} type="button"
                    className={'config-grupo' + (grupoId === item.id ? ' ativo' : '')}
                    aria-expanded={grupoId === item.id}
                    aria-controls="config-detalhes"
                    onClick={() => {
                      setGrupoId(atual => atual === item.id ? '' : item.id);
                      setCampoAberto(false);
                      setNomeCampo('');
                      setErro('');
                      setAviso('');
                    }}>
                    <span>{item.nome}</span>
                    {item.origem === 'COMISSAO' && <small>{item.responsavel}</small>}
                    <small>{dados.campos.filter(c => c.grupoId === item.id).length} campos</small>
                    <small>{(dados.funcionariosPorGrupo[item.id] ?? []).length} funcionários</small>
                  </button>
                ))}
              </div>
            </div>

            {grupoSelecionado && (
              <section id="config-detalhes" className="config-detalhes"
                aria-label={'Detalhes de ' + grupoSelecionado.nome}>
                <div className="config-titulo-detalhes">
                  <div>
                    <h4>{grupoSelecionado.nome}</h4>
                    <p>Campos e funcionários vinculados ao cadastro.</p>
                  </div>
                  <button type="button" className="acao-principal" disabled={ocupado}
                    aria-expanded={campoAberto} aria-controls="form-campo-extra"
                    onClick={() => {
                      setCampoAberto(aberto => !aberto);
                      setNomeCampo('');
                      setTipo('moeda');
                      setClassificacao('provento');
                      setErro('');
                    }}>
                    {campoAberto ? 'Fechar campo' : '+ Adicionar campo'}
                  </button>
                </div>

                {campoAberto && (
                  <form id="form-campo-extra" className="config-formulario config-form-campo"
                    onSubmit={evento => void criarCampo(evento)}>
                    <h4>Adicionar campo em {grupoSelecionado.nome}</h4>
                    <div className="config-campos-form">
                      <label htmlFor="config-campo-nome">Nome do campo
                        <input id="config-campo-nome" autoFocus required maxLength={160}
                          value={nomeCampo} onChange={e => setNomeCampo(e.target.value)}
                          placeholder="Ex.: Valor mensal" />
                      </label>
                      <label htmlFor="config-tipo">Tipo
                        <select id="config-tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
                          <option value="moeda">Moeda (R$)</option>
                          <option value="percentual">Percentual (%)</option>
                          <option value="data">Data</option>
                          <option value="horario">Horário</option>
                        </select>
                      </label>
                      <label htmlFor="config-classificacao">Classificação
                        <select id="config-classificacao" value={classificacao}
                          onChange={e => setClassificacao(e.target.value)}>
                          <option value="provento">Provento</option>
                          <option value="desconto">Desconto</option>
                          <option value="informativo">Informativo</option>
                        </select>
                      </label>
                      <label htmlFor="config-competencia">A partir da competência
                        <input id="config-competencia" type="month" required
                          value={competencia} onChange={e => setCompetencia(e.target.value)} />
                      </label>
                    </div>
                    <div className="config-acoes-form">
                      <button className="acao-principal" type="submit" disabled={ocupado}>
                        Salvar campo
                      </button>
                      <button className="botao-secundario" type="button" disabled={ocupado}
                        onClick={() => { setCampoAberto(false); setNomeCampo(''); }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}

                <div className="config-lista-vinculados">
                  <h5>Funcionários vinculados <span>({vinculados.length})</span></h5>
                  {vinculados.length === 0 ? (
                    <p className="config-sem-vinculos">Nenhum funcionário vinculado à competência mais recente.</p>
                  ) : (
                    <ul>{vinculados.map(item => (
                      <li key={item.id}>{item.nome}{!item.ativo ? ' (inativo)' : ''}</li>
                    ))}</ul>
                  )}
                </div>

                <div className="config-tabela-titulo">
                  <h4>Campos de {grupoSelecionado.nome}</h4>
                  <span>{campos.length} {campos.length === 1 ? 'campo' : 'campos'}</span>
                </div>
                <div className="rolagem-tabela">
                  <table className="tabela-principal">
                    <thead><tr><th scope="col">Campo</th><th scope="col">Tipo</th>
                      <th scope="col">Ordem</th><th scope="col">Situação</th>
                      <th scope="col">Ação</th></tr></thead>
                    <tbody>
                      {campos.map(campo => (
                        <tr key={campo.id}>
                          <td>{campo.nome}</td><td>{campo.tipo}</td><td>{campo.ordemGlobal}</td>
                          <td>{campo.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td><button type="button" className="botao-secundario"
                            disabled={ocupado} onClick={() => void alterarStatus(campo)}>
                            {campo.ativo ? 'Desativar' : 'Ativar'}
                          </button></td>
                        </tr>
                      ))}
                      {campos.length === 0 && (
                        <tr><td colSpan={5} className="config-linha-vazia">
                          Nenhum campo cadastrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {criacaoAberta && (
        <div className="config-sobreposicao">
          <div ref={dialogoRef} className="config-modal" role="dialog" aria-modal="true"
            aria-labelledby="config-modal-titulo" aria-describedby="config-modal-ajuda"
            onKeyDown={lidarComTeclado}>
            <div className="config-modal-topo">
              <div>
                <p className="config-modal-etapa">Etapa {passo} de 3</p>
                <h3 id="config-modal-titulo">Criar {rotulo.singular}</h3>
                <p id="config-modal-ajuda">{nomePasso[passo - 1]}</p>
              </div>
              <button type="button" className="config-modal-fechar" onClick={fecharCriacao}
                aria-label="Fechar modal" disabled={ocupado}>×</button>
            </div>
            <ol className="config-progresso" aria-label="Etapas da criação">
              {nomePasso.map((item, indice) => (
                <li key={item} className={indice + 1 === passo ? 'atual' :
                  indice + 1 < passo ? 'feito' : ''} aria-current={indice + 1 === passo ? 'step' : undefined}>
                  <span>{indice + 1}</span><small>{item}</small>
                </li>
              ))}
            </ol>
            <form onSubmit={avancar}>
              <div className="config-modal-corpo">
                {passo === 1 && (
                  <div className="config-campos-form config-form-uma-coluna">
                    <label htmlFor="wizard-nome">Nome {aba === 'BENEFICIO' ? 'do benefício' : 'da comissão'}
                      <input id="wizard-nome" autoFocus required maxLength={160}
                        value={nome} onChange={e => setNome(e.target.value)}
                        placeholder={aba === 'BENEFICIO' ? 'Ex.: Vale-transporte' : 'Ex.: Comissão comercial'} />
                    </label>
                    {aba === 'COMISSAO' && (
                      <label htmlFor="wizard-responsavel">Responsável pelo lançamento
                        <select id="wizard-responsavel" value={responsavel}
                          onChange={e => setResponsavel(e.target.value as Responsavel)}>
                          <option value="NENHUM">Sem responsável definido</option>
                          <option value="ADM">Administrativo (ADM)</option>
                          <option value="CENTRAL">Central</option>
                        </select>
                      </label>
                    )}
                  </div>
                )}

                {passo === 2 && (
                  <div className="config-campos-form">
                    <label htmlFor="wizard-campo">Nome do campo
                      <input id="wizard-campo" autoFocus required maxLength={160}
                        value={nomeCampo} onChange={e => setNomeCampo(e.target.value)}
                        placeholder="Ex.: Valor mensal" />
                    </label>
                    <label htmlFor="wizard-tipo">Tipo
                      <select id="wizard-tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
                        <option value="moeda">Moeda (R$)</option>
                        <option value="percentual">Percentual (%)</option>
                        <option value="data">Data</option>
                        <option value="horario">Horário</option>
                      </select>
                    </label>
                    <label htmlFor="wizard-classificacao">Classificação
                      <select id="wizard-classificacao" value={classificacao}
                        onChange={e => setClassificacao(e.target.value)}>
                        <option value="provento">Provento</option>
                        <option value="desconto">Desconto</option>
                        <option value="informativo">Informativo</option>
                      </select>
                    </label>
                    <label htmlFor="wizard-vigencia">A partir da competência
                      <input id="wizard-vigencia" type="month" required value={competencia}
                        onChange={e => setCompetencia(e.target.value)} />
                    </label>
                  </div>
                )}

                {passo === 3 && (
                  <div className="config-etapa-funcionarios">
                    <h4>Quem estará vinculado a {nome}?</h4>
                    {semCompetenciaElegivel ? (
                      <p className="config-aviso-vinculos">
                        Ainda não há competência aberta igual ou posterior à vigência escolhida.
                        Você pode finalizar sem funcionários e criar os vínculos quando houver
                        uma competência adequada.
                      </p>
                    ) : (
                      <>
                        <label htmlFor="wizard-busca">Buscar funcionário
                          <input id="wizard-busca" autoFocus
                            placeholder="Digite o nome do funcionário"
                            value={buscaFuncionario} onChange={e => setBuscaFuncionario(e.target.value)} />
                        </label>
                        <div className="config-selecao-todos">
                          <span>{selecionados.length} selecionado(s)</span>
                          <button type="button" className="botao-secundario" onClick={() =>
                            setSelecionados(funcionariosAtivos.map(f => f.id))}>
                            Selecionar todos
                          </button>
                          <button type="button" className="botao-secundario"
                            onClick={() => setSelecionados([])}>Limpar</button>
                        </div>
                        <div className="config-checklist">
                          {filtrados.map(item => (
                            <label key={item.id} className="config-item-funcionario">
                              <input type="checkbox" checked={selecionados.includes(item.id)}
                                onChange={e => setSelecionados(atual => e.target.checked
                                  ? [...atual, item.id] : atual.filter(id => id !== item.id))} />
                              <span>{item.nome}</span>
                            </label>
                          ))}
                          {filtrados.length === 0 && (
                            <p className="config-sem-vinculos">
                              Nenhum funcionário ativo encontrado.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {erroCriacao && <p className="erro" role="alert">{erroCriacao}</p>}
              </div>
              <div className="config-modal-acoes">
                <button type="button" className="botao-secundario" disabled={ocupado}
                  onClick={() => {
                    if (passo === 1) fecharCriacao();
                    else { setPasso((passo - 1) as Passo); setErroCriacao(''); }
                  }}>{passo === 1 ? 'Cancelar' : 'Voltar'}</button>
                <button type="submit" className="acao-principal" disabled={ocupado}>
                  {ocupado ? 'Salvando...' : passo === 3 ? 'Finalizar' : 'Próximo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
