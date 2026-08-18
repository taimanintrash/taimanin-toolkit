'use strict';

function stopAll() {
  if (S.audio) { S.audio.pause(); S.audio = null; }
  if (S.bgm) { S.bgm.pause(); S.bgm = null; }
  if (S.voice) { S.voice.pause(); S.voice = null; }
}

async function openScene(k) {
  closeLightbox();
  if (typeof disposeUnitSpine === 'function') disposeUnitSpine();
  S.sel = k;
  S.tab = 'scenes';
  $$('#list [data-k]').forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === k)));
  const s = S.scenes.get(k);
  if (!s) return;
  $('#paneS').classList.add('on');
  $('#paneU').classList.remove('on');
  $('#paneC').classList.remove('on');
  $('#empty').style.display = 'none';
  $('#app').classList.remove('browse');
  stopAll();

  $('#stitle').textContent = s.label || s.id;
  $('#ssub').textContent = `${s.id}` + (s.hasArtAnimation ? ' · Animated' : s.hasCG ? ' · CG' : '');
}