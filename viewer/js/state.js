'use strict';

const LAZY = new Set(['images', 'voices', 'audioclip']);

const VAR = '(?:r18|u17|v)(?:_(?:r18|u17|v))?';
const RE = {
  art: new RegExp(`^(?:uni_?|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?l_(?<idx>\\d+)\\.(?:png|jpg|webp)$`, 'i'),
  thumb: new RegExp(`^(?:uni_?|kar_c|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?s\\.(?:png|jpg|webp)$`, 'i'),
  voice: new RegExp(`^uni(?<id>\\d{5})_(?<form>\\d+)_(?<type>[a-z]+?)(?:_(?<var>${VAR}))?_(?<idx>\\d+)\\.(?:ogg|mp3|wav|m4a)$`, 'i'),
};

const keyOf = (id, f) => (+(f || 1) > 1) ? `${id}_${f}` : id;
const normVar = v => (v || 'base').replace(/_$/, '').toLowerCase();

const VOICE_LABEL = {
  new: 'Acquired', hom: 'Home', atk: 'Attack', dmg: 'Damaged', evo: 'Awakening',
  lup: 'Level Up', rdy: 'Battle Start', res: 'Result', wav: 'Wave', msr: 'Mission'
};
const VOICE_ORDER = ['new', 'hom', 'rdy', 'atk', 'dmg', 'wav', 'msr', 'evo', 'lup', 'res'];

const RANKS = [[1, 'C'], [2, 'R'], [3, 'HR'], [4, 'SR']];
const rankKey = r => `rank:${r}`;

const S = {
  tab: 'units',
  lang: localStorage.getItem('tmv-lang') || 'en',
  en: new Map(), enMeta: null,
  units: new Map(), scenes: new Map(),
  metadata: new Map(),
  sceneUnits: new Map(),
  characterFamilies: new Map(), unitCharacters: new Map(), characterLabels: new Map(),
  realCidByName: new Map(),
  actorSources: new Map(), actorAuthored: new Map(), actorRaw: new Map(),
  actorCanvas: [1280, 760],
  npcs: new Map(), cutSize: 'm', cutPoses: [], cutIndex: 0,
  actorsUsed: new Set(),
  positions: new Map(),
  spineModels: new Map(), spineLoose: new Map(),
  pool: new Map(),
  lazy: new Map(),
  order: [], view: [], sel: null,
  artIndex: 0, fit: 'canvas',
  filters: new Set(),
  urls: new Map(), pinned: new Set(), bbox: new Map(), metrics: new Map(), actorBounds: new Map(),
  sceneOffsets: new Map(),
  audio: null, bgm: null, voice: null, muted: false,
  unitMode: 'image', unitSpine: null, sceneSpine: null,
  cgMode: false, sceneSpineEnabled: true,
  adv: null,
};