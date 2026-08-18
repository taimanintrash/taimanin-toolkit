// viewer/js/ui.js — UI module (extracted from taimanin_viewer.html)
'use strict';

import { blobURL, buildCharacterFamilies, localText, resolve } from './fs.js';
import { renderUnitInfo, renderVoices, run } from './scenes.js';
import { S } from './state.js';
import { applyFilter, artChoices, showArt, sizeGrid } from './units.js';

// DOM helper functions to replace jQuery dependencies
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

export { $, $$ };

// {"name": "toast", "kind": "const", "module": "ui"}
const toast = (m, ms = 2400) => {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms);
};
export { toast };

// {"name": "prog", "kind": "const", "module": "ui"}
const prog = p => { const b = $('#bar'); b.style.width = (p * 100) + '%'; if (p >= 1) setTimeout(() => b.style.width = 0, 400); };
export { prog };

/**
 * {"name": "renderLightbox", "kind": "asyncFunction", "params": [], "module": "ui"}
 */
async function renderLightbox() {
  console.log("[Trace:UI:renderLightbox]");
  const u = S.units.get(S.sel), choice = u ? artChoices(u)[S.artIndex] : null;
  if (!choice) return closeLightbox();
  const box = $('#lightbox'), img = box.querySelector('img');
  img.src = await blobURL(choice.entry);
  box.querySelector('.caption').textContent =
    `${localText(u.meta?.display_name || u.meta?.name) || u.id} · image ${choice.pose}` +
    (choice.variant === 'base' ? '' : ` · ${choice.variant.toUpperCase()}`);
}
export { renderLightbox };

/**
 * {"name": "openLightbox", "kind": "asyncFunction", "params": [], "module": "ui"}
 */
async function openLightbox() {
  console.log("[Trace:UI:openLightbox]");
  if (!artChoices(S.units.get(S.sel)).length) return;
  const box = $('#lightbox'); box.classList.add('on'); box.setAttribute('aria-hidden', 'false');
  await renderLightbox();
}
export { openLightbox };

/**
 * {"name": "closeLightbox", "kind": "function", "params": [], "module": "ui"}
 */
function closeLightbox() {
  console.log("[Trace:UI:closeLightbox]");
  const box = $('#lightbox'); box.classList.remove('on'); box.setAttribute('aria-hidden', 'true');
  const holder = $('#lightbox .lbcomp');
  holder.hidden = true; holder.textContent = '';        // release the blob-backed imgs
  $('#lightbox img').hidden = false;
}
export { closeLightbox };

/**
 * {"name": "flash", "kind": "function", "params": ["ms"], "module": "ui"}
 */
function flash(ms) {
  console.log("[Trace:UI:flash]"); const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = '.95';
  requestAnimationFrame(() => { f.style.transition = `opacity ${Math.max(120, +ms || 600)}ms`; f.style.opacity = '0'; });
}
export { flash };

/**
 * {"name": "quake", "kind": "function", "params": [], "module": "ui"}
 */
function quake() {
  console.log("[Trace:UI:quake]"); const a = $('#adv'); a.classList.remove('quake'); void a.offsetWidth; a.classList.add('quake');
}

async function playBGM(name) {
  const e = await resolve(name, []); if (!e) return;
  if (S.bgm) { S.bgm.pause(); S.bgm = null; }
  const a = new Audio(await blobURL(e)); a.loop = true; a.volume = .45; a.muted = S.muted;
  S.bgm = a; a.play().catch(() => { });
}
export { quake };

// {"name": "lbIsCut", "kind": "const", "module": "ui"}
const lbIsCut = () => !$('#lightbox .lbcomp').hidden;
export { lbIsCut };

/**
 * {"name": "syncLangUI", "kind": "function", "params": [], "module": "ui"}
 */
function syncLangUI() {
  console.log("[Trace:UI:syncLangUI]");
  const en = $('#langseg button[data-lang="en"]');
  if (!en) return;
  const n = S.en.size;
  en.disabled = !n;
  en.title = n ? `English translation — ${n.toLocaleString()} strings`
    : 'No tables/strings_en.json found — run translation/tools/export_strings.py';
  if (!n && S.lang === 'en') S.lang = 'ja';
  $$('#langseg button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
}
export { syncLangUI };

/**
 * {"name": "setLang", "kind": "function", "params": ["lang"], "module": "ui"}
 */
function setLang(lang) {
  console.log("[Trace:UI:setLang]");
  if (lang === S.lang) return;
  S.lang = lang;
  localStorage.setItem('tmv-lang', lang);
  syncLangUI();
  if (S.metadata.size) buildCharacterFamilies();
  applyFilter();
  const u = S.units.get(S.sel);
  if (u) {
    $('#utitle').textContent = localText(u.meta?.display_name || u.meta?.name) || `Unit ${u.id}`;
    renderUnitInfo(u); renderVoices(u);
  }
}
export { setLang };

/**
 * {"name": "syncSideUI", "kind": "function", "params": [], "module": "ui"}
 */
function syncSideUI() {
  console.log("[Trace:UI:syncSideUI]");
  const app = $('#app');
  const wide = app.classList.contains('wide');
  $('#sidetoggle')?.setAttribute('aria-pressed', String(!wide));
  $('#widebtn')?.setAttribute('aria-pressed', String(wide));
  $('#infotoggle')?.setAttribute('aria-pressed', String(!app.classList.contains('noside')));
}
export { syncSideUI };

/**
 * {"name": "setWide", "kind": "function", "params": ["on"], "module": "ui"}
 */
function setWide(on) {
  console.log("[Trace:UI:setWide]");
  const app = $('#app'); app.classList.toggle('wide', on);
  localStorage.setItem('tmv-wide', on ? '1' : '');
  syncSideUI(); sizeGrid(); setTimeout(showArt, 60);
}
export { setWide };

/**
 * {"name": "setNoSide", "kind": "function", "params": ["on"], "module": "ui"}
 */
function setNoSide(on) {
  console.log("[Trace:UI:setNoSide]");
  const app = $('#app'); app.classList.toggle('noside', on);
  localStorage.setItem('tmv-noside', on ? '1' : '');
  syncSideUI(); if (S.unitSpine) S.unitSpine.resize(); showArt();
}
export { setNoSide };