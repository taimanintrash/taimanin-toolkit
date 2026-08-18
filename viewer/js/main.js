'use strict';

// Global Event Listeners & Bootstrapping
new ResizeObserver(() => sizeGrid()).observe($('#list'));

$('#fallback').addEventListener('change', e => {
  S.lazy.clear();
  ingest(fromFileList([...e.target.files]));
});

$('#pick').onclick = pickFolder;
$('#reopen').onclick = pickFolder;

$('#q').addEventListener('input', applyFilter);

$('#tabU').onclick = () => setTab('units');
$('#tabS').onclick = () => setTab('scenes');
$('#tabN').onclick = () => setTab('story');
$('#tabC').onclick = () => setTab('npc');

$$('#csizeseg button').forEach(b => b.onclick = () => {
  S.cutSize = b.dataset.csize;
  $$('#csizeseg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('#cutsheet').style.setProperty('--cut', { s: '170px', m: '260px', l: '420px' }[S.cutSize]);
});

$('#sidetoggle').onclick = () => $('#app').classList.toggle('wide');
$('#sideshow').onclick = () => $('#app').classList.toggle('wide');

$('#theme').onclick = () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
};

// Initial Auto-Load Check
(async () => {
  if (await loadFromServer()) return;
  const dir = await idb.get('dir');
  if (dir && dir.queryPermission) {
    if (await dir.queryPermission({ mode: 'read' }) === 'granted') return loadDir(dir);
    $('#pick').textContent = 'Reopen last folder…';
    $('#pick').onclick = async () => {
      if (await dir.requestPermission({ mode: 'read' }) === 'granted') return loadDir(dir);
      pickFolder();
    };
  }
})();