'use strict';

const LAZY = new Set(['images', 'voices', 'audioclip']);

const VAR = '(?:r18|u17|v)(?:_(?:r18|u17|v))?';
const RE = {
  art: new RegExp(`^(?:uni_?|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?l_(?<idx>\\d+)\\.(?:png|jpg|webp)$`, 'i'),
  thumb: new RegExp(`^(?:uni_?|kar_c|bos_?)(?<id>\\d{5})(?:_(?<form>\\d+))?_?(?<var>${VAR}_)?s\\.(?:png|jpg|webp)$`, 'i'),
  voice: new RegExp(`^uni(?<id>\\d{5})_(?<form>\\d+)_(?<type>[a-z]+?)(?:_(?<var>${VAR}))?_(?<idx>\\d+)\\.(?:ogg|mp3|wav|m4a)$`, 'i'),
};

/**
 * Generates a unique unit key from unit ID and form.
 * Called by: unitOf, unitKeyFromId
 */
const keyOf = (id, f) => (+(f || 1) > 1) ? `${id}_${f}` : id;

/**
 * Normalizes variant strings to lowercase base format.
 * Called by: indexFile, openUnit
 */
const normVar = v => (v || 'base').replace(/_$/, '').toLowerCase();

const VOICE_LABEL = {
  new: 'Acquired', hom: 'Home', atk: 'Attack', dmg: 'Damaged', evo: 'Awakening',
  lup: 'Level Up', rdy: 'Battle Start', res: 'Result', wav: 'Wave', msr: 'Mission'
};
const VOICE_ORDER = ['new', 'hom', 'rdy', 'atk', 'dmg', 'wav', 'msr', 'evo', 'lup', 'res'];

const RANKS = [[1, 'C'], [2, 'R'], [3, 'HR'], [4, 'SR']];

/**
 * Generates a storage key for rarity ranks.
 * Called by: buildChips, applyFilter
 */
const rankKey = r => `rank:${r}`;

const S = {
  tab: 'units',                        // Current active UI tab ('units', 'scenes', 'story', 'npc')
  lang: localStorage.getItem('tmv-lang') || 'en', // Current UI language code ('en', 'ja', etc.)
  en: new Map(),                       // Map of English translation strings loaded from strings_en.json
  enMeta: null,                        // Metadata object associated with English translations
  units: new Map(),                    // Map of all loaded unit objects keyed by unit key
  scenes: new Map(),                   // Map of all loaded scene objects keyed by scene key
  metadata: new Map(),                 // Map of raw unit metadata records from tables/units.json
  sceneUnits: new Map(),               // Map mapping scene IDs to arrays of associated unit objects
  characterFamilies: new Map(),        // Map mapping character family IDs to sets of unit keys
  unitCharacters: new Map(),           // Map mapping unit keys to arrays of character family IDs
  characterLabels: new Map(),          // Map of canonical character display labels keyed by family ID
  realCidByName: new Map(),            // Map indexing real character IDs by normalized character name
  actorSources: new Map(),             // Map of actor source definitions loaded from actor_sources.json
  actorAuthored: new Map(),            // Map of authored actor image file entries keyed by stem name
  actorRaw: new Map(),                 // Map of raw actor image file entries keyed by path and name
  actorCanvas: [1280, 760],            // Default actor canvas dimensions [width, height]
  npcs: new Map(),                     // Map of NPC records containing poses and versions
  cutSize: 'm',                        // Cutsheet view size setting ('s', 'm', 'l')
  cutPoses: [],                        // Array of pose names for the current cutsheet view
  cutIndex: 0,                         // Current active index in the cutsheet poses array
  actorsUsed: new Set(),               // Set of actor names used in scenes or data
  positions: new Map(),                // Map of position metadata records keyed by lowercase file path
  spineModels: new Map(),              // Map of indexed Spine skeletal models keyed by model name
  spineLoose: new Map(),               // Map of loosely matched Spine models keyed by loose name
  pool: new Map(),                     // Map of general asset file entries keyed by stem name
  lazy: new Map(),                     // Map of lazy-load directory handles or remote state flags
  order: [],                           // Array of keys representing the current sorted list order
  view: [],                            // Array of filtered keys currently displayed in the view list
  sel: null,                           // Currently selected key in the active tab
  artIndex: 0,                         // Current active art pose index for the selected unit
  fit: 'canvas',                       // Art display fit mode ('canvas' or 'subject')
  filters: new Set(),                  // Set of active filter keys applied to the list view
  urls: new Map(),                     // Map cache of active object URLs generated for file entries
  pinned: new Set(),                   // Set of pinned file entry keys to prevent URL revocation
  bbox: new Map(),                     // Map cache of calculated alpha bounding boxes for images
  metrics: new Map(),                  // Map cache of image dimensions and bounding box metrics
  actorBounds: new Map(),              // Map cache of combined actor content bounds
  sceneOffsets: new Map(),             // Map cache of scene offset configurations
  audio: null,                         // Currently playing HTML5 Audio instance for sound effects
  bgm: null,                           // Currently playing HTML5 Audio instance for background music
  voice: null,                         // Currently playing HTML5 Audio instance for voice clips
  muted: false,                        // Mute state flag for audio playback
  unitMode: 'image',                   // Current unit viewer display mode ('image', 'chibi', 'art')
  unitSpine: null,                     // Active Spine player instance for unit chibis
  sceneSpine: null,                    // Active Spine player instance for scene animations
  cgMode: false,                       // CG mode active flag
  sceneSpineEnabled: true,             // Flag indicating whether scene Spine animations are enabled
  adv: null,                           // Active visual novel adventure script runner or state
};