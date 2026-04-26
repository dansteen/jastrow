const ENTRIES_BASE = '/data/entries/';
const NIKUD_RE = /[֑-ׇ]/g;
const FINAL_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function isHebrew(s) {
  return /[א-ת]/.test(s);
}

export function normalizeHe(s) {
  return s
    .replace(NIKUD_RE, '')
    .replace(/[ךםןףץ]/g, c => FINAL_MAP[c]);
}

export class JastrowSearch {
  #index = null;   // [[hw, rid, gloss], ...]
  #normed = null;  // normalized headwords (parallel array)
  #cache = {};     // letter → entries array

  async init() {
    const r = await fetch('/data/index.json');
    if (!r.ok) throw new Error(`Failed to load index: ${r.status}`);
    const d = await r.json();
    this.#index = d.entries;
    this.#normed = this.#index.map(([hw]) => normalizeHe(hw));
    return d.count;
  }

  get loaded() { return this.#index !== null; }

  search(q, limit = 15) {
    if (!this.#index || !q.trim()) return [];
    return isHebrew(q)
      ? this.#searchHe(normalizeHe(q.trim()), limit)
      : this.#searchEn(q.trim().toLowerCase(), limit);
  }

  #searchHe(norm, limit) {
    const out = [];
    for (let i = 0; i < this.#normed.length; i++) {
      if (this.#normed[i].startsWith(norm)) {
        const [hw, rid, gloss] = this.#index[i];
        out.push({ hw, rid, gloss });
        if (out.length === limit) break;
      }
    }
    return out;
  }

  #searchEn(q, limit) {
    const exact = [], word = [], partial = [];
    const wordRe = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    for (const [hw, rid, gloss] of this.#index) {
      const g = gloss.toLowerCase();
      if (g.startsWith(q)) exact.push({ hw, rid, gloss });
      else if (wordRe.test(gloss)) word.push({ hw, rid, gloss });
      else if (g.includes(q)) partial.push({ hw, rid, gloss });
      if (exact.length + word.length + partial.length >= limit * 5) break;
    }
    return [...exact, ...word, ...partial].slice(0, limit);
  }

  async entry(rid) {
    const letter = rid[0];
    if (!this.#cache[letter]) {
      const r = await fetch(`${ENTRIES_BASE}${letter}.json`);
      if (!r.ok) throw new Error(`Failed to load entries/${letter}.json`);
      this.#cache[letter] = await r.json();
    }
    return this.#cache[letter].find(e => e.rid === rid) ?? null;
  }

  async prefetchAll() {
    if (!this.#index) return;
    const letters = [...new Set(this.#index.map(([, rid]) => rid[0]))];
    for (const letter of letters) {
      if (!this.#cache[letter]) {
        await this.entry(letter + '00000').catch(() => {});
      }
    }
  }
}
