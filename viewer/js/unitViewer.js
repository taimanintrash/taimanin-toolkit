'use strict';

/**
 * Opens the unit viewer pane, loads missing voice clips, and initializes art choices.
 * Called by: setTab, render
 */
async function openUnit(k) {
  closeLightbox();
  if (typeof disposeSceneSpine === 'function') disposeSceneSpine();
  const changed = S.sel !== k;
  if (changed && typeof disposeUnitSpine === 'function') disposeUnitSpine();
  S.sel = k;
  S.tab = 'units';
  if (changed) { S.artIndex = 0; S.unitMode = 'image'; }
  $$('#list [data-k]').forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === k)));
  const u = S.units.get(k);
  $('#paneU').classList.add('on');
  $('#paneS').classList.remove('on');
  $('#empty').style.display = 'none';
  $('#app').classList.remove('browse');
  if (typeof stopAll === 'function') stopAll();

  if (!u.loaded) {
    u.loaded = true;
    const voicePaths = [u.dir + '/AudioClip', u.dir + '/audioclip',
      ...[...S.lazy.keys()].filter(p => p.toLowerCase().endsWith(`/voice/${u.id}`))];
    for (const p of new Set(voicePaths)) {
      for (const e of await listLazy(p)) {
        const m = e.name.match(RE.voice);
        if (!m) continue;
        const g = m.groups;
        u.voices.push({ entry: e, form: +g.form, type: g.type.toLowerCase(), variant: normVar(g.var), idx: +g.idx, name: e.name });
      }
    }
    if (typeof joinVoiceMetadata === 'function') joinVoiceMetadata(u);
  }
  const choices = artChoices(u);
  const unitName = localText(u.meta?.display_name || u.meta?.name);
  $('#utitle').textContent = unitName || `Unit ${u.id}`;
  const clipCount = u.voices.filter(v => v.entry).length;
  $('#usub').textContent = `${choices.length} image${choices.length === 1 ? '' : 's'} · ${clipCount} clips`
    + (u.spine ? ' · Chibi' : '') + (u.artSpine ? ' · Art animation' : '');

  const ps = $('#poseseg');
  ps.textContent = '';
  choices.forEach((choice, i) => {
    const b = document.createElement('button');
    b.dataset.index = i;
    b.textContent = choice.variant === 'base' ? String(choice.pose) : `${choice.pose} ${choice.variant.toUpperCase()}`;
    b.onclick = () => selectArt(i);
    ps.appendChild(b);
  });
  if ((S.unitMode === 'chibi' && !u.spine) || (S.unitMode === 'art' && !u.artSpine)) S.unitMode = 'image';
  $('#viewseg').hidden = !u.spine && !u.artSpine;
  $$('#viewseg button').forEach(b => {
    b.hidden = (b.dataset.view === 'chibi' && !u.spine) || (b.dataset.view === 'art' && !u.artSpine);
    b.setAttribute('aria-pressed', String(b.dataset.view === S.unitMode));
  });
  $('#uspinecontrols').hidden = S.unitMode === 'image';
  if (S.artIndex >= choices.length) S.artIndex = 0;
  syncArtButtons();
  if (typeof renderUnitInfo === 'function') renderUnitInfo(u);
  if (typeof renderVoices === 'function') renderVoices(u);
  if (S.unitMode !== 'image' && typeof showUnitSpine === 'function') showUnitSpine();
  else showArt();
}

/**
 * Returns sorted array of available art poses and variants for a unit.
 * Called by: openUnit, selectArt, showArt
 */
function artChoices(u) {
  if (!u) return [];
  const out = [];
  for (const pose of [...u.art.keys()].sort((a, b) => a - b)) {
    const set = u.art.get(pose);
    for (const variant of Object.keys(set).sort((a, b) => (a === 'base' ? -1 : b === 'base' ? 1 : a.localeCompare(b))))
      out.push({ pose, variant, entry: set[variant], set });
  }
  return out;
}

const syncArtButtons = () => $$('#poseseg button').forEach(
  b => b.setAttribute('aria-pressed', String(+b.dataset.index === S.artIndex))
);

/**
 * Selects a specific art pose index and updates buttons and view.
 * Called by: poseseg button clicks
 */
async function selectArt(index) {
  const u = S.units.get(S.sel), choices = u ? artChoices(u) : [];
  if (!choices.length) return;
  S.artIndex = (index + choices.length) % choices.length;
  syncArtButtons();
  if (S.unitMode !== 'image' && typeof setUnitView === 'function') await setUnitView('image');
  await showArt();
  if ($('#lightbox').classList.contains('on') && typeof renderLightbox === 'function') await renderLightbox();
}

/**
 * Computes the non-transparent alpha bounding box of an image.
 * Called by: imageMetrics
 */
async function alphaBox(url, key) {
  if (S.bbox.has(key)) return S.bbox.get(key);
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const N = 96, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  let d;
  try { d = x.getImageData(0, 0, N, N).data; } catch (_) { return null; }
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let py = 0; py < N; py++)
    for (let px = 0; px < N; px++)
      if (d[(py * N + px) * 4 + 3] > 8) {
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
  const b = x1 < 0 ? [0, 0, 1, 1] : [x0 / N, y0 / N, (x1 - x0 + 1) / N, (y1 - y0 + 1) / N];
  S.bbox.set(key, b);
  return b;
}

/**
 * Extracts natural dimensions and bounding box metrics for an image entry.
 * Called by: actorContentBounds, showArt
 */
async function imageMetrics(entry) {
  if (S.metrics.has(entry.key)) return S.metrics.get(entry.key);
  const url = await blobURL(entry), img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const norm = await alphaBox(url, entry.key);
  const value = {
    w: img.naturalWidth || 1,
    h: img.naturalHeight || 1,
    bbox: norm ? [
      norm[0] * (img.naturalWidth || 1),
      norm[1] * (img.naturalHeight || 1),
      (norm[0] + norm[2]) * (img.naturalWidth || 1),
      (norm[1] + norm[3]) * (img.naturalHeight || 1)
    ] : null
  };
  S.metrics.set(entry.key, value);
  return value;
}

/**
 * Renders and positions the active unit art image onto the stage.
 * Called by: openUnit, selectArt
 */
async function showArt() {
  const u = S.units.get(S.sel);
  if (!u) return;
  if (S.unitMode !== 'image') return;
  const choices = artChoices(u), choice = choices[S.artIndex], stage = $('#ustage');
  if (!choice) { stage.textContent = ''; return; }
  const { entry: e, set } = choice;
  S.pinned = new Set(choices.map(x => x.entry.key));

  const url = await blobURL(e);
  stage.textContent = '';
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const W = stage.clientWidth, H = stage.clientHeight, nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
  const groupChoices = choices.filter(c => c.pose === choice.pose);
  const groupIndex = groupChoices.indexOf(choice);
  const measured = await Promise.all(groupChoices.map(c => imageMetrics(c.entry)));
  const dims = groupChoices.map((c, i) => {
    const p = c.entry.position || {}, canvas = p.canvas || p.canvas_authored || p.untrimmed_size;
    return {
      choice: c, p, metric: measured[i],
      w: +canvas?.[0] || measured[i].w, h: +canvas?.[1] || measured[i].h
    };
  });
  const current = dims[groupIndex];
  current.w = current.w || nw;
  current.h = current.h || nh;
  const maxW = Math.max(current.w, ...dims.map(d => d.w || 0));
  const maxH = Math.max(current.h, ...dims.map(d => d.h || 0));
  const imageOffset = current.p.canvas_offset || current.p.trim_offset || [0, 0];
  const imageCenter = {
    x: (maxW - current.w) / 2 + (+imageOffset[0] || 0) + nw / 2,
    y: maxH - current.h + (+imageOffset[1] || 0) + nh / 2,
  };

  let frame = { x: 0, y: 0, w: maxW, h: maxH };
  if (S.fit === 'subject') {
    const boxes = [];
    for (const d of dims) {
      if (!d.w || !d.h) continue;
      const p = d.p, off = p.canvas_offset || p.trim_offset || [0, 0];
      const b = p.content_bbox || d.metric.bbox || [0, 0, d.w, d.h];
      boxes.push({
        x: (maxW - d.w) / 2 + (+off[0] || 0) + b[0],
        y: maxH - d.h + (+off[1] || 0) + b[1],
        x1: (maxW - d.w) / 2 + (+off[0] || 0) + b[2],
        y1: maxH - d.h + (+off[1] || 0) + b[3],
      });
    }
    if (boxes.length) {
      const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
      const x1 = Math.max(...boxes.map(b => b.x1)), y1 = Math.max(...boxes.map(b => b.y1));
      frame = { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) };
    }
  }
  const sc = Math.min(W / frame.w, H / frame.h) * 0.96;
  const frameCenter = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };

  img.style.left = '50%';
  img.style.top = '50%';
  img.style.width = nw + 'px';
  img.style.height = nh + 'px';
  img.style.transform = `translate(-50%,-50%) translate(${(imageCenter.x - frameCenter.x) * sc}px, ${(imageCenter.y - frameCenter.y) * sc}px) scale(${sc})`;
  stage.appendChild(img);
  requestAnimationFrame(() => img.classList.add('on'));
}