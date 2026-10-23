'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';
import { atualizarMascaraComCursor, mascaraFinal, numeroDaMascara,
  prepararMascaraParaEdicao } from '../mascaras';
type Grupo = {
 id:string; nome:string; responsavel:string; concluido:boolean; pendentes:number;
};
type Mes = { id:string; ano:number; mes:number; revisao:number; grupos:Grupo[] };
type Campo = { id:string; nome:string; tipo:string; valor:number|string|null;
 pendente:boolean; quantidadeParcelas?:number };
type Pessoa = { id:string; nome:string; campos:Campo[] };
type Detalhe = { grupoId:string; responsavel:string; concluido:boolean;
 revisao:number; funcionarios:Pessoa[] };
function mostrarMes(m:Mes){return m.mes.toString().padStart(2,'0')+'/'+m.ano;}
async function json<T>(url:string,options?:RequestInit):Promise<T>{
 const r=await fetch(url,{credentials:'include',cache:'no-store',...options});
 if(!r.ok){let message='Operação não concluída';
 try{const x=await r.json() as {erro?:string};message=x.erro??message;}catch{ /* resposta sem JSON */ }
 throw Error(message);}return r.json() as Promise<T>;
}
const post=<T,>(url:string,body:object)=>json<T>(url,{method:'POST',
 headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export default function PainelSetor({perfil}:{perfil:'ADM'|'CENTRAL'}){
 const [meses,setMeses]=useState<Mes[]>([]);
 const [mesId,setMesId]=useState('');
 const [grupoId,setGrupoId]=useState('');
 const [detalhe,setDetalhe]=useState<Detalhe|null>(null);
 const [buscaFuncionario,setBuscaFuncionario]=useState('');
 const [modo,setModo]=useState<'total'|'parcela'>('total');
 const [erro,setErro]=useState('');
 const [aviso,setAviso]=useState('');
 const [ocupado,setOcupado]=useState(false);
 const listar=useCallback(async()=>{
  const dados=await json<{competencias:Mes[]}>('/api/setor/competencias');
  setMeses(dados.competencias);return dados.competencias;
 },[]);
 useEffect(()=>{
  const t=setTimeout(()=>{void listar().catch(e=>setErro(String(e)));},0);
  return()=>clearTimeout(t);
 },[listar]);
 async function selecionar(id:string,gid:string){
  setErro('');setAviso('');setMesId(id);setGrupoId(gid);
  setBuscaFuncionario('');
  try{const d=await json<Detalhe>('/api/competencias/'+id+'/comissoes/'+gid);setDetalhe(d);}
  catch(e){setErro(e instanceof Error?e.message:'Erro ao abrir comissão');}
 }
 async function salvar(funcionarioId:string,campo:Campo,texto:string){
  if(!detalhe||ocupado||detalhe.concluido)return;
  const atual=campo.valor===null?'':String(campo.valor);
  if(texto===atual&&modo==='total')return;
  if(texto.trim()==='')return;
  const valor=campo.tipo==='moeda'||campo.tipo==='percentual'
   ?numeroDaMascara(texto):texto;
  if(modo==='total'&&(campo.tipo==='moeda'||campo.tipo==='percentual')&&
   typeof campo.valor==='number'&&valor===campo.valor)return;
  if(typeof valor==='number'&&!Number.isFinite(valor)){setErro('Valor inválido');return;}
  const confirmarSubstituicao=modo==='total'&&!campo.pendente
    ? window.confirm('Substituir os lançamentos anteriores por um total direto? O histórico será preservado.')
    : false;
  if(modo==='total'&&!campo.pendente&&!confirmarSubstituicao)return;
  setErro('');setAviso('');setOcupado(true);
  try{
   const result=await post<{avisos:string[]}>('/api/competencias/'+mesId+'/lancamentos',
    {funcionarioId,campoId:campo.id,valor,modo,versaoEsperada:detalhe.revisao,
      confirmarSubstituicao});
   await selecionar(mesId,grupoId);
   setAviso(result.avisos.length?result.avisos.join(' '):'Lançamento salvo');
  }catch(e){setErro(e instanceof Error?e.message:'Falha ao salvar');}
  finally{setOcupado(false);}
 }
 async function concluir(){
  if(!detalhe||ocupado)return;
  const pendentes=meses.find(m=>m.id===mesId)?.grupos.find(g=>g.id===grupoId)?.pendentes??0;
  if(pendentes&&!window.confirm('Há '+pendentes+' campos pendentes. Concluir parcialmente mesmo assim?'))
    return;
  setOcupado(true);setErro('');
  try{
   await post('/api/competencias/'+mesId+'/comissoes/'+grupoId+'/concluir',
    {versaoEsperada:detalhe.revisao,confirmarPendentes:pendentes>0});
   await selecionar(mesId,grupoId);await listar();setAviso('Envio concluído. A edição está bloqueada.');
  }catch(e){setErro(e instanceof Error?e.message:'Falha ao concluir');}
  finally{setOcupado(false);}
 }
 const mes=meses.find(m=>m.id===mesId);
 return <section className="area-setor">
  <div className="titulo-secao"><div><h2>Comissões do setor {perfil}</h2>
   <p>Somente comissões atribuídas ao seu setor. Os lançamentos são compartilhados com DP.</p></div></div>
  {erro&&<p role="alert" className="erro">{erro}</p>}
  {aviso&&<p role="status" className="feedback">{aviso}</p>}
  <div className="grade-competencias">
   {meses.flatMap(m=>m.grupos.map(g=><button key={m.id+g.id}
    className="cartao-competencia" onClick={()=>void selecionar(m.id,g.id)}>
    <span className="tag-competencia">{mostrarMes(m)}</span>
    <strong>{g.nome}</strong>
    <small>{g.concluido?'Enviado e bloqueado':g.pendentes+' pendências'} · {g.responsavel}</small>
    <ArrowUpRightIcon className="seta-competencia" aria-hidden="true" />
   </button>))}
  </div>
  {!meses.some(m=>m.grupos.length)&&<div className="painel-app estado-vazio">
    <h2>Sem comissões atribuídas</h2>
    <p>O DP ainda não vinculou comissões a este setor em uma competência aberta.</p>
  </div>}
  {detalhe&&<div className="painel-app">
    <div className="titulo-secao"><div>
      <span className="sobre">{mes?mostrarMes(mes):''} · {detalhe.responsavel}</span>
      <h2>{mes?.grupos.find(g=>g.id===grupoId)?.nome??'Comissão'}</h2>
      <p>{detalhe.concluido?'Envio concluído · somente leitura':
         'Registre valores e conclua o envio quando terminar'}</p>
     </div>
     <div className="acoes-cabecalho-comissao">
      {!detalhe.concluido&&<button disabled={ocupado} className="acao-principal"
        onClick={()=>void concluir()}>Concluir envio</button>}
     </div>
    </div>
    <div className="controles-comissao">
     {!detalhe.concluido&&<label className="modo-comissao">Modo de lançamento
       <select value={modo} onChange={e=>setModo(e.target.value as 'total'|'parcela')}>
        <option value="total">Total direto</option>
        <option value="parcela">Adicionar parcela</option>
       </select>
      </label>}
     <label className="filtro-funcionario busca-inline-comissao">Buscar funcionário
      <input type="search" value={buscaFuncionario}
       onChange={e=>setBuscaFuncionario(e.target.value)}
       placeholder="Digite o nome" autoComplete="off" />
     </label>
    </div>
    <div className="rolagem-tabela">
     <table className="tabela-principal"><thead><tr><th>Funcionário</th>
      {Array.from(new Map(detalhe.funcionarios.flatMap(p=>p.campos)
       .map(c=>[c.id,c.nome])).entries()).map(([id,nome])=><th key={id}>{nome}</th>)}
     </tr></thead><tbody>{detalhe.funcionarios.filter(p=>p.nome.toLocaleLowerCase('pt-BR')
       .includes(buscaFuncionario.trim().toLocaleLowerCase('pt-BR'))).map(p=><tr key={p.id}>
      <td className="nome-pessoa">{p.nome}</td>
      {Array.from(new Map(detalhe.funcionarios.flatMap(x=>x.campos)
       .map(c=>[c.id,c.nome])).keys()).map(id=>{
        const campo=p.campos.find(c=>c.id===id);
        return <td key={id}>{!campo?'—':detalhe.concluido
         ? (campo.pendente?'Pendente':campo.tipo==='moeda'||campo.tipo==='percentual'
          ?mascaraFinal(String(campo.valor??''),campo.tipo):String(campo.valor??''))
         : <span className="editor-valor-mascarado"><input className="editor-celula" aria-label={campo.nome+' de '+p.nome}
          disabled={ocupado} key={p.id+campo.id+detalhe.revisao}
          defaultValue={modo==='parcela'?'':(campo.tipo==='moeda'||campo.tipo==='percentual'
          ?mascaraFinal(String(campo.valor??''),campo.tipo):String(campo.valor??''))}
          placeholder={campo.pendente?'Pendente':''}
          type={campo.tipo==='data'?'date':campo.tipo==='horario'?'time':'text'}
          inputMode={campo.tipo==='moeda'||campo.tipo==='percentual'?'decimal':undefined}
          onFocus={e=>{if(campo.tipo==='moeda'||campo.tipo==='percentual')
            prepararMascaraParaEdicao(e.currentTarget);}}
          onChange={e=>{if(campo.tipo==='moeda'||campo.tipo==='percentual')
            atualizarMascaraComCursor(e.currentTarget,campo.tipo as 'moeda'|'percentual');}}
          onBlur={e=>{
           const texto=campo.tipo==='moeda'||campo.tipo==='percentual'
            ?mascaraFinal(e.currentTarget.value,campo.tipo):e.currentTarget.value;
           e.currentTarget.value=texto;void salvar(p.id,campo,texto);
          }}
          onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} />
          </span>}</td>;
      })}
     </tr>)}{!detalhe.funcionarios.some(p=>p.nome.toLocaleLowerCase('pt-BR')
       .includes(buscaFuncionario.trim().toLocaleLowerCase('pt-BR')))&&<tr>
       <td colSpan={Array.from(new Set(detalhe.funcionarios.flatMap(p=>p.campos.map(c=>c.id)))).length+1}
        className="config-linha-vazia">Nenhum funcionário encontrado.</td>
      </tr>}</tbody></table>
    </div>
   </div>}
 </section>;
}
