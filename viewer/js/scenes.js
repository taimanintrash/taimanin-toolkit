// viewer/js/scenes.js — Scenes module (extracted from taimanin_viewer.html)
'use strict';

import { blobURL, findSpineModel, localText, resolve, sceneIdFromUnit, stem, unitKeyFromId } from './fs.js';
import { S, VOICE_LABEL, VOICE_ORDER } from './state.js';
import { closeLightbox, flash, quake, toast } from './ui.js';
import { disposeUnitSpine, openUnit, setTab } from './units.js';


/**
 * {"name": "voiceKey", "kind": "function", "params": ["v"], "module": "scenes"}
 */
function voiceKey(v){
  console.log("[Trace:Scenes:voiceKey]");
  return `${String(v.type||'').toLowerCase()}|${String(v.variant||'base').toLowerCase()}|${+(v.index??v.idx??1)}`;
}
export { voiceKey };

/**
 * {"name": "joinVoiceMetadata", "kind": "function", "params": ["u"], "module": "scenes"}
 */
function joinVoiceMetadata(u){
  console.log("[Trace:Scenes:joinVoiceMetadata]");
  const meta=u.meta?.voices||[];
  const byFile=new Map(),bySlot=new Map();
  for(const m of meta){
    if(m.filename) byFile.set(String(m.filename).toLowerCase(),m);
    bySlot.set(voiceKey(m),m);
  }
  const seen=new Set();
  for(const v of u.voices){
    v.metaVoice=byFile.get(String(v.name||'').toLowerCase())||bySlot.get(voiceKey(v))||null;
    if(v.metaVoice) seen.add(v.metaVoice);
  }
  for(const m of meta){
    if(seen.has(m)||!localText(m.text)) continue;
    u.voices.push({entry:null,form:u.form,type:m.type,variant:m.variant||'base',
      idx:+m.index||1,name:m.filename||'',metaVoice:m});
  }
}
export { joinVoiceMetadata };

/**
 * {"name": "renderUnitInfo", "kind": "function", "params": ["u"], "module": "scenes"}
 */
function renderUnitInfo(u){
  console.log("[Trace:Scenes:renderUnitInfo]");
  const box=$('#uinfo'); box.textContent='';
  const m=u.meta;
  if(!m){
    box.innerHTML='<div class="none">Run taimanin_tables.py to add names, profiles, skills and transcripts.</div>';
    renderSceneLinks(u,box);
    return;
  }
  const credits=document.createElement('div'); credits.className='ucredits';
  const rarity={1:'N',2:'R',3:'HR',4:'SR',5:'UR'}[m.rarity]||m.rarity;
  const element={1:'Superhuman',2:'Demon',3:'Spirit',4:'Nature',5:'Science'}[m.element]||m.element;
  for(const [label,value] of [['Unit',m.unit_id],['Rarity',rarity],['Element',element],
      ['Illustrator',localText(m.illustrator)],['Voice',localText(m.voice_actor)]]){
    if(value==null||value==='') continue;
    const s=document.createElement('span'),b=document.createElement('b');
    b.textContent=label+': '; s.append(b,document.createTextNode(value)); credits.appendChild(s);
  }
  box.appendChild(credits);
  const profile=localText(m.profile);
  if(profile){
    const p=document.createElement('p'); p.className='uprofile'; p.textContent=profile; box.appendChild(p);
  }
  const skills=document.createElement('div'); skills.className='uskills';
  const rows=[];
  if(m.leader_skill) rows.push(['Leader',localText(m.leader_skill.name),localText(m.leader_skill.detail)]);
  for(const s of m.skills||[]){
    const lev=(s.levels||[]).at(-1);
    rows.push(['Skill',localText(s.name),localText(lev?.detail)]);
  }
  for(const [kind,name,detail] of rows){
    const d=document.createElement('div'); d.className='uskill';
    const b=document.createElement('b'); b.textContent=`${kind}: ${name||'—'}`;
    d.appendChild(b);
    if(detail) d.append(document.createElement('br'),document.createTextNode(detail));
    skills.appendChild(d);
  }
  if(rows.length) box.appendChild(skills);
  renderVariationLinks(u,box);
  renderSceneLinks(u,box);
}
export { renderUnitInfo };

/**
 * {"name": "attachCardPreview", "kind": "function", "params": ["el", "unit"], "module": "scenes"}
 */
function attachCardPreview(el,unit){
  console.log("[Trace:Scenes:attachCardPreview]");
  if(!unit) return;
  const entry=unit.thumb||unit.thumbR18;
  if(!entry) return;
  let tip=null,token=0;
  const show=async()=>{
    const mine=++token;
    if(!tip){
      tip=document.createElement('div'); tip.className='cardtip';
      const img=new Image(); tip.appendChild(img);
      document.body.appendChild(tip);
      try{ img.src=await blobURL(entry); }catch(_){ tip.remove(); tip=null; return; }
    }
    if(mine!==token) return;
    const r=el.getBoundingClientRect();
    tip.style.left=Math.max(8,Math.min(innerWidth-168,r.left))+'px';
    // Prefer above; flip below when there is no room.
    tip.style.top=(r.top>190?r.top-182:r.bottom+8)+'px';
    tip.classList.add('on');
  };
  const hide=()=>{ token++; if(tip) tip.classList.remove('on'); };
  el.addEventListener('pointerenter',show);
  el.addEventListener('pointerleave',hide);
  el.addEventListener('click',hide);
  el.addEventListener('blur',hide);
}
export { attachCardPreview };

/**
 * {"name": "renderVariationLinks", "kind": "function", "params": ["u", "box"], "module": "scenes"}
 */
function renderVariationLinks(u,box){
  console.log("[Trace:Scenes:renderVariationLinks]");
  const ids=S.unitCharacters.get(u.key)||[];
  const currentRoot=unitKeyFromId(u.meta?.root_unit_id||u.meta?.unit_id);
  const groups=[];
  for(const id of ids){
    const keys=[...(S.characterFamilies.get(id)||[])].filter(k=>S.units.has(k))
      .sort((a,b)=>{
        const am=S.units.get(a)?.meta?.unit_id||a,bm=S.units.get(b)?.meta?.unit_id||b;
        return am.localeCompare(bm,undefined,{numeric:true});
      });
    if(keys.length>1) groups.push({id,keys});
  }
  if(!groups.length) return;
  const wrap=document.createElement('div'); wrap.className='uvariations';
  for(const {id,keys} of groups){
    const row=document.createElement('div'); row.className='uvar-group';
    const label=document.createElement('span'); label.className='lbl';
    label.textContent=`${S.characterLabels.get(id)||'Character'} variations`;
    row.appendChild(label);
    for(const key of keys){
      const v=S.units.get(key),name=localText(v?.meta?.display_name||v?.meta?.name)||`Unit ${v?.id||key}`;
      const b=document.createElement('button'); b.className='uvar'; b.textContent=name;
      b.title=v?.meta?.unit_id||key;
      b.setAttribute('aria-current',String(key===currentRoot));
      attachCardPreview(b,v);
      b.onclick=()=>{
        openUnit(key);
        $(`#list [data-k="${CSS.escape(key)}"]`)?.scrollIntoView({block:'nearest'});
      };
      row.appendChild(b);
    }
    wrap.appendChild(row);
  }
  box.appendChild(wrap);
}
export { renderVariationLinks };

/**
 * {"name": "renderSceneLinks", "kind": "function", "params": ["u", "box"], "module": "scenes"}
 */
function renderSceneLinks(u,box){
  console.log("[Trace:Scenes:renderSceneLinks]");
  const sceneNumber=sceneIdFromUnit(u);
  if(!sceneNumber) return;
  const scenes=[...S.scenes.values()].filter(s=>{
    const m=String(s.id).match(/^(?:chr_)?(\d+)(?:_\d+)?$/i);
    return m&&String(+m[1])===sceneNumber;
  }).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  if(!scenes.length) return;
  const row=document.createElement('div'); row.className='uscenes';
  const label=document.createElement('span'); label.className='lbl'; label.textContent='Scenes';
  row.appendChild(label);
  for(const scene of scenes){
    const b=document.createElement('button'); b.className='uscene'; b.textContent=scene.id;
    b.onclick=()=>setTab('scenes',scene.key); row.appendChild(b);
  }
  box.appendChild(row);
}
export { renderSceneLinks };

/**
 * {"name": "renderVoices", "kind": "function", "params": ["u"], "module": "scenes"}
 */
function renderVoices(u){
  console.log("[Trace:Scenes:renderVoices]");
  const box=$('#voices'); box.textContent='';
  if(!u.voices.length){box.innerHTML='<div class="none">No voice clips found for this unit.</div>';return;}
  const g=new Map();
  for(const v of u.voices){ if(!g.has(v.type)) g.set(v.type,[]); g.get(v.type).push(v); }
  const keys=[...g.keys()].sort((a,b)=>{const i=VOICE_ORDER.indexOf(a),j=VOICE_ORDER.indexOf(b);
    return (i<0?99:i)-(j<0?99:j)||a.localeCompare(b);});
  for(const k of keys){
    const list=g.get(k).sort((a,b)=>a.variant.localeCompare(b.variant)||a.idx-b.idx);
    const d=document.createElement('div'); d.className='vgroup';
    d.innerHTML=`<h4>${VOICE_LABEL[k]||k} <span style="color:var(--fg-3);font-weight:400">${k}</span></h4>`;
    const l=document.createElement('div'); l.className='vlist';
    for(const v of list){
      const item=document.createElement('div'); item.className='vitem';
      const b=document.createElement('button'); b.className='vbtn';
      b.innerHTML=`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                   <span class="n">${v.idx}${v.variant!=='base'?' · '+v.variant:''}</span>`;
      if(v.entry) b.onclick=()=>playClip(v.entry,b); else b.disabled=true;
      item.appendChild(b);
      const text=localText(v.metaVoice?.text);
      if(text){
        const t=document.createElement('div'); t.className='vtext'; t.textContent=text; item.appendChild(t);
      }
      l.appendChild(item);
    }
    d.appendChild(l); box.appendChild(d);
  }
}
export { renderVoices };

/**
 * {"name": "playClip", "kind": "asyncFunction", "params": ["entry", "btn"], "module": "scenes"}
 */
async function playClip(entry,btn){
  console.log("[Trace:Scenes:playClip]");
  $$('.vbtn.playing').forEach(b=>b.classList.remove('playing'));
  if(S.audio){S.audio.pause();S.audio=null;}
  try{
    const a=new Audio(await blobURL(entry)); S.audio=a; a.muted=S.muted;
    btn?.classList.add('playing');
    a.onended=()=>btn?.classList.remove('playing');
    await a.play();
  }catch(_){ btn?.classList.remove('playing'); toast('Could not play that clip'); }
}
export { playClip };

/**
 * {"name": "parseScript", "kind": "function", "params": ["text"], "module": "scenes"}
 */
function parseScript(text){
  console.log("[Trace:Scenes:parseScript]");
  const ops=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/^\uFEFF/,'').replace(/\s+$/,'');
    if(!line.trim()||line.startsWith('//')) continue;
    // GROUP is a container in the source format. Its XML-style closing tag
    // is control syntax, never dialogue.
    if(/^<\/[A-Z_0-9]+>\s*$/i.test(line)) continue;
    const m=line.match(/^<([A-Z_0-9]+)>(.*)$/i);
    if(m) ops.push({t:m[1].toUpperCase(),a:m[2].split(',').map(s=>s.trim())});
    else ops.push({t:'TEXT',a:[line]});
  }
  return ops;
}
export { parseScript };

/**
 * {"name": "sceneSpineAnimations", "kind": "function", "params": ["ops"], "module": "scenes"}
 */
function sceneSpineAnimations(ops){
  console.log("[Trace:Scenes:sceneSpineAnimations]");
  return [...new Set(ops.filter(o=>o.t==='SPINE_ANIMATOR')
    .map(o=>o.a[0]).filter(Boolean))];
}
export { sceneSpineAnimations };

/**
 * {"name": "indexCGStops", "kind": "function", "params": ["A"], "module": "scenes"}
 */
function indexCGStops(A){
  console.log("[Trace:Scenes:indexCGStops]");
  let ev=null,spine='',animation='',pause=-1;
  const seen=new Set();
  A.cgStops=[];
  for(const o of A.ops){
    const a=o.a;
    if(o.t==='EV') ev=`ev:${String(a[0]||'').toLowerCase()}`;
    else if(o.t==='EV_OUT') ev=null;
    else if(o.t==='SPINE'){
      if(String(a[1]||'IN').toUpperCase()==='OUT'){spine='';animation='';}
      else {spine=String(a[0]||'').toLowerCase();animation='';}
    }else if(o.t==='SPINE_ANIMATOR'&&spine) animation=String(a[0]||'').toLowerCase();
    else if(o.t==='BG_OUT') ev=null;
    if(o.t==='PAUSE'){
      pause++;
      const visual=S.sceneSpineEnabled&&spine
        ?`spine:${spine}${animation?`:${animation}`:''}`:ev;
      if(visual&&!seen.has(visual)){
        A.cgStops.push({pause,key:visual});
        seen.add(visual);
      }
    }
  }
}
export { indexCGStops };

/**
 * {"name": "refreshSceneVisualKey", "kind": "function", "params": ["A"], "module": "scenes"}
 */
function refreshSceneVisualKey(A){
  console.log("[Trace:Scenes:refreshSceneVisualKey]");
  if(!A) return;
  A.visualKey=S.sceneSpineEnabled&&A.spineRef
    ?`spine:${A.spineRef}${A.spineAnimation?`:${A.spineAnimation}`:''}`
    :A.evKey;
}
export { refreshSceneVisualKey };

/**
 * {"name": "openScene", "kind": "asyncFunction", "params": ["k"], "module": "scenes"}
 */
async function openScene(k){
  console.log("[Trace:Scenes:openScene]");
  closeLightbox();
  disposeUnitSpine();
  S.sel=k;
  // Story and unit scenes share this viewer; keep whichever tab is showing so
  // opening a story scene does not bounce the browser back to unit scenes.
  if(S.tab==='units') S.tab=(S.scenes.get(k)?.kind==='story')?'story':'scenes';
  $$('#list [data-k]').forEach(c=>c.setAttribute('aria-selected',String(c.dataset.k===k)));
  const s=S.scenes.get(k);
  $('#paneS').classList.add('on'); $('#paneU').classList.remove('on'); $('#empty').style.display='none';
  $('#app').classList.remove('browse');
  $('#adv').classList.toggle('cgmode',S.cgMode);
  $('#cgmode').setAttribute('aria-pressed',String(S.cgMode));
  stopAll();

  $('#stitle').textContent=s.label;
  $('#ssub').textContent=s.path;
  $('#sspinecontrols').hidden=true;
  $('#spinetoggle').hidden=!s.hasSpine;
  $('#spinetoggle').setAttribute('aria-pressed',String(S.sceneSpineEnabled));
  $('#spinetoggle').textContent=`Spine: ${S.sceneSpineEnabled?'On':'Off'}`;
  for(const id of ['rew','play','seek']) $('#'+id).disabled=!!s.spineModel;

  if(s.spineModel){
    S.adv={s,ops:[],pair:new Map(),locals:[],i:0,stops:[],log:[],
      cgStops:[],spineAnimations:[],visualKey:null,evKey:null,
      spineRef:'',spineAnimation:'',
      name:'',text:'',auto:false,timer:null};
    $('#seek').max=0; $('#seek').value=0; $('#pos').textContent='Spine';
    resetStage(); $('#log').classList.remove('on');
    await loadSceneSpineModel(s.spineModel);
    return;
  }

  let text,ops;
  try{
    text=await (await s.script.get()).text();
    ops=parseScript(text);
    if(!ops.length) throw new Error('the script contains no readable operations');
  }catch(err){
    console.error('scene script',s.path,err);
    resetStage();
    $('#ttext').textContent='The scene script could not be loaded.';
    $('#ttext').lang='en';
    toast(`Scene failed to load: ${s.id}`,5000);
    return;
  }

  // parent/child layering: a child image is a partial overlay on its parent
  const pair=new Map();
  if(s.img){
    try{
      const j=JSON.parse(await (await s.img.get()).text());
      for(const p of (j.pairList||[])) pair.set(String(p.child).toLowerCase(),String(p.parent));
    }catch(_){}
  }
  const locals=[s.imagesPath,s.voicesPath];
  S.adv={s,ops,pair,locals,i:0,stops:[],cgStops:[],log:[],
    spineAnimations:sceneSpineAnimations(ops),visualKey:null,evKey:null,
    spineRef:'',spineAnimation:'',
    name:'',text:'',auto:false,timer:null};

  // index every PAUSE so the seek bar maps to readable positions
  ops.forEach((o,i)=>{ if(o.t==='PAUSE') S.adv.stops.push(i); });
  indexCGStops(S.adv);
  $('#seek').max=Math.max(0,(S.cgMode?S.adv.cgStops:S.adv.stops).length-1);
  $('#seek').value=0;

  resetStage(); $('#log').classList.remove('on');
  if(S.cgMode&&S.adv.cgStops.length) await seekTo(S.adv.cgStops[0].pause);
  else await run();
}
export { openScene };

/**
 * {"name": "resetStage", "kind": "function", "params": [], "module": "scenes"}
 */
function resetStage(){
  console.log("[Trace:Scenes:resetStage]");
  $('#lBG').textContent=''; $('#lEV').textContent=''; $('#lAC').textContent='';
  disposeSceneSpine(); $('#lSP').textContent='';
  $('#sspinecontrols').hidden=true;
  if(S.adv){
    S.adv.visualKey=null;S.adv.evKey=null;S.adv.evBaseEntry=null;
    S.adv.spineRef='';S.adv.spineAnimation='';
  }
  $('#tname').textContent=''; $('#ttext').textContent='';
  $('#tbox').classList.remove('off');
}
export { resetStage };

/**
 * {"name": "clearSceneVisuals", "kind": "function", "params": [], "module": "scenes"}
 */
function clearSceneVisuals(){
  console.log("[Trace:Scenes:clearSceneVisuals]");
  $('#lBG').textContent=''; $('#lEV').textContent=''; $('#lAC').textContent='';
  disposeSceneSpine(); $('#lSP').textContent='';
  $('#sspinecontrols').hidden=true;
  if(S.adv){
    S.adv.visualKey=null;S.adv.evKey=null;S.adv.evBaseEntry=null;
    S.adv.spineRef='';S.adv.spineAnimation='';
  }
}
export { clearSceneVisuals };

/**
 * {"name": "disposeSceneSpine", "kind": "function", "params": [], "module": "scenes"}
 */
function disposeSceneSpine(){
  console.log("[Trace:Scenes:disposeSceneSpine]");
  if(S.sceneSpine){S.sceneSpine.dispose();S.sceneSpine=null;}
}
export { disposeSceneSpine };

/**
 * {"name": "spineVariantFor", "kind": "function", "params": ["model", "animation"], "module": "scenes"}
 */
function spineVariantFor(model,animation){
  console.log("[Trace:Scenes:spineVariantFor]");
  const suffix=String(animation||'').match(/_(\d{2})$/)?.[1];
  return (suffix&&model?.variants?.find(v=>v.variant===suffix))||model;
}
export { spineVariantFor };

/**
 * {"name": "loadSceneSpineModel", "kind": "asyncFunction", "params": ["model", "requestedAnimation"], "module": "scenes"}
 */
async function loadSceneSpineModel(model,requestedAnimation){
  console.log("[Trace:Scenes:loadSceneSpineModel]");
  disposeSceneSpine();
  const layer=$('#lSP'); layer.textContent='';
  const canvas=document.createElement('canvas'); layer.appendChild(canvas);
  let player=null;
  try{
    const selected=spineVariantFor(model,requestedAnimation);
    const loadModel={...selected,variants:model.variants||selected.variants||[],stage:true};
    // RPGX event Spine is rendered onto an opaque black 1280x720 surface in
    // the game. Keeping this canvas opaque prevents browser compositing from
    // darkening semi-transparent edges where attachments overlap.
    player=new TaimaninSpinePlayer(canvas,{opaque:true}); S.sceneSpine=player;
    const animations=await player.load(loadModel,requestedAnimation);
    if(S.sceneSpine!==player){player.dispose();return [];}
    const select=$('#sspineanim'); select.textContent='';
    const choices=[...new Set([...(S.adv?.spineAnimations||[]),...animations])];
    for(const name of choices){
      const option=document.createElement('option');
      option.value=option.textContent=name; select.appendChild(option);
    }
    const current=requestedAnimation||player.state?.tracks?.[0]?.animation?.name;
    if(current) select.value=current;
    $('#sspinecontrols').hidden=!choices.length;
    $('#sspineplay').textContent='Pause';
    $('#sspineplay').setAttribute('aria-pressed','true');
    return choices;
  }catch(err){
    console.error('scene spine',model.name,err);
    if(S.sceneSpine===player){
      disposeSceneSpine(); layer.textContent='';
      toast(`Scene Spine failed: ${model.name}`,5000);
    }
    return [];
  }
}
export { loadSceneSpineModel };

/**
 * {"name": "setSceneSpine", "kind": "asyncFunction", "params": ["name", "direction"], "module": "scenes"}
 */
async function setSceneSpine(name,direction){
  console.log("[Trace:Scenes:setSceneSpine]");
  if(String(direction||'IN').toUpperCase()==='OUT'){
    disposeSceneSpine(); $('#lSP').textContent=''; $('#sspinecontrols').hidden=true; return true;
  }
  if(!S.sceneSpineEnabled) return false;
  const model=findSpineModel(name);
  if(!model){console.warn('scene Spine model not found',name);return false;}
  await loadSceneSpineModel(model);
  return !!S.sceneSpine;
}
export { setSceneSpine };

/**
 * {"name": "setSceneSpineAnimation", "kind": "asyncFunction", "params": ["name"], "module": "scenes"}
 */
async function setSceneSpineAnimation(name){
  console.log("[Trace:Scenes:setSceneSpineAnimation]");
  if(!name||!S.sceneSpineEnabled) return false;
  if(S.sceneSpine?.setAnimation(name)){
    $('#sspineanim').value=name;
    return true;
  }
  const model=S.sceneSpine?.model;
  if(!model) return false;
  await loadSceneSpineModel(model,name);
  const ok=!!S.sceneSpine;
  if(ok) $('#sspineanim').value=name;
  return ok;
}
export { setSceneSpineAnimation };

/**
 * {"name": "buildActor", "kind": "asyncFunction", "params": ["name", "locals"], "module": "scenes"}
 */
async function buildActor(name,locals){
  console.log("[Trace:Scenes:buildActor]");
  const key=String(name||'').toLowerCase();
  /* Source selection is already settled in actor_sources.json. */
  const source=S.actorSources.get(key);
  if(!source||source.kind==='missing') return null;
  if(source.kind==='authored'){
    const authored=source.file
      ?S.actorAuthored.get(stem(source.file.split('/').pop()))
      :S.actorAuthored.get(key);
    if(!authored) return null;
    const box=document.createElement('div'); box.className='composite';
    const img=new Image(); img.src=await blobURL(authored);
    img.style.left='50%'; img.style.top='50%'; img.style.width='100%';
    box.appendChild(img);
    return box;
  }
  const parts=Array.isArray(source.parts)?source.parts:null;
  if(!parts||!parts.length) return null;
  const [CW,CH]=S.actorCanvas;
  const box=document.createElement('div'); box.className='composite';
  /* The catalog is already flattened. Runtime composition is deliberately a
     literal draw of this list, with no ownership or fallback inference. */
  for(const p of parts){
    const e=p.file?S.actorRaw.get(String(p.file).toLowerCase()):null;
    if(!e) return null;                    // catalog integrity failure
    const url=await blobURL(e);
    const left=(((CW/2)+p.x)/CW*100)+'%', top=(((CH/2)-p.y)/CH*100)+'%';
    const img=new Image();
    img.src=url;
    img.style.left=left; img.style.top=top;
    img.style.width=(p.w/CW*100)+'%';
    img.style.height=(p.h/CH*100)+'%';
    box.appendChild(img);
  }
  return box.childElementCount?box:null;
}
export { buildActor };

/**
 * {"name": "setLayer", "kind": "asyncFunction", "params": ["el", "names", "locals"], "module": "scenes"}
 */
async function setLayer(el,names,locals){
  console.log("[Trace:Scenes:setLayer]");
  el.textContent='';
  for(const n of names){
    const e=await resolve(n,locals); if(!e) continue;
    const img=new Image(); img.src=await blobURL(e); el.appendChild(img);
  }
}
export { setLayer };

/**
 * {"name": "spriteParts", "kind": "function", "params": ["name"], "module": "scenes"}
 */
function spriteParts(name){
  console.log("[Trace:Scenes:spriteParts]");
  const want=stem(name),out=[];
  const exact=S.pool.get(want);
  if(exact) out.push(exact);
  if(!exact){
    for(const [key,e] of S.pool){
      const tail=key.slice(want.length);
      if(key.startsWith(want)&&/^[a-z](?:~\d+)?$/i.test(tail)) out.push(e);
    }
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
export { spriteParts };

/**
 * {"name": "evEntrySize", "kind": "function", "params": ["entry"], "module": "scenes"}
 */
function evEntrySize(entry){
  console.log("[Trace:Scenes:evEntrySize]");
  const p=entry?.position||{};
  const size=p.size||p.source_size||p.canvas;
  return {w:+size?.[0]||0,h:+size?.[1]||0};
}
export { evEntrySize };

/**
 * {"name": "isEVFrame", "kind": "function", "params": ["entry"], "module": "scenes"}
 */
function isEVFrame(entry){
  console.log("[Trace:Scenes:isEVFrame]");
  const {w,h}=evEntrySize(entry);
  // Event artwork is authored on a 960x720 stage. Keep this deliberately a
  // little permissive for older packs with a differently sized full frame,
  // while excluding expression/body patches such as 152x152 or 520x300.
  return w>=720&&h>=540;
}
export { isEVFrame };

/**
 * {"name": "sameEVAtlas", "kind": "function", "params": ["a", "b"], "module": "scenes"}
 */
function sameEVAtlas(a,b){
  console.log("[Trace:Scenes:sameEVAtlas]");
  const aa=a?.position?.atlas,bb=b?.position?.atlas;
  return !!aa&&!!bb&&String(aa).toLowerCase()===String(bb).toLowerCase();
}
export { sameEVAtlas };

/**
 * {"name": "inferEVBase", "kind": "function", "params": ["parts", "previous"], "module": "scenes"}
 */
function inferEVBase(parts,previous){
  console.log("[Trace:Scenes:inferEVBase]");
  const ownFrame=parts.find(isEVFrame);
  if(ownFrame) return ownFrame;
  const sample=parts[0];
  if(!sample) return null;
  if(previous&&isEVFrame(previous)&&sameEVAtlas(sample,previous)) return previous;
  const atlas=sample.position?.atlas;
  if(!atlas) return null;
  return [...S.pool.values()]
    .filter(e=>isEVFrame(e)&&String(e.position?.atlas||'').toLowerCase()===String(atlas).toLowerCase())
    .sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))[0]||null;
}
export { inferEVBase };

/**
 * {"name": "loadImageEntry", "kind": "asyncFunction", "params": ["entry"], "module": "scenes"}
 */
async function loadImageEntry(entry){
  console.log("[Trace:Scenes:loadImageEntry]");
  const img=new Image(); img.src=await blobURL(entry);
  await img.decode().catch(()=>{});
  return img;
}
export { loadImageEntry };

/**
 * {"name": "imagePixels", "kind": "function", "params": ["img"], "module": "scenes"}
 */
function imagePixels(img){
  console.log("[Trace:Scenes:imagePixels]");
  const c=document.createElement('canvas'); c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
  return {w:c.width,h:c.height,data:x.getImageData(0,0,c.width,c.height).data};
}
export { imagePixels };

/**
 * {"name": "patchOffset", "kind": "function", "params": ["base", "patch", "entry"], "module": "scenes"}
 */
function patchOffset(base,patch,entry){
  console.log("[Trace:Scenes:patchOffset]");
  const cacheKey=`${base.w}x${base.h}|${entry.key}`;
  if(S.sceneOffsets.has(cacheKey)) return S.sceneOffsets.get(cacheKey);
  const maxX=Math.max(0,base.w-patch.w),maxY=Math.max(0,base.h-patch.h);
  if(!maxX&&!maxY) return {x:0,y:0};
  const samples=[],stride=Math.max(8,Math.floor(Math.min(patch.w,patch.h)/12));
  for(let y=4;y<patch.h-4;y+=stride) for(let x=4;x<patch.w-4;x+=stride){
    const i=(y*patch.w+x)*4;
    if(patch.data[i+3]>220) samples.push([x,y,i]);
  }
  const score=(ox,oy,limit=Infinity)=>{
    let sum=0;
    for(const [x,y,pi] of samples){
      const bi=((oy+y)*base.w+ox+x)*4;
      sum+=Math.abs(patch.data[pi]-base.data[bi])
        +Math.abs(patch.data[pi+1]-base.data[bi+1])
        +Math.abs(patch.data[pi+2]-base.data[bi+2]);
      if(sum>=limit) break;
    }
    return sum;
  };
  let best={x:0,y:0,s:Infinity};
  // Position metadata provides the natural dimensions and a useful authored
  // coordinate candidate. Pixel matching then corrects atlas-packed sprites
  // into the 960x720 scene coordinate system.
  const p=entry.position||{},r=p.logical_rect||[0,0];
  const seeds=[[Math.max(0,Math.min(maxX,Math.round(+r[0]||0))),
    Math.max(0,Math.min(maxY,Math.round(+r[1]||0)))]];
  for(let y=0;y<=maxY;y+=6) for(let x=0;x<=maxX;x+=6){
    const s=score(x,y,best.s); if(s<best.s) best={x,y,s};
  }
  for(const [x,y] of seeds){const s=score(x,y,best.s);if(s<best.s)best={x,y,s};}
  const coarse=best;
  for(let y=Math.max(0,coarse.y-7);y<=Math.min(maxY,coarse.y+7);y++)
    for(let x=Math.max(0,coarse.x-7);x<=Math.min(maxX,coarse.x+7);x++){
      const s=score(x,y,best.s); if(s<best.s) best={x,y,s};
    }
  const value={x:best.x,y:best.y};S.sceneOffsets.set(cacheKey,value);return value;
}
export { patchOffset };

/**
 * {"name": "setEVLayer", "kind": "asyncFunction", "params": ["name", "parentName", "previousBase"], "module": "scenes"}
 */
async function setEVLayer(name,parentName,previousBase){
  console.log("[Trace:Scenes:setEVLayer]");
  const layer=$('#lEV'); layer.textContent='';
  const requested=spriteParts(name);
  const explicitBase=parentName&&((await resolve(parentName,[]))||spriteParts(parentName)[0]);
  const baseEntry=explicitBase||inferEVBase(requested,previousBase)
    ||(await resolve(name,[]))||requested[0];
  if(!baseEntry) return null;
  const baseImg=await loadImageEntry(baseEntry),base=imagePixels(baseImg);
  // Pair-list scenes supply an explicit parent. Newer direct scripts omit it:
  // when their requested asset is smaller than a scene frame it is a packed
  // patch and must be composited over the prior/inferred full-frame CG.
  const patches=(parentName||!requested.some(isEVFrame))?requested:[];
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  // EV art is stored on a 960x720 authored canvas but the scene player and
  // Spine use the full 1280x720 viewport. Map both axes to that same stage so
  // switching between static and animated CGs does not change visual size.
  const scaleX=canvas.width/base.w,scaleY=canvas.height/base.h;
  ctx.drawImage(baseImg,0,0,canvas.width,canvas.height);
  for(const entry of patches){
    if(entry.key===baseEntry.key) continue;
    const img=await loadImageEntry(entry),patch=imagePixels(img);
    if(patch.w===base.w&&patch.h===base.h){
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      continue;
    }
    const off=patchOffset(base,patch,entry);
    ctx.drawImage(img,off.x*scaleX,off.y*scaleY,patch.w*scaleX,patch.h*scaleY);
  }
  layer.appendChild(canvas);
  return baseEntry;
}
export { setEVLayer };

/**
 * {"name": "playVoice", "kind": "asyncFunction", "params": ["name", "locals"], "module": "scenes"}
 */
async function playVoice(name,locals){
  console.log("[Trace:Scenes:playVoice]");
  const e=await resolve(name,locals); if(!e) return;
  if(S.voice){S.voice.pause();S.voice=null;}
  const a=new Audio(await blobURL(e)); a.muted=S.muted; S.voice=a; a.play().catch(()=>{});
}
export { playVoice };

/**
 * {"name": "stopAll", "kind": "function", "params": [], "module": "scenes"}
 */
function stopAll(){
  console.log("[Trace:Scenes:stopAll]");
  for(const k of ['audio','bgm','voice']) if(S[k]){S[k].pause();S[k]=null;}
  if(S.adv&&S.adv.timer){clearTimeout(S.adv.timer);S.adv.timer=null;}
}
export { stopAll };

/**
 * {"name": "run", "kind": "asyncFunction", "params": [], "module": "scenes"}
 */
async function run(){
  console.log("[Trace:Scenes:run]");
  const A=S.adv; if(!A||running) return;
  running=true;
  try{ await runInner(A); } finally{ running=false; }
}
export { run };

/**
 * {"name": "runInner", "kind": "asyncFunction", "params": ["A"], "module": "scenes"}
 */
async function runInner(A){
  console.log("[Trace:Scenes:runInner]");
  let guard=0;
  while(A.i<A.ops.length){
    if(++guard>4000) break;
    const o=A.ops[A.i++], a=o.a;
    switch(o.t){
      case 'TEXT': A.text+=(A.text?'\n':'')+a.join(','); break;
      case 'NAME_PLATE': A.name=a.join(',').trim(); break;
      case 'TXT_CLEAR': A.text=''; A.name=''; break;
      case 'BG': await setLayer($('#lBG'),[a[0]],A.locals); break;
      case 'BG_OUT':
        $('#lBG').textContent=''; $('#lEV').textContent='';
        A.evKey=null; A.evBaseEntry=null; refreshSceneVisualKey(A);
        break;
      case 'EV': {
        const n=a[0]||''; const p=A.pair.get(n.toLowerCase());
        A.evBaseEntry=await setEVLayer(n,p,A.evBaseEntry);
        A.evKey=`ev:${n.toLowerCase()}`; refreshSceneVisualKey(A);
        break; }
      case 'EV_OUT':
        $('#lEV').textContent='';
        A.evKey=null; A.evBaseEntry=null; refreshSceneVisualKey(A);
        break;
      /* <ACTOR> idx, name, posFrom, posTo, direction, timing, duration
         The position that matters is posTo (a[3]) — posFrom is where the move
         starts — and `direction` is OUT as often as IN. Treating every ACTOR as
         "show" and reading a[2] as the position left a dismissed actor on stage:
         in adv/c001_s01b__all the CENTER character is taken OUT at line 56, then
         re-enters on the RIGHT while a second character enters LEFT, so she was
         visible twice at once. */
      case 'ACTOR': {
        const slot=a[0]||'0', nm=a[1]||'';
        const x=(a[3]||a[2]||'CENTER').toUpperCase();
        const dir=(a[4]||'IN').toUpperCase();
        const old=$('#lAC').querySelector(`[data-slot="${slot}"]`);
        if(dir==='OUT'){ if(old) old.remove(); break; }
        const el=await buildActor(nm,A.locals);
        if(!el){ if(old) old.remove(); break; }
        el.dataset.slot=slot; el.dataset.x=x;
        if(old) old.replaceWith(el); else $('#lAC').appendChild(el);
        break; }
      case 'ACTOR_OUT': {
        // `[data-slot]`, not `img[data-slot]`: a composed actor is a <div>.
        const el=$('#lAC').querySelector(`[data-slot="${a[0]||'0'}"]`); if(el) el.remove(); break; }
      case 'VOICE_PLAY': await playVoice(a[0],A.locals); break;
      case 'BGM_PLAY': await playBGM(a[0]); break;
      case 'BGM_STOP': if(S.bgm){S.bgm.pause();S.bgm=null;} break;
      case 'SE_PLAY': { const e=await resolve(a[0],A.locals);
        if(e){const s=new Audio(await blobURL(e));s.muted=S.muted;s.volume=.6;s.play().catch(()=>{});} break; }
      case 'EFFECT_FLASH': flash(a[1]); break;
      case 'EFFECT_QUAKE': quake(); break;
      case 'UI_DISP': $('#tbox').classList.toggle('off',(a[0]||'').toUpperCase()==='OFF'); break;
      case 'SPINE':
        await setSceneSpine(a[0],a[1]);
        if(String(a[1]||'IN').toUpperCase()==='OUT'){
          A.spineRef=''; A.spineAnimation='';
        }else{
          A.spineRef=String(a[0]||'').toLowerCase();
          A.spineAnimation='';
        }
        refreshSceneVisualKey(A);
        break;
      case 'SPINE_ANIMATOR':
        A.spineAnimation=String(a[0]||'').toLowerCase();
        if(S.sceneSpineEnabled&&!await setSceneSpineAnimation(a[0]))
          console.warn('Spine animation not found',a[0]);
        refreshSceneVisualKey(A);
        break;
      case 'TRANSITION': case 'FADE': case 'WAIT': case 'GROUP':
      case 'LABEL': case 'JUMP':
      case 'ACTOR_FRONT': case 'DEBUG_STOP': break;      // no-ops / unsupported
      case 'SCENARIO_END':
        paint(); clearSceneVisuals(); A.i=A.ops.length; updatePos(); return;
      case 'PAUSE': paint(); pushLog(); A.text=''; updatePos();
        if(A.auto) A.timer=setTimeout(()=>run(),Math.max(900,(A.lastLen||30)*55));
        return;
      default: break;
    }
  }
  paint(); updatePos();
}
export { runInner };

/**
 * {"name": "paint", "kind": "function", "params": [], "module": "scenes"}
 */
function paint(){
  console.log("[Trace:Scenes:paint]");
  const A=S.adv; if(!A) return;
  const name=localText(A.name||''), text=localText(A.text||'');
  const jp=/[぀-ヿ一-鿿]/;
  $('#tname').textContent=name;
  $('#ttext').textContent=text;
  $('#tname').lang=jp.test(name)?'ja':'en';
  $('#ttext').lang=jp.test(text)?'ja':'en';
  A.lastLen=text.length;
}
export { paint };

/**
 * {"name": "buildScript", "kind": "function", "params": [], "module": "scenes"}
 */
function buildScript(){
  console.log("[Trace:Scenes:buildScript]");
  const A=S.adv, box=$('#script');
  box.textContent='';
  if(!A){ box.textContent='No scene loaded.'; return; }
  const hd=document.createElement('div'); hd.className='hd'; hd.lang='en';
  const entries=[];
  let name='', text='';
  for(const o of A.ops){
    if(o.t==='NAME_PLATE') name=(o.a[0]||'').trim();
    else if(o.t==='TEXT') text+=(text?'\n':'')+o.a.join(',');
    else if(o.t==='TXT_CLEAR'){ name=''; text=''; }
    else if(o.t==='PAUSE'){
      if(text.trim()) entries.push({name,text});
      text='';
    }
  }
  if(text.trim()) entries.push({name,text});
  hd.textContent=`${A.name||''} — ${entries.length} line${entries.length===1?'':'s'}`;
  box.appendChild(hd);
  const jp=/[぀-ヿ一-鿿]/;
  const fr=document.createDocumentFragment();
  for(const e of entries){
    const d=document.createElement('div'); d.className='e';
    if(e.name){
      const b=document.createElement('b');
      b.textContent=localText(e.name); b.lang=jp.test(b.textContent)?'ja':'en';
      d.appendChild(b);
    }
    const pp=document.createElement('p');
    pp.textContent=localText(e.text); pp.lang=jp.test(pp.textContent)?'ja':'en';
    d.appendChild(pp); fr.appendChild(d);
  }
  box.appendChild(fr);
}
export { buildScript };

/**
 * {"name": "pushLog", "kind": "function", "params": [], "module": "scenes"}
 */
function pushLog(){
  console.log("[Trace:Scenes:pushLog]");
  const A=S.adv; if(!A||!A.text) return;
  A.log.push({name:A.name,text:A.text,i:A.i});
  if(A.log.length>600) A.log.shift();
}
export { pushLog };

/**
 * {"name": "updatePos", "kind": "function", "params": [], "module": "scenes"}
 */
function updatePos(){
  console.log("[Trace:Scenes:updatePos]");
  const A=S.adv; if(!A) return;
  const done=A.stops.filter(x=>x<A.i).length;
  if(S.cgMode){
    const pause=Math.max(-1,done-1);
    const at=A.cgStops.findLastIndex(x=>x.pause<=pause);
    $('#seek').value=Math.max(0,at);
    $('#pos').textContent=`${Math.max(0,at+1)} / ${A.cgStops.length} CG`;
  }else{
    $('#seek').value=Math.max(0,done-1);
    $('#pos').textContent=`${done} / ${A.stops.length}`;
  }
}
export { updatePos };

/**
 * {"name": "seekTo", "kind": "asyncFunction", "params": ["stopIdx"], "module": "scenes"}
 */
async function seekTo(stopIdx){
  console.log("[Trace:Scenes:seekTo]");
  const A=S.adv; if(!A) return;
  const target=A.stops[Math.max(0,Math.min(stopIdx,A.stops.length-1))]??A.ops.length;
  stopAll(); resetStage();
  A.i=0; A.text=''; A.name=''; A.log=[];
  const wasMuted=S.muted, wasAuto=A.auto;
  S.muted=true; A.auto=false;                 // silent, non-scheduling fast-forward
  let guard=0;
  while(A.i<=target && A.i<A.ops.length && ++guard<20000){
    const before=A.i;
    await run();
    if(A.i<=before) break;                    // no progress -> stop rather than spin
  }
  S.muted=wasMuted; A.auto=wasAuto;
  // anything started while muted must follow the real mute state again
  for(const k of ['audio','bgm','voice']) if(S[k]) S[k].muted=S.muted;
  paint(); updatePos();
}
export { seekTo };

/**
 * {"name": "adjacentScene", "kind": "function", "params": ["step=1"], "module": "scenes"}
 */
function adjacentScene(step=1){
  console.log("[Trace:Scenes:adjacentScene]");
  const keys=S.view.includes(S.sel)?S.view:S.order;
  const at=keys.indexOf(S.sel),next=at+step;
  if(at<0||next<0||next>=keys.length) return null;
  return keys[next];
}
export { adjacentScene };

/**
 * {"name": "cgSceneStep", "kind": "asyncFunction", "params": ["direction"], "module": "scenes"}
 */
async function cgSceneStep(direction){
  console.log("[Trace:Scenes:cgSceneStep]");
  const A=S.adv; if(!A||running) return;
  const pause=Math.max(-1,A.stops.filter(x=>x<A.i).length-1);
  let target;
  if(direction<0){
    target=[...A.cgStops].reverse().find(x=>x.pause<pause);
    if(!target) target=A.cgStops[0];
  }else target=A.cgStops.find(x=>x.pause>pause);
  if(target){await seekTo(target.pause);return;}
  if(direction>0){
    const next=adjacentScene(1);
    if(next) await openScene(next); else toast('This is the last scene');
  }
}
export { cgSceneStep };

/**
 * {"name": "sceneStep", "kind": "asyncFunction", "params": ["direction"], "module": "scenes"}
 */
async function sceneStep(direction){
  console.log("[Trace:Scenes:sceneStep]");
  const A=S.adv; if(!A||running) return;
  if(S.cgMode){await cgSceneStep(direction);return;}
  if(direction<0){
    if(!A.stops.length) return;
    const done=A.stops.filter(x=>x<A.i).length;
    await seekTo(Math.max(0,done-2));
    return;
  }
  if(!A.ops.length||A.i>=A.ops.length){
    const next=adjacentScene(1);
    if(next) await openScene(next); else toast('This is the last scene');
    return;
  }
  await run();
  if(A===S.adv&&A.i>=A.ops.length){
    const next=adjacentScene(1);
    if(next) await openScene(next); else toast('This is the last scene');
  }
}
export { sceneStep };
