'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const toast = (m, ms = 2400) => {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), ms);
};

const prog = p => {
  const b = $('#bar');
  b.style.width = (p * 100) + '%';
  if (p >= 1) setTimeout(() => b.style.width = 0, 400);
};

const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();
const dirOf = p => p.split('/').slice(0, -1).join('/');
const baseOf = p => p.split('/').pop();

const localText = v => {
  if (v == null) return '';
  if (typeof v === 'string')
    return (S.lang === 'en' && S.en.get(v)) || v;
  if (S.lang === 'en') {
    const t = S.en.get(v.ja);
    if (t) return t;
  }
  return v[S.lang] || v.ja || v.ko || Object.values(v).find(Boolean) || '';
};

const multiCharacterName = s => /[＆&×＋+]/.test(String(s || ''));
const normCharacterName = s => String(s || '').replace(/[\s ・･]/g, '').toLowerCase();
const rawCharacterName = m => normCharacterName(m?.name?.ja || localText(m?.name));

const spineLoose = name => String(name || '').toLowerCase().replace(/\d+/g, n => String(+n)).replace(/[^a-z0-9]/g, '');

const idb = {
  db: null,
  async open() {
    return this.db ||= await new Promise((res, rej) => {
      const r = indexedDB.open('tmv2', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async set(k, v) {
    try {
      const db = await this.open();
      return new Promise(r => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = r;
      });
    } catch (_) {}
  },
  async get(k) {
    try {
      const db = await this.open();
      return new Promise(r => {
        const t = db.transaction('kv', 'readonly');
        const q = t.objectStore('kv').get(k);
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
      });
    } catch (_) {
      return null;
    }
  }
};