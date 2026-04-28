const ENTRIES_BASE = 'data/entries/';
const NIKUD_RE = /[֑-ׇ]/g;
const FINAL_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const SUPER_RE  = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const ROMAN_RE  = /\s+[IVXLCDM]+$/;

export function isHebrew(s) {
  return /[א-ת]/.test(s);
}

export function normalizeHe(s) {
  return s
    .replace(NIKUD_RE, '')
    .replace(/[ךםןףץ]/g, c => FINAL_MAP[c]);
}

// Looser key for grouping same-root entries (strips superscripts and Roman numerals)
function groupKey(hw) {
  return normalizeHe(hw).replace(SUPER_RE, '').replace(ROMAN_RE, '').trimEnd();
}

// Clean display form: keep nikud but strip disambiguation suffixes
function displayHw(hw) {
  return hw.replace(SUPER_RE, '').replace(ROMAN_RE, '').trimEnd();
}

export class JastrowSearch {
  #index = null;   // [[hw, rid, gloss], ...]
  #normed = null;  // normalized headwords (parallel array)
  #groups = null;  // normalized-hw → [{hw, rid}, ...]
  #cache = {};     // letter → entries array

  async init() {
    const r = await fetch('data/index.json');
    if (!r.ok) throw new Error(`Failed to load index: ${r.status}`);
    const d = await r.json();
    this.#index = d.entries;
    this.#normed = this.#index.map(([hw]) => normalizeHe(hw));

    // Build same-spelling groups in one pass
    this.#groups = new Map();
    for (let i = 0; i < this.#index.length; i++) {
      const [hw, rid] = this.#index[i];
      const key = groupKey(hw);
      if (!this.#groups.has(key)) this.#groups.set(key, []);
      this.#groups.get(key).push({ hw, rid });
    }

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
    const out = [], seen = new Set();
    for (let i = 0; i < this.#normed.length; i++) {
      if (this.#normed[i].startsWith(norm)) {
        const [hw, rid, gloss] = this.#index[i];
        const key = groupKey(hw);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ hw: displayHw(hw), rid, gloss });
        if (out.length === limit) break;
      }
    }
    return out;
  }

  #searchEn(q, limit) {
    const exact = [], word = [], partial = [];
    const seen = new Set();
    const wordRe = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    for (const [hw, rid, gloss] of this.#index) {
      const key = groupKey(hw);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = gloss.toLowerCase();
      const dhw = displayHw(hw);
      if (g.startsWith(q)) exact.push({ hw: dhw, rid, gloss });
      else if (wordRe.test(gloss)) word.push({ hw: dhw, rid, gloss });
      else if (g.includes(q)) partial.push({ hw: dhw, rid, gloss });
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

  // Returns { prev, next, position, total } for same-spelling navigation.
  // prev/next are {hw, rid} or null.
  neighbors(rid, hw) {
    const group = this.#groups?.get(groupKey(hw)) ?? [];
    const idx = group.findIndex(e => e.rid === rid);
    if (idx === -1) return { prev: null, next: null, position: 1, total: group.length };
    return {
      prev:     idx > 0                ? group[idx - 1] : null,
      next:     idx < group.length - 1 ? group[idx + 1] : null,
      position: idx + 1,
      total:    group.length,
    };
  }

  // Returns all {hw, rid} entries that share the same root spelling, base form first.
  groupFor(hw) {
    const group = this.#groups?.get(groupKey(hw)) ?? [];
    return [...group].sort((a, b) => (displayHw(b.hw) === b.hw) - (displayHw(a.hw) === a.hw));
  }

  async prefetchAll(onProgress) {
    if (!this.#index) return;
    const letters = [...new Set(this.#index.map(([, rid]) => rid[0]))];
    const total = letters.length;
    let done = 0;
    for (const letter of letters) {
      if (!this.#cache[letter]) {
        await this.entry(letter + '00000').catch(() => {});
      }
      onProgress?.(++done / total);
    }
  }
}
