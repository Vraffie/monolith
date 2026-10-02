"""Output formats: Mermaid, Graphviz DOT, JSON and a self-contained HTML viewer."""
from __future__ import annotations

import json
import re
from html import escape

from .core import Graph


def _ids(g: Graph) -> dict[str, str]:
    return {nid: f"n{i}" for i, nid in enumerate(g.nodes)}


def _label(n) -> str:
    return f"{n.type}: {n.key}"


def _q(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def to_mermaid(g: Graph, by_file: bool = False) -> str:
    out = ["graph LR"]
    if by_file:
        ids = {f: f"f{i}" for i, f in enumerate(g.files)}
        for f, i in ids.items():
            out.append(f'  {i}["{_q(f)}"]')
        for (a, b), n in sorted(g.file_edges().items()):
            out.append(f"  {ids[a]} -->|{n}| {ids[b]}")
        return "\n".join(out) + "\n"
    ids = _ids(g)
    for nid, n in g.nodes.items():
        out.append(f'  {ids[nid]}["{_q(_label(n))}"]')
    seen = set()
    for e in g.edges:
        k = (e.source, e.target, e.via)
        if k not in seen:
            seen.add(k)
            out.append(f"  {ids[e.source]} -->|{e.via}| {ids[e.target]}")
    out += [f"  style {ids[nid]} stroke-dasharray: 4 3" for nid, n in g.nodes.items() if n.external]
    return "\n".join(out) + "\n"


def to_dot(g: Graph, by_file: bool = False) -> str:
    out = ["digraph xmlgraph {", "  rankdir=LR;", "  node [shape=box, fontname=Helvetica];"]
    if by_file:
        ids = {f: f"f{i}" for i, f in enumerate(g.files)}
        for f, i in ids.items():
            out.append(f'  {i} [label="{_q(f)}"];')
        for (a, b), n in sorted(g.file_edges().items()):
            out.append(f'  {ids[a]} -> {ids[b]} [label="{n}"];')
    else:
        ids = _ids(g)
        files = sorted({n.file for n in g.nodes.values() if n.file})
        for i, f in enumerate(files):
            out.append(f'  subgraph cluster_{i} {{ label="{_q(f)}";')
            out += [f'    {ids[nid]} [label="{_q(_label(n))}"];' for nid, n in g.nodes.items() if n.file == f]
            out.append("  }")
        for nid, n in g.nodes.items():
            if n.external:
                out.append(f'  {ids[nid]} [label="{_q(_label(n))}", style=dashed];')
        seen = set()
        for e in g.edges:
            k = (e.source, e.target, e.via)
            if k not in seen:
                seen.add(k)
                out.append(f'  {ids[e.source]} -> {ids[e.target]} [label="{e.via}", fontsize=9];')
    out.append("}")
    return "\n".join(out) + "\n"


def to_data(g: Graph) -> dict:
    return {
        "nodes": [vars(n) | {"id": nid} for nid, n in g.nodes.items()],
        "edges": [vars(e) for e in g.edges],
        "files": g.files,
        "errors": g.errors,
    }


def to_json(g: Graph) -> str:
    return json.dumps(to_data(g), indent=2, ensure_ascii=False) + "\n"


def to_html(g: Graph, title: str = "xmlgraph") -> str:
    data = json.dumps(to_data(g), ensure_ascii=False)
    data = re.sub(r"</", r"<\\/", data)  # keep the JSON from closing the script tag
    return _HTML.replace("__TITLE__", escape(title)).replace("__DATA__", data)


_HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#fff;--fg:#1c2330;--mut:#6b7488;--line:#c5cbd8;--card:#f4f6fa;--acc:#2f6fed}
@media(prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e4e8f0;--mut:#8b94a8;--line:#3a4256;--card:#1b202b;--acc:#6aa0ff}}
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;background:var(--bg);color:var(--fg);display:flex;height:100vh}
#main{flex:1;position:relative;min-width:0}svg{width:100%;height:100%;display:block;cursor:grab}
#side{width:320px;border-left:1px solid var(--line);padding:12px;overflow:auto;background:var(--card)}
#bar{position:absolute;top:8px;left:8px;display:flex;gap:6px;flex-wrap:wrap;right:8px}
input,select,button{font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.node rect{stroke:var(--line);fill:var(--card)}.node.ext rect{stroke-dasharray:4 3}.node text{font-size:11px;fill:var(--fg);pointer-events:none}
.node.sel rect{stroke:var(--acc);stroke-width:2.5}.node.dim,.edge.dim{opacity:.12}
.edge{stroke:var(--line);fill:none;stroke-width:1.2}.edge.hl{stroke:var(--acc);stroke-width:2}
h1{font-size:15px;margin:0 0 8px}h2{font-size:12px;color:var(--mut);margin:12px 0 4px;text-transform:uppercase}
li{margin:2px 0;cursor:pointer}li:hover{color:var(--acc)}ul{padding-left:18px;margin:0}code{font-size:12px;word-break:break-all}
</style></head><body>
<div id="main"><svg id="svg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8b94a8"/></marker></defs><g id="vp"></g></svg>
<div id="bar"><input id="q" placeholder="Search key or type…"><select id="mode"><option value="entity">Entities</option><option value="file">Files</option></select><select id="type"></select><button id="fit">Fit</button></div></div>
<div id="side"><h1>__TITLE__</h1><div id="info">Click a node. Drag to move, scroll to zoom.</div></div>
<script id="data" type="application/json">__DATA__</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent),svg=document.getElementById('svg'),vp=document.getElementById('vp'),NS='http://www.w3.org/2000/svg';
let nodes=[],edges=[],sel=null,tf={x:0,y:0,k:1};
const el=(n,a={},p)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);p&&p.appendChild(e);return e};
const types=[...new Set(D.nodes.map(n=>n.type))].sort();
document.getElementById('type').innerHTML='<option value="">All types</option>'+types.map(t=>`<option>${t}</option>`).join('');
function build(){
  const mode=mode_.value,tp=type_.value;let N,E;
  if(mode==='file'){
    const c={};D.edges.forEach(e=>{const a=nid(e.source),b=nid(e.target);if(a&&b&&a!==b){const k=a+'\n'+b;c[k]=(c[k]||0)+1}});
    N=D.files.map(f=>({id:f,label:f,sub:D.nodes.filter(n=>n.file===f).length+' entities',file:f}));
    E=Object.entries(c).map(([k,n])=>{const[s,t]=k.split('\n');return{s,t,label:n>1?n:''}});
  }else{
    const keep=n=>!tp||n.type===tp;
    N=D.nodes.filter(keep).map(n=>({id:n.id,label:n.key,sub:n.type,ext:n.external,file:n.file,n}));
    const ids=new Set(N.map(n=>n.id)),seen=new Set();E=[];
    D.edges.forEach(e=>{const k=e.source+e.target+e.via;if(ids.has(e.source)&&ids.has(e.target)&&!seen.has(k)){seen.add(k);E.push({s:e.source,t:e.target,label:e.via})}});
  }
  const R=300,m=Object.fromEntries(N.map((n,i)=>[n.id,n]));
  N.forEach((n,i)=>{const a=i/N.length*6.283;n.x=Math.cos(a)*R*(1+(i%3)*.3);n.y=Math.sin(a)*R*(1+(i%3)*.3);n.vx=n.vy=0;n.w=Math.max(60,Math.min(n.label.length,28)*6.6+16)});
  nodes=N;edges=E.map(e=>({...e,a:m[e.s],b:m[e.t]})).filter(e=>e.a&&e.b);
  vp.replaceChildren();
  edges.forEach(e=>{e.el=el('path',{class:'edge','marker-end':'url(#ar)'},vp)});
  nodes.forEach(n=>{const g=el('g',{class:'node'+(n.ext?' ext':'')},vp);el('rect',{width:n.w,height:34,x:-n.w/2,y:-17,rx:6},g);
    const t=el('text',{'text-anchor':'middle',y:-2},g);t.textContent=n.label.length>28?n.label.slice(0,27)+'…':n.label;
    const s=el('text',{'text-anchor':'middle',y:11,style:'fill:var(--mut);font-size:9px'},g);s.textContent=n.sub;
    g.onclick=ev=>{ev.stopPropagation();select(n)};drag(g,n);n.el=g});
  sel=null;alpha=1;tick();
}
function nid(id){const n=D.nodes.find(x=>x.id===id);return n&&n.file}
let alpha=1;
function tick(){
  if(alpha>0.01){
    for(const a of nodes)for(const b of nodes){if(a===b)continue;let dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy+.01;if(d<90000){const f=5000/d;a.vx+=dx*f*.02;a.vy+=dy*f*.02}}
    for(const e of edges){const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,d=Math.hypot(dx,dy)||1,f=(d-160)*.01;e.a.vx+=dx/d*f;e.a.vy+=dy/d*f;e.b.vx-=dx/d*f;e.b.vy-=dy/d*f}
    for(const n of nodes){n.vx-=n.x*.002;n.vy-=n.y*.002;if(!n.fx){n.x+=n.vx*alpha;n.y+=n.vy*alpha}n.vx*=.6;n.vy*=.6}
    alpha*=.985;
  }
  draw();if(alpha>0.01)requestAnimationFrame(tick);
}
function draw(){
  for(const n of nodes)n.el.setAttribute('transform',`translate(${n.x},${n.y})`);
  for(const e of edges){const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,d=Math.hypot(dx,dy)||1,k=Math.min(1,17/Math.max(Math.abs(dy/d),.01)/d),p=Math.min(e.b.w/2/Math.max(Math.abs(dx/d),.01),17/Math.max(Math.abs(dy/d),.01));
    e.el.setAttribute('d',`M${e.a.x+dx/d*10},${e.a.y+dy/d*10}L${e.b.x-dx/d*Math.min(p,d/2)},${e.b.y-dy/d*Math.min(p,d/2)}`)}
  vp.setAttribute('transform',`translate(${tf.x},${tf.y}) scale(${tf.k})`);
}
function select(n){
  sel=n;const nb=new Set([n.id]);
  edges.forEach(e=>{const h=e.a===n||e.b===n;e.el.classList.toggle('hl',h);e.el.classList.toggle('dim',!h);if(h){nb.add(e.s);nb.add(e.t)}});
  nodes.forEach(x=>{x.el.classList.toggle('sel',x===n);x.el.classList.toggle('dim',!nb.has(x.id))});
  const out=edges.filter(e=>e.a===n),inn=edges.filter(e=>e.b===n),li=(l,f)=>l.length?'<ul>'+l.map(f).join('')+'</ul>':'<i>none</i>';
  const meta=n.n?`<code>${n.n.file||'(not found in scanned files)'}</code><br><code>${n.n.path}</code>`:`<code>${n.file}</code>`;
  info.innerHTML=`<b>${n.label}</b> <span style="color:var(--mut)">${n.sub}</span><br>${meta}<h2>References (${out.length})</h2>${li(out,e=>`<li data-id="${e.t}">${e.label?e.label+' → ':''}${e.b.label}</li>`)}<h2>Referenced by (${inn.length})</h2>${li(inn,e=>`<li data-id="${e.s}">${e.a.label}${e.label?' ('+e.label+')':''}</li>`)}`;
  info.querySelectorAll('li').forEach(l=>l.onclick=()=>select(nodes.find(x=>x.id===l.dataset.id)));
}
function clear(){sel=null;nodes.forEach(x=>x.el.classList.remove('sel','dim'));edges.forEach(e=>e.el.classList.remove('hl','dim'))}
function drag(g,n){g.onpointerdown=ev=>{ev.stopPropagation();g.setPointerCapture(ev.pointerId);n.fx=1;alpha=Math.max(alpha,.3);
  g.onpointermove=m=>{n.x+=m.movementX/tf.k;n.y+=m.movementY/tf.k;n.vx=n.vy=0;alpha<.01&&(alpha=.02,tick())};
  g.onpointerup=()=>{n.fx=0;g.onpointermove=g.onpointerup=null;tick()}}}
svg.onpointerdown=ev=>{clear();svg.onpointermove=m=>{tf.x+=m.movementX;tf.y+=m.movementY;draw()};svg.onpointerup=()=>svg.onpointermove=svg.onpointerup=null};
svg.onwheel=ev=>{ev.preventDefault();const r=svg.getBoundingClientRect(),f=ev.deltaY<0?1.1:.9,mx=ev.clientX-r.left,my=ev.clientY-r.top;tf.x=mx-(mx-tf.x)*f;tf.y=my-(my-tf.y)*f;tf.k*=f;draw()};
function fit(){const r=svg.getBoundingClientRect();if(!nodes.length)return;const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),x0=Math.min(...xs)-80,x1=Math.max(...xs)+80,y0=Math.min(...ys)-40,y1=Math.max(...ys)+40;
  tf.k=Math.min(r.width/(x1-x0),r.height/(y1-y0),1.5);tf.x=r.width/2-(x0+x1)/2*tf.k;tf.y=r.height/2-(y0+y1)/2*tf.k;draw()}
const mode_=document.getElementById('mode'),type_=document.getElementById('type'),info=document.getElementById('info');
mode_.onchange=type_.onchange=()=>{build();setTimeout(fit,600)};
document.getElementById('fit').onclick=fit;
document.getElementById('q').oninput=ev=>{const q=ev.target.value.toLowerCase();nodes.forEach(n=>n.el.classList.toggle('dim',!!q&&!(n.label+' '+n.sub).toLowerCase().includes(q)))};
build();setTimeout(fit,800);
</script></body></html>
"""
