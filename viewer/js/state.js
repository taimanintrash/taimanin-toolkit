// viewer/js/state.js — State module (extracted from taimanin_viewer.html)
'use strict';

import { spineLoose } from './fs.js';


// {"name": "LAZY", "kind": "const", "module": "state"}
const LAZY = new Set(['images','voices','audioclip']);
export { LAZY };

// {"name": "VAR", "kind": "const", "module": "state"}
const VAR='(?:r18|u17|v)(?:_(?:r18|u17|v))?';
export { VAR };

// {"name": "RE", "kind": "const", "module": "state"}
const RE={
  /* `kar_c` is deliberately NOT accepted here. Those are TABA collection cards
     (extracted/unit_art/r18_image_kar_l) and they number in their OWN id space,
     so kar_c00003 is card 3, not unit 00003 — yet the shared \d{5} capture made
     them collide. r18_image_kar_l is indexed after every r18_image_chr_* folder
     and art slots are assigned last-wins, so the card silently replaced the
     unit's real R18 art: 304 units lost 608 real R18 poses that way, Crackle
     (uni_00003) among them. TABA cards have their own viewer; they do not
     belong in unit art. Only 3 of 392 card ids have no unit of the same number,
     so nothing meaningful is hidden by dropping them here. */
  art  : new RegExp(`^(?:uni_?|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?l_(?<idx>\\d+)\\.(?:png|jpg|webp)$`,'i'),
  thumb: new RegExp(`^(?:uni_?|kar_c|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?s\\.(?:png|jpg|webp)$`,'i'),
  voice: new RegExp(`^uni(?<id>\\d{5})_(?<form>\\d+)_(?<type>[a-z]+?)(?:_(?<var>${VAR}))?_(?<idx>\\d+)\\.(?:ogg|mp3|wav|m4a)$`,'i'),
};
export { RE };

// {"name": "keyOf", "kind": "const", "module": "state"}
const keyOf=(id,f)=>(+(f||1)>1)?`${id}_${f}`:id;
export { keyOf };

// {"name": "normVar", "kind": "const", "module": "state"}
const normVar=v=>(v||'base').replace(/_$/,'').toLowerCase();
export { normVar };

// {"name": "VOICE_LABEL", "kind": "const", "module": "state"}
const VOICE_LABEL={new:'Acquired',hom:'Home',atk:'Attack',dmg:'Damaged',evo:'Awakening',
  lup:'Level Up',rdy:'Battle Start',res:'Result',wav:'Wave',msr:'Mission'};
export { VOICE_LABEL };

// {"name": "VOICE_ORDER", "kind": "const", "module": "state"}
const VOICE_ORDER=['new','hom','rdy','atk','dmg','wav','msr','evo','lup','res'];
export { VOICE_ORDER };

// {"name": "S", "kind": "const", "module": "state"}
const S={
  tab:'units',
  lang:localStorage.getItem('tmv-lang')||'en',
  en:new Map(), enMeta:null,
  units:new Map(), scenes:new Map(),
  metadata:new Map(),
  sceneUnits:new Map(),
  characterFamilies:new Map(), unitCharacters:new Map(), characterLabels:new Map(),
  realCidByName:new Map(),   // JA character name -> non-999 character_id
  actorSources:new Map(), actorAuthored:new Map(), actorRaw:new Map(),
  actorCanvas:[1280,760],
  npcs:new Map(), cutSize:'m', cutPoses:[], cutIndex:0,
  actorsUsed:new Set(),      // sprite names ADV scripts actually stage
  positions:new Map(),
  spineModels:new Map(), spineLoose:new Map(),
  pool:new Map(),          // "basename" (no ext, lower) -> entry
  lazy:new Map(),          // dirPath -> {handle}|{entries}
  order:[], view:[], sel:null,
  artIndex:0, fit:'canvas',
  filters:new Set(),
  urls:new Map(), pinned:new Set(), bbox:new Map(), metrics:new Map(), actorBounds:new Map(),
  sceneOffsets:new Map(),
  audio:null, bgm:null, voice:null, muted:false,
  unitMode:'image', unitSpine:null, sceneSpine:null,
  cgMode:false, sceneSpineEnabled:true,
  adv:null,
};
export { S };
