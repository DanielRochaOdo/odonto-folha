'use client';
import { useEffect, useState } from 'react';
type Grupo = { id:string; nome:string; origem:'BENEFICIO'|'COMISSAO'; responsavel:string; ativo:boolean };
type Campo = {id:string; grupoId:string; nome:string; tipo:string; classificacao:string; ordemGlobal:number; ativo:boolean};
export default function ConfigCampos(){
const [dados,setDados]=useState<{grupos:Grupo[]; campos:Campo[]}>({grupos:[],campos:[]});
const [erro,setErro]=useState('');
const [nome,setNome]=useState('');
const [origem,setOrigem]=useState<'BENEFICIO'|'COMISSAO'>('BENEFICIO');
const [responsavel,setResponsavel]=useState('NENHUM');
const [grupo,setGrupo]=useState('');
const [nomeCampo,setNomeCampo]=useState('');
const [tipo,setTipo]=useState('moeda');
const [classificacao,setClassificacao]=useState('provento');
const [competencia,setCompetencia]=useState('2026-10');
async function carregar(){const r=await fetch('/api/configuracao/campos',{credentials:'include',cache:'no-store'});
if(!r.ok)throw Error('Falha ao carregar');setDados(await r.json() as typeof dados);}
useEffect(()=>{const t=setTimeout(()=>{void carregar().catch(e=>setErro(String(e)));},0);return()=>clearTimeout(t);},[]);
async function enviar(url:string,obj:object){setErro('');const r=await fetch(url,{method:'POST',
credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});
if(!r.ok)throw Error('Falha ao salvar');await carregar();}
return <section className="painel-app"><h2>Benefícios e comissões</h2>
{erro&&<p className="erro" role="alert">{erro}</p>}
<form onSubmit={e=>{e.preventDefault();void enviar('/api/configuracao/grupos',
{nome,origem,responsavel:origem==='BENEFICIO'?'NENHUM':responsavel}).then(()=>setNome('')).catch(e=>setErro(String(e)));}}>
<label>Nome do grupo<input required value={nome} onChange={e=>setNome(e.target.value)}/></label>
<select value={origem} onChange={e=>setOrigem(e.target.value as typeof origem)}>
<option value="BENEFICIO">Benefício</option><option value="COMISSAO">Comissão</option></select>
{origem==='COMISSAO'&&<select value={responsavel} onChange={e=>setResponsavel(e.target.value)}>
<option>ADM</option><option>CENTRAL</option><option>NENHUM</option></select>}
<button className="acao-principal">Criar grupo</button></form>
<div className="pequena-lista">{dados.grupos.map(g=><button key={g.id} className="botao-secundario"
onClick={()=>setGrupo(g.id)}>{g.nome} · {g.origem}</button>)}</div>
{grupo&&<form onSubmit={e=>{e.preventDefault();const [ano,mes]=competencia.split('-').map(Number);
void enviar('/api/configuracao/campos',{grupoId:grupo,nome:nomeCampo,tipo,classificacao,ano,mes})
.then(()=>setNomeCampo('')).catch(e=>setErro(String(e)));}}>
<h3>Novo campo</h3>
<input required value={nomeCampo} onChange={e=>setNomeCampo(e.target.value)}/>
<select value={tipo} onChange={e=>setTipo(e.target.value)}>
<option value="moeda">R$</option><option value="percentual">%</option><option value="data">Data</option><option value="horario">Hora</option></select>
<select value={classificacao} onChange={e=>setClassificacao(e.target.value)}>
<option value="provento">Provento</option><option value="desconto">Desconto</option><option value="informativo">Informativo</option></select>
<input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)}/>
<button className="acao-principal">Adicionar campo</button></form>}
<div className="rolagem-tabela"><table className="tabela-principal"><thead><tr><th>Grupo</th><th>Campo</th><th>Tipo</th><th>Ordem</th><th>Situação</th><th>Ação</th></tr></thead><tbody>
{dados.campos.map(c=><tr key={c.id}><td>{dados.grupos.find(g=>g.id===c.grupoId)?.nome}</td>
<td>{c.nome}</td><td>{c.tipo}</td><td>{c.ordemGlobal}</td><td>{c.ativo?'Ativo':'Inativo'}</td>
<td><button className="botao-secundario" onClick={()=>{void enviar('/api/configuracao/campos/'+c.id+'/status',
{ativo:!c.ativo}).catch(e=>setErro(String(e)));}}>{c.ativo?'Desativar':'Ativar'}</button></td></tr>)}
</tbody></table></div></section>;
}