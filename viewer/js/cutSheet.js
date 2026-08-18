'use strict';

async function openNpc(k) {
  closeLightbox();
  if (typeof disposeSceneSpine === 'function') disposeSceneSpine();
  if (typeof disposeUnitSpine === 'function') disposeUnitSpine();
  if (typeof stopAll === 'function') stopAll();
  S.sel = k;
  S.tab = 'npc';
  $$('#list [data-k]').forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === k)));
  $('#paneC').classList.add('on');
  $('#paneU').classList.remove('on');
  $('#paneS').classList.remove('on');
  $('#empty').style.display = 'none';
  $('#app').classList.remove('browse');

  const g = S.npcs.get(k);
  if (!g) return;
  $('#ctitle').textContent = k;
  const sourceCounts = { authored: 0, parts: 0, missing: 0 };
  const allVersions = [];
  for (const pose of g.poses) {
    const versions = g.versions.get(pose);
    for (const n of [versions?.base, versions?.r18]) if (n) allVersions.push(n);
  }
  for (const n of allVersions) {
    const kind = S.actorSources.get(n)?.kind;
    sourceCounts[kind === 'authored' ? 'authored' : kind === 'parts' ? 'parts' : 'missing']++;
  }
  $('#csub').textContent = `${g.poses.length} pose${g.poses.length === 1 ? '' : 's'} · ` +
    `${allVersions.length - g.poses.length} R18 alternate${allVersions.length - g.poses.length === 1 ? '' : 's'} · ` +
    `${sourceCounts.authored} authored · ${sourceCounts.parts} composed` +
    (sourceCounts.missing ? ` · ${sourceCounts.missing} missing` : '');
  const sheet = $('#cutsheet');
  sheet.textContent = '';
  sheet.style.setProperty('--cut', { s: '170px', m: '260px', l: '420px' }[S.cutSize] || '260px');

  S.cutPoses = g.poses.map(pose => {
    const versions = g.versions.get(pose);
    return versions?.base || versions?.r18 || pose;
  });
  const token = ++openNpc._token;
  for (let i = 0; i < g.poses.length; i++) {
    const pose = g.poses[i], versions = g.versions.get(pose);
    const name = versions?.base || versions?.r18 || pose;
    if (token !== openNpc._token) return;
    const cell = document.createElement('button');
    cell.className = 'cutcell';
    cell.title = 'Open large';
    cell.onclick = () => openCut(i);
    const frame = document.createElement('div');
    frame.className = 'frame';
    const cap = document.createElement('div');
    cap.className = 'cap';
    const source = S.actorSources.get(name);
    const tag = source?.kind === 'authored'
      ? '<span class="tag">AUTHORED</span>'
      : source?.kind === 'parts'
        ? '<span class="tag p">COMPOSED</span>'
        : '<span class="tag">MISSING</span>';
    cap.innerHTML = `<span class="n"></span>${tag}`;
    cap.querySelector('.n').textContent = pose;
    if (versions?.base && versions?.r18) {
      const pick = document.createElement('span');
      pick.className = 'vpick';
      const show = async (chosen, button) => {
        S.cutPoses[i] = chosen;
        frame.textContent = '';
        cell.classList.remove('miss');
        pick.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === button));
        const actor = await buildActor(chosen, []);
        if (token !== openNpc._token) return;
        if (actor) frame.appendChild(actor); else cell.classList.add('miss');
      };
      for (const [label, chosen] of [['BASE', versions.base], ['R18', versions.r18]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.classList.toggle('on', chosen === name);
        button.onclick = e => { e.stopPropagation(); show(chosen, button); };
        pick.appendChild(button);
      }
      cap.appendChild(pick);
    }
    cell.append(frame, cap);
    sheet.appendChild(cell);
    const el = await buildActor(name, []);
    if (token !== openNpc._token) return;
    if (el) frame.appendChild(el); else cell.classList.add('miss');
  }
}
openNpc._token = 0;

async function actorContentBounds(name) {
  const key = String(name || '').toLowerCase();
  if (S.actorBounds.has(key)) return S.actorBounds.get(key);
  const source = S.actorSources.get(key);
  if (!source) return null;
  const [CW, CH] = S.actorCanvas;
  const boxes = [];
  if (source.kind === 'authored') {
    const entry = S.actorAuthored.get(stem((source.file || key).split('/').pop()));
    if (entry) {
      const metric = await imageMetrics(entry), b = metric.bbox || [0, 0, metric.w, metric.h];
      boxes.push({
        x: b[0] / metric.w * CW, y: b[1] / metric.h * CH,
        x1: b[2] / metric.w * CW, y1: b[3] / metric.h * CH
      });
    }
  } else for (const p of source.parts || []) {
    const entry = S.actorRaw.get(String(p.file || '').toLowerCase());
    if (!entry) continue;
    const metric = await imageMetrics(entry), b = metric.bbox || [0, 0, metric.w, metric.h];
    const w = +p.w || metric.w, h = +p.h || metric.h;
    const left = CW / 2 + (+p.x || 0) - w / 2, top = CH / 2 - (+p.y || 0) - h / 2;
    boxes.push({
      x: left + b[0] / metric.w * w, y: top + b[1] / metric.h * h,
      x1: left + b[2] / metric.w * w, y1: top + b[3] / metric.h * h
    });
  }
  if (!boxes.length) { S.actorBounds.set(key, null); return null; }
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x1)), y1 = Math.max(...boxes.map(b => b.y1));
  const result = { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) };
  S.actorBounds.set(key, result);
  return result;
}

async function openCut(i) {
  const list = S.cutPoses || [];
  if (!list.length) return;
  S.cutIndex = ((i % list.length) + list.length) % list.length;
  const name = list[S.cutIndex];
  const box = $('#lightbox'), holder = $('#lightbox .lbcomp'), img = $('#lightbox img');
  img.hidden = true;
  img.removeAttribute('src');
  holder.hidden = false;
  holder.textContent = '';
  const el = await buildActor(name, []);
  if (el) {
    holder.appendChild(el);
    const bounds = await actorContentBounds(name);
    if (bounds) {
      const [CW, CH] = S.actorCanvas;
      const scale = Math.min(CW / bounds.w, CH / bounds.h) * .94;
      const centerX = bounds.x + bounds.w / 2, centerY = bounds.y + bounds.h / 2;
      el.style.inset = 'auto';
      el.style.left = ((CW / 2 - centerX * scale) / CW * 100) + '%';
      el.style.top = ((CH / 2 - centerY * scale) / CH * 100) + '%';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.transformOrigin = '0 0';
      el.style.transform = `scale(${scale})`;
    }
  }
  $('#lightbox .caption').textContent =
    `${name}  ·  ${S.cutIndex + 1}/${list.length}` + (el ? '' : '  ·  no image');
  box.classList.add('on');
  box.setAttribute('aria-hidden', 'false');
}

async function buildActor(name, localPaths = []) {
  const key = String(name || '').toLowerCase();
  const source = S.actorSources.get(key);
  if (source?.kind === 'authored') {
    const entry = S.actorAuthored.get(stem((source.file || key).split('/').pop()));
    if (!entry) return null;
    const img = document.createElement('img');
    img.src = await blobURL(entry);
    return img;
  }
  if (source?.kind === 'parts') {
    const wrap = document.createElement('div');
    wrap.className = 'composite';
    const [CW, CH] = S.actorCanvas;
    for (const p of source.parts || []) {
      const entry = S.actorRaw.get(String(p.file || '').toLowerCase());
      if (!entry) continue;
      const img = document.createElement('img');
      img.src = await blobURL(entry);
      const w = +p.w, h = +p.h;
      img.style.left = ((CW / 2 + (+p.x || 0)) / CW * 100) + '%';
      img.style.top = ((CH / 2 - (+p.y || 0)) / CH * 100) + '%';
      if (w) img.style.width = (w / CW * 100) + '%';
      if (h) img.style.height = (h / CH * 100) + '%';
      wrap.appendChild(img);
    }
    return wrap;
  }
  return null;
}