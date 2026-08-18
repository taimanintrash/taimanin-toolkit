'use strict';

/**
 * Creates or retrieves a blob URL for a file entry.
 * Called by: buildActor, showArt, render, ingest
 */
async function blobURL(e) {
  if (!e) return null;
  if (S.urls.has(e.key)) return S.urls.get(e.key);
  const url = URL.createObjectURL(await e.get());
  S.urls.set(e.key, url);
  if (S.urls.size > 260) {
    for (const k of [...S.urls.keys()]) {
      if (S.urls.size <= 180) break;
      if (S.pinned.has(k)) continue;
      URL.revokeObjectURL(S.urls.get(k));
      S.urls.delete(k);
    }
  }
  return url;
}

/**
 * Lists entries in a lazy directory or remote endpoint.
 * Called by: openUnit, mapOf
 */
async function listLazy(path) {
  const b = S.lazy.get(path);
  if (!b) return [];
  if (b.entries) return b.entries;
  if (b.cached) return b.cached;
  if (b.remote) {
    try {
      const r = await fetch('/__taimanin_list__?path=' + encodeURIComponent(path));
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      b.cached = (await r.json()).map(name => remoteEntry(path + '/' + name));
    } catch (err) {
      console.warn('remote lazy', path, err);
      b.cached = [];
    }
    return b.cached;
  }
  const out = [];
  try {
    for await (const [name, h] of b.handle.entries())
      if (h.kind === 'file') {
        const p = path + '/' + name;
        out.push({ name, path: p, key: p, get: () => h.getFile() });
      }
  } catch (err) {
    console.warn('lazy', path, err);
  }
  b.cached = out;
  return out;
}

const remoteURL = path => '/' + path.split('/').map(encodeURIComponent).join('/');

/**
 * Creates a remote file entry object with fetch capabilities.
 * Called by: listLazy, ingest, loadFromServer
 */
function remoteEntry(path) {
  return {
    name: baseOf(path),
    path,
    key: path,
    url: remoteURL(path),
    get: async () => {
      const r = await fetch(remoteURL(path));
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${path}`);
      return r.blob();
    }
  };
}

/**
 * Creates a stem-keyed map of file entries for a given path.
 * Called by: resolve
 */
async function mapOf(path) {
  const b = S.lazy.get(path);
  if (!b) return null;
  if (b.map) return b.map;
  const m = new Map();
  for (const e of await listLazy(path))
    if (!m.has(stem(e.name))) m.set(stem(e.name), e);
  b.map = m;
  return m;
}

/**
 * Resolves a name against local paths or pool entries.
 * Called by: resolve
 */
async function resolve(name, localPaths = []) {
  if (!name) return null;
  const want = stem(name);
  for (const p of localPaths) {
    const m = await mapOf(p);
    const hit = m && m.get(want);
    if (hit) return hit;
  }
  return S.pool.get(want) || null;
}

/**
 * Recursively walks a directory handle to collect files.
 * Called by: loadDir
 */
async function walkDir(dir, path, files) {
  for await (const [name, h] of dir.entries()) {
    const p = path ? path + '/' + name : name;
    if (h.kind === 'directory') {
      if (LAZY.has(name.toLowerCase())) S.lazy.set(p, { handle: h });
      else await walkDir(h, p, files);
    } else files.push({ name, path: p, key: p, get: () => h.getFile() });
    if ((files.length & 2047) === 0) {
      $('#scanning').textContent = 'scanning ' + files.length;
      await new Promise(r => setTimeout(r));
    }
  }
}

/**
 * Parses file entries from a file list input.
 * Called by: bootstrap event listener
 */
function fromFileList(list) {
  const files = [];
  for (const f of list) {
    const p = f.webkitRelativePath || f.name;
    const parent = dirOf(p), pname = baseOf(parent).toLowerCase();
    const e = { name: f.name, path: p, key: p, get: async () => f };
    if (LAZY.has(pname)) {
      if (!S.lazy.has(parent)) S.lazy.set(parent, { entries: [] });
      S.lazy.get(parent).entries.push(e);
    } else files.push(e);
  }
  return files;
}

/**
 * Retrieves or creates a unit object in the units map.
 * Called by: indexFile
 */
function unitOf(key, id, form) {
  let u = S.units.get(key);
  if (!u) {
    u = {
      key, id, form: +(form || 1), dir: '', thumb: null, thumbR18: null, art: new Map(),
      voices: [], variants: new Set(), loaded: false
    };
    S.units.set(key, u);
  }
  return u;
}

/**
 * Indexes an individual file entry into thumbs, art, or voices.
 * Called by: ingest
 */
function indexFile(e) {
  const n = e.name;
  let m;
  if ((m = n.match(RE.thumb))) {
    const g = m.groups, u = unitOf(keyOf(g.id, g.form), g.id, g.form);
    u.dir = u.dir || dirOf(dirOf(e.path));
    if (/r18/i.test(g.var || '')) u.thumbR18 = e; else u.thumb = e;
    return true;
  }
  if ((m = n.match(RE.art))) {
    const g = m.groups, u = unitOf(keyOf(g.id, g.form), g.id, g.form);
    u.dir = u.dir || dirOf(dirOf(e.path));
    const v = normVar(g.var), p = +g.idx;
    if (!u.art.has(p)) u.art.set(p, {});
    u.art.get(p)[v] = e;
    u.variants.add(v);
    return true;
  }
  if ((m = n.match(RE.voice))) {
    const g = m.groups, u = unitOf(keyOf(g.id, g.form), g.id, g.form);
    u.voices.push({ entry: e, form: +g.form, type: g.type.toLowerCase(), variant: normVar(g.var), idx: +g.idx, name: n });
    return true;
  }
  return false;
}

/**
 * Indexes Spine skeletal models and atlases from a file list.
 * Called by: ingest
 */
function indexSpineModels(files) {
  S.spineModels.clear();
  S.spineLoose.clear();
  const eligible = files.filter(e => /^taimanin_assets\/extracted\/spine\//i.test(e.path));
  const atlases = new Map();
  for (const e of eligible) {
    if (!/\.atlas$/i.test(e.name)) continue;
    const d = dirOf(e.path);
    if (!atlases.has(d)) atlases.set(d, []);
    atlases.get(d).push(e);
  }
  const put = (key, model, score) => {
    key = String(key || '').toLowerCase();
    const old = S.spineModels.get(key);
    if (!old || score > old.score) S.spineModels.set(key, { ...model, score });
  };
  const groups = new Map();
  for (const skel of eligible) {
    if (!/\.skel$/i.test(skel.name) || !skel.url) continue;
    const exact = stem(skel.name);
    const list = atlases.get(dirOf(skel.path)) || [];
    const exactAtlas = list.find(a => stem(a.name) === exact);
    const base = exactAtlas ? exact : exact.replace(/_\d{2}$/, '');
    const atlas = exactAtlas || list.find(a => stem(a.name) === base)
      || list.find(a => spineLoose(stem(a.name)) === spineLoose(base));
    if (!atlas || !atlas.url) continue;
    const suffix = exactAtlas ? '' : (exact.match(/_(\d{2})$/)?.[1] || '');
    const model = { name: base, exact, variant: suffix, skel, atlas, skelURL: skel.url, atlasURL: atlas.url };
    const groupKey = `${dirOf(skel.path).toLowerCase()}|${base.toLowerCase()}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(model);
  }
  for (const variants of groups.values()) {
    variants.sort((a, b) => (a.variant || '00').localeCompare(b.variant || '00', undefined, { numeric: true }));
    const primary = variants.find(v => !v.variant) || variants.find(v => v.variant === '01') || variants[0];
    const combined = { ...primary, variants };
    put(primary.name, combined, primary.variant ? 2 : 4);
    for (const variant of variants) put(variant.exact, { ...variant, variants }, 3);
    const loose = spineLoose(primary.name), old = S.spineLoose.get(loose);
    if (!old || (primary.variant ? 2 : 4) > old.score)
      S.spineLoose.set(loose, { ...combined, score: primary.variant ? 2 : 4 });
  }
}

/**
 * Finds a spine model by exact name or loose matching.
 * Called by: ingest
 */
function findSpineModel(name) {
  return S.spineModels.get(String(name || '').toLowerCase())
    || S.spineLoose.get(spineLoose(name)) || null;
}

/**
 * Loads English translation strings from file list.
 * Called by: ingest
 */
async function loadTranslations(files) {
  S.en.clear();
  S.enMeta = null;
  const hit = files.find(e => e.name.toLowerCase() === 'strings_en.json');
  if (!hit) return;
  try {
    const data = JSON.parse(await (await hit.get()).text());
    const strings = data && data.strings ? data.strings : data;
    for (const k in strings) if (strings[k]) S.en.set(k, strings[k]);
    S.enMeta = data && data._meta || null;
  } catch (err) {
    console.warn('translations', err);
    toast('Could not read strings_en.json');
  }
  if (typeof syncLangUI === 'function') syncLangUI();
}

/**
 * Loads actor sources JSON configuration.
 * Called by: ingest
 */
async function loadActorSources(files) {
  S.actorSources.clear();
  const hit = files.find(e => e.name.toLowerCase() === 'actor_sources.json');
  if (!hit) return;
  try {
    const data = JSON.parse(await (await hit.get()).text());
    if (Array.isArray(data._meta?.canvas) && data._meta.canvas.length === 2)
      S.actorCanvas = data._meta.canvas;
    for (const [name, source] of Object.entries(data.sources || {}))
      S.actorSources.set(name.toLowerCase(), source);
  } catch (err) {
    console.warn('actor sources', err);
    toast('Could not read actor_sources.json');
  }
}

/**
 * Loads unit metadata tables and builds character indexes.
 * Called by: ingest
 */
async function loadUnitMetadata(files) {
  S.metadata.clear();
  S.characterFamilies.clear();
  S.unitCharacters.clear();
  S.characterLabels.clear();
  S.realCidByName.clear();
  const candidates = files.filter(e => e.name.toLowerCase() === 'units.json')
    .sort((a, b) => (/\/tables\/units\.json$/i.test(b.path) ? 1 : 0) - (/\/tables\/units\.json$/i.test(a.path) ? 1 : 0));
  if (!candidates.length) return;
  try {
    const data = JSON.parse(await (await candidates[0].get()).text());
    if (!Array.isArray(data)) throw new Error('root is not an array');
    const byGraphic = new Map();
    for (const m of data) {
      if (m && m.unit_id) S.metadata.set(String(m.unit_id).toLowerCase(), m);
      const gid = String(m?.graphic_id || '').toLowerCase();
      if (gid && !byGraphic.has(gid)) byGraphic.set(gid, m);
    }
    for (const u of S.units.values())
      u.meta = S.metadata.get(`uni${u.id}_${u.form}`) || byGraphic.get(`uni_${u.id}`) || null;
    buildRealCidIndex();
    buildCharacterFamilies();
  } catch (err) {
    console.warn('unit metadata', err);
    toast('Could not read tables/units.json');
  }
}

/**
 * Builds an index of real character IDs by name.
 * Called by: loadUnitMetadata
 */
function buildRealCidIndex() {
  S.realCidByName.clear();
  for (const m of S.metadata.values()) {
    const cid = Number(m?.character_id);
    if (!Number.isFinite(cid) || cid === 999) continue;
    const n = rawCharacterName(m);
    if (!n || multiCharacterName(n) || S.realCidByName.has(n)) continue;
    S.realCidByName.set(n, cid);
  }
}

/**
 * Determines the character family ID for a unit metadata record.
 * Called by: buildCharacterFamilies
 */
function characterFamilyId(m) {
  const cid = Number(m?.character_id);
  if (cid !== 999) return cid;
  const n = rawCharacterName(m);
  const real = S.realCidByName.get(n);
  return real === undefined ? `name:${n}` : real;
}

/**
 * Extracts a unit key from a unit ID string.
 * Called by: buildSceneUnitIndex, buildCharacterFamilies
 */
function unitKeyFromId(id) {
  const m = String(id || '').match(/^uni(\d{5})_(\d+)$/i);
  return m ? keyOf(m[1], m[2]) : null;
}

/**
 * Extracts a scene ID from a unit's spine metadata.
 * Called by: buildSceneUnitIndex
 */
function sceneIdFromUnit(u) {
  const m = String(u?.meta?.spine_id || '').match(/^chr_(\d+)$/i);
  return m ? String(+m[1]) : null;
}

/**
 * Extracts the NPC prefix from an actor name.
 * Called by: buildNpcIndex
 */
function npcPrefix(name) {
  const b = String(name || '').toLowerCase().replace(/_r18$/, '');
  const m = b.match(/^(.*\d)[a-z]+\d*$/);
  return m ? m[1] : b;
}

/**
 * Builds the index of NPCs and their available poses and versions.
 * Called by: ingest, loadFromServer
 */
function buildNpcIndex() {
  S.npcs.clear();
  const add = n => {
    const source = S.actorSources.get(n);
    if (source?.duplicate_of) n = source.duplicate_of;
    const base = n.endsWith('_r18') ? n.slice(0, -4) : n;
    const canonical = n.endsWith('_r18') && S.actorSources.has(base) ? base : n;
    const k = npcPrefix(canonical);
    if (!k) return;
    let g = S.npcs.get(k);
    if (!g) { g = { key: k, poses: [], versions: new Map() }; S.npcs.set(k, g); }
    if (!g.poses.includes(canonical)) g.poses.push(canonical);
    let versions = g.versions.get(canonical);
    if (!versions) { versions = { base: null, r18: null }; g.versions.set(canonical, versions); }
    if (n.endsWith('_r18')) versions.r18 = n; else versions.base = n;
  };
  if (S.actorsUsed.size) {
    for (const n of S.actorsUsed) add(n);
  }
  for (const [name, source] of S.actorSources)
    if (source.kind !== 'missing') add(name);
  for (const g of S.npcs.values())
    g.poses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Builds the index mapping scene IDs to units.
 * Called by: ingest
 */
function buildSceneUnitIndex() {
  S.sceneUnits.clear();
  for (const u of S.units.values()) {
    const rootKey = unitKeyFromId(u.meta?.root_unit_id || u.meta?.unit_id);
    if (!rootKey || u.key !== rootKey) continue;
    const id = sceneIdFromUnit(u); if (!id) continue;
    if (!S.sceneUnits.has(id)) S.sceneUnits.set(id, []);
    const list = S.sceneUnits.get(id);
    if (!list.some(x => x.key === u.key)) list.push(u);
  }
}

/**
 * Builds character families, unit character mappings, and labels.
 * Called by: loadUnitMetadata
 */
function buildCharacterFamilies() {
  S.characterFamilies.clear();
  S.unitCharacters.clear();
  S.characterLabels.clear();
  const roots = new Map(), canonical = new Map();
  for (const u of S.units.values()) {
    const m = u.meta, rootKey = unitKeyFromId(m?.root_unit_id || m?.unit_id);
    if (!m || !rootKey || !S.units.has(rootKey) || roots.has(rootKey)) continue;
    roots.set(rootKey, S.units.get(rootKey));
    const cid = characterFamilyId(m), name = m?.name?.ja || localText(m.name);
    if ((typeof cid === 'number' && !Number.isFinite(cid)) || !name || multiCharacterName(name)) continue;
    if (!canonical.has(cid)) canonical.set(cid, []);
    const list = canonical.get(cid);
    if (!list.some(x => normCharacterName(x) === normCharacterName(name))) list.push(name);
    const label = localText(m.name);
    const old = S.characterLabels.get(cid);
    if (label && (!old || (!localText(m.w2_name) && label.length < old.length)))
      S.characterLabels.set(cid, label);
  }

  const candidates = [];
  for (const [cid, names] of canonical)
    for (const name of names) {
      const norm = normCharacterName(name);
      const parts = String(name).trim().split(/[\s ]+/).filter(Boolean);
      const given = normCharacterName(parts[parts.length - 1] || name);
      if (norm.length >= 1) candidates.push({ cid, name, norm, given, short: norm.length < 2 });
    }

  for (const [rootKey, u] of roots) {
    const m = u.meta, cid = characterFamilyId(m);
    const name = m?.name?.ja || localText(m.name);
    let ids = (typeof cid === 'string' || Number.isFinite(cid)) ? [cid] : [];
    if (multiCharacterName(name)) {
      const profile = normCharacterName(m?.profile?.ja || localText(m.profile));
      const found = [];
      for (const c of candidates)
        if (c.cid !== cid && typeof c.cid === 'number' && !c.short
          && profile.includes(c.norm) && !found.includes(c.cid)) found.push(c.cid);
      if (found.length < 2) {
        const parts = name.split(/[＆&×＋+]/).map(normCharacterName).filter(Boolean);
        const pool = candidates.filter(c => c.cid !== cid && typeof c.cid === 'number');
        for (const part of parts) {
          let pick = null;
          const exactName = pool.filter(c => c.norm === part);
          const exactGiven = pool.filter(c => c.given === part);
          const suffix = pool.filter(c => c.given.length >= 2 && part.endsWith(c.given));
          if (exactName.length === 1) pick = exactName[0];
          else if (exactGiven.length === 1) pick = exactGiven[0];
          else if (suffix.length) {
            const best = suffix.slice().sort((a, b) => a.given.length - b.given.length);
            if (best.length === 1 || best[0].given.length < best[1].given.length) pick = best[0];
          }
          if (pick && !found.includes(pick.cid)) found.push(pick.cid);
        }
      }
      if (found.length >= 2) ids = found;
    }
    S.unitCharacters.set(rootKey, ids);
    for (const id of ids) {
      if (!S.characterFamilies.has(id)) S.characterFamilies.set(id, new Set());
      S.characterFamilies.get(id).add(rootKey);
    }
  }
  for (const u of S.units.values()) {
    const rootKey = unitKeyFromId(u.meta?.root_unit_id || u.meta?.unit_id);
    if (rootKey && S.unitCharacters.has(rootKey))
      S.unitCharacters.set(u.key, S.unitCharacters.get(rootKey));
  }
}

/**
 * Loads position metadata JSON and attaches positions to file entries.
 * Called by: ingest
 */
async function loadPositionMetadata(files) {
  S.positions.clear();
  const source = files.find(e => e.name.toLowerCase() === 'positions.json');
  if (!source) return;
  try {
    const data = JSON.parse(await (await source.get()).text());
    if (!Array.isArray(data)) return;
    for (const rec of data) {
      if (rec?.file) S.positions.set(String(rec.file).replace(/\\/g, '/').toLowerCase(), rec);
    }
    for (const e of files) {
      const marker = '/extracted/', lower = ('/' + e.path).toLowerCase(), at = lower.lastIndexOf(marker);
      if (at >= 0) e.position = S.positions.get(lower.slice(at + marker.length)) || null;
    }
  } catch (err) {
    console.warn('positions metadata', err);
  }
}

/**
 * Clears state, indexes files, and runs metadata/actor ingestion pipelines.
 * Called by: loadFromServer, loadDir, bootstrap
 */
async function ingest(files, sceneDefs = []) {
  if (typeof disposeUnitSpine === 'function') disposeUnitSpine();
  if (typeof disposeSceneSpine === 'function') disposeSceneSpine();
  S.units.clear(); S.scenes.clear(); S.pool.clear(); S.metadata.clear();
  S.actorAuthored.clear(); S.actorRaw.clear();
  S.sceneUnits.clear(); S.positions.clear();
  S.spineModels.clear(); S.spineLoose.clear();
  S.urls.forEach(URL.revokeObjectURL); S.urls.clear(); S.bbox.clear(); S.metrics.clear();
  S.actorBounds.clear();
  S.sceneOffsets.clear();

  const thumbDirs = [];
  for (const def of sceneDefs) {
    if (!def?.script) continue;
    const script = remoteEntry(def.script), pair = def.pair ? remoteEntry(def.pair) : null;
    const key = def.script, id = def.id || stem(script.name);
    S.scenes.set(key, {
      key, path: def.script, id, script, img: pair, thumb: null,
      imagesPath: '', voicesPath: '', hasSpine: !!def.spine, hasCG: !!def.cg,
      hasArtAnimation: !!def.spine,
      kind: def.kind || 'unit', srcLabel: def.label || ''
    });
  }
  for (let i = 0; i < files.length; i++) {
    const e = files[i];
    const k = stem(e.name);
    const authored = /\/extracted\/adv\/authored_chr\//i.test('/' + (e.path || ''));
    const rawActor = ('/' + (e.path || '')).match(/\/extracted\/adv\/(adv_chr|r18_adv_chr)\/[^/]+$/i);
    if (authored && /\.png$/i.test(e.name)) S.actorAuthored.set(k, e);
    if (rawActor && /\.png$/i.test(e.name))
      S.actorRaw.set(`${rawActor[1].toLowerCase()}/${e.name.toLowerCase()}`, e);
    if (!authored && /\.(?:png|jpe?g|webp|ogg|mp3|wav|m4a)$/i.test(e.name) && !S.pool.has(k))
      S.pool.set(k, e);
    indexFile(e);
    if (e.name.toLowerCase() === 'img.txt') thumbDirs.push(e);
    if ((i & 4095) === 0) { prog(i / files.length); await new Promise(r => setTimeout(r)); }
  }
  for (const e of thumbDirs) { const s = S.scenes.get(dirOf(e.path)); if (s) s.img = e; }
  indexSpineModels(files);
  await loadPositionMetadata(files);
  await loadTranslations(files);
  await loadActorSources(files);
  await loadUnitMetadata(files);
  buildSceneUnitIndex();
  buildNpcIndex();
  for (const u of S.units.values()) {
    u.spine = findSpineModel(u.meta?.spine_id);
    u.artSpine = findSpineModel(`Cut_${u.meta?.spine_id || ''}`);
  }
  const byId = new Map();
  for (const s of S.scenes.values()) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push(s);
  }
  for (const e of files) {
    if (!/(^|\/)thumbnails?(\/|$)/i.test(dirOf(e.path))) continue;
    const list = byId.get(stem(e.name));
    if (list) for (const s of list) s.thumb = s.thumb || e;
  }
  for (const s of S.scenes.values()) {
    const m = String(s.id).match(/^(\d+)(?:_(\d+))?$/);
    const unit = m && S.sceneUnits.get(String(+m[1]))?.[0];
    s.units = m ? (S.sceneUnits.get(String(+m[1])) || []) : [];
    const name = localText(unit?.meta?.display_name || unit?.meta?.name);
    s.label = name ? `${name} · Scene ${m[2] || 1}` : `Scene ${s.id}`;
    if (s.kind === 'story') s.label = s.srcLabel ? `${s.srcLabel} · ${s.id}` : s.id;
    s.thumb = s.thumb || unit?.thumb || unit?.thumbR18 || null;
  }

  prog(1);
  $('#scanning').textContent = '';
  for (const [k, u] of S.units)
    if (!u.thumb && !u.thumbR18 && !u.art.size && !u.voices.length) S.units.delete(k);

  if (!S.units.size && !S.scenes.size) { toast('No units or scenes recognised in that folder'); return; }
  $('#empty').style.display = 'none';
  if (typeof buildChips === 'function') buildChips();
  if (typeof setTab === 'function') setTab(S.units.size ? 'units' : 'scenes');
  toast(`${S.units.size} units · ${S.scenes.size} scenes`);
}

/**
 * Prompts the user to pick a directory handle using the File System Access API.
 * Called by: pickFolder, bootstrap button clicks
 */
async function pickFolder() {
  if (window.showDirectoryPicker) {
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'read' }); }
    catch (e) { if (e.name === 'AbortError') return; $('#fallback').click(); return; }
    await idb.set('dir', dir);
    await loadDir(dir);
  } else $('#fallback').click();
}

/**
 * Attempts to load file index and data automatically from the local server endpoint.
 * Called by: IIFE bootstrap in main.js
 */
async function loadFromServer() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
  try {
    const r = await fetch('/__taimanin_index__');
    if (!r.ok) return false;
    const data = await r.json();
    if (!Array.isArray(data.files) || !Array.isArray(data.lazy)) return false;
    $('#scanning').textContent = 'reading local index…';
    S.lazy.clear();
    for (const path of data.lazy) S.lazy.set(path, { remote: true });
    S.actorsUsed = new Set((data.actors_used || []).map(x => String(x).toLowerCase()));
    await ingest(data.files.map(remoteEntry), Array.isArray(data.scenes) ? data.scenes : []);
    return true;
  } catch (err) {
    console.warn('automatic local load', err);
    return false;
  }
}

/**
 * Reads files from a directory handle and runs ingestion.
 * Called by: pickFolder, IIFE bootstrap in main.js
 */
async function loadDir(dir) {
  $('#scanning').textContent = 'reading…';
  S.lazy.clear();
  const files = [];
  await walkDir(dir, '', files);
  await ingest(files);
}