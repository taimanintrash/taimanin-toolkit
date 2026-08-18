// viewer/js/app.js — top-level wiring & initialisation (extracted)
'use strict';

import { findSpineModel, fromFileList, idb, ingest, loadDir, loadFromServer, pickFolder } from './fs.js';
import { buildScript, cgSceneStep, disposeSceneSpine, indexCGStops, loadSceneSpineModel, openScene, refreshSceneVisualKey, run, sceneStep, seekTo, setSceneSpineAnimation, updatePos } from './scenes.js';
import { S } from './state.js';
import { closeLightbox, lbIsCut, setLang, setNoSide, setWide, syncLangUI, syncSideUI } from './ui.js';
import { applyFilter, openCut, openNpc, openUnit, setTab, setUnitView, showArt, sizeGrid } from './units.js';

console.log('[Trace:App:init]');


// --- wiring block (source line ~1) ---
'use strict';
/* ===================================================================
   Taimanin Viewer — Units + Scenes in one local page.

   * Reads files in place through the File System Access API (or a plain
     directory input as fallback). Nothing is uploaded or copied.
   * Units, scenes and Spine sets are discovered only under
     taimanin_assets. The deprecated standalone viewer is not indexed.
   * Huge media folders (images/ voices/ AudioClip/) are NOT walked at
     start-up — 148k files would take minutes. Their directory handle is
     kept and enumerated only when that unit or scene is opened.
   =================================================================== */

const $ = s=>document.querySelector(s), $$ = s=>[...document.querySelectorAll(s)];

// --- wiring block (source line ~621) ---
$('#fallback').addEventListener('change',e=>{S.lazy.clear();ingest(fromFileList([...e.target.files]));});
(async()=>{
  if(await loadFromServer()) return;
  const dir=await idb.get('dir');
  if(dir&&dir.queryPermission){
    if(await dir.queryPermission({mode:'read'})==='granted') return loadDir(dir);
    $('#pick').textContent='Reopen last folder…';
    $('#pick').onclick=async()=>{
      if(await dir.requestPermission({mode:'read'})==='granted') return loadDir(dir);
      pickFolder();};
  }
})();

/* ------------------------------------------------------------ browsing */
/* The game's rank letters. `rarity` runs 1-6, but 5 and 6 are what awakening
   turns a rank-4 card into, not ranks a card is issued at — so only 1-4 are
   offered, and a unit with no rarity is simply never matched. */

// --- wiring block (source line ~702) ---
$('#tabU').onclick=()=>setTab('units'); $('#tabS').onclick=()=>setTab('scenes');
$('#tabN').onclick=()=>setTab('story');
$('#tabC').onclick=()=>setTab('npc');
$$('#csizeseg button').forEach(b=>b.onclick=()=>{
  S.cutSize=b.dataset.csize;
  $$('#csizeseg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  $('#cutsheet').style.setProperty('--cut',{s:'170px',m:'260px',l:'420px'}[S.cutSize]);
});


// --- wiring block (source line ~741) ---
$('#q').addEventListener('input',applyFilter);


// --- wiring block (source line ~815) ---
new ResizeObserver(()=>sizeGrid()).observe($('#list'));

/* =====================================================================
   UNITS
   ===================================================================== */
/* Cut sheet: every pose of one ADV character, each composed on the shared
   1280x760 canvas. Rendering them all at the same scale is the point — it is how
   you see that a pose is mis-sized or missing a piece. */

// --- wiring block (source line ~896) ---
openNpc._token=0;

/* Visible-pixel bounds in the actor's authored 1280x760 coordinate system.
   Big view uses the same subject-fit idea as unit art: prefab offsets remain
   intact, then the complete visible result is centred and fitted as one unit. */

// --- wiring block (source line ~1817) ---
let running=false;

// --- wiring block (source line ~2050) ---
$('#adv').onclick=()=>{ if(S.cgMode||$('#log').classList.contains('on')) return; run(); };
$('#cgprev').onclick=e=>{e.stopPropagation();sceneStep(-1);};
$('#cgnext').onclick=e=>{e.stopPropagation();sceneStep(1);};
$('#texttoggle').onclick=()=>{
  const hidden=$('#tbox').classList.toggle('manual-off');
  const button=$('#texttoggle');
  button.setAttribute('aria-pressed',String(hidden));
  button.textContent=hidden?'Show text':'Hide text';
};
$('#spinetoggle').onclick=async()=>{
  S.sceneSpineEnabled=!S.sceneSpineEnabled;
  const button=$('#spinetoggle');
  button.setAttribute('aria-pressed',String(S.sceneSpineEnabled));
  button.textContent=`Spine: ${S.sceneSpineEnabled?'On':'Off'}`;
  const A=S.adv;
  if(!S.sceneSpineEnabled){
    disposeSceneSpine(); $('#lSP').textContent=''; $('#sspinecontrols').hidden=true;
  }else if(A?.spineRef){
    const model=findSpineModel(A.spineRef);
    if(model) await loadSceneSpineModel(model,A.spineAnimation);
  }
  if(A){
    refreshSceneVisualKey(A); indexCGStops(A);
    $('#seek').max=Math.max(0,(S.cgMode?A.cgStops:A.stops).length-1);
    updatePos();
    if(S.cgMode&&!A.visualKey) cgSceneStep(1);
  }
};
$('#cgmode').onclick=()=>{
  S.cgMode=!S.cgMode;
  $('#adv').classList.toggle('cgmode',S.cgMode);
  $('#cgmode').setAttribute('aria-pressed',String(S.cgMode));
  const A=S.adv;
  if(A){
    $('#seek').max=Math.max(0,(S.cgMode?A.cgStops:A.stops).length-1);
    updatePos();
    if(S.cgMode&&!A.visualKey) cgSceneStep(1);
  }
};
$('#play').onclick=()=>{const A=S.adv;if(!A)return;A.auto=!A.auto;
  $('#play').setAttribute('aria-pressed',String(A.auto));
  $('#play').textContent=A.auto?'❚❚ Auto':'▶ Auto'; if(A.auto) run();};
$('#rew').onclick=()=>{const A=S.adv;if(!A)return;
  const done=A.stops.filter(x=>x<A.i).length; seekTo(Math.max(0,done-2));};
$('#seek').oninput=e=>{
  const A=S.adv;if(!A)return;
  const i=+e.target.value;
  seekTo(S.cgMode?(A.cgStops[i]?.pause??0):i);
};
$('#mute').onclick=()=>{S.muted=!S.muted;
  for(const k of ['audio','bgm','voice']) if(S[k]) S[k].muted=S.muted;
  $('#mute').setAttribute('aria-pressed',String(S.muted));
  $('#mute').textContent=S.muted?'🔇':'🔊';};
$('#sspineanim').onchange=e=>setSceneSpineAnimation(e.target.value);
$('#sspineplay').onclick=()=>{
  if(!S.sceneSpine) return;
  const playing=!S.sceneSpine.playing; S.sceneSpine.setPlaying(playing);
  $('#sspineplay').textContent=playing?'Pause':'Play';
  $('#sspineplay').setAttribute('aria-pressed',String(playing));
};
$('#logbtn').onclick=()=>{
  const L=$('#log'); const A=S.adv; if(!A) return;
  L.classList.toggle('on');
  if(!L.classList.contains('on')) return;
  L.textContent='';
  A.log.slice().reverse().forEach(e=>{
    const d=document.createElement('div'); d.className='e';
    const b=document.createElement('b'); b.textContent=e.name||' ';
    const p=document.createElement('p'); p.textContent=e.text;
    const j=document.createElement('button'); j.textContent='jump here';
    j.onclick=()=>{L.classList.remove('on');
      seekTo(A.stops.filter(x=>x<e.i).length-1);};
    d.append(b,p,j); L.appendChild(d);
  });
};
$('#widebtn').onclick=()=>setWide(!$('#app').classList.contains('wide'));

/* ---------------------------------------------------------- chrome */
$('#pick').onclick=pickFolder; $('#reopen').onclick=pickFolder;
$$('#viewseg button').forEach(b=>b.onclick=()=>setUnitView(b.dataset.view));
$('#uspineanim').onchange=e=>S.unitSpine?.setAnimation(e.target.value);
$('#uspineplay').onclick=()=>{
  if(!S.unitSpine) return;
  const playing=!S.unitSpine.playing; S.unitSpine.setPlaying(playing);
  $('#uspineplay').textContent=playing?'Pause':'Play';
  $('#uspineplay').setAttribute('aria-pressed',String(playing));
};
$('#chk').onclick=()=>{const on=$('#ustagewrap').classList.toggle('checker');
  $('#chk').setAttribute('aria-pressed',String(on));};
$('#lightbox .close').onclick=closeLightbox;

// --- wiring block (source line ~2141) ---
$('#lightbox .prev').onclick=e=>{e.stopPropagation();
  lbIsCut()?openCut(S.cutIndex-1):selectArt(S.artIndex-1);};
$('#lightbox .next').onclick=e=>{e.stopPropagation();
  lbIsCut()?openCut(S.cutIndex+1):selectArt(S.artIndex+1);};
$('#lightbox').onclick=e=>{if(e.target===$('#lightbox'))closeLightbox();};
$$('#fitseg button').forEach(b=>b.onclick=()=>{S.fit=b.dataset.fit;
  $$('#fitseg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));showArt();});
/* Language toggle. EN is disabled until tables/strings_en.json has loaded, so a
   missing translation file degrades to a visibly-off button rather than a
   silently untranslated UI. Character grouping keys off the displayed name, so
   the families have to be rebuilt before the list is redrawn. */

// --- wiring block (source line ~2176) ---
$$('#langseg button').forEach(b=>b.onclick=()=>{ if(!b.disabled) setLang(b.dataset.lang); });
syncLangUI();

/* Collapsing the browser list widens the stage. `#app.wide` already existed for
   the scene pane's Wide button; this exposes the same state from the brand bar so
   it works on both tabs, and persists it like the theme. */

// --- wiring block (source line ~2199) ---
$('#sidetoggle').onclick=()=>setWide(!$('#app').classList.contains('wide'));
$('#sideshow').onclick  =()=>setWide(false);
$('#infotoggle').onclick=()=>setNoSide(!$('#app').classList.contains('noside'));
$('#usidehide').onclick =()=>setNoSide(true);
$('#usideshow').onclick =()=>setNoSide(false);
if(localStorage.getItem('tmv-wide')) $('#app').classList.add('wide');
if(localStorage.getItem('tmv-noside')) $('#app').classList.add('noside');
syncSideUI();

$('#scriptbtn').onclick=()=>{
  const box=$('#script'), on=!box.classList.contains('on');
  if(on) buildScript();
  box.classList.toggle('on',on);
  $('#scriptbtn').setAttribute('aria-pressed',String(on));
  if(on) $('#log').classList.remove('on');
};

$('#theme').onclick=()=>{const r=document.documentElement;
  r.dataset.theme=r.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('tmv-theme',r.dataset.theme);};
document.documentElement.dataset.theme=localStorage.getItem('tmv-theme')||'dark';

addEventListener('keydown',e=>{
  if($('#lightbox').classList.contains('on')){
    if(e.key==='Escape'){e.preventDefault();closeLightbox();}
    else if(e.key==='ArrowLeft'){e.preventDefault();
      lbIsCut()?openCut(S.cutIndex-1):selectArt(S.artIndex-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();
      lbIsCut()?openCut(S.cutIndex+1):selectArt(S.artIndex+1);}
    return;
  }
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){if(e.key==='Escape')e.target.blur();return;}
  if(e.key==='/'){e.preventDefault();$('#q').focus();return;}
  if(e.key==='\\'){e.preventDefault();$('#sidetoggle').click();return;}
  if(S.tab!=='units'&&S.adv){
    if(e.key==='ArrowLeft'){e.preventDefault();sceneStep(-1);return;}
    if(e.key==='ArrowRight'){e.preventDefault();sceneStep(1);return;}
    if(e.key===' '||e.key==='Enter'){e.preventDefault();run();return;}
    if(e.key==='Escape'){$('#log').classList.remove('on');return;}
  }
  if(S.tab==='units'){
    if(/^[1-9]$/.test(e.key)){$$('#poseseg button')[+e.key-1]?.click();return;}
  }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    const i=S.view.indexOf(S.sel); if(i<0) return;
    const cols=S.tab==='units'?Math.max(1,Math.floor($('#list').clientWidth/72)):1;
    const d={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols}[e.key];
    const n=S.view[Math.min(S.view.length-1,Math.max(0,i+d))];
    if(n){e.preventDefault(); S.tab==='units'?openUnit(n):S.tab==='npc'?openNpc(n):openScene(n);
      $(`#list [data-k="${CSS.escape(n)}"]`)?.scrollIntoView({block:'nearest'});}
  }
});
let rt; addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(S.tab==='units')showArt();},140);});


