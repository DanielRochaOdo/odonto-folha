'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowPathIcon, PencilSquareIcon, TrashIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import { atualizarMascaraComCursor, mascaraFinal, numeroDaMascara,
  prepararMascaraParaEdicao } from '../mascaras';

type Origem = 'BENEFICIO' | 'COMISSAO';
type Responsavel = string;
type CentroCusto = { id: string; nome: string; ativo: boolean };
type Grupo = {
  id: string; nome: string; origem: Origem; responsavel: Responsavel;
  responsavelNome: string; centroCustoId: string | null; ativo: boolean;
};
type Campo = {
  id: string; grupoId: string; nome: string; tipo: string;
  classificacao: string; anoCriacao: number; mesCriacao: number;
  ordemGlobal: number; ativo: boolean;
};
type RegraDesconto = { id: string; campoOrigemId: string; campoDescontoId: string;
  nomeColuna: string; percentualPadrao: string | number; anoInicio: number; mesInicio: number;
  ativo: boolean; criadoEm: string };
type CampoEdicaoGrupo = Pick<Campo, 'id' | 'nome' | 'tipo' | 'classificacao' | 'ativo'> &
  { vigencia: string; descontoAutomatico: boolean; nomeColunaDesconto: string;
    percentualDesconto: string; vigenciaDesconto: string; descontoConfigurado: boolean };
type Dados = {
  grupos: Grupo[]; centrosCusto: CentroCusto[]; campos: Campo[];
  funcionariosPorGrupo: Record<string, string[]>;
  regrasDesconto: RegraDesconto[];
};
type Funcionario = { id: string; nome: string; ativo: boolean };
type Cadastro = { funcionarios: Funcionario[] };
type BasesBeneficio = {
  versao: number;
  campos: { id: string; nome: string; tipo: string }[];
  descontos: { campoOrigemId: string; campoDescontoId: string;
    nomeColuna: string; percentualPadrao: number }[];
  funcionarios: { id: string; nome: string; ativo: boolean;
    valores: Record<string, number | string | null>;
    percentuaisDesconto: Record<string, number> }[];
};
type Passo = 1 | 2 | 3;

const inicio: Dados = {
  grupos: [], centrosCusto: [], campos: [], funcionariosPorGrupo: {}, regrasDesconto: [],

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
const mesAtual = () => {
  const data = new Date();
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
};
function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.';
}

function regraDescontoVigente(regras: RegraDesconto[], campoId: string, competencia = mesAtual()) {
  const [ano, mes] = competencia.split('-').map(Number);
  const numeroCompetencia = ano * 12 + mes;
  return regras.filter(item => item.campoOrigemId === campoId &&
    item.anoInicio * 12 + item.mesInicio <= numeroCompetencia)
    .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
      a.criadoEm.localeCompare(b.criadoEm)).at(-1);
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
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [grupoEditando, setGrupoEditando] = useState<Grupo | null>(null);
  const [nomeGrupoEditando, setNomeGrupoEditando] = useState('');
  const [responsavelGrupoEditando, setResponsavelGrupoEditando] = useState<Responsavel>('NENHUM');
  const [camposGrupoEditando, setCamposGrupoEditando] = useState<CampoEdicaoGrupo[]>([]);
  const [funcionariosGrupoEditando, setFuncionariosGrupoEditando] = useState<string[]>([]);
  const [buscaFuncionariosGrupoEditando, setBuscaFuncionariosGrupoEditando] = useState('');
  const [campoEditando, setCampoEditando] = useState<Campo | null>(null);
  const [nomeCampoEditando, setNomeCampoEditando] = useState('');
  const [tipoCampoEditando, setTipoCampoEditando] = useState('moeda');
  const [classificacaoCampoEditando, setClassificacaoCampoEditando] = useState('provento');
  const [vigenciaCampoEditando, setVigenciaCampoEditando] = useState(mesAtual);
  const [geraDesconto, setGeraDesconto] = useState(false);
  const [nomeColunaDesconto, setNomeColunaDesconto] = useState('');
  const [percentualPadraoDesconto, setPercentualPadraoDesconto] = useState('0');
  const [vigenciaDesconto, setVigenciaDesconto] = useState(mesAtual);
  const [criacaoAberta, setCriacaoAberta] = useState(false);
  const [passo, setPasso] = useState<Passo>(1);
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState<Responsavel>('NENHUM');
  const [nomeCampo, setNomeCampo] = useState('');
  const [tipo, setTipo] = useState('moeda');
  const [classificacao, setClassificacao] = useState('provento');
  const [competencia, setCompetencia] = useState(mesAtual);
  const [geraDescontoCriacao, setGeraDescontoCriacao] = useState(false);
  const [nomeColunaDescontoCriacao, setNomeColunaDescontoCriacao] = useState('');
  const [percentualDescontoCriacao, setPercentualDescontoCriacao] = useState('0');
  const [vigenciaDescontoCriacao, setVigenciaDescontoCriacao] = useState(mesAtual);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [buscaFuncionario, setBuscaFuncionario] = useState('');
  const [campoAberto, setCampoAberto] = useState(false);
  const [erroCriacao, setErroCriacao] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [basesAbertas, setBasesAbertas] = useState(false);
  const [bases, setBases] = useState<BasesBeneficio | null>(null);
  const [vigenciaBases, setVigenciaBases] = useState(mesAtual);
  const [valoresBases, setValoresBases] = useState<Record<string, string>>({});
  const [valoresBasesOriginais, setValoresBasesOriginais] = useState<Record<string, string>>({});
  const [valoresPercentuaisDesconto, setValoresPercentuaisDesconto] = useState<Record<string, string>>({});
  const [valoresPercentuaisOriginais, setValoresPercentuaisOriginais] = useState<Record<string, string>>({});
  const [buscaBases, setBuscaBases] = useState('');
  const [funcionariosSelecionadosBase, setFuncionariosSelecionadosBase] = useState<string[]>([]);
  const [campoBaseEmMassa, setCampoBaseEmMassa] = useState('');
  const [valorBaseEmMassa, setValorBaseEmMassa] = useState('');
  const [carregandoBases, setCarregandoBases] = useState(false);
  const [erroBases, setErroBases] = useState('');
  const [avisoBases, setAvisoBases] = useState('');
  const [vinculosAbertos, setVinculosAbertos] = useState(false);
  const [listaVinculadosAberta, setListaVinculadosAberta] = useState(false);
  const [buscaListaVinculados, setBuscaListaVinculados] = useState('');
  const [selecionadosParaVincular, setSelecionadosParaVincular] = useState<string[]>([]);
  const [buscaVinculos, setBuscaVinculos] = useState('');
  const dialogoRef = useRef<HTMLDivElement>(null);
  const dialogoEdicaoRef = useRef<HTMLFormElement>(null);
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

  const chaveBase = (funcionarioId: string, campoId: string) => funcionarioId + ':' + campoId;

  async function carregarBasesBeneficio(id: string, competenciaMes: string): Promise<boolean> {
    setCarregandoBases(true);
    setErroBases('');
    setAvisoBases('');
    try {
      const resposta = await fetch('/api/configuracao/grupos/' + encodeURIComponent(id) +
        '/bases-beneficios?competencia=' + encodeURIComponent(competenciaMes),
      { credentials: 'include', cache: 'no-store' });
      await lerResposta(resposta);
      const resultado = await resposta.json() as BasesBeneficio;
      const valores = Object.fromEntries(resultado.funcionarios.flatMap(funcionario =>
        resultado.campos.map(campo => {
          const valor = funcionario.valores[campo.id];
          const numerico = campo.tipo === 'moeda' || campo.tipo === 'percentual';
          return [chaveBase(funcionario.id, campo.id), valor === null ? ''
            : numerico ? mascaraFinal(String(valor), campo.tipo as 'moeda' | 'percentual') : String(valor)];
        })));
      const percentuais = Object.fromEntries(resultado.funcionarios.flatMap(funcionario =>
        resultado.descontos.map(desconto => [chaveBase(funcionario.id, desconto.campoOrigemId),
          mascaraFinal(String(funcionario.percentuaisDesconto[desconto.campoOrigemId] ??
            desconto.percentualPadrao), 'percentual')])));
      setBases(resultado);
      setValoresBases(valores);
      setValoresBasesOriginais(valores);
      setValoresPercentuaisDesconto(percentuais);
      setValoresPercentuaisOriginais(percentuais);
      return true;
    } catch (e) {
      setErroBases(mensagemErro(e));
      setBases(null);
      setValoresBases({});
      setValoresBasesOriginais({});
      setValoresPercentuaisDesconto({});
      setValoresPercentuaisOriginais({});
      return false;
    } finally {
      setCarregandoBases(false);
    }
  }

  async function salvarBasesBeneficio() {
    if (!grupoSelecionado || !bases || ocupado) return;
    let invalido = false;
    const valores: { funcionarioId: string; campoId: string; valor: number | string }[] = [];
    const percentuaisDesconto: { funcionarioId: string; campoOrigemId: string; percentual: number }[] = [];
    for (const funcionario of bases.funcionarios) {
      for (const campo of bases.campos) {
        const chave = chaveBase(funcionario.id, campo.id);
        const valor = valoresBases[chave]?.trim() ?? '';
        if (!valor || valor === (valoresBasesOriginais[chave] ?? '')) continue;
        if (campo.tipo === 'moeda' || campo.tipo === 'percentual') {
          const numero = numeroDaMascara(valor);
          if (!Number.isFinite(numero) || (campo.tipo === 'moeda' && numero < 0)) {
            invalido = true;
            continue;
          }
          valores.push({ funcionarioId: funcionario.id, campoId: campo.id, valor: numero });
        } else {
          valores.push({ funcionarioId: funcionario.id, campoId: campo.id, valor });
        }
      }
      for (const desconto of bases.descontos) {
        const chave = chaveBase(funcionario.id, desconto.campoOrigemId);
        const entrada = valoresPercentuaisDesconto[chave]?.trim() ?? '';
        if (!entrada || entrada === (valoresPercentuaisOriginais[chave] ?? '')) continue;
        const percentual = numeroDaMascara(entrada);
        if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
          invalido = true;
          continue;
        }
        percentuaisDesconto.push({ funcionarioId: funcionario.id,
          campoOrigemId: desconto.campoOrigemId, percentual });
      }
    }
    if (invalido) {
      setErroBases('Confira os valores numéricos. Moeda não pode ser negativa.');
      return;
    }
    if (!valores.length && !percentuaisDesconto.length) {
      setAvisoBases('Nenhum valor novo para salvar.');
      return;
    }
    setOcupado(true);
    setErroBases('');
    setAvisoBases('');
    try {
      const resposta = await enviar('/api/configuracao/grupos/' +
        encodeURIComponent(grupoSelecionado.id) + '/bases-beneficios', {
        competencia: vigenciaBases, versaoEsperada: bases.versao, valores, percentuaisDesconto,
      });
      const resultado = await resposta.json() as { salvos: number };
      const atualizado = await carregarBasesBeneficio(grupoSelecionado.id, vigenciaBases);
      if (!atualizado) return;
      setAvisoBases(resultado.salvos
        ? `${resultado.salvos} valor(es) ou percentual(is) atualizado(s) a partir de ${mesNome(vigenciaBases)}.`
        : 'Os valores já estavam atualizados.');
    } catch (e) {
      setErroBases(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  function preencherBasesSelecionadas() {
    if (!bases || !campoBaseEmMassa || !funcionariosSelecionadosBase.length) return;
    const campo = bases.campos.find(item => item.id === campoBaseEmMassa);
    if (!campo || !valorBaseEmMassa.trim()) {
      setErroBases('Selecione um campo e informe o valor a repetir.');
      return;
    }
    let valorAplicado = valorBaseEmMassa;
    if (campo.tipo === 'moeda' || campo.tipo === 'percentual') {
      const valor = numeroDaMascara(valorBaseEmMassa);
      if (!Number.isFinite(valor) || (campo.tipo === 'moeda' && valor < 0)) {
        setErroBases('Informe um número válido. Moeda não pode ser negativa.');
        return;
      }
      valorAplicado = mascaraFinal(valorBaseEmMassa, campo.tipo);
      setValorBaseEmMassa(valorAplicado);
    }
    setValoresBases(atual => {
      const novo = { ...atual };
      for (const funcionarioId of funcionariosSelecionadosBase)
        novo[chaveBase(funcionarioId, campo.id)] = valorAplicado;
      return novo;
    });
    setErroBases('');
    setAvisoBases(`Valor preenchido para ${funcionariosSelecionadosBase.length} funcionário(s). Clique em Salvar valores recorrentes para gravar.`);
  }

  async function vincularFuncionariosGrupo() {
    if (!grupoSelecionado || !selecionadosParaVincular.length || ocupado) return;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const resposta = await enviar('/api/configuracao/grupos/' +
        encodeURIComponent(grupoSelecionado.id) + '/funcionarios', {
        funcionariosIds: selecionadosParaVincular,
      });
      const resultado = await resposta.json() as { vinculados: number };
      setVinculosAbertos(false);
      setSelecionadosParaVincular([]);
      setBuscaVinculos('');
      await carregar();
      if (basesAbertas) await carregarBasesBeneficio(grupoSelecionado.id, vigenciaBases);
      setAviso(`${resultado.vinculados} funcionário(s) vinculado(s) permanentemente ao cadastro.`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  function mesNome(valor: string) {
    const [ano, mes] = valor.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(ano, mes - 1, 1)));
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
    setCompetencia(mesAtual());
    setGeraDescontoCriacao(false);
    setNomeColunaDescontoCriacao('');
    setPercentualDescontoCriacao('0');
    setVigenciaDescontoCriacao(mesAtual());
    setSelecionados([]);
    setBuscaFuncionario('');
    setPasso(1);
    setErroCriacao('');
    setErro('');
    setAviso('');
    setCriacaoAberta(true);
  }

  function mudarAba(proxima: Origem) {
    if (proxima === aba || ocupado || carregandoBases) return;
    setAba(proxima);
    setGrupoId('');
    setBasesAbertas(false);
    setBases(null);
    setVinculosAbertos(false);
    setCampoAberto(false);
    setCriacaoAberta(false);
    setNomeCampo('');
    setErro('');
    setAviso('');
  }

  function lidarComTeclado(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      if (ocupado) return;
      if (grupoEditando) setGrupoEditando(null);
      else if (campoEditando) setCampoEditando(null);
      else fecharCriacao();
      return;
    }
    const dialogo = dialogoEdicaoRef.current ?? dialogoRef.current;
    if (evento.key !== 'Tab' || !dialogo) return;
    const elementos = Array.from(dialogo.querySelectorAll<HTMLElement>(
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
    const [anoDesconto, mesDesconto] = vigenciaDescontoCriacao.split('-').map(Number);
    const percentual = Number(percentualDescontoCriacao.replace(',', '.'));
    if (aba === 'BENEFICIO' && tipo === 'moeda' && geraDescontoCriacao &&
      (!nomeColunaDescontoCriacao.trim() || !anoDesconto || !mesDesconto || mesDesconto > 12 ||
        anoDesconto * 12 + mesDesconto < Number(mesAtual().slice(0, 4)) * 12 + Number(mesAtual().slice(5, 7)) ||
        !Number.isFinite(percentual) || percentual < 0 || percentual > 100)) {
      setErroCriacao('Informe o nome da coluna, uma competência atual ou futura e um percentual entre 0 e 100.');
      setPasso(2);
      return;
    }
    setOcupado(true);
    setErroCriacao('');
    try {
      const resposta = await enviar('/api/configuracao/criacao', {
        nome: nome.trim(), origem: aba,
        responsavel: aba === 'BENEFICIO' ? 'NENHUM' : responsavel,
        campo: { nome: nomeCampo.trim(), tipo, classificacao, ...vigencia },
        ...(aba === 'BENEFICIO' && tipo === 'moeda' && geraDescontoCriacao ? {
          descontoBeneficio: {
            nomeColuna: nomeColunaDescontoCriacao.trim(), percentualPadrao: percentual,
            ano: anoDesconto, mes: mesDesconto,
          },
        } : {}),
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
    if (campo.ativo && !window.confirm(`Excluir o campo “${campo.nome}” dos cadastros ativos? Ele será arquivado para novos lançamentos; valores e competências históricos serão preservados.`)) return;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await enviar('/api/configuracao/campos/' + encodeURIComponent(campo.id) + '/status',
        { ativo: !campo.ativo });
      await carregar();
      setAviso(campo.ativo ? 'Campo excluído dos ativos e arquivado com o histórico preservado.' : 'Campo restaurado.');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  function iniciarEdicaoGrupo(grupo: Grupo) {
    setGrupoEditando(grupo);
    setNomeGrupoEditando(grupo.nome);
    setResponsavelGrupoEditando(grupo.responsavel);
    setCamposGrupoEditando(dados.campos.filter(campo => campo.grupoId === grupo.id)
      .map(campo => {
        const regra = regraDescontoVigente(dados.regrasDesconto, campo.id);
        return {
          id: campo.id, nome: campo.nome, tipo: campo.tipo, classificacao: campo.classificacao,
          ativo: campo.ativo,
          vigencia: `${campo.anoCriacao}-${String(campo.mesCriacao).padStart(2, '0')}`,
          descontoAutomatico: regra?.ativo ?? false,
          descontoConfigurado: regra?.ativo ?? false,
          nomeColunaDesconto: regra?.nomeColuna ?? '',
          percentualDesconto: String(regra?.percentualPadrao ?? 0),
          vigenciaDesconto: mesAtual(),
        };
      }));
    setFuncionariosGrupoEditando(dados.funcionariosPorGrupo[grupo.id] ?? []);
    setBuscaFuncionariosGrupoEditando('');
    setErro('');
    setAviso('');
  }

  async function salvarEdicaoGrupo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!grupoEditando || ocupado) return;
    if (grupoEditando.origem === 'BENEFICIO') {
      for (const campo of camposGrupoEditando) {
        if (!campo.descontoAutomatico || campo.tipo !== 'moeda') continue;
        const [ano, mes] = campo.vigenciaDesconto.split('-').map(Number);
        const percentual = Number(campo.percentualDesconto.replace(',', '.'));
        const competenciaAtual = mesAtual();
        if (!campo.nomeColunaDesconto.trim() || !ano || !mes || mes > 12 ||
          ano * 12 + mes < Number(competenciaAtual.slice(0, 4)) * 12 + Number(competenciaAtual.slice(5, 7)) ||
          !Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
          setErro('Informe o nome da coluna, uma competência atual ou futura e um percentual entre 0 e 100.');
          return;
        }
      }
    }
    setOcupado(true); setErro(''); setAviso('');
    try {
      await enviar('/api/configuracao/grupos/' + encodeURIComponent(grupoEditando.id) + '/editar-completo', {
        nome: nomeGrupoEditando.trim(), responsavel: grupoEditando.origem === 'BENEFICIO'
          ? 'NENHUM' : responsavelGrupoEditando,
        campos: camposGrupoEditando.map(campo => {
          const [ano, mes] = campo.vigencia.split('-').map(Number);
          return { id: campo.id, nome: campo.nome.trim(), tipo: campo.tipo,
            classificacao: campo.classificacao, ano, mes, ativo: campo.ativo };
        }),
        funcionariosIds: funcionariosGrupoEditando,
      });
      if (grupoEditando.origem === 'BENEFICIO') {
        for (const campo of camposGrupoEditando) {
          const regraAtual = regraDescontoVigente(dados.regrasDesconto, campo.id);
          const ativo = campo.descontoAutomatico && campo.tipo === 'moeda';
          const percentual = Number(campo.percentualDesconto.replace(',', '.'));
          const nomeColuna = campo.nomeColunaDesconto.trim() ||
            regraAtual?.nomeColuna || `Desconto ${campo.nome.trim()}`;
          const regraAtiva = regraAtual?.ativo ?? false;
          const precisaSalvar = ativo
            ? !regraAtiva || nomeColuna !== regraAtual?.nomeColuna ||
              percentual !== Number(regraAtual?.percentualPadrao)
            : regraAtiva;
          if (!precisaSalvar) continue;
          await enviar('/api/configuracao/campos/' + encodeURIComponent(campo.id) +
            '/desconto-beneficio', {
            nomeColuna, percentualPadrao: Number.isFinite(percentual)
              ? percentual : Number(regraAtual?.percentualPadrao ?? 0),
            competencia: campo.vigenciaDesconto, ativo,
          });
        }
      }
      setGrupoEditando(null);
      await carregar();
      setAviso('Cadastro, campos e funcionários vinculados atualizados.');
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  async function alterarStatusGrupo(grupo: Grupo) {
    if (ocupado) return;
    const ativar = !grupo.ativo;
    const mensagem = ativar
      ? `Restaurar ${grupo.origem === 'BENEFICIO' ? 'o benefício' : 'a comissão'} “${grupo.nome}”?`
      : `Excluir “${grupo.nome}” dos cadastros ativos? O item será arquivado para novos lançamentos, e seu histórico será preservado. É possível restaurá-lo depois.`;
    if (!window.confirm(mensagem)) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      await enviar('/api/configuracao/grupos/' + encodeURIComponent(grupo.id) + '/status', { ativo: ativar });
      if (!ativar && grupoId === grupo.id) setGrupoId('');
      await carregar();
      setAviso(ativar ? 'Cadastro restaurado.' : 'Cadastro excluído dos ativos e arquivado com o histórico preservado.');
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  function iniciarEdicaoCampo(campo: Campo) {
    setCampoEditando(campo);
    setNomeCampoEditando(campo.nome);
    setTipoCampoEditando(campo.tipo);
    setClassificacaoCampoEditando(campo.classificacao);
    setVigenciaCampoEditando(`${campo.anoCriacao}-${String(campo.mesCriacao).padStart(2, '0')}`);
    const [anoAtual, mesAtualNumero] = mesAtual().split('-').map(Number);
    const regra = dados.regrasDesconto.filter(item => item.campoOrigemId === campo.id &&
      item.anoInicio * 12 + item.mesInicio <= anoAtual * 12 + mesAtualNumero)
      .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
        a.criadoEm.localeCompare(b.criadoEm)).at(-1);
    setGeraDesconto(regra?.ativo ?? false);
    setNomeColunaDesconto(regra?.nomeColuna ?? '');
    setPercentualPadraoDesconto(String(regra?.percentualPadrao ?? 0));
    setVigenciaDesconto(mesAtual());
    setErro(''); setAviso('');
  }

  async function salvarEdicaoCampo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!campoEditando || ocupado) return;
    const [ano, mes] = vigenciaCampoEditando.split('-').map(Number);
    if (!ano || ano < 2000 || ano > 2200 || !mes || mes > 12) {
      setErro('Escolha uma competência válida para a vigência.'); return;
    }
    const percentualDesconto = Number(percentualPadraoDesconto.replace(',', '.'));
    if (aba === 'BENEFICIO' && tipoCampoEditando === 'moeda' && geraDesconto &&
      (!nomeColunaDesconto.trim() || !Number.isFinite(percentualDesconto) ||
        percentualDesconto < 0 || percentualDesconto > 100)) {
      setErro('Informe o nome da coluna e um percentual entre 0 e 100.'); return;
    }
    setOcupado(true); setErro(''); setAviso('');
    try {
      await enviar('/api/configuracao/campos/' + encodeURIComponent(campoEditando.id) + '/editar', {
        nome: nomeCampoEditando.trim(), tipo: tipoCampoEditando,
        classificacao: classificacaoCampoEditando, ano, mes,
      });
      const competenciaDesconto = Number(vigenciaDesconto.slice(0, 4)) * 12 +
        Number(vigenciaDesconto.slice(5, 7));
      const regraVigente = dados.regrasDesconto.filter(item => item.campoOrigemId === campoEditando.id &&
        item.anoInicio * 12 + item.mesInicio <= competenciaDesconto)
        .sort((a, b) => a.anoInicio * 12 + a.mesInicio - (b.anoInicio * 12 + b.mesInicio) ||
          a.criadoEm.localeCompare(b.criadoEm)).at(-1);
      const existeRegra = regraVigente?.ativo ?? false;
      if ((aba === 'BENEFICIO' && tipoCampoEditando === 'moeda' && geraDesconto) || existeRegra) {
        await enviar('/api/configuracao/campos/' + encodeURIComponent(campoEditando.id) +
          '/desconto-beneficio', {
          nomeColuna: nomeColunaDesconto.trim() || `Desconto ${nomeCampoEditando.trim()}`,
          percentualPadrao: Number.isFinite(percentualDesconto) ? percentualDesconto : 0,
          competencia: vigenciaDesconto,
          ativo: geraDesconto && tipoCampoEditando === 'moeda',
        });
      }
      setCampoEditando(null);
      await carregar();
      if (basesAbertas && grupoSelecionado?.origem === 'BENEFICIO')
        await carregarBasesBeneficio(grupoSelecionado.id, vigenciaBases);
      setAviso('Campo atualizado.');
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  async function removerVinculo(funcionario: Funcionario) {
    if (!grupoSelecionado || ocupado) return;
    if (!window.confirm(`Remover ${funcionario.nome} deste cadastro? Os registros históricos serão preservados.`)) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      await enviar('/api/configuracao/grupos/' + encodeURIComponent(grupoSelecionado.id) +
        '/funcionarios/' + encodeURIComponent(funcionario.id) + '/remover', {});
      await carregar();
      if (basesAbertas) await carregarBasesBeneficio(grupoSelecionado.id, vigenciaBases);
      setAviso('Funcionário removido do cadastro; os registros históricos foram preservados.');
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  const grupos = dados.grupos.filter(item => item.origem === aba);
  const gruposVisiveis = grupos.filter(item => item.ativo || mostrarExcluidos);
  const grupoSelecionado = grupos.find(item => item.id === grupoId);
  const campos = dados.campos.filter(item => item.grupoId === grupoId);
  const rotulo = informacoes[aba];
  // Qualquer vínculo empregatício cadastrado pode ser associado ao grupo.
  const filtrados = funcionarios.filter(item =>
    item.nome.toLocaleLowerCase('pt-BR').includes(buscaFuncionario.toLocaleLowerCase('pt-BR')));
  const idsVinculados = dados.funcionariosPorGrupo[grupoId] ?? [];
  const vinculados = funcionarios.filter(item => idsVinculados.includes(item.id));
  const vinculadosFiltrados = vinculados.filter(item =>
    item.nome.toLocaleLowerCase('pt-BR').includes(buscaListaVinculados.trim().toLocaleLowerCase('pt-BR')));
  const disponiveisParaVincular = funcionarios.filter(item => !idsVinculados.includes(item.id) &&
    item.nome.toLocaleLowerCase('pt-BR').includes(buscaVinculos.toLocaleLowerCase('pt-BR')));

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
            disabled={ocupado || carregandoBases}
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
              <div className="config-selecao-cabecalho">
                <div><h4>Cadastros de {rotulo.titulo.toLowerCase()}</h4>
                  <p>Selecione um item para consultar os vínculos e gerenciar os campos.</p></div>
                {grupos.some(item => !item.ativo) && <label className="config-mostrar-excluidos">
                  <input type="checkbox" checked={mostrarExcluidos}
                    onChange={evento => setMostrarExcluidos(evento.target.checked)} />
                  Mostrar excluídos
                </label>}
              </div>
              <div className="config-lista-grupos">
                {gruposVisiveis.map(item => (
                  <article key={item.id} className={'config-grupo-cartao' +
                    (grupoId === item.id ? ' selecionado' : '') + (!item.ativo ? ' arquivado' : '')}>
                    <button type="button"
                      className={'config-grupo' + (grupoId === item.id ? ' ativo' : '')}
                      disabled={ocupado || carregandoBases}
                      aria-expanded={grupoId === item.id}
                      aria-controls="config-detalhes"
                      onClick={() => {
                      setGrupoId(atual => atual === item.id ? '' : item.id);
                      setBasesAbertas(false);
                      setBases(null);
                      setBuscaBases('');
                      setFuncionariosSelecionadosBase([]);
                      setCampoBaseEmMassa('');
                      setValorBaseEmMassa('');
                      setVinculosAbertos(false);
                      setListaVinculadosAberta(false);
                      setBuscaListaVinculados('');
                      setSelecionadosParaVincular([]);
                      setBuscaVinculos('');
                      setCampoAberto(false);
                      setNomeCampo('');
                      setErro('');
                      setAviso('');
                    }}>
                      <span>{item.nome}</span>
                      {item.origem === 'COMISSAO' && <small>{item.responsavelNome}</small>}
                      <small>{dados.campos.filter(c => c.grupoId === item.id).length} campos</small>
                      <small>{(dados.funcionariosPorGrupo[item.id] ?? []).length} funcionários</small>
                      {!item.ativo && <small>Excluído</small>}
                    </button>
                    <div className="config-grupo-acoes">
                      <button type="button" className="acao-cadastro-icone"
                        aria-label={'Editar todos os dados de ' + item.nome}
                        title={'Editar cadastro completo'}
                        disabled={ocupado} onClick={() => iniciarEdicaoGrupo(item)}>
                        <PencilSquareIcon aria-hidden="true" />
                      </button>
                      <button type="button" className="acao-cadastro-icone"
                        aria-label={(item.ativo ? 'Excluir ' : 'Restaurar ') + item.nome}
                        title={item.ativo ? 'Excluir cadastro' : 'Restaurar cadastro'}
                        disabled={ocupado}
                        onClick={() => void alterarStatusGrupo(item)}>
                        {item.ativo ? <TrashIcon aria-hidden="true" /> : <ArrowPathIcon aria-hidden="true" />}
                      </button>
                    </div>
                  </article>
                ))}
                {gruposVisiveis.length === 0 && <p className="config-sem-vinculos">
                  Todos os cadastros estão excluídos. Marque “Mostrar excluídos” para restaurar um deles.
                </p>}
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
                  <button type="button" className="acao-principal" disabled={ocupado || !grupoSelecionado.ativo}
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

                {!grupoSelecionado.ativo && <p className="config-aviso-arquivado" role="status">
                  Cadastro excluído dos ativos. O histórico continua disponível; restaure-o pelo card para voltar a editar ou lançar valores.
                </p>}

                {campoAberto && grupoSelecionado.ativo && (
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
                  <div className="config-titulo-detalhes">
                    <div className="config-acoes-vinculados">
                      <button type="button" className="config-toggle-vinculados"
                        aria-expanded={listaVinculadosAberta} aria-controls="lista-funcionarios-vinculados"
                        onClick={() => setListaVinculadosAberta(atual => !atual)}>
                        Funcionários vinculados <strong>{vinculados.length}</strong>
                        <span>{listaVinculadosAberta ? 'Ocultar' : 'Mostrar'}</span>
                      </button>
                      <button type="button" className="botao-secundario" disabled={ocupado || !grupoSelecionado.ativo}
                        aria-expanded={vinculosAbertos} aria-controls="adicionar-funcionarios-grupo"
                        onClick={() => {
                          setVinculosAbertos(atual => !atual);
                          setSelecionadosParaVincular([]);
                          setBuscaVinculos('');
                        }}>
                        {vinculosAbertos ? 'Fechar seleção' : 'Adicionar funcionários'}
                      </button>
                      {listaVinculadosAberta && vinculados.length > 0 && (
                        <label className="filtro-funcionario busca-cabecalho">Buscar funcionário vinculado
                          <input type="search" value={buscaListaVinculados}
                            onChange={evento => setBuscaListaVinculados(evento.target.value)}
                            placeholder="Digite o nome" autoComplete="off" />
                        </label>
                      )}
                    </div>
                  </div>
                  {listaVinculadosAberta && <div id="lista-funcionarios-vinculados">
                    {vinculados.length === 0 ? (
                      <p className="config-sem-vinculos">Nenhum funcionário vinculado a este cadastro.</p>
                    ) : (
                      <>
                        {vinculadosFiltrados.length ? (
                          <ul className="config-lista-funcionarios-vinculados">{vinculadosFiltrados.map(item => (
                            <li key={item.id}><span>{item.nome}{!item.ativo ? ' (inativo)' : ''}</span>
                              {grupoSelecionado.ativo && <button type="button" className="acao-cadastro-icone"
                                aria-label={'Remover ' + item.nome + ' deste cadastro'}
                                title={'Remover ' + item.nome + ' deste cadastro'} disabled={ocupado}
                                onClick={() => void removerVinculo(item)}>
                                <UserMinusIcon aria-hidden="true" />
                              </button>}
                            </li>
                          ))}</ul>
                        ) : <p className="config-sem-vinculos">Nenhum funcionário encontrado.</p>}
                      </>
                    )}
                  </div>}
                  {vinculosAbertos && grupoSelecionado.ativo && (
                    <div id="adicionar-funcionarios-grupo" className="config-aviso-vinculos">
                      <label htmlFor="busca-funcionarios-beneficio">Buscar funcionário
                        <input id="busca-funcionarios-beneficio" value={buscaVinculos}
                          onChange={evento => setBuscaVinculos(evento.target.value)}
                          placeholder="Digite um nome" />
                      </label>
                      <div className="config-selecao-todos">
                        <span>{selecionadosParaVincular.length} selecionado(s)</span>
                        <button type="button" className="botao-secundario"
                          onClick={() => setSelecionadosParaVincular(atual =>
                            [...new Set([...atual, ...disponiveisParaVincular.map(f => f.id)])])}>
                          Selecionar visíveis
                        </button>
                        <button type="button" className="botao-secundario"
                          onClick={() => setSelecionadosParaVincular([])}>Limpar seleção</button>
                      </div>
                      <div className="config-checklist">
                        {disponiveisParaVincular.map(item => (
                          <label key={item.id} className="config-item-funcionario">
                            <input type="checkbox" checked={selecionadosParaVincular.includes(item.id)}
                              onChange={evento => setSelecionadosParaVincular(atual => evento.target.checked
                                ? [...atual, item.id] : atual.filter(id => id !== item.id))} />
                            <span>{item.nome}{item.ativo ? '' : ' (inativo)'}</span>
                          </label>
                        ))}
                        {disponiveisParaVincular.length === 0 && (
                          <p className="config-sem-vinculos">Não há funcionários disponíveis nesta busca.</p>
                        )}
                      </div>
                      <div className="config-acoes-form">
                        <button type="button" className="botao-secundario" disabled={ocupado}
                          onClick={() => setVinculosAbertos(false)}>Cancelar</button>
                        <button type="button" className="acao-principal" disabled={ocupado || !selecionadosParaVincular.length}
                          onClick={() => void vincularFuncionariosGrupo()}>
                          {ocupado ? 'Salvando...' : 'Vincular selecionados'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {grupoSelecionado.origem === 'BENEFICIO' && (
                  <section className="config-bases-beneficio" aria-label="Valores recorrentes por funcionário">
                    <div className="config-titulo-detalhes">
                      <div>
                        <h4>Valores recorrentes por funcionário</h4>
                        <p>Defina um valor próprio para cada funcionário e campo, com início por competência.</p>
                      </div>
                      {basesAbertas && <label className="filtro-funcionario busca-cabecalho">
                        Buscar funcionário
                        <input type="search" value={buscaBases}
                          onChange={evento => setBuscaBases(evento.target.value)}
                          placeholder="Digite o nome" autoComplete="off" />
                      </label>}
                      <button type="button" className="botao-secundario" disabled={ocupado || !grupoSelecionado.ativo}
                        aria-expanded={basesAbertas}
                        onClick={() => {
                          const abrir = !basesAbertas;
                          setBasesAbertas(abrir);
                          if (abrir) void carregarBasesBeneficio(grupoSelecionado.id, vigenciaBases);
                        }}>
                        {basesAbertas ? 'Fechar valores' : 'Configurar valores'}
                      </button>
                    </div>
                    {basesAbertas && (
                      <div className="config-editor-bases">
                        <label htmlFor="config-vigencia-bases">Válidos a partir da competência
                      <input id="config-vigencia-bases" type="month" required
                            value={vigenciaBases}
                            disabled={ocupado || carregandoBases || !grupoSelecionado.ativo}
                            onChange={evento => {
                              const valor = evento.target.value;
                              setVigenciaBases(valor);
                              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(valor))
                                void carregarBasesBeneficio(grupoSelecionado.id, valor);
                            }} />
                        </label>
                        <p className="config-ajuda-bases">
                          Cada valor será recorrente desde esse mês. Uma célula vazia não altera uma base existente;
                          informe 0 para registrar zero explicitamente. A exceção de um único mês continua na Consolidação.
                        </p>
                        {bases && <div className="edicao-massa" aria-label="Repetir valor em funcionarios selecionados">
                          <div className="edicao-massa-topo">
                            <strong>{funcionariosSelecionadosBase.length} funcionario(s) selecionado(s)</strong>
                            <button type="button" className="botao-secundario" disabled={ocupado || carregandoBases || !grupoSelecionado.ativo}
                              onClick={() => setFuncionariosSelecionadosBase(bases.funcionarios.map(f => f.id))}>
                              Selecionar todos
                            </button>
                            <button type="button" className="botao-secundario" disabled={ocupado || carregandoBases || !grupoSelecionado.ativo}
                              onClick={() => setFuncionariosSelecionadosBase([])}>Limpar selecao</button>
                          </div>
                          <label>Campo
                            <select value={campoBaseEmMassa} disabled={ocupado || carregandoBases || !grupoSelecionado.ativo}
                              onChange={evento => { setCampoBaseEmMassa(evento.target.value); setValorBaseEmMassa(''); }}>
                              <option value="">Selecione um campo</option>
                              {bases.campos.map(campo => <option key={campo.id} value={campo.id}>{campo.nome}</option>)}
                            </select>
                          </label>
                          {(() => {
                            const campo = bases?.campos.find(item => item.id === campoBaseEmMassa);
                            if (!campo) return null;
                            const numerico = campo.tipo === 'moeda' || campo.tipo === 'percentual';
                            return <label>Valor a repetir
                              <span className="entrada-com-mascara">
                                <input type={campo.tipo === 'data' ? 'date' : campo.tipo === 'horario' ? 'time' : 'text'}
                                  inputMode={numerico ? 'decimal' : undefined} value={valorBaseEmMassa}
                                  disabled={ocupado || carregandoBases}
                                  onFocus={evento => {
                                    if (numerico) setValorBaseEmMassa(prepararMascaraParaEdicao(evento.currentTarget));
                                  }}
                                  onChange={evento => setValorBaseEmMassa(numerico
                                    ? atualizarMascaraComCursor(evento.currentTarget,
                                      campo.tipo as 'moeda' | 'percentual') : evento.target.value)}
                                  onBlur={() => {
                                    if (numerico) setValorBaseEmMassa(atual => mascaraFinal(atual,
                                      campo.tipo as 'moeda' | 'percentual'));
                                  }} />
                              </span>
                            </label>;
                          })()}
                          <div className="edicao-massa-acoes">
                            <button type="button" className="botao-secundario"
                              disabled={ocupado || carregandoBases || !campoBaseEmMassa ||
                                !funcionariosSelecionadosBase.length || !valorBaseEmMassa.trim()}
                              onClick={preencherBasesSelecionadas}>Preencher selecionados</button>
                            {bases.campos.length > 0 && bases.funcionarios.length > 0 && (
                              <button type="button" className="acao-principal"
                                disabled={ocupado || carregandoBases || !grupoSelecionado.ativo}
                                onClick={() => void salvarBasesBeneficio()}>
                                {ocupado ? 'Salvando...' : 'Salvar valores recorrentes'}
                              </button>
                            )}
                          </div>
                        </div>}
                        {erroBases && <p className="erro" role="alert">{erroBases}</p>}
                        {avisoBases && <p className="feedback" role="status">{avisoBases}</p>}
                        {carregandoBases ? (
                          <p className="config-vazio">Carregando valores...</p>
                        ) : !bases ? null : bases.campos.length === 0 ? (
                          <p className="config-sem-vinculos">Este benefício ainda não tem campos ativos.</p>
                        ) : bases.funcionarios.length === 0 ? (
                          <p className="config-sem-vinculos">Vincule funcionários ao benefício para configurar valores.</p>
                        ) : (
                          <>
                            <div className="rolagem-tabela">
                              <table className="tabela-principal tabela-bases-beneficio">
                                <thead><tr><th scope="col">Selecionar</th><th scope="col">Funcionário</th>
                                  {bases.campos.map(campo => <th scope="col" key={campo.id}>
                                    {campo.nome}<span>{campo.tipo}</span>
                                  </th>)}
                                  {bases.descontos.map(desconto => <th scope="col" key={desconto.campoDescontoId}>
                                    {desconto.nomeColuna}<span>Percentual recorrente</span>
                                  </th>)}
                                </tr></thead>
                                <tbody>{bases.funcionarios.filter(funcionario =>
                                  funcionario.nome.toLocaleLowerCase('pt-BR')
                                    .includes(buscaBases.trim().toLocaleLowerCase('pt-BR'))).map(funcionario => (
                                  <tr key={funcionario.id}>
                                    <td><input type="checkbox" aria-label={'Selecionar ' + funcionario.nome}
                                      checked={funcionariosSelecionadosBase.includes(funcionario.id)}
                                      onChange={evento => setFuncionariosSelecionadosBase(atual => evento.target.checked
                                        ? [...new Set([...atual, funcionario.id])]
                                        : atual.filter(id => id !== funcionario.id))} /></td>
                                    <td className="nome-pessoa">{funcionario.nome}{funcionario.ativo ? '' : ' (inativo)'}</td>
                                    {bases.campos.map(campo => {
                                      const chave = chaveBase(funcionario.id, campo.id);
                                      const tipoEntrada = campo.tipo === 'data' ? 'date'
                                        : campo.tipo === 'horario' ? 'time'
                                          : 'text';
                                      return <td key={campo.id}>
                                        <span className="editor-valor-mascarado">
                                        <input className="editor-valor-base" type={tipoEntrada}
                                          inputMode={campo.tipo === 'moeda' || campo.tipo === 'percentual'
                                            ? 'decimal' : undefined}
                                          aria-label={`${campo.nome} para ${funcionario.nome}`}
                                          value={valoresBases[chave] ?? ''}
                                          disabled={ocupado || carregandoBases}
                                          onChange={evento => {
                                            const numerico = campo.tipo === 'moeda' || campo.tipo === 'percentual';
                                            const valor = numerico
                                              ? atualizarMascaraComCursor(evento.currentTarget,
                                                campo.tipo as 'moeda' | 'percentual')
                                              : evento.target.value;
                                            setValoresBases(atual => ({ ...atual, [chave]: valor }));
                                          }}
                                          onFocus={evento => {
                                            if (campo.tipo === 'moeda' || campo.tipo === 'percentual') {
                                              const valor = prepararMascaraParaEdicao(evento.currentTarget);
                                              setValoresBases(atual => ({ ...atual, [chave]: valor }));
                                            }
                                          }}
                                          onBlur={() => {
                                            if (campo.tipo === 'moeda' || campo.tipo === 'percentual')
                                              setValoresBases(atual => ({ ...atual,
                                                [chave]: mascaraFinal(atual[chave] ?? '',
                                                  campo.tipo as 'moeda' | 'percentual') }));
                                          }} />
                                        </span>
                                      </td>;
                                    })}
                                    {bases.descontos.map(desconto => {
                                      const chave = chaveBase(funcionario.id, desconto.campoOrigemId);
                                      return <td key={desconto.campoDescontoId}>
                                        <span className="editor-valor-mascarado config-percentual-desconto">
                                          <input className="editor-valor-base" type="text" inputMode="decimal"
                                            aria-label={`${desconto.nomeColuna} em percentual para ${funcionario.nome}`}
                                            value={valoresPercentuaisDesconto[chave] ?? ''}
                                            disabled={ocupado || carregandoBases || vigenciaBases < mesAtual()}
                                            onChange={evento => setValoresPercentuaisDesconto(atual => ({
                                              ...atual, [chave]: atualizarMascaraComCursor(
                                                evento.currentTarget, 'percentual'),
                                            }))}
                                            onFocus={evento => {
                                              const valor = prepararMascaraParaEdicao(evento.currentTarget);
                                              setValoresPercentuaisDesconto(atual => ({ ...atual, [chave]: valor }));
                                            }}
                                            onBlur={() => setValoresPercentuaisDesconto(atual => ({ ...atual,
                                              [chave]: mascaraFinal(atual[chave] ?? '', 'percentual') }))} />
                                          <span>%</span>
                                        </span>
                                      </td>;
                                    })}
                                  </tr>
                                ))}{!bases.funcionarios.some(funcionario =>
                                  funcionario.nome.toLocaleLowerCase('pt-BR')
                                    .includes(buscaBases.trim().toLocaleLowerCase('pt-BR'))) && (
                                    <tr><td colSpan={bases.campos.length + bases.descontos.length + 2} className="config-linha-vazia">
                                      Nenhum funcionário encontrado.
                                    </td></tr>
                                  )}</tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                )}

                <div className="config-tabela-titulo">
                  <h4>Campos de {grupoSelecionado.nome}</h4>
                  <span>{campos.length} {campos.length === 1 ? 'campo' : 'campos'}</span>
                </div>
                <div className="rolagem-tabela">
                  <table className="tabela-principal">
                    <thead><tr><th scope="col">Campo</th><th scope="col">Tipo</th>
                      <th scope="col">Classificação</th><th scope="col">Vigência</th>
                      <th scope="col">Ordem</th><th scope="col">Situação</th>
                      <th scope="col">Ações</th></tr></thead>
                    <tbody>
                      {campos.map(campo => (
                        <tr key={campo.id}>
                          <td>{campo.nome}</td><td>{campo.tipo}</td><td>{campo.classificacao}</td>
                          <td>{String(campo.mesCriacao).padStart(2, '0')}/{campo.anoCriacao}</td>
                          <td>{campo.ordemGlobal}</td><td>{campo.ativo ? 'Ativo' : 'Excluído'}</td>
                          <td><div className="acoes-cadastro">
                            <button type="button" className="acao-cadastro-icone"
                              aria-label={'Editar campo ' + campo.nome} title={'Editar campo ' + campo.nome}
                              disabled={ocupado || !grupoSelecionado.ativo}
                              onClick={() => iniciarEdicaoCampo(campo)}>
                              <PencilSquareIcon aria-hidden="true" />
                            </button>
                            <button type="button" className="acao-cadastro-icone"
                              aria-label={(campo.ativo ? 'Excluir campo ' : 'Restaurar campo ') + campo.nome}
                              title={campo.ativo ? 'Excluir campo' : 'Restaurar campo'}
                              disabled={ocupado || !grupoSelecionado.ativo}
                              onClick={() => void alterarStatus(campo)}>
                              {campo.ativo ? <TrashIcon aria-hidden="true" /> :
                                <ArrowPathIcon aria-hidden="true" />}
                            </button>
                          </div></td>
                        </tr>
                      ))}
                      {campos.length === 0 && (
                        <tr><td colSpan={7} className="config-linha-vazia">
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
                          {dados.centrosCusto.filter(centro => centro.ativo).map(centro =>
                            <option key={centro.id} value={centro.id}>{centro.nome}</option>)}
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
                    {aba === 'BENEFICIO' && tipo === 'moeda' && (
                      <fieldset className="config-desconto-beneficio">
                        <legend>Desconto automático</legend>
                        <label className="config-desconto-alternador">
                          <input type="checkbox" checked={geraDescontoCriacao}
                            onChange={e => setGeraDescontoCriacao(e.target.checked)} />
                          <span><strong>Gera desconto</strong>
                            <small>Cria uma coluna calculada a partir do valor deste benefício.</small></span>
                        </label>
                        {geraDescontoCriacao && <div className="config-campos-form">
                          <label htmlFor="wizard-desconto-nome">Nome da coluna de desconto
                            <input id="wizard-desconto-nome" required maxLength={160}
                              value={nomeColunaDescontoCriacao}
                              onChange={e => setNomeColunaDescontoCriacao(e.target.value)}
                              placeholder="Ex.: Desconto vale alimentação" />
                          </label>
                          <label htmlFor="wizard-desconto-percentual">Percentual padrão
                            <span className="config-desconto-percentual">
                              <input id="wizard-desconto-percentual" type="number" min="0" max="100"
                                step="0.01" required value={percentualDescontoCriacao}
                                onChange={e => setPercentualDescontoCriacao(e.target.value)} />
                              <span>%</span>
                            </span>
                          </label>
                          <label htmlFor="wizard-desconto-vigencia">Vigente a partir da competência
                            <input id="wizard-desconto-vigencia" type="month" min={mesAtual()} required
                              value={vigenciaDescontoCriacao}
                              onChange={e => setVigenciaDescontoCriacao(e.target.value)} />
                          </label>
                          <p className="config-ajuda-bases">O percentual vale para os funcionários vinculados e pode ser ajustado individualmente depois.</p>
                        </div>}
                      </fieldset>
                    )}
                  </div>
                )}

                {passo === 3 && (
                  <div className="config-etapa-funcionarios">
                    <h4>Quem estará vinculado a {nome}?</h4>
                        <label htmlFor="wizard-busca">Buscar funcionário
                          <input id="wizard-busca" autoFocus
                            placeholder="Digite o nome do funcionário"
                            value={buscaFuncionario} onChange={e => setBuscaFuncionario(e.target.value)} />
                        </label>
                        <div className="config-selecao-todos">
                          <span>{selecionados.length} selecionado(s)</span>
                          <button type="button" className="botao-secundario" onClick={() =>
                            setSelecionados(funcionarios.map(f => f.id))}>
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
                              <span>{item.nome}{item.ativo ? '' : ' (inativo)'}</span>
                            </label>
                          ))}
                          {filtrados.length === 0 && (
                            <p className="config-sem-vinculos">
                              Nenhum funcionário cadastrado encontrado.</p>
                          )}
                        </div>
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

      {grupoEditando && (
        <div className="config-sobreposicao">
          <form ref={dialogoEdicaoRef} className="config-modal config-modal-edicao config-modal-edicao-completa" role="dialog" aria-modal="true"
            aria-labelledby="editar-grupo-titulo" onSubmit={evento => void salvarEdicaoGrupo(evento)}
            onKeyDown={lidarComTeclado}>
            <div className="config-modal-topo">
              <div><h3 id="editar-grupo-titulo">Editar {grupoEditando.origem === 'BENEFICIO' ? 'benefício' : 'comissão'}</h3>
                <p>Revise identificação, campos e funcionários vinculados.</p></div>
              <button type="button" className="config-modal-fechar" disabled={ocupado}
                aria-label="Fechar edição" onClick={() => setGrupoEditando(null)}>×</button>
            </div>
            <div className="config-modal-corpo">
              <section className="config-edicao-secao">
                <h4>Identificação</h4>
                <div className="config-campos-form">
                  <label htmlFor="editar-grupo-nome">Nome do cadastro
                    <input id="editar-grupo-nome" autoFocus required maxLength={160}
                      value={nomeGrupoEditando} onChange={evento => setNomeGrupoEditando(evento.target.value)} />
                  </label>
                  {grupoEditando.origem === 'COMISSAO' && <label htmlFor="editar-grupo-responsavel">Setor responsável
                    <select id="editar-grupo-responsavel" value={responsavelGrupoEditando}
                      onChange={evento => setResponsavelGrupoEditando(evento.target.value as Responsavel)}>
                      {dados.centrosCusto.filter(centro => centro.ativo).map(centro =>
                        <option key={centro.id} value={centro.id}>{centro.nome}</option>)}
                    </select>
                  </label>}
                </div>
              </section>
              <section className="config-edicao-secao">
                <div className="config-edicao-secao-topo"><div><h4>Campos</h4>
                  <p>Tipo e classificação respeitam os valores já registrados.</p></div>
                  <span>{camposGrupoEditando.length}</span></div>
                <div className="config-edicao-campos-lista">
                  {camposGrupoEditando.map((campo, indice) => (
                    <fieldset className="config-edicao-campo" key={campo.id}>
                      <legend>{campo.nome || `Campo ${indice + 1}`}</legend>
                      <div className="config-campos-form">
                        <label htmlFor={`editar-campo-nome-${campo.id}`}>Nome do campo
                          <input id={`editar-campo-nome-${campo.id}`} required maxLength={160}
                            value={campo.nome} onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                              item.id === campo.id ? { ...item, nome: evento.target.value } : item))} />
                        </label>
                        <label htmlFor={`editar-campo-tipo-${campo.id}`}>Tipo
                          <select id={`editar-campo-tipo-${campo.id}`} value={campo.tipo}
                            onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                              item.id === campo.id ? { ...item, tipo: evento.target.value } : item))}>
                            <option value="moeda">Moeda (R$)</option><option value="percentual">Percentual (%)</option>
                            <option value="data">Data</option><option value="horario">Horário</option>
                          </select>
                        </label>
                        <label htmlFor={`editar-campo-classificacao-${campo.id}`}>Classificação
                          <select id={`editar-campo-classificacao-${campo.id}`} value={campo.classificacao}
                            onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                              item.id === campo.id ? { ...item, classificacao: evento.target.value } : item))}>
                            <option value="provento">Provento</option><option value="desconto">Desconto</option>
                            <option value="informativo">Informativo</option>
                          </select>
                        </label>
                        <label htmlFor={`editar-campo-vigencia-${campo.id}`}>A partir da competência
                          <input id={`editar-campo-vigencia-${campo.id}`} type="month" required
                            value={campo.vigencia} onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                              item.id === campo.id ? { ...item, vigencia: evento.target.value } : item))} />
                        </label>
                        <label className="config-edicao-campo-ativo">
                          <input type="checkbox" checked={campo.ativo}
                            onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                              item.id === campo.id ? { ...item, ativo: evento.target.checked } : item))} />
                          Campo ativo para novas competências
                        </label>
                      </div>
                      {grupoEditando.origem === 'BENEFICIO' && campo.tipo === 'moeda' &&
                        <fieldset className="config-desconto-beneficio">
                          <legend>Desconto automático</legend>
                          <label className="config-desconto-alternador">
                            <input type="checkbox" checked={campo.descontoAutomatico}
                              onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                                item.id === campo.id
                                  ? { ...item, descontoAutomatico: evento.target.checked } : item))} />
                            <span><strong>Gera desconto</strong>
                              <small>Adicione ou remova o desconto automático deste benefício.</small></span>
                          </label>
                          {(campo.descontoAutomatico || campo.descontoConfigurado) &&
                            <div className="config-campos-form config-desconto-edicao-campos">
                              <label htmlFor={`editar-desconto-nome-${campo.id}`}>
                                <span>Nome da coluna de desconto</span>
                                <input id={`editar-desconto-nome-${campo.id}`} required maxLength={160}
                                  value={campo.nomeColunaDesconto}
                                  onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                                    item.id === campo.id
                                      ? { ...item, nomeColunaDesconto: evento.target.value } : item))} />
                              </label>
                              <label htmlFor={`editar-desconto-percentual-${campo.id}`}>
                                <span>Percentual padrão</span>
                                <span className="config-desconto-percentual">
                                  <input id={`editar-desconto-percentual-${campo.id}`} type="number"
                                    min="0" max="100" step="0.01" required
                                    value={campo.percentualDesconto}
                                    onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                                      item.id === campo.id
                                        ? { ...item, percentualDesconto: evento.target.value } : item))} />
                                  <span>%</span>
                                </span>
                              </label>
                              <label htmlFor={`editar-desconto-vigencia-${campo.id}`}>
                                <span>Vigente a partir da competência</span>
                                <input id={`editar-desconto-vigencia-${campo.id}`} type="month"
                                  min={mesAtual()} required value={campo.vigenciaDesconto}
                                  onChange={evento => setCamposGrupoEditando(atual => atual.map(item =>
                                    item.id === campo.id
                                      ? { ...item, vigenciaDesconto: evento.target.value } : item))} />
                              </label>
                            </div>}
                        </fieldset>}
                    </fieldset>
                  ))}
                  {camposGrupoEditando.length === 0 && <p className="config-sem-vinculos">
                    Este cadastro ainda não tem campos.</p>}
                </div>
              </section>
              <section className="config-edicao-secao">
                <div className="config-edicao-secao-topo"><div><h4>Funcionários vinculados</h4>
                  <p>Marque quem deve permanecer associado a este cadastro.</p></div>
                  <span>{funcionariosGrupoEditando.length} selecionado(s)</span></div>
                <label className="config-busca-edicao-funcionario" htmlFor="editar-grupo-busca-funcionario">
                  Buscar funcionário
                  <input id="editar-grupo-busca-funcionario" type="search"
                    value={buscaFuncionariosGrupoEditando}
                    onChange={evento => setBuscaFuncionariosGrupoEditando(evento.target.value)}
                    placeholder="Digite o nome" />
                </label>
                <div className="config-checklist config-checklist-edicao">
                  {funcionarios.filter(funcionario => funcionario.nome.toLocaleLowerCase('pt-BR')
                    .includes(buscaFuncionariosGrupoEditando.trim().toLocaleLowerCase('pt-BR'))).map(funcionario => (
                    <label key={funcionario.id} className="config-item-funcionario">
                      <input type="checkbox" checked={funcionariosGrupoEditando.includes(funcionario.id)}
                        onChange={evento => setFuncionariosGrupoEditando(atual => evento.target.checked
                          ? [...new Set([...atual, funcionario.id])]
                          : atual.filter(id => id !== funcionario.id))} />
                      <span>{funcionario.nome}{funcionario.ativo ? '' : ' (inativo)'}</span>
                    </label>
                  ))}
                </div>
              </section>
              {erro && <p className="erro" role="alert">{erro}</p>}
            </div>
            <div className="config-modal-acoes">
              <button type="button" className="botao-secundario" disabled={ocupado}
                onClick={() => setGrupoEditando(null)}>Cancelar</button>
              <button type="submit" className="acao-principal" disabled={ocupado || !nomeGrupoEditando.trim()}>
                {ocupado ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

      {campoEditando && (
        <div className="config-sobreposicao">
          <form ref={dialogoEdicaoRef} className="config-modal config-modal-edicao" role="dialog" aria-modal="true"
            aria-labelledby="editar-campo-titulo" onSubmit={evento => void salvarEdicaoCampo(evento)}
            onKeyDown={lidarComTeclado}>
            <div className="config-modal-topo">
              <div><h3 id="editar-campo-titulo">Editar campo</h3>
                <p>Altere nome, tipo, classificação ou vigência quando o histórico permitir.</p></div>
              <button type="button" className="config-modal-fechar" disabled={ocupado}
                aria-label="Fechar edição" onClick={() => setCampoEditando(null)}>×</button>
            </div>
            <div className="config-modal-corpo">
              <div className="config-campos-form">
                <label htmlFor="editar-campo-nome">Nome do campo
                  <input id="editar-campo-nome" autoFocus required maxLength={160}
                    value={nomeCampoEditando} onChange={evento => setNomeCampoEditando(evento.target.value)} />
                </label>
                <label htmlFor="editar-campo-tipo">Tipo
                  <select id="editar-campo-tipo" value={tipoCampoEditando}
                    onChange={evento => setTipoCampoEditando(evento.target.value)}>
                    <option value="moeda">Moeda (R$)</option><option value="percentual">Percentual (%)</option>
                    <option value="data">Data</option><option value="horario">Horário</option>
                  </select>
                </label>
                <label htmlFor="editar-campo-classificacao">Classificação
                  <select id="editar-campo-classificacao" value={classificacaoCampoEditando}
                    onChange={evento => setClassificacaoCampoEditando(evento.target.value)}>
                    <option value="provento">Provento</option><option value="desconto">Desconto</option>
                    <option value="informativo">Informativo</option>
                  </select>
                </label>
                <label htmlFor="editar-campo-vigencia">Vigência
                  <input id="editar-campo-vigencia" type="month" required value={vigenciaCampoEditando}
                    onChange={evento => setVigenciaCampoEditando(evento.target.value)} />
                </label>
              </div>
              {aba === 'BENEFICIO' && tipoCampoEditando === 'moeda' && (
                <fieldset className="config-desconto-beneficio">
                  <legend>Desconto automático</legend>
                  <label className="config-desconto-alternador">
                    <input type="checkbox" checked={geraDesconto}
                      onChange={evento => setGeraDesconto(evento.target.checked)} />
                    <span><strong>Gera desconto</strong>
                      <small>Calcula uma coluna de desconto com base neste valor do benefício.</small></span>
                  </label>
                  {geraDesconto && <div className="config-campos-form">
                    <label htmlFor="desconto-nome-coluna">Nome da coluna de desconto
                      <input id="desconto-nome-coluna" required maxLength={160}
                        value={nomeColunaDesconto} onChange={evento => setNomeColunaDesconto(evento.target.value)}
                        placeholder="Ex.: Desconto vale alimentação" />
                    </label>
                    <label htmlFor="desconto-percentual-padrao">Percentual padrão
                      <span className="config-desconto-percentual">
                        <input id="desconto-percentual-padrao" type="number" min="0" max="100"
                          step="0.01" required value={percentualPadraoDesconto}
                          onChange={evento => setPercentualPadraoDesconto(evento.target.value)} />
                        <span>%</span>
                      </span>
                    </label>
                    <label htmlFor="desconto-vigencia">Vigente a partir da competência
                      <input id="desconto-vigencia" type="month" min={mesAtual()} required value={vigenciaDesconto}
                        onChange={evento => setVigenciaDesconto(evento.target.value)} />
                    </label>
                    <p className="config-ajuda-bases">O percentual padrão vale para todos. Percentuais individuais podem ser ajustados aqui ou na Consolidação e ficam recorrentes.</p>
                  </div>}
                </fieldset>
              )}
              {erro && <p className="erro" role="alert">{erro}</p>}
            </div>
            <div className="config-modal-acoes">
              <button type="button" className="botao-secundario" disabled={ocupado}
                onClick={() => setCampoEditando(null)}>Cancelar</button>
              <button type="submit" className="acao-principal" disabled={ocupado || !nomeCampoEditando.trim()}>
                {ocupado ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
