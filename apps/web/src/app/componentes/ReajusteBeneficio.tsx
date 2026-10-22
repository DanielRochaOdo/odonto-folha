'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Competencia = { id:string; ano:number; mes:number };
type Pessoa = { funcionario:{id:string; nome:string}; celulas:Record<string,{situacao:string}> };
type Consolidado = { colunas:{id:string; grupoId:string; nome:string; tipo:string}[];
 abas:{funcionarios:Pessoa[]}[] };
type Previa = { versaoCatalogo:number; competencia:{ano:number;mes:number};
 campoId:string;modo:'percentual'|'moeda';variacao:number;
 linhas:{funcionarioId:string;anterior:number;proposto:number}[] };
const dinheiro=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);

export default function ReajusteBeneficio({grupoId}:{grupoId:string}){
 const [meses,setMeses]=useState<Competencia[]>([]);
 const [competenciaId,setCompetenciaId]=useState('');
 const [dados,setDados]=useState<Consolidado|null>(null);
 const [campoId,setCampoId]=useState('');
 const [selecionados,setSelecionados]=useState<string[]>([]);
 const [modo,setModo]=useState<'percentual'|'moeda'>('percentual');
 const [variacao,setVariacao]=useState(0);
 const [previa,setPrevia]=useState<Previa|null>(null);
 const [erro,setErro]=useState('');
 const [aviso,setAviso]=useState('');
 const [ocupado,setOcupado]=useState(false);
 const recarregar=useCallback(async()=>{
  const r=await fetch('/api/competencias',{credentials:'include',cache:'no-store'});
  if(!r.ok)throw Error('Não foi possível carregar competências');
  setMeses((await r.json() as {competencias:Competencia[]}).competencias);
 },[]);
 useEffect(()=>{
  const t=setTimeout(()=>{void recarregar().catch(e=>setErro(String(e)));},0);
  return()=>clearTimeout(t);
 },[recarregar]);
 async function escolherMes(id:string){
  setCompetenciaId(id);setPrevia(null);setCampoId('');setSelecionados([]);
  if(!id){setDados(null);return;}
  const r=await fetch('/api/competencias/'+id+'/consolidacao',{
    credentials:'include',cache:'no-store'});
  if(!r.ok){setErro('Não foi possível carregar competência');return;}
  setDados(await r.json() as Consolidado);
 }
 const campos=dados?.colunas.filter(c=>c.grupoId===grupoId&&c.tipo==='moeda')??[];
 const pessoas=(dados?.abas.flatMap(a=>a.funcionarios)??[])
  .filter(p=>p.celulas[campoId]?.situacao!=='nao_aplicavel');
 async function gerarPrevia(e:FormEvent){
  e.preventDefault();if(!competenciaId||!campoId||!selecionados.length)return;
  setOcupado(true);setErro('');setAviso('');
  try{
   const r=await fetch('/api/beneficios/'+competenciaId+'/reajuste/previa',{
    method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({campoId,funcionariosIds:selecionados,modo,variacao})});
   if(!r.ok)throw Error((await r.json() as {erro?:string}).erro??'Reajuste inválido');
   setPrevia(await r.json() as Previa);
  }catch(e){setErro(e instanceof Error?e.message:'Erro de reajuste');}
  finally{setOcupado(false);}
 }
 async function confirmar(){
  if(!previa||ocupado)return;
  if(!window.confirm('Confirmar reajuste para '+previa.linhas.length+' funcionários?'))return;
  setOcupado(true);setErro('');
  try{
   const r=await fetch('/api/beneficios/'+competenciaId+'/reajuste/confirmar',{
    method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({previa})});
   if(!r.ok)throw Error((await r.json() as {erro?:string}).erro??'Falha ao reajustar');
   setPrevia(null);setAviso('Reajuste confirmado com vigência preservada');
  }catch(e){setErro(e instanceof Error?e.message:'Não foi possível confirmar');}
  finally{setOcupado(false);}
 }
 return <section className="painel-app">
  <h3>Reajuste de benefício</h3>
  <p>Selecione o campo, os funcionários e a variação. Confira a prévia antes de confirmar.</p>
  {erro&&<p className="erro" role="alert">{erro}</p>}
  {aviso&&<p className="feedback" role="status">{aviso}</p>}
  <form className="formulario-resumo" onSubmit={e=>void gerarPrevia(e)}>
   <label>Competência
    <select value={competenciaId} required onChange={e=>void escolherMes(e.target.value)}>
     <option value="">Selecione...</option>
     {meses.map(m=><option key={m.id} value={m.id}>
       {m.mes.toString().padStart(2,'0')}/{m.ano}
      </option>)}
    </select></label>
   <label>Campo monetário
    <select required value={campoId} onChange={e=>{setCampoId(e.target.value);
      setSelecionados([]);setPrevia(null);}}>
     <option value="">Selecione...</option>
     {campos.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
    </select></label>
   {campoId&&<div>
    <strong>Funcionários vinculados</strong>
    <p><button type="button" className="botao-secundario"
     onClick={()=>setSelecionados(pessoas.map(p=>p.funcionario.id))}>
      Selecionar todos
     </button></p>
    <div className="lista-selecao">{pessoas.map(p=><label key={p.funcionario.id}>
      <input type="checkbox" checked={selecionados.includes(p.funcionario.id)}
       onChange={e=>setSelecionados(atual=>e.target.checked
        ? [...atual,p.funcionario.id] : atual.filter(id=>id!==p.funcionario.id))}/>
      {p.funcionario.nome}</label>)}</div>
   </div>}
   <div className="grade-formulario">
    <label>Tipo de variação<select value={modo} onChange={e=>{
     setModo(e.target.value as typeof modo);setPrevia(null);}}>
     <option value="percentual">Percentual (%)</option><option value="moeda">Valor (R$)</option>
    </select></label>
    <label>Variação positiva ou negativa<input type="number" step="0.01"
     value={variacao} onChange={e=>{setVariacao(Number(e.target.value));setPrevia(null);}}/></label>
   </div>
   <button className="acao-principal" disabled={ocupado||!selecionados.length}>
    Pré-visualizar reajuste</button>
  </form>
  {previa&&<div><h3>Prévia de reajuste</h3>
   <div className="rolagem-tabela"><table className="tabela-principal"><thead>
    <tr><th>Funcionário</th><th>Valor anterior</th><th>Valor proposto</th></tr>
   </thead><tbody>{previa.linhas.map(l=><tr key={l.funcionarioId}>
    <td>{pessoas.find(p=>p.funcionario.id===l.funcionarioId)?.funcionario.nome??'—'}</td>
    <td>{dinheiro(l.anterior)}</td><td>{dinheiro(l.proposto)}</td>
   </tr>)}</tbody></table></div>
   <p>Competência: {previa.competencia.mes}/{previa.competencia.ano}</p>
   <button className="acao-principal" disabled={ocupado} onClick={()=>void confirmar()}>
    Confirmar reajuste para {previa.linhas.length} funcionários</button>
  </div>}
 </section>;
}
