'use strict';

/**
 * Builds and renders filter chips based on the active tab.
 * Called by: setTab
 */
function buildChips() {
  const c = $('#chips');
  c.textContent = '';
  const chip = (key, text, cls) => {
    const b = document.createElement('button');
    b.className = 'chip' + (cls ? ' ' + cls : '');
    b.dataset.f = key;
    b.textContent = text;
    b.setAttribute('aria-pressed', String(S.filters.has(key)));
    b.onclick = () => {
      S.filters.has(key) ? S.filters.delete(key) : S.filters.add(key);
      b.setAttribute('aria-pressed', String(S.filters.has(key)));
      applyFilter();
    };
    c.appendChild(b);
    return b;
  };

  const defs = S.tab === 'units'
    ? [['poses', 'Alt poses'], ['voice', 'Voices'], ['artanim', 'Art animation']]
    : S.tab === 'npc' ? [['multi', 'Multiple poses']]
    : S.tab === 'story' ? [['cg', 'Has CG']]
    : [['thumb', 'Has preview'], ['animcg', 'Animated CG']];
  for (const [k, t] of defs) chip(k, t);
  if (S.tab !== 'units') return;

  const sep = document.createElement('span');
  sep.className = 'chipsep';
  c.appendChild(sep);
  for (const [r, label] of RANKS) chip(rankKey(r), label, 'rank');
}

/**
 * Switches the active application tab, clears filters, and updates view order.
 * Called by: bootstrap button clicks
 */
function setTab(t, selectedKey = null) {
  S.tab = t;
  S.filters.clear();
  S.sel = null;
  if (typeof stopAll === 'function') stopAll();
  if (selectedKey) $('#q').value = '';
  $('#tabU').setAttribute('aria-selected', String(t === 'units'));
  $('#tabS').setAttribute('aria-selected', String(t === 'scenes'));
  $('#tabN').setAttribute('aria-selected', String(t === 'story'));
  $('#tabC').setAttribute('aria-selected', String(t === 'npc'));
  $('#q').placeholder = t === 'units' ? 'Search unit id…'
    : t === 'story' ? 'Search story scene…'
    : t === 'npc' ? 'Search NPC sprite id…' : 'Search scene…';
  $('#list').className = t === 'units' ? 'units' : 'scenes';
  $('#paneU').classList.remove('on');
  $('#paneS').classList.remove('on');
  $('#paneC').classList.remove('on');
  buildChips();
  S.order = t === 'npc' ? [...S.npcs.keys()].sort()
    : t === 'units' ? [...S.units.keys()].sort()
    : [...S.scenes.keys()]
        .filter(k => (S.scenes.get(k).kind || 'unit') === (t === 'story' ? 'story' : 'unit'))
        .sort((a, b) => {
          const sa = S.scenes.get(a), sb = S.scenes.get(b);
          return sa.id.localeCompare(sb.id, undefined, { numeric: true, sensitivity: 'base' })
            || sa.label.localeCompare(sb.label, undefined, { numeric: true });
        });
  applyFilter();
  if (S.view.length) {
    const target = selectedKey && S.view.includes(selectedKey) ? selectedKey : S.view[0];
    (t === 'units' ? openUnit : t === 'npc' ? openNpc : openScene)(target);
    if (selectedKey) {
      requestAnimationFrame(() =>
        $(`#list [data-k="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'center' }));
    }
  }
}

/**
 * Filters the view list based on search queries and active filter chips.
 * Called by: buildChips, setTab, search input listener
 */
function applyFilter() {
  const q = $('#q').value.trim().toLowerCase(), f = S.filters;
  const ranks = new Set(RANKS.filter(([r]) => f.has(rankKey(r))).map(([r]) => r));
  S.view = S.order.filter(k => {
    if (S.tab === 'npc') {
      const g = S.npcs.get(k);
      if (q && !k.includes(q)) return false;
      if (f.has('multi') && g.poses.length < 2) return false;
      return true;
    }
    if (S.tab === 'units') {
      const u = S.units.get(k);
      const names = localText(u.meta?.display_name || u.meta?.name).toLowerCase();
      if (q && !k.toLowerCase().includes(q) && !names.includes(q)) return false;
      if (ranks.size && !ranks.has(Number(u.meta?.rarity))) return false;
      if (f.has('r18') && !u.variants.has('r18') && !u.thumbR18) return false;
      if (f.has('poses') && u.art.size < 2) return false;
      if (f.has('voice') && !u.voices.length && !S.lazy.has(u.dir + '/AudioClip')) return false;
      if (f.has('artanim') && !u.artSpine) return false;
    } else {
      const s = S.scenes.get(k);
      if (q && !s.label.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
      if (f.has('cg') && !s.hasCG) return false;
      if (f.has('thumb') && !s.thumb) return false;
      if (f.has('animcg') && !s.hasArtAnimation) return false;
    }
    return true;
  });
  render();
}

const io = new IntersectionObserver(async es => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    const el = e.target;
    io.unobserve(el);
    if (el.dataset.kind === 'npc') {
      const g = S.npcs.get(el.dataset.k), box = el.querySelector('.nthumb');
      if (!g || !box || box.childElementCount) continue;
      try {
        const first = g.poses[0], versions = g.versions.get(first);
        const c = await buildActor(versions?.base || versions?.r18 || first, []);
        if (c) { box.appendChild(c); box.classList.add('on'); }
      } catch (_) {}
      continue;
    }
    const img = el.querySelector('img');
    if (!img) continue;
    const rec = el.dataset.kind === 'units' ? S.units.get(el.dataset.k) : S.scenes.get(el.dataset.k);
    const ent = el.dataset.kind === 'units' ? (rec?.thumb || rec?.thumbR18) : rec?.thumb;
    if (!ent) continue;
    try { img.src = await blobURL(ent); img.onload = () => img.classList.add('on'); } catch (_) {}
  }
}, { root: $('#list'), rootMargin: '340px' });

/**
 * Renders the filtered view list into the DOM grid.
 * Called by: applyFilter
 */
function render() {
  const L = $('#list');
  L.textContent = '';
  $('#cnt').textContent = `${S.view.length} ${S.tab === 'units' ? 'unit' : 'scene'}${S.view.length === 1 ? '' : 's'}`;
  const fr = document.createDocumentFragment();
  for (const k of S.view) {
    const el = document.createElement('div');
    el.dataset.k = k;
    el.dataset.kind = S.tab === 'units' ? 'units' : 'scene';
    el.setAttribute('aria-selected', String(k === S.sel));
    if (S.tab === 'npc') {
      const g = S.npcs.get(k);
      el.className = 'nrow';
      el.dataset.kind = 'npc';
      el.innerHTML = `<div class="nthumb"></div><div class="m">` +
        `<div class="t">${k}</div>` +
        `<div class="s">${g.poses.length} pose${g.poses.length === 1 ? '' : 's'}</div></div>`;
      el.onclick = () => openNpc(k);
      fr.appendChild(el);
      io.observe(el);
      continue;
    }
    if (S.tab === 'units') {
      const u = S.units.get(k);
      el.className = 'card';
      el.innerHTML = `<img alt=""><span class="id">${u.id}${u.form > 1 ? '·' + u.form : ''}</span>` +
        (u.artSpine ? '<span class="artbadge">ART ANIM</span>' : '') +
        (u.variants.has('r18') || u.thumbR18 ? '<span class="r18">18</span>' : '');
      el.title = localText(u.meta?.display_name || u.meta?.name);
      el.onclick = () => openUnit(k);
    } else {
      const s = S.scenes.get(k);
      el.className = 'srow';
      const thumb = s.kind === 'story' ? '' : '<img alt="">';
      el.innerHTML = `${thumb}<div class="m"><div class="t">${s.label}</div><div class="s">${s.id}` +
        `${s.hasArtAnimation ? '<span class="spinebadge">ANIMATED CG</span>' :
          s.hasCG ? '<span class="spinebadge">CG</span>' : ''}</div></div>`;
      el.onclick = () => openScene(k);
    }
    fr.appendChild(el);
    io.observe(el);
  }
  L.appendChild(fr);
  sizeGrid();
}

/**
 * Adjusts CSS grid auto-rows based on card element dimensions.
 * Called by: render, ResizeObserver in main.js
 */
function sizeGrid() {
  const L = $('#list');
  if (!L.classList.contains('units')) return;
  const c = L.querySelector('.card');
  if (!c) return;
  const w = c.getBoundingClientRect().width;
  if (w > 0) L.style.gridAutoRows = w + 'px';
}

/**
 * Closes the lightbox overlay.
 * Called by: openNpc, openScene, openUnit
 */
function closeLightbox() {
  const box = $('#lightbox');
  box.classList.remove('on');
  box.setAttribute('aria-hidden', 'true');
}

/**
 * Synchronizes language UI button states.
 * Called by: loadTranslations
 */
function syncLangUI() {
  const lang = S.lang;
  $$('#langseg button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
}