'use strict';

/**
 * Returns the first element matching a CSS selector.
 * Called by: Various modules
 */
const $ = s => document.querySelector(s);

/**
 * Returns all elements matching a CSS selector as an array.
 * Called by: Various modules
 */
const $$ = s => [...document.querySelectorAll(s)];

/**
 * Displays a toast notification message.
 * Called by: loadTranslations, loadActorSources, loadUnitMetadata, ingest
 */
const toast = (m, ms = 2400) => {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), ms);
};

/**
 * Updates the loading progress bar width.
 * Called by: ingest
 */
const prog = p => {
  const b = $('#bar');
  b.style.width = (p * 100) + '%';
  if (p >= 1) setTimeout(() => b.style.width = 0, 400);
};

/**
 * Extracts filename stem without extension and converts to lowercase.
 * Called by: Various modules
 */
const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();

/**
 * Extracts directory path from a file path string.
 * Called by: Various modules
 */
const dirOf = p => p.split('/').slice(0, -1).join('/');

/**
 * Extracts base filename from a file path string.
 * Called by: remoteEntry, fromFileList
 */
const baseOf = p => p.split('/').pop();

/**
 * Returns localized text string based on current language settings.
 * Called by: loadUnitMetadata, buildCharacterFamilies, openUnit, render
 */
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

/**
 * Checks if a character name contains multi-character separators.
 * Called by: buildCharacterFamilies
 */
const multiCharacterName = s => /[＆&×＋+]/.test(String(s || ''));

/**
 * Normalizes character name by removing spaces and symbols.
 * Called by: buildCharacterFamilies, rawCharacterName
 */
const normCharacterName = s => String(s || '').replace(/[\s ・･]/g, '').toLowerCase();

/**
 * Returns normalized raw character name from metadata.
 * Called by: buildRealCidIndex, characterFamilyId
 */
const rawCharacterName = m => normCharacterName(m?.name?.ja || localText(m?.name));

/**
 * Normalizes spine model name for loose matching.
 * Called by: indexSpineModels, findSpineModel
 */
const spineLoose = name => String(name || '').toLowerCase().replace(/\d+/g, n => String(+n)).replace(/[^a-z0-9]/g, '');

/**
 * IndexedDB wrapper object for key-value storage.
 * Called by: pickFolder, IIFE bootstrap in main.js
 */
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