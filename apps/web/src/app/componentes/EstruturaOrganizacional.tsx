'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CheckIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type Empresa = { id: string; nome: string; ativa: boolean };
type Setor = { id: string; nome: string; ativo: boolean };
type Estrutura = { empresas: Empresa[]; setores: Setor[] };
type Tipo = 'empresas' | 'setores';
type Item = Empresa | Setor;
type Edicao = { tipo: Tipo; id: string; nome: string };

async function mensagemErro(resposta: Response) {
  try {
    const dados = (await resposta.json()) as { erro?: string };
    if (dados.erro) return dados.erro;
  } catch {
    /* Usa a mensagem padrão para respostas sem JSON. */
  }
  return 'Não foi possível concluir a operação.';
}

async function buscarEstrutura(signal?: AbortSignal): Promise<Estrutura> {
  const resposta = await fetch('/api/cadastros/estrutura', {
    cache: 'no-store',
    credentials: 'include',
    signal,
  });
  if (!resposta.ok) throw new Error(await mensagemErro(resposta));
  return resposta.json() as Promise<Estrutura>;
}

export default function EstruturaOrganizacional({ aoSincronizar }: {
  aoSincronizar: () => Promise<void>;
}) {
  const [estrutura, setEstrutura] = useState<Estrutura>({ empresas: [], setores: [] });
  const [novosNomes, setNovosNomes] = useState<Record<Tipo, string>>({ empresas: '', setores: '' });
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const atualizar = useCallback(async (signal?: AbortSignal) => {
    setEstrutura(await buscarEstrutura(signal));
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    const trabalho = window.setTimeout(() => {
      void atualizar(controle.signal)
        .catch((error) => {
          if (!controle.signal.aborted)
            setErro(
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar empresas e setores.',
            );
        })
        .finally(() => {
          if (!controle.signal.aborted) setCarregando(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(trabalho);
      controle.abort();
    };
  }, [atualizar]);

  async function concluir(mensagem: string, operacao: () => Promise<Response>) {
    setErro('');
    setAviso('');
    setOcupado(mensagem);
    try {
      const resposta = await operacao();
      if (!resposta.ok) throw new Error(await mensagemErro(resposta));
      await atualizar();
      try {
        await aoSincronizar();
      } catch {
        setErro('A alteração foi salva, mas a consolidação não atualizou. Reabra a competência para conferir os dados.');
        return true;
      }
      setAviso(mensagem);
      return true;
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
      return false;
    } finally {
      setOcupado('');
    }
  }

  async function criar(evento: FormEvent<HTMLFormElement>, tipo: Tipo) {
    evento.preventDefault();
    const nome = novosNomes[tipo].trim();
    if (!nome) return;
    const salvo = await concluir(
      tipo === 'empresas' ? 'Empresa cadastrada.' : 'Setor cadastrado.',
      () =>
        fetch('/api/cadastros/' + tipo, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome }),
        }),
    );
    if (salvo) setNovosNomes((atual) => ({ ...atual, [tipo]: '' }));
  }

  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!edicao || !edicao.nome.trim()) return;
    const { tipo, id, nome } = edicao;
    const salvo = await concluir(
      tipo === 'empresas' ? 'Empresa atualizada.' : 'Setor atualizado.',
      () =>
        fetch(`/api/cadastros/${tipo}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nome.trim() }),
        }),
    );
    if (salvo) setEdicao(null);
  }

  async function excluir(tipo: Tipo, item: Item) {
    const nome = item.nome;
    const confirmado = window.confirm(
      `Excluir ${tipo === 'empresas' ? 'a empresa' : 'o setor'} “${nome}”? ` +
        'A exclusão será bloqueada se houver funcionários, histórico ou usuários vinculados.',
    );
    if (!confirmado) return;
    await concluir(tipo === 'empresas' ? 'Empresa excluída.' : 'Setor excluído.', () =>
      fetch(`/api/cadastros/${tipo}/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      }),
    );
  }

  function lista(tipo: Tipo, itens: Item[]) {
    const nomeTipo = tipo === 'empresas' ? 'empresa' : 'setor';
    return (
      <section className="estrutura-grupo" aria-labelledby={`titulo-${tipo}`}>
        <div className="estrutura-grupo-topo">
          <div>
            <h3 id={`titulo-${tipo}`}>{tipo === 'empresas' ? 'Empresas' : 'Setores'}</h3>
            <span>
              {itens.length} {itens.length === 1 ? 'cadastro' : 'cadastros'}
            </span>
          </div>
        </div>
        <form className="estrutura-form-novo" onSubmit={(evento) => void criar(evento, tipo)}>
          <label htmlFor={`novo-${tipo}`}>
            Nome da {nomeTipo}
            <input
              id={`novo-${tipo}`}
              required
              maxLength={160}
              value={novosNomes[tipo]}
              onChange={(evento) =>
                setNovosNomes((atual) => ({ ...atual, [tipo]: evento.target.value }))
              }
              disabled={!!ocupado || carregando}
              placeholder={tipo === 'empresas' ? 'Ex.: Odontoart' : 'Ex.: DP'}
            />
          </label>
          <button
            className="acao-principal estrutura-adicionar"
            type="submit"
            disabled={!!ocupado || carregando || !novosNomes[tipo].trim()}
          >
            <PlusIcon aria-hidden="true" /> Adicionar
          </button>
        </form>
        {carregando ? (
          <p>Carregando...</p>
        ) : itens.length ? (
          <ul className="estrutura-lista">
            {itens.map((item) => {
              const editando = edicao?.tipo === tipo && edicao.id === item.id;
              const ativo = 'ativa' in item ? item.ativa : item.ativo;
              return (
                <li key={item.id} className="estrutura-item">
                  {editando ? (
                    <form
                      className="estrutura-form-edicao"
                      onSubmit={(evento) => void salvarEdicao(evento)}
                    >
                      <label className="texto-somente-leitor" htmlFor={`editar-${tipo}-${item.id}`}>
                        Nome da {nomeTipo}
                      </label>
                      <input
                        id={`editar-${tipo}-${item.id}`}
                        required
                        maxLength={160}
                        autoFocus
                        value={edicao.nome}
                        onChange={(evento) =>
                          setEdicao((atual) =>
                            atual ? { ...atual, nome: evento.target.value } : atual,
                          )
                        }
                        disabled={!!ocupado}
                      />
                      <button
                        className="acao-cadastro-icone"
                        type="submit"
                        aria-label={`Salvar ${nomeTipo}`}
                        title="Salvar"
                        disabled={!!ocupado || !edicao.nome.trim()}
                      >
                        <CheckIcon aria-hidden="true" />
                      </button>
                      <button
                        className="acao-cadastro-icone"
                        type="button"
                        aria-label="Cancelar edição"
                        title="Cancelar"
                        disabled={!!ocupado}
                        onClick={() => setEdicao(null)}
                      >
                        <XMarkIcon aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="estrutura-item-dados">
                        <strong>{item.nome}</strong>
                        <span
                          className={ativo ? 'estrutura-status ativo' : 'estrutura-status inativo'}
                        >
                          {ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="estrutura-item-acoes">
                        <button
                          className="acao-cadastro-icone"
                          type="button"
                          aria-label={`Editar ${nomeTipo} ${item.nome}`}
                          title="Editar"
                          disabled={!!ocupado}
                          onClick={() => setEdicao({ tipo, id: item.id, nome: item.nome })}
                        >
                          <PencilSquareIcon aria-hidden="true" />
                        </button>
                        <button
                          className="acao-cadastro-icone perigo"
                          type="button"
                          aria-label={`Excluir ${nomeTipo} ${item.nome}`}
                          title="Excluir"
                          disabled={!!ocupado}
                          onClick={() => void excluir(tipo, item)}
                        >
                          <TrashIcon aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="estrutura-vazia">
            Nenhuma {tipo === 'empresas' ? 'empresa' : 'setor'} cadastrada.
          </p>
        )}
      </section>
    );
  }

  return (
    <div
      className="painel-configuracao estrutura-organizacional"
      role="tabpanel"
      id="painel-estrutura"
      aria-labelledby="aba-estrutura"
    >
      <div className="config-linha-acoes">
        <div>
          <h3>Estrutura organizacional</h3>
          <p>Gerencie as empresas e os setores usados nos cadastros e nas competências.</p>
        </div>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="feedback" role="status">
          {aviso}
        </p>
      )}
      <p className="estrutura-nota">
        Empresas e setores usados por funcionários, histórico ou usuários não podem ser excluídos,
        para preservar os registros.
      </p>
      <div className="estrutura-grade">
        {lista('empresas', estrutura.empresas)}
        {lista('setores', estrutura.setores)}
      </div>
    </div>
  );
}
