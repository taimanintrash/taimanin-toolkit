// viewer/js/fs.js — FileSystem module (extracted from taimanin_viewer.html)
'use strict';

import { disposeSceneSpine } from './scenes.js';
import { LAZY, RE, S, keyOf, normVar } from './state.js';
import { prog, syncLangUI, toast } from './ui.js';
import { buildChips, disposeUnitSpine, setTab } from './units.js';


// {"name": "stem", "kind": "const", "module": "fs"}
const stem=n=>n.replace(/\.[^.]+$/,'').toLowerCase();
export { stem };

// {"name": "dirOf", "kind": "const", "module": "fs"}
const dirOf=p=>p.split('/').slice(0,-1).join('/');
export { dirOf };

// {"name": "baseOf", "kind": "const", "module": "fs"}
const baseOf=p=>p.split('/').pop();
export { baseOf };

// {"name": "localText", "kind": "const", "module": "fs"}
const localText=v=>{
  if(v==null) return '';
  if(typeof v==='string')
    return (S.lang==='en'&&S.en.get(v))||v;
  if(S.lang==='en'){
    const t=S.en.get(v.ja);
    if(t) return t;
  }
  return v[S.lang]||v.ja||v.ko||Object.values(v).find(Boolean)||'';
};
export { localText };

/**
 * {"name": "blobURL", "kind": "asyncFunction", "params": ["e"], "module": "fs"}
 */
async function blobURL(e){
  console.log("[Trace:FileSystem:blobURL]");
  if(!e) return null;
  if(S.urls.has(e.key)) return S.urls.get(e.key);
  const url=URL.createObjectURL(await e.get());
  S.urls.set(e.key,url);
  if(S.urls.size>260){
    for(const k of [...S.urls.keys()]){
      if(S.urls.size<=180) break;
      if(S.pinned.has(k)) continue;
      URL.revokeObjectURL(S.urls.get(k)); S.urls.delete(k);
    }
  }
  return url;
}
export { blobURL };

/**
 * {"name": "listLazy", "kind": "asyncFunction", "params": ["path"], "module": "fs"}
 */
async function listLazy(path){
  console.log("[Trace:FileSystem:listLazy]");
  const b=S.lazy.get(path); if(!b) return [];
  if(b.entries) return b.entries;
  if(b.cached) return b.cached;
  if(b.remote){
    try{
      const r=await fetch('/__taimanin_list__?path='+encodeURIComponent(path));
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      b.cached=(await r.json()).map(name=>remoteEntry(path+'/'+name));
    }catch(err){console.warn('remote lazy',path,err);b.cached=[];}
    return b.cached;
  }
  const out=[];
  try{
    for await (const [name,h] of b.handle.entries())
      if(h.kind==='file'){const p=path+'/'+name;out.push({name,path:p,key:p,get:()=>h.getFile()});}
  }catch(err){ console.warn('lazy',path,err); }
  b.cached=out; return out;
}
export { listLazy };

// {"name": "remoteURL", "kind": "const", "module": "fs"}
const remoteURL=path=>'/'+path.split('/').map(encodeURIComponent).join('/');
export { remoteURL };

/**
 * {"name": "remoteEntry", "kind": "function", "params": ["path"], "module": "fs"}
 */
function remoteEntry(path){
  console.log("[Trace:FileSystem:remoteEntry]");
  return {name:baseOf(path),path,key:path,url:remoteURL(path),get:async()=>{
    const r=await fetch(remoteURL(path));
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}: ${path}`);
    return r.blob();
  }};
}
export { remoteEntry };

/**
 * {"name": "mapOf", "kind": "asyncFunction", "params": ["path"], "module": "fs"}
 */
async function mapOf(path){
  console.log("[Trace:FileSystem:mapOf]");
  const b=S.lazy.get(path); if(!b) return null;
  if(b.map) return b.map;
  const m=new Map();
  for(const e of await listLazy(path)) if(!m.has(stem(e.name))) m.set(stem(e.name),e);
  b.map=m; return m;
}
export { mapOf };

/**
 * {"name": "resolve", "kind": "asyncFunction", "params": ["name", "localPaths=[]"], "module": "fs"}
 */
async function resolve(name, localPaths=[]){
  console.log("[Trace:FileSystem:resolve]");
  if(!name) return null;
  const want=stem(name);
  for(const p of localPaths){
    const m=await mapOf(p);
    const hit=m&&m.get(want);
    if(hit) return hit;
  }
  return S.pool.get(want)||null;
}
export { resolve };

/**
 * {"name": "walkDir", "kind": "asyncFunction", "params": ["dir", "path", "files"], "module": "fs"}
 */
async function walkDir(dir, path, files){
  console.log("[Trace:FileSystem:walkDir]");
  for await (const [name,h] of dir.entries()){
    const p = path? path+'/'+name : name;
    if(h.kind==='directory'){
      if(LAZY.has(name.toLowerCase())) S.lazy.set(p,{handle:h});
      else await walkDir(h,p,files);
    }else files.push({name,path:p,key:p,get:()=>h.getFile()});
    if((files.length&2047)===0){$('#scanning').textContent='scanning '+files.length;await new Promise(r=>setTimeout(r));}
  }
}
export { walkDir };

/**
 * {"name": "fromFileList", "kind": "function", "params": ["list"], "module": "fs"}
 */
function fromFileList(list){
  console.log("[Trace:FileSystem:fromFileList]");
  const files=[];
  for(const f of list){
    const p=f.webkitRelativePath||f.name;
    const parent=dirOf(p), pname=baseOf(parent).toLowerCase();
    const e={name:f.name,path:p,key:p,get:async()=>f};
    if(LAZY.has(pname)){
      if(!S.lazy.has(parent)) S.lazy.set(parent,{entries:[]});
      S.lazy.get(parent).entries.push(e);
    }else files.push(e);
  }
  return files;
}
export { fromFileList };

/**
 * {"name": "unitOf", "kind": "function", "params": ["key", "id", "form"], "module": "fs"}
 */
function unitOf(key,id,form){
  console.log("[Trace:FileSystem:unitOf]");
  let u=S.units.get(key);
  if(!u){u={key,id,form:+(form||1),dir:'',thumb:null,thumbR18:null,art:new Map(),
            voices:[],variants:new Set(),loaded:false};S.units.set(key,u);}
  return u;
}
export { unitOf };

/**
 * {"name": "indexFile", "kind": "function", "params": ["e"], "module": "fs"}
 */
function indexFile(e){
  console.log("[Trace:FileSystem:indexFile]");
  const n=e.name; let m;
  if((m=n.match(RE.thumb))){const g=m.groups,u=unitOf(keyOf(g.id,g.form),g.id,g.form);
    u.dir=u.dir||dirOf(dirOf(e.path));
    if(/r18/i.test(g.var||'')) u.thumbR18=e; else u.thumb=e; return true;}
  if((m=n.match(RE.art))){const g=m.groups,u=unitOf(keyOf(g.id,g.form),g.id,g.form);
    u.dir=u.dir||dirOf(dirOf(e.path));
    const v=normVar(g.var),p=+g.idx;
    if(!u.art.has(p)) u.art.set(p,{});
    u.art.get(p)[v]=e; u.variants.add(v); return true;}
  if((m=n.match(RE.voice))){const g=m.groups,u=unitOf(keyOf(g.id,g.form),g.id,g.form);
    u.voices.push({entry:e,form:+g.form,type:g.type.toLowerCase(),variant:normVar(g.var),idx:+g.idx,name:n});
    return true;}
  return false;
}
export { indexFile };

// {"name": "spineLoose", "kind": "const", "module": "fs"}
const spineLoose=name=>String(name||'').toLowerCase().replace(/\d+/g,n=>String(+n)).replace(/[^a-z0-9]/g,'');
export { spineLoose };

/**
 * {"name": "indexSpineModels", "kind": "function", "params": ["files"], "module": "fs"}
 */
function indexSpineModels(files){
  console.log("[Trace:FileSystem:indexSpineModels]");
  S.spineModels.clear(); S.spineLoose.clear();
  const eligible=files.filter(e=>/^taimanin_assets\/extracted\/spine\//i.test(e.path));
  const atlases=new Map();
  for(const e of eligible){
    if(!/\.atlas$/i.test(e.name)) continue;
    const d=dirOf(e.path);
    if(!atlases.has(d)) atlases.set(d,[]);
    atlases.get(d).push(e);
  }
  const put=(key,model,score)=>{
    key=String(key||'').toLowerCase();
    const old=S.spineModels.get(key);
    if(!old||score>old.score) S.spineModels.set(key,{...model,score});
  };
  const groups=new Map();
  for(const skel of eligible){
    if(!/\.skel$/i.test(skel.name)||!skel.url) continue;
    const exact=stem(skel.name);
    const list=atlases.get(dirOf(skel.path))||[];
    const exactAtlas=list.find(a=>stem(a.name)===exact);
    const base=exactAtlas?exact:exact.replace(/_\d{2}$/,'');
    const atlas=exactAtlas||list.find(a=>stem(a.name)===base)
      ||list.find(a=>spineLoose(stem(a.name))===spineLoose(base));
    if(!atlas||!atlas.url) continue;
    const suffix=exactAtlas?'':(exact.match(/_(\d{2})$/)?.[1]||'');
    const model={name:base,exact,variant:suffix,skel,atlas,
      skelURL:skel.url,atlasURL:atlas.url};
    const groupKey=`${dirOf(skel.path).toLowerCase()}|${base.toLowerCase()}`;
    if(!groups.has(groupKey)) groups.set(groupKey,[]);
    groups.get(groupKey).push(model);
  }
  for(const variants of groups.values()){
    variants.sort((a,b)=>(a.variant||'00').localeCompare(b.variant||'00',undefined,{numeric:true}));
    const primary=variants.find(v=>!v.variant)||variants.find(v=>v.variant==='01')||variants[0];
    const combined={...primary,variants};
    put(primary.name,combined,primary.variant?2:4);
    for(const variant of variants) put(variant.exact,{...variant,variants},3);
    const loose=spineLoose(primary.name),old=S.spineLoose.get(loose);
    if(!old||(primary.variant?2:4)>old.score)
      S.spineLoose.set(loose,{...combined,score:primary.variant?2:4});
  }
}
export { indexSpineModels };

/**
 * {"name": "findSpineModel", "kind": "function", "params": ["name"], "module": "fs"}
 */
function findSpineModel(name){
  console.log("[Trace:FileSystem:findSpineModel]");
  return S.spineModels.get(String(name||'').toLowerCase())
    ||S.spineLoose.get(spineLoose(name))||null;
}
export { findSpineModel };

/**
 * {"name": "loadTranslations", "kind": "asyncFunction", "params": ["files"], "module": "fs"}
 */
async function loadTranslations(files){
  console.log("[Trace:FileSystem:loadTranslations]");
  S.en.clear(); S.enMeta=null;
  const hit=files.find(e=>e.name.toLowerCase()==='strings_en.json');
  if(!hit) return;
  try{
    const data=JSON.parse(await (await hit.get()).text());
    const strings=data&&data.strings?data.strings:data;
    for(const k in strings) if(strings[k]) S.en.set(k,strings[k]);
    S.enMeta=data&&data._meta||null;
  }catch(err){
    console.warn('translations',err);
    toast('Could not read strings_en.json');
  }
  syncLangUI();
}
export { loadTranslations };

/**
 * {"name": "loadActorSources", "kind": "asyncFunction", "params": ["files"], "module": "fs"}
 */
async function loadActorSources(files){
  console.log("[Trace:FileSystem:loadActorSources]");
  S.actorSources.clear();
  const hit=files.find(e=>e.name.toLowerCase()==='actor_sources.json');
  if(!hit) return;
  try{
    const data=JSON.parse(await (await hit.get()).text());
    if(Array.isArray(data._meta?.canvas)&&data._meta.canvas.length===2)
      S.actorCanvas=data._meta.canvas;
    for(const [name,source] of Object.entries(data.sources||{}))
      S.actorSources.set(name.toLowerCase(),source);
  }catch(err){
    console.warn('actor sources',err);
    toast('Could not read actor_sources.json');
  }
}
export { loadActorSources };

/**
 * {"name": "loadUnitMetadata", "kind": "asyncFunction", "params": ["files"], "module": "fs"}
 */
async function loadUnitMetadata(files){
  console.log("[Trace:FileSystem:loadUnitMetadata]");
  S.metadata.clear(); S.characterFamilies.clear(); S.unitCharacters.clear();
  S.characterLabels.clear(); S.realCidByName.clear();
  const candidates=files.filter(e=>e.name.toLowerCase()==='units.json')
    .sort((a,b)=>(/\/tables\/units\.json$/i.test(b.path)?1:0)-(/\/tables\/units\.json$/i.test(a.path)?1:0));
  if(!candidates.length) return;
  try{
    const data=JSON.parse(await (await candidates[0].get()).text());
    if(!Array.isArray(data)) throw new Error('root is not an array');
    const byGraphic=new Map();
    for(const m of data){
      if(m&&m.unit_id) S.metadata.set(String(m.unit_id).toLowerCase(),m);
      const gid=String(m?.graphic_id||'').toLowerCase();
      if(gid&&!byGraphic.has(gid)) byGraphic.set(gid,m);
    }
    for(const u of S.units.values())
      u.meta=S.metadata.get(`uni${u.id}_${u.form}`)||byGraphic.get(`uni_${u.id}`)||null;
    buildRealCidIndex();       // must precede grouping: it resolves the 999 rows
    buildCharacterFamilies();
  }catch(err){
    console.warn('unit metadata',err);
    toast('Could not read tables/units.json');
  }
}
export { loadUnitMetadata };

// {"name": "multiCharacterName", "kind": "const", "module": "fs"}
const multiCharacterName=s=>/[＆&×＋+]/.test(String(s||''));
export { multiCharacterName };

// {"name": "normCharacterName", "kind": "const", "module": "fs"}
const normCharacterName=s=>String(s||'').replace(/[\s　・･]/g,'').toLowerCase();
export { normCharacterName };

// {"name": "rawCharacterName", "kind": "const", "module": "fs"}
const rawCharacterName=m=>normCharacterName(m?.name?.ja||localText(m?.name));
export { rawCharacterName };

/**
 * {"name": "buildRealCidIndex", "kind": "function", "params": [], "module": "fs"}
 */
function buildRealCidIndex(){
  console.log("[Trace:FileSystem:buildRealCidIndex]");
  S.realCidByName.clear();
  for(const m of S.metadata.values()){
    const cid=Number(m?.character_id);
    if(!Number.isFinite(cid)||cid===999) continue;
    const n=rawCharacterName(m);
    if(!n||multiCharacterName(n)||S.realCidByName.has(n)) continue;
    S.realCidByName.set(n,cid);
  }
}
export { buildRealCidIndex };

/**
 * {"name": "characterFamilyId", "kind": "function", "params": ["m"], "module": "fs"}
 */
function characterFamilyId(m){
  console.log("[Trace:FileSystem:characterFamilyId]");
  const cid=Number(m?.character_id);
  if(cid!==999) return cid;
  const n=rawCharacterName(m);
  const real=S.realCidByName.get(n);
  return real===undefined?`name:${n}`:real;
}
export { characterFamilyId };

/**
 * {"name": "unitKeyFromId", "kind": "function", "params": ["id"], "module": "fs"}
 */
function unitKeyFromId(id){
  console.log("[Trace:FileSystem:unitKeyFromId]");
  const m=String(id||'').match(/^uni(\d{5})_(\d+)$/i);
  return m?keyOf(m[1],m[2]):null;
}
export { unitKeyFromId };

/**
 * {"name": "sceneIdFromUnit", "kind": "function", "params": ["u"], "module": "fs"}
 */
function sceneIdFromUnit(u){
  console.log("[Trace:FileSystem:sceneIdFromUnit]");
  const m=String(u?.meta?.spine_id||'').match(/^chr_(\d+)$/i);
  return m?String(+m[1]):null;
}
export { sceneIdFromUnit };

/**
 * {"name": "npcPrefix", "kind": "function", "params": ["name"], "module": "fs"}
 */
function npcPrefix(name){
  console.log("[Trace:FileSystem:npcPrefix]");
  const b=String(name||'').toLowerCase().replace(/_r18$/,'');
  const m=b.match(/^(.*\d)[a-z]+\d*$/);
  return m?m[1]:b;
}
export { npcPrefix };

/**
 * {"name": "buildNpcIndex", "kind": "function", "params": [], "module": "fs"}
 */
function buildNpcIndex(){
  console.log("[Trace:FileSystem:buildNpcIndex]");
  S.npcs.clear();
  const add=n=>{
    const source=S.actorSources.get(n);
    if(source?.duplicate_of) n=source.duplicate_of;
    const base=n.endsWith('_r18')?n.slice(0,-4):n;
    const canonical=n.endsWith('_r18')&&S.actorSources.has(base)?base:n;
    const k=npcPrefix(canonical);
    if(!k) return;
    let g=S.npcs.get(k);
    if(!g){g={key:k,poses:[],versions:new Map()};S.npcs.set(k,g);}
    if(!g.poses.includes(canonical)) g.poses.push(canonical);
    let versions=g.versions.get(canonical);
    if(!versions){versions={base:null,r18:null};g.versions.set(canonical,versions);}
    if(n.endsWith('_r18')) versions.r18=n; else versions.base=n;
  };
  /* Scenario references remain included, but they are not the complete pose
     inventory: actor-controller prefabs can ship selectable keys unused by
     scripts (sdk_t001 has all 16 base poses under its controller). */
  if(S.actorsUsed.size){
    for(const n of S.actorsUsed){
      add(n);
    }
  }
  /* The catalog includes staged names, exact counterparts/final cuts, and every
     direct pose key declared by an original actor-controller prefab. */
  for(const [name,source] of S.actorSources)
    if(source.kind!=='missing') add(name);
  for(const g of S.npcs.values())
    g.poses.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
export { buildNpcIndex };

/**
 * {"name": "buildSceneUnitIndex", "kind": "function", "params": [], "module": "fs"}
 */
function buildSceneUnitIndex(){
  console.log("[Trace:FileSystem:buildSceneUnitIndex]");
  S.sceneUnits.clear();
  for(const u of S.units.values()){
    const rootKey=unitKeyFromId(u.meta?.root_unit_id||u.meta?.unit_id);
    if(!rootKey||u.key!==rootKey) continue;
    const id=sceneIdFromUnit(u); if(!id) continue;
    if(!S.sceneUnits.has(id)) S.sceneUnits.set(id,[]);
    const list=S.sceneUnits.get(id);
    if(!list.some(x=>x.key===u.key)) list.push(u);
  }
}
export { buildSceneUnitIndex };

/**
 * {"name": "buildCharacterFamilies", "kind": "function", "params": [], "module": "fs"}
 */
function buildCharacterFamilies(){
  console.log("[Trace:FileSystem:buildCharacterFamilies]");
  S.characterFamilies.clear(); S.unitCharacters.clear(); S.characterLabels.clear();
  const roots=new Map(),canonical=new Map();
  for(const u of S.units.values()){
    const m=u.meta,rootKey=unitKeyFromId(m?.root_unit_id||m?.unit_id);
    if(!m||!rootKey||!S.units.has(rootKey)||roots.has(rootKey)) continue;
    roots.set(rootKey,S.units.get(rootKey));
    // Match on Japanese, label in the display language. Matching a name against
    // profile text only works if BOTH are the same language, and translation
    // coverage is partial — an English name would be hunted for inside a profile
    // still showing Japanese and never found.
    const cid=characterFamilyId(m),name=m?.name?.ja||localText(m.name);
    if((typeof cid==='number'&&!Number.isFinite(cid))||!name||multiCharacterName(name)) continue;
    if(!canonical.has(cid)) canonical.set(cid,[]);
    const list=canonical.get(cid);
    if(!list.some(x=>normCharacterName(x)===normCharacterName(name))) list.push(name);
    const label=localText(m.name);
    const old=S.characterLabels.get(cid);
    if(label&&(!old||(!localText(m.w2_name)&&label.length<old.length)))
      S.characterLabels.set(cid,label);
  }
  // `given` is the personal name — the last space-separated token of the
  // Japanese 「surname given」 form. Dual cards decorate the GIVEN name
  // (風神アスカ, 雷神ゆきかぜ), so that is what a card part can be matched against.
  const candidates=[];
  for(const [cid,names] of canonical)
    for(const name of names){
      const norm=normCharacterName(name);
      const parts=String(name).trim().split(/[\s　]+/).filter(Boolean);
      const given=normCharacterName(parts[parts.length-1]||name);
      // One-character names are real (朧 = Iga Oboro, 篝). They are kept so an
      // exact match can find them, but flagged so the profile-substring pass
      // below skips them — a single kanji hits inside unrelated prose.
      if(norm.length>=1) candidates.push({cid,name,norm,given,short:norm.length<2});
    }

  for(const [rootKey,u] of roots){
    const m=u.meta,cid=characterFamilyId(m);
    const name=m?.name?.ja||localText(m.name);
    let ids=(typeof cid==='string'||Number.isFinite(cid))?[cid]:[];
    if(multiCharacterName(name)){
      const profile=normCharacterName(m?.profile?.ja||localText(m.profile));
      const found=[];
      // Dual-card profiles usually spell out both full character names. Prefer
      // those authoritative matches over trying to split decorated card names.
      for(const c of candidates)
        if(c.cid!==cid&&typeof c.cid==='number'&&!c.short
           &&profile.includes(c.norm)&&!found.includes(c.cid)) found.push(c.cid);
      if(found.length<2){
        const parts=name.split(/[＆&×＋+]/).map(normCharacterName).filter(Boolean);
        const pool=candidates.filter(c=>c.cid!==cid&&typeof c.cid==='number');
        for(const part of parts){
          // Most specific first. A bare part like アサギ matches every Asagi
          // variant by suffix (井河アサギ, クローンアサギ, ＺＥＲＯアサギ), so plain
          // suffix matching is ambiguous and used to resolve nothing at all.
          // An exact given-name hit picks the base character out of that set;
          // the suffix pass then still catches a decorated part like 風神アスカ,
          // preferring the shortest given name when several could apply.
          let pick=null;
          const exactName=pool.filter(c=>c.norm===part);
          const exactGiven=pool.filter(c=>c.given===part);
          const suffix=pool.filter(c=>c.given.length>=2&&part.endsWith(c.given));
          if(exactName.length===1) pick=exactName[0];
          else if(exactGiven.length===1) pick=exactGiven[0];
          else if(suffix.length){
            const best=suffix.slice().sort((a,b)=>a.given.length-b.given.length);
            if(best.length===1||best[0].given.length<best[1].given.length) pick=best[0];
          }
          if(pick&&!found.includes(pick.cid)) found.push(pick.cid);
        }
      }
      if(found.length>=2) ids=found;
    }
    S.unitCharacters.set(rootKey,ids);
    for(const id of ids){
      if(!S.characterFamilies.has(id)) S.characterFamilies.set(id,new Set());
      S.characterFamilies.get(id).add(rootKey);
    }
  }
  // Every awakening form resolves through its root card.
  for(const u of S.units.values()){
    const rootKey=unitKeyFromId(u.meta?.root_unit_id||u.meta?.unit_id);
    if(rootKey&&S.unitCharacters.has(rootKey))
      S.unitCharacters.set(u.key,S.unitCharacters.get(rootKey));
  }
}
export { buildCharacterFamilies };

/**
 * {"name": "loadPositionMetadata", "kind": "asyncFunction", "params": ["files"], "module": "fs"}
 */
async function loadPositionMetadata(files){
  console.log("[Trace:FileSystem:loadPositionMetadata]");
  S.positions.clear();
  const source=files.find(e=>e.name.toLowerCase()==='positions.json');
  if(!source) return;
  try{
    const data=JSON.parse(await (await source.get()).text());
    if(!Array.isArray(data)) return;
    for(const rec of data){
      if(rec?.file) S.positions.set(String(rec.file).replace(/\\/g,'/').toLowerCase(),rec);
    }
    for(const e of files){
      const marker='/extracted/',lower=('/'+e.path).toLowerCase(),at=lower.lastIndexOf(marker);
      if(at>=0) e.position=S.positions.get(lower.slice(at+marker.length))||null;
    }
  }catch(err){console.warn('positions metadata',err);}
}
export { loadPositionMetadata };

/**
 * {"name": "ingest", "kind": "asyncFunction", "params": ["files", "sceneDefs=[]"], "module": "fs"}
 */
async function ingest(files,sceneDefs=[]){
  console.log("[Trace:FileSystem:ingest]");
  disposeUnitSpine(); disposeSceneSpine();
  S.units.clear(); S.scenes.clear(); S.pool.clear(); S.metadata.clear();
  S.actorAuthored.clear(); S.actorRaw.clear();
  S.sceneUnits.clear(); S.positions.clear();
  S.spineModels.clear(); S.spineLoose.clear();
  S.urls.forEach(URL.revokeObjectURL); S.urls.clear(); S.bbox.clear(); S.metrics.clear();
  S.actorBounds.clear();
  S.sceneOffsets.clear();

  const thumbDirs=[];
  for(const def of sceneDefs){
    if(!def?.script) continue;
    const script=remoteEntry(def.script),pair=def.pair?remoteEntry(def.pair):null;
    const key=def.script,id=def.id||stem(script.name);
    S.scenes.set(key,{key,path:def.script,id,script,img:pair,thumb:null,
      imagesPath:'',voicesPath:'',hasSpine:!!def.spine,hasCG:!!def.cg,
      hasArtAnimation:!!def.spine,
      kind:def.kind||'unit',srcLabel:def.label||''});
  }
  for(let i=0;i<files.length;i++){
    const e=files[i];
    const k=stem(e.name);
    const authored=/\/extracted\/adv\/authored_chr\//i.test('/'+(e.path||''));
    const rawActor=('/'+(e.path||'')).match(
      /\/extracted\/adv\/(adv_chr|r18_adv_chr)\/[^/]+$/i);
    if(authored&&/\.png$/i.test(e.name)) S.actorAuthored.set(k,e);
    if(rawActor&&/\.png$/i.test(e.name))
      S.actorRaw.set(`${rawActor[1].toLowerCase()}/${e.name.toLowerCase()}`,e);
    if(!authored&&/\.(?:png|jpe?g|webp|ogg|mp3|wav|m4a)$/i.test(e.name)&&!S.pool.has(k))
      S.pool.set(k,e);                         // global media name -> file
    indexFile(e);
    if(e.name.toLowerCase()==='img.txt') thumbDirs.push(e);
    if((i&4095)===0){prog(i/files.length);await new Promise(r=>setTimeout(r));}
  }
  for(const e of thumbDirs){const s=S.scenes.get(dirOf(e.path)); if(s) s.img=e;}
  indexSpineModels(files);
  await loadPositionMetadata(files);
  await loadTranslations(files);   // before metadata: character grouping reads names
  await loadActorSources(files);
  await loadUnitMetadata(files);
  buildSceneUnitIndex();
  buildNpcIndex();
  for(const u of S.units.values()){
    u.spine=findSpineModel(u.meta?.spine_id);
    u.artSpine=findSpineModel(`Cut_${u.meta?.spine_id||''}`);
  }
  // scene thumbnails: thumbnails/<PACK>/<sceneId>.jpg  ->  scenes/<sceneId>/
  const byId=new Map();
  for(const s of S.scenes.values()){
    if(!byId.has(s.id)) byId.set(s.id,[]);
    byId.get(s.id).push(s);
  }
  for(const e of files){
    if(!/(^|\/)thumbnails?(\/|$)/i.test(dirOf(e.path))) continue;
    const list=byId.get(stem(e.name));
    if(list) for(const s of list) s.thumb=s.thumb||e;
  }
  // Scene IDs are graphic/Spine IDs, not card IDs. Resolve them through each
  // root card's spine_id (for example card 00725 -> scene/Spine 0573).
  for(const s of S.scenes.values()){
    const m=String(s.id).match(/^(\d+)(?:_(\d+))?$/);
    const unit=m&&S.sceneUnits.get(String(+m[1]))?.[0];
    s.units=m?(S.sceneUnits.get(String(+m[1]))||[]):[];
    const name=localText(unit?.meta?.display_name||unit?.meta?.name);
    s.label=name?`${name} · Scene ${m[2]||1}`:`Scene ${s.id}`;
    if(s.kind==='story') s.label=s.srcLabel?`${s.srcLabel} · ${s.id}`:s.id;
    s.thumb=s.thumb||unit?.thumb||unit?.thumbR18||null;
  }

  prog(1); $('#scanning').textContent='';
  for(const [k,u] of S.units)
    if(!u.thumb&&!u.thumbR18&&!u.art.size&&!u.voices.length) S.units.delete(k);

  if(!S.units.size&&!S.scenes.size){toast('No units or scenes recognised in that folder');return;}
  $('#empty').style.display='none';
  buildChips(); setTab(S.units.size?'units':'scenes');
  toast(`${S.units.size} units · ${S.scenes.size} scenes`);
}
export { ingest };

// {"name": "idb", "kind": "const", "module": "fs"}
const idb={db:null,
  async open(){return this.db||=await new Promise((res,rej)=>{const r=indexedDB.open('tmv2',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},
  async set(k,v){try{const db=await this.open();return new Promise(r=>{const t=db.transaction('kv','readwrite');
    t.objectStore('kv').put(v,k);t.oncomplete=r;});}catch(_){}},
  async get(k){try{const db=await this.open();return new Promise(r=>{const t=db.transaction('kv','readonly');
    const q=t.objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);});}catch(_){return null}}};
export { idb };

/**
 * {"name": "pickFolder", "kind": "asyncFunction", "params": [], "module": "fs"}
 */
async function pickFolder(){
  console.log("[Trace:FileSystem:pickFolder]");
  if(window.showDirectoryPicker){
    let dir;
    try{ dir=await window.showDirectoryPicker({mode:'read'}); }
    catch(e){ if(e.name==='AbortError') return; $('#fallback').click(); return; }
    await idb.set('dir',dir); await loadDir(dir);
  }else $('#fallback').click();
}
export { pickFolder };

/**
 * {"name": "loadFromServer", "kind": "asyncFunction", "params": [], "module": "fs"}
 */
async function loadFromServer(){
  console.log("[Trace:FileSystem:loadFromServer]");
  if(location.protocol!=='http:'&&location.protocol!=='https:') return false;
  try{
    const r=await fetch('/__taimanin_index__');
    if(!r.ok) return false;
    const data=await r.json();
    if(!Array.isArray(data.files)||!Array.isArray(data.lazy)) return false;
    $('#scanning').textContent='reading local index…'; S.lazy.clear();
    for(const path of data.lazy) S.lazy.set(path,{remote:true});
    S.actorsUsed=new Set((data.actors_used||[]).map(x=>String(x).toLowerCase()));
    await ingest(data.files.map(remoteEntry),Array.isArray(data.scenes)?data.scenes:[]);
    return true;
  }catch(err){
    console.warn('automatic local load',err);
    return false;
  }
}
export { loadFromServer };

/**
 * {"name": "loadDir", "kind": "asyncFunction", "params": ["dir"], "module": "fs"}
 */
async function loadDir(dir){
  console.log("[Trace:FileSystem:loadDir]");
  $('#scanning').textContent='reading…'; S.lazy.clear();
  const files=[]; await walkDir(dir,'',files); await ingest(files);
}
export { loadDir };
