// viewer/js/units.js — Units module (extracted from taimanin_viewer.html)
'use strict';

import { blobURL, listLazy, localText, stem } from './fs.js';
import { buildActor, disposeSceneSpine, joinVoiceMetadata, openScene, renderUnitInfo, renderVoices, stopAll } from './scenes.js';
import { RE, S, normVar } from './state.js';
import { closeLightbox, openLightbox, renderLightbox, toast } from './ui.js';


// {"name": "RANKS", "kind": "const", "module": "units"}
const RANKS=[[1,'C'],[2,'R'],[3,'HR'],[4,'SR']];
export { RANKS };

// {"name": "rankKey", "kind": "const", "module": "units"}
const rankKey=r=>`rank:${r}`;
export { rankKey };

/**
 * {"name": "buildChips", "kind": "function", "params": [], "module": "units"}
 */
function buildChips(){
  console.log("[Trace:Units:buildChips]");
  const c=$('#chips'); c.textContent='';
  const chip=(key,text,cls)=>{
    const b=document.createElement('button');
    b.className='chip'+(cls?' '+cls:''); b.dataset.f=key; b.textContent=text;
    b.setAttribute('aria-pressed',String(S.filters.has(key)));
    b.onclick=()=>{S.filters.has(key)?S.filters.delete(key):S.filters.add(key);
      b.setAttribute('aria-pressed',String(S.filters.has(key)));applyFilter();};
    c.appendChild(b);
    return b;
  };
  // Story scenes have no Spine and no thumbnails, so those two chips would only
  // ever filter to nothing; CG is the one distinction that exists there.
  const defs = S.tab==='units'
    ? [['poses','Alt poses'],['voice','Voices'],['artanim','Art animation']]
    : S.tab==='npc'   ? [['multi','Multiple poses']]
    : S.tab==='story' ? [['cg','Has CG']]
    : [['thumb','Has preview'],['animcg','Animated CG']];
  for(const [k,t] of defs) chip(k,t);
  if(S.tab!=='units') return;
  // Rank chips are OR'd with each other (see applyFilter) but AND'd with the
  // feature chips above, so "★5 or ★6, and has voices" is expressible.
  const sep=document.createElement('span'); sep.className='chipsep'; c.appendChild(sep);
  for(const [r,label] of RANKS) chip(rankKey(r),label,'rank');
}
export { buildChips };

/**
 * {"name": "setTab", "kind": "function", "params": ["t", "selectedKey=null"], "module": "units"}
 */
function setTab(t,selectedKey=null){
  console.log("[Trace:Units:setTab]");
  S.tab=t; S.filters.clear(); S.sel=null; stopAll();
  if(selectedKey) $('#q').value='';
  $('#tabU').setAttribute('aria-selected',String(t==='units'));
  $('#tabS').setAttribute('aria-selected',String(t==='scenes'));
  $('#tabN').setAttribute('aria-selected',String(t==='story'));
  $('#tabC').setAttribute('aria-selected',String(t==='npc'));
  $('#q').placeholder = t==='units'?'Search unit id…'
        : t==='story'?'Search story scene…'
        : t==='npc'?'Search NPC sprite id…':'Search scene…';
  $('#list').className = t==='units'?'units':'scenes';
  $('#paneU').classList.remove('on');        // nothing selected yet in this tab
  $('#paneS').classList.remove('on');
  $('#paneC').classList.remove('on');
  buildChips();
  S.order = t==='npc' ? [...S.npcs.keys()].sort()
          : t==='units' ? [...S.units.keys()].sort()
                        : [...S.scenes.keys()]
                            .filter(k=>(S.scenes.get(k).kind||'unit')===
                              (t==='story'?'story':'unit'))
                            .sort((a,b)=>{
                            const sa=S.scenes.get(a),sb=S.scenes.get(b);
                            return sa.id.localeCompare(sb.id,undefined,{numeric:true,sensitivity:'base'})
                              ||sa.label.localeCompare(sb.label,undefined,{numeric:true});
                          });
  applyFilter();
  // Open the first entry, otherwise the main pane sits blank with no explanation.
  if(S.view.length){
    const target=selectedKey&&S.view.includes(selectedKey)?selectedKey:S.view[0];
    (t==='units'?openUnit:t==='npc'?openNpc:openScene)(target);
    if(selectedKey){
      requestAnimationFrame(()=>
        $(`#list [data-k="${CSS.escape(target)}"]`)?.scrollIntoView({block:'center'}));
    }
  }
}
export { setTab };

/**
 * {"name": "applyFilter", "kind": "function", "params": [], "module": "units"}
 */
function applyFilter(){
  console.log("[Trace:Units:applyFilter]");
  const q=$('#q').value.trim().toLowerCase(), f=S.filters;
  const ranks=new Set(RANKS.filter(([r])=>f.has(rankKey(r))).map(([r])=>r));
  S.view=S.order.filter(k=>{
    if(S.tab==='npc'){
      const g=S.npcs.get(k);
      if(q&&!k.includes(q)) return false;
      if(f.has('multi')&&g.poses.length<2) return false;
      return true;
    }
    if(S.tab==='units'){
      const u=S.units.get(k);
      const names=localText(u.meta?.display_name||u.meta?.name).toLowerCase();
      if(q&&!k.toLowerCase().includes(q)&&!names.includes(q)) return false;
      if(ranks.size&&!ranks.has(Number(u.meta?.rarity))) return false;
      if(f.has('r18')&&!u.variants.has('r18')&&!u.thumbR18) return false;
      if(f.has('poses')&&u.art.size<2) return false;
      if(f.has('voice')&&!u.voices.length&&!S.lazy.has(u.dir+'/AudioClip')) return false;
      if(f.has('artanim')&&!u.artSpine) return false;
    }else{
      const s=S.scenes.get(k);
      if(q&&!s.label.toLowerCase().includes(q)&&!s.id.toLowerCase().includes(q)) return false;
      if(f.has('cg')&&!s.hasCG) return false;
      if(f.has('thumb')&&!s.thumb) return false;
      if(f.has('animcg')&&!s.hasArtAnimation) return false;
    }
    return true;
  });
  render();
}
export { applyFilter };

// {"name": "io", "kind": "const", "module": "units"}
const io=new IntersectionObserver(async es=>{
  for(const e of es){
    if(!e.isIntersecting) continue;
    const el=e.target; io.unobserve(el);
    if(el.dataset.kind==='npc'){
      // The preview is a real composite, not a stored thumbnail — these
      // characters have no shipped preview image. Built on first sight only.
      const g=S.npcs.get(el.dataset.k), box=el.querySelector('.nthumb');
      if(!g||!box||box.childElementCount) continue;
      try{
        const first=g.poses[0],versions=g.versions.get(first);
        const c=await buildActor(versions?.base||versions?.r18||first,[]);
        if(c){ box.appendChild(c); box.classList.add('on'); }
      }catch(_){}
      continue;
    }
    const img=el.querySelector('img'); if(!img) continue;
    const rec = el.dataset.kind==='unit' ? S.units.get(el.dataset.k) : S.scenes.get(el.dataset.k);
    const ent = el.dataset.kind==='unit' ? (rec?.thumb||rec?.thumbR18) : rec?.thumb;
    if(!ent) continue;                        // continue, not return — other rows still need loading
    try{ img.src=await blobURL(ent); img.onload=()=>img.classList.add('on'); }catch(_){}
  }
},{root:$('#list'),rootMargin:'340px'});
export { io };

/**
 * {"name": "render", "kind": "function", "params": [], "module": "units"}
 */
function render(){
  console.log("[Trace:Units:render]");
  const L=$('#list'); L.textContent='';
  $('#cnt').textContent=`${S.view.length} ${S.tab==='units'?'unit':'scene'}${S.view.length===1?'':'s'}`;
  const fr=document.createDocumentFragment();
  for(const k of S.view){
    const el=document.createElement('div');
    el.dataset.k=k; el.dataset.kind=S.tab==='units'?'unit':'scene';
    el.setAttribute('aria-selected',String(k===S.sel));
    if(S.tab==='npc'){
      const g=S.npcs.get(k);
      el.className='nrow'; el.dataset.kind='npc';
      el.innerHTML=`<div class="nthumb"></div><div class="m">`+
                   `<div class="t">${k}</div>`+
                   `<div class="s">${g.poses.length} pose${g.poses.length===1?'':'s'}</div></div>`;
      el.onclick=()=>openNpc(k);
      fr.appendChild(el); io.observe(el);
      continue;
    }
    if(S.tab==='units'){
      const u=S.units.get(k); el.className='card';
      el.innerHTML=`<img alt=""><span class="id">${u.id}${u.form>1?'·'+u.form:''}</span>`+
                   (u.artSpine?'<span class="artbadge">ART ANIM</span>':'')+
                   (u.variants.has('r18')||u.thumbR18?'<span class="r18">18</span>':'');
      el.title=localText(u.meta?.display_name||u.meta?.name);
      el.onclick=()=>openUnit(k);
    }else{
      const s=S.scenes.get(k); el.className='srow';
      // Story scenes ship no thumbnail, so the <img> would just be an empty box.
      const thumb=s.kind==='story'?'':'<img alt="">';
      el.innerHTML=`${thumb}<div class="m"><div class="t">${s.label}</div><div class="s">${s.id}`+
        `${s.hasArtAnimation?'<span class="spinebadge">ANIMATED CG</span>':
          s.hasCG?'<span class="spinebadge">CG</span>':''}</div></div>`;
      el.onclick=()=>openScene(k);
    }
    fr.appendChild(el); io.observe(el);
  }
  L.appendChild(fr);
  sizeGrid();
}
export { render };

/**
 * {"name": "sizeGrid", "kind": "function", "params": [], "module": "units"}
 */
function sizeGrid(){
  console.log("[Trace:Units:sizeGrid]");
  const L=$('#list');
  if(!L.classList.contains('units')) return;
  const c=L.querySelector('.card'); if(!c) return;
  const w=c.getBoundingClientRect().width;
  if(w>0) L.style.gridAutoRows=w+'px';
}
export { sizeGrid };

/**
 * {"name": "openNpc", "kind": "asyncFunction", "params": ["k"], "module": "units"}
 */
async function openNpc(k){
  console.log("[Trace:Units:openNpc]");
  closeLightbox(); disposeSceneSpine(); disposeUnitSpine(); stopAll();
  S.sel=k; S.tab='npc';
  $$('#list [data-k]').forEach(c=>c.setAttribute('aria-selected',String(c.dataset.k===k)));
  $('#paneC').classList.add('on');
  $('#paneU').classList.remove('on'); $('#paneS').classList.remove('on');
  $('#empty').style.display='none'; $('#app').classList.remove('browse');

  const g=S.npcs.get(k); if(!g) return;
  $('#ctitle').textContent=k;
  const sourceCounts={authored:0,parts:0,missing:0};
  const allVersions=[];
  for(const pose of g.poses){
    const versions=g.versions.get(pose);
    for(const n of [versions?.base,versions?.r18]) if(n) allVersions.push(n);
  }
  for(const n of allVersions){
    const kind=S.actorSources.get(n)?.kind;
    sourceCounts[kind==='authored'?'authored':kind==='parts'?'parts':'missing']++;
  }
  $('#csub').textContent=`${g.poses.length} pose${g.poses.length===1?'':'s'} · `+
    `${allVersions.length-g.poses.length} R18 alternate${allVersions.length-g.poses.length===1?'':'s'} · `+
    `${sourceCounts.authored} authored · ${sourceCounts.parts} composed`+
    (sourceCounts.missing?` · ${sourceCounts.missing} missing`:'');
  const sheet=$('#cutsheet'); sheet.textContent='';
  sheet.style.setProperty('--cut',{s:'170px',m:'260px',l:'420px'}[S.cutSize]||'260px');

  S.cutPoses=g.poses.map(pose=>{
    const versions=g.versions.get(pose);
    return versions?.base||versions?.r18||pose;
  });
  const token=++openNpc._token;
  for(let i=0;i<g.poses.length;i++){
    const pose=g.poses[i],versions=g.versions.get(pose);
    const name=versions?.base||versions?.r18||pose;
    if(token!==openNpc._token) return;         // a newer selection took over
    const cell=document.createElement('button'); cell.className='cutcell';
    cell.title='Open large'; cell.onclick=()=>openCut(i);
    const frame=document.createElement('div'); frame.className='frame';
    const cap=document.createElement('div'); cap.className='cap';
    const source=S.actorSources.get(name);
    const tag=source?.kind==='authored'
      ?'<span class="tag">AUTHORED</span>'
      :source?.kind==='parts'
        ?'<span class="tag p">COMPOSED</span>'
        :'<span class="tag">MISSING</span>';
    cap.innerHTML=`<span class="n"></span>${tag}`;
    cap.querySelector('.n').textContent=pose;
    if(versions?.base&&versions?.r18){
      const pick=document.createElement('span'); pick.className='vpick';
      const show=async(chosen,button)=>{
        S.cutPoses[i]=chosen;
        frame.textContent=''; cell.classList.remove('miss');
        pick.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===button));
        const actor=await buildActor(chosen,[]);
        if(token!==openNpc._token) return;
        if(actor) frame.appendChild(actor); else cell.classList.add('miss');
      };
      for(const [label,chosen] of [['BASE',versions.base],['R18',versions.r18]]){
        const button=document.createElement('button');
        button.type='button'; button.textContent=label;
        button.classList.toggle('on',chosen===name);
        button.onclick=e=>{e.stopPropagation();show(chosen,button);};
        pick.appendChild(button);
      }
      cap.appendChild(pick);
    }
    cell.append(frame,cap); sheet.appendChild(cell);
    const el=await buildActor(name,[]);
    if(token!==openNpc._token) return;
    if(el) frame.appendChild(el); else cell.classList.add('miss');
  }
}
export { openNpc };

/**
 * {"name": "actorContentBounds", "kind": "asyncFunction", "params": ["name"], "module": "units"}
 */
async function actorContentBounds(name){
  console.log("[Trace:Units:actorContentBounds]");
  const key=String(name||'').toLowerCase();
  if(S.actorBounds.has(key)) return S.actorBounds.get(key);
  const source=S.actorSources.get(key);
  if(!source) return null;
  const [CW,CH]=S.actorCanvas;
  const boxes=[];
  if(source.kind==='authored'){
    const entry=S.actorAuthored.get(stem((source.file||key).split('/').pop()));
    if(entry){
      const metric=await imageMetrics(entry),b=metric.bbox||[0,0,metric.w,metric.h];
      boxes.push({x:b[0]/metric.w*CW,y:b[1]/metric.h*CH,
        x1:b[2]/metric.w*CW,y1:b[3]/metric.h*CH});
    }
  }else for(const p of source.parts||[]){
    const entry=S.actorRaw.get(String(p.file||'').toLowerCase());
    if(!entry) continue;
    const metric=await imageMetrics(entry),b=metric.bbox||[0,0,metric.w,metric.h];
    const w=+p.w||metric.w,h=+p.h||metric.h;
    const left=CW/2+(+p.x||0)-w/2,top=CH/2-(+p.y||0)-h/2;
    boxes.push({x:left+b[0]/metric.w*w,y:top+b[1]/metric.h*h,
      x1:left+b[2]/metric.w*w,y1:top+b[3]/metric.h*h});
  }
  if(!boxes.length){S.actorBounds.set(key,null);return null;}
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  const x1=Math.max(...boxes.map(b=>b.x1)),y1=Math.max(...boxes.map(b=>b.y1));
  const result={x,y,w:Math.max(1,x1-x),h:Math.max(1,y1-y)};
  S.actorBounds.set(key,result); return result;
}
export { actorContentBounds };

/**
 * {"name": "openCut", "kind": "asyncFunction", "params": ["i"], "module": "units"}
 */
async function openCut(i){
  console.log("[Trace:Units:openCut]");
  const list=S.cutPoses||[];
  if(!list.length) return;
  S.cutIndex=((i%list.length)+list.length)%list.length;
  const name=list[S.cutIndex];
  const box=$('#lightbox'), holder=$('#lightbox .lbcomp'), img=$('#lightbox img');
  img.hidden=true; img.removeAttribute('src');
  holder.hidden=false; holder.textContent='';
  const el=await buildActor(name,[]);
  if(el){
    holder.appendChild(el);
    const bounds=await actorContentBounds(name);
    if(bounds){
      const [CW,CH]=S.actorCanvas;
      const scale=Math.min(CW/bounds.w,CH/bounds.h)*.94;
      const centerX=bounds.x+bounds.w/2,centerY=bounds.y+bounds.h/2;
      el.style.inset='auto';
      el.style.left=((CW/2-centerX*scale)/CW*100)+'%';
      el.style.top=((CH/2-centerY*scale)/CH*100)+'%';
      el.style.width='100%'; el.style.height='100%';
      el.style.transformOrigin='0 0';
      el.style.transform=`scale(${scale})`;
    }
  }
  $('#lightbox .caption').textContent=
    `${name}  ·  ${S.cutIndex+1}/${list.length}`+(el?'':'  ·  no image');
  box.classList.add('on'); box.setAttribute('aria-hidden','false');
}
export { openCut };

/**
 * {"name": "openUnit", "kind": "asyncFunction", "params": ["k"], "module": "units"}
 */
async function openUnit(k){
  console.log("[Trace:Units:openUnit]");
  closeLightbox();
  disposeSceneSpine();
  const changed=S.sel!==k;
  if(changed) disposeUnitSpine();
  S.sel=k; S.tab='units';
  if(changed){S.artIndex=0;S.unitMode='image';}
  $$('#list [data-k]').forEach(c=>c.setAttribute('aria-selected',String(c.dataset.k===k)));
  const u=S.units.get(k);
  $('#paneU').classList.add('on'); $('#paneS').classList.remove('on'); $('#empty').style.display='none';
  $('#app').classList.remove('browse');
  stopAll();

  if(!u.loaded){                                   // pull voices on demand
    u.loaded=true;
    const voicePaths=[u.dir+'/AudioClip',u.dir+'/audioclip',
      ...[...S.lazy.keys()].filter(p=>p.toLowerCase().endsWith(`/voice/${u.id}`))];
    for(const p of new Set(voicePaths)){
      for(const e of await listLazy(p)){
        const m=e.name.match(RE.voice); if(!m) continue;
        const g=m.groups;
        u.voices.push({entry:e,form:+g.form,type:g.type.toLowerCase(),variant:normVar(g.var),idx:+g.idx,name:e.name});
      }
    }
    joinVoiceMetadata(u);
  }
  const choices=artChoices(u);
  const unitName=localText(u.meta?.display_name||u.meta?.name);
  $('#utitle').textContent=unitName||`Unit ${u.id}`;
  const clipCount=u.voices.filter(v=>v.entry).length;
  $('#usub').textContent=`${choices.length} image${choices.length===1?'':'s'} · ${clipCount} clips`
    +(u.spine?' · Chibi':'')+(u.artSpine?' · Art animation':'');

  const ps=$('#poseseg'); ps.textContent='';
  choices.forEach((choice,i)=>{
    const b=document.createElement('button');
    b.dataset.index=i; b.textContent=choice.variant==='base'?String(choice.pose):`${choice.pose} ${choice.variant.toUpperCase()}`;
    b.onclick=()=>selectArt(i); ps.appendChild(b);
  });
  if((S.unitMode==='chibi'&&!u.spine)||(S.unitMode==='art'&&!u.artSpine)) S.unitMode='image';
  $('#viewseg').hidden=!u.spine&&!u.artSpine;
  $$('#viewseg button').forEach(b=>{
    b.hidden=(b.dataset.view==='chibi'&&!u.spine)||(b.dataset.view==='art'&&!u.artSpine);
    b.setAttribute('aria-pressed',String(b.dataset.view===S.unitMode));
  });
  $('#uspinecontrols').hidden=S.unitMode==='image';
  if(S.artIndex>=choices.length) S.artIndex=0;
  syncArtButtons();
  renderUnitInfo(u); renderVoices(u);
  if(S.unitMode!=='image') showUnitSpine(); else showArt();
}
export { openUnit };

/**
 * {"name": "artChoices", "kind": "function", "params": ["u"], "module": "units"}
 */
function artChoices(u){
  console.log("[Trace:Units:artChoices]");
  if(!u) return [];
  const out=[];
  for(const pose of [...u.art.keys()].sort((a,b)=>a-b)){
    const set=u.art.get(pose);
    for(const variant of Object.keys(set).sort((a,b)=>(a==='base'?-1:b==='base'?1:a.localeCompare(b))))
      out.push({pose,variant,entry:set[variant],set});
  }
  return out;
}
export { artChoices };

// {"name": "syncArtButtons", "kind": "const", "module": "units"}
const syncArtButtons=()=>$$('#poseseg button').forEach(
  b=>b.setAttribute('aria-pressed',String(+b.dataset.index===S.artIndex)));
async function selectArt(index){
  const u=S.units.get(S.sel),choices=u?artChoices(u):[];
  if(!choices.length) return;
  S.artIndex=(index+choices.length)%choices.length;
  syncArtButtons();
  if(S.unitMode!=='image') await setUnitView('image');
  await showArt();
  if($('#lightbox').classList.contains('on')) await renderLightbox();
}
export { syncArtButtons };

/**
 * {"name": "alphaBox", "kind": "asyncFunction", "params": ["url", "key"], "module": "units"}
 */
async function alphaBox(url,key){
  console.log("[Trace:Units:alphaBox]");
  if(S.bbox.has(key)) return S.bbox.get(key);
  const img=new Image(); img.src=url; await img.decode().catch(()=>{});
  const N=96,c=document.createElement('canvas'); c.width=c.height=N;
  const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0,N,N);
  let d; try{d=x.getImageData(0,0,N,N).data;}catch(_){return null;}
  let x0=N,y0=N,x1=-1,y1=-1;
  for(let py=0;py<N;py++)for(let px=0;px<N;px++)
    if(d[(py*N+px)*4+3]>8){if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py;}
  const b=x1<0?[0,0,1,1]:[x0/N,y0/N,(x1-x0+1)/N,(y1-y0+1)/N];
  S.bbox.set(key,b); return b;
}
export { alphaBox };

/**
 * {"name": "imageMetrics", "kind": "asyncFunction", "params": ["entry"], "module": "units"}
 */
async function imageMetrics(entry){
  console.log("[Trace:Units:imageMetrics]");
  if(S.metrics.has(entry.key)) return S.metrics.get(entry.key);
  const url=await blobURL(entry),img=new Image(); img.src=url; await img.decode().catch(()=>{});
  const norm=await alphaBox(url,entry.key);
  const value={w:img.naturalWidth||1,h:img.naturalHeight||1,
    bbox:norm?[norm[0]*(img.naturalWidth||1),norm[1]*(img.naturalHeight||1),
      (norm[0]+norm[2])*(img.naturalWidth||1),(norm[1]+norm[3])*(img.naturalHeight||1)]:null};
  S.metrics.set(entry.key,value); return value;
}
export { imageMetrics };

/**
 * {"name": "showArt", "kind": "asyncFunction", "params": [], "module": "units"}
 */
async function showArt(){
  console.log("[Trace:Units:showArt]");
  const u=S.units.get(S.sel); if(!u) return;
  if(S.unitMode!=='image') return;
  const choices=artChoices(u),choice=choices[S.artIndex],stage=$('#ustage');
  if(!choice){stage.textContent='';return;}
  const {entry:e,set}=choice;
  S.pinned=new Set(choices.map(x=>x.entry.key));

  const url=await blobURL(e); stage.textContent='';
  const img=new Image(); img.src=url; await img.decode().catch(()=>{});
  const W=stage.clientWidth,H=stage.clientHeight,nw=img.naturalWidth||1,nh=img.naturalHeight||1;
  const groupChoices=choices.filter(c=>c.pose===choice.pose);
  const groupIndex=groupChoices.indexOf(choice);
  const measured=await Promise.all(groupChoices.map(c=>imageMetrics(c.entry)));
  const dims=groupChoices.map((c,i)=>{
    const p=c.entry.position||{},canvas=p.canvas||p.canvas_authored||p.untrimmed_size;
    return {choice:c,p,metric:measured[i],
      w:+canvas?.[0]||measured[i].w,h:+canvas?.[1]||measured[i].h};
  });
  const current=dims[groupIndex];
  current.w=current.w||nw; current.h=current.h||nh;
  const maxW=Math.max(current.w,...dims.map(d=>d.w||0));
  const maxH=Math.max(current.h,...dims.map(d=>d.h||0));
  const imageOffset=current.p.canvas_offset||current.p.trim_offset||[0,0];
  const imageCenter={
    x:(maxW-current.w)/2+(+imageOffset[0]||0)+nw/2,
    y:maxH-current.h+(+imageOffset[1]||0)+nh/2,
  };

  // positions.json supplies the authored canvas and offsets. Every image is
  // placed in one bottom-centred coordinate system, so switching poses cannot
  // make the character jump around.
  let frame={x:0,y:0,w:maxW,h:maxH};
  if(S.fit==='subject'){
    const boxes=[];
    for(const d of dims){
      if(!d.w||!d.h) continue;
      const p=d.p,off=p.canvas_offset||p.trim_offset||[0,0];
      const b=p.content_bbox||d.metric.bbox||[0,0,d.w,d.h];
      boxes.push({
        x:(maxW-d.w)/2+(+off[0]||0)+b[0],
        y:maxH-d.h+(+off[1]||0)+b[1],
        x1:(maxW-d.w)/2+(+off[0]||0)+b[2],
        y1:maxH-d.h+(+off[1]||0)+b[3],
      });
    }
    if(boxes.length){
      const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
      const x1=Math.max(...boxes.map(b=>b.x1)),y1=Math.max(...boxes.map(b=>b.y1));
      frame={x,y,w:Math.max(1,x1-x),h:Math.max(1,y1-y)};
    }
  }
  const sc=Math.min(W/frame.w,H/frame.h)*.96;
  const frameCenter={x:frame.x+frame.w/2,y:frame.y+frame.h/2};
  img.style.width=nw+'px'; img.style.height=nh+'px';
  img.style.left=`calc(50% + ${(imageCenter.x-frameCenter.x)*sc}px)`;
  img.style.top=`calc(50% + ${(imageCenter.y-frameCenter.y)*sc}px)`;
  img.style.transform=`translate(-50%,-50%) scale(${sc})`;
  img.onclick=openLightbox;
  stage.appendChild(img); requestAnimationFrame(()=>img.classList.add('on'));
}
export { showArt };

/**
 * {"name": "disposeUnitSpine", "kind": "function", "params": [], "module": "units"}
 */
function disposeUnitSpine(){
  console.log("[Trace:Units:disposeUnitSpine]");
  if(S.unitSpine){S.unitSpine.dispose();S.unitSpine=null;}
}
export { disposeUnitSpine };

/**
 * {"name": "setUnitView", "kind": "asyncFunction", "params": ["mode"], "module": "units"}
 */
async function setUnitView(mode){
  console.log("[Trace:Units:setUnitView]");
  const u=S.units.get(S.sel);
  if((mode==='chibi'&&!u?.spine)||(mode==='art'&&!u?.artSpine)) return;
  S.unitMode=mode;
  $$('#viewseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));
  $('#uspinecontrols').hidden=mode==='image';
  if(mode==='image'){disposeUnitSpine();await showArt();}
  else await showUnitSpine();
}
export { setUnitView };

/**
 * {"name": "attachSpineZoom", "kind": "function", "params": ["canvas", "getPlayer"], "module": "units"}
 */
function attachSpineZoom(canvas,getPlayer){
  console.log("[Trace:Units:attachSpineZoom]");
  canvas.style.touchAction='none';
  canvas.title='Scroll to zoom · drag to pan · double-click to reset';
  canvas.addEventListener('wheel',e=>{
    const p=getPlayer(); if(!p||p.model?.stage) return;   // scene stage is fixed
    e.preventDefault();
    const r=canvas.getBoundingClientRect();
    p.zoomAt(Math.exp(-e.deltaY*0.0015),e.clientX-r.left,e.clientY-r.top);
    canvas.style.cursor=p.zoom>1?'grab':'';
  },{passive:false});
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{
    const p=getPlayer(); if(!p||p.model?.stage||p.zoom<=1) return;
    drag={x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor='grabbing';
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag) return;
    const p=getPlayer(); if(!p) return;
    p.panBy(e.clientX-drag.x,e.clientY-drag.y);
    drag={x:e.clientX,y:e.clientY};
  });
  const end=e=>{ if(!drag) return; drag=null;
    try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
    const p=getPlayer(); canvas.style.cursor=p&&p.zoom>1?'grab':''; };
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('dblclick',()=>{
    const p=getPlayer(); if(!p||p.model?.stage) return;
    p.resetView(); canvas.style.cursor='';
  });
}
export { attachSpineZoom };

/**
 * {"name": "showUnitSpine", "kind": "asyncFunction", "params": [], "module": "units"}
 */
async function showUnitSpine(){
  console.log("[Trace:Units:showUnitSpine]");
  const u=S.units.get(S.sel);
  const model=S.unitMode==='art'?u?.artSpine:S.unitMode==='chibi'?u?.spine:null;
  if(!model) return;
  disposeUnitSpine();
  const stage=$('#ustage'); stage.textContent='';
  const canvas=document.createElement('canvas');
  canvas.setAttribute('aria-label',`${model.name} Spine animation`);
  attachSpineZoom(canvas,()=>S.unitSpine);
  stage.appendChild(canvas);
  const selectedKey=u.key;
  let player=null;
  try{
    player=new TaimaninSpinePlayer(canvas); S.unitSpine=player;
    const animations=await player.load(model);
    if(S.sel!==selectedKey||S.unitMode==='image'||S.unitSpine!==player){player.dispose();return;}
    const select=$('#uspineanim'); select.textContent='';
    for(const name of animations){
      const option=document.createElement('option');
      option.value=option.textContent=name; select.appendChild(option);
    }
    const current=player.state?.tracks?.[0]?.animation?.name;
    if(current) select.value=current;
    $('#uspineplay').textContent='Pause';
    $('#uspineplay').setAttribute('aria-pressed','true');
  }catch(err){
    console.error('unit spine',model,err);
    if(S.unitSpine===player){
      disposeUnitSpine();
      stage.innerHTML='<div class="none">This Spine model could not be rendered.</div>';
      toast(`Spine failed: ${model.name}`,5000);
    }
  }
}
export { showUnitSpine };
