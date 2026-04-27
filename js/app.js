import { JastrowSearch, isHebrew } from './search.js';
import { HebrewKeyboard } from './keyboard.js';

// ── DOM refs ────────────────────────────────────────────────────────────────
const searchInput  = document.getElementById('searchInput');
const suggestions  = document.getElementById('suggestions');
const clearBtn     = document.getElementById('clearBtn');
const kbToggleBtn  = document.getElementById('kbToggleBtn');
const entryView    = document.getElementById('entryView');
const kbContainer  = document.getElementById('keyboard');
const statusMsg    = document.getElementById('statusMsg');
const installBtn   = document.getElementById('installBtn');
const themeBtn     = document.getElementById('themeBtn');

// ── State ───────────────────────────────────────────────────────────────────
const dict = new JastrowSearch();
let debounce = null;
let activeIdx = -1;   // keyboard-selected suggestion index
let lastQuery = '';

// ── Keyboard collapse ────────────────────────────────────────────────────────
function collapseKeyboard() { kbContainer.classList.add('collapsed'); }
function expandKeyboard()   { kbContainer.classList.remove('collapsed'); }

// ── Keyboard ─────────────────────────────────────────────────────────────────
new HebrewKeyboard(kbContainer, key => {
  const inp = searchInput;
  const start = inp.selectionStart;
  const end   = inp.selectionEnd;

  if (key === 'Backspace') {
    if (start !== end) {
      inp.value = inp.value.slice(0, start) + inp.value.slice(end);
      inp.setSelectionRange(start, start);
    } else if (start > 0) {
      inp.value = inp.value.slice(0, start - 1) + inp.value.slice(start);
      inp.setSelectionRange(start - 1, start - 1);
    }
  } else {
    inp.value = inp.value.slice(0, start) + key + inp.value.slice(end);
    const pos = start + key.length;
    inp.setSelectionRange(pos, pos);
  }

  inp.focus();
  triggerSearch();
});

// ── Search ────────────────────────────────────────────────────────────────────
function triggerSearch() {
  const q = searchInput.value;
  clearBtn.hidden = !q;
  clearTimeout(debounce);
  if (!q.trim()) { hideSuggestions(); return; }
  debounce = setTimeout(() => {
    const results = dict.search(q);
    renderSuggestions(results);
    lastQuery = q;
  }, 80);
}

function renderSuggestions(results) {
  suggestions.innerHTML = '';
  activeIdx = -1;
  if (!results.length) { hideSuggestions(); return; }

  const frag = document.createDocumentFragment();
  results.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'sug-item';
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', 'false');
    div.dataset.rid = r.rid;
    div.dataset.hw  = r.hw;
    div.innerHTML =
      `<span class="sug-hw" dir="rtl" lang="he">${escHtml(r.hw)}</span>` +
      `<span class="sug-gloss">${escHtml(r.gloss)}</span>`;
    div.addEventListener('mousedown', e => e.preventDefault());
    div.addEventListener('click', () => openEntry(r.rid, r.hw));
    frag.appendChild(div);
  });
  suggestions.appendChild(frag);
  suggestions.hidden = false;
}

function hideSuggestions() {
  suggestions.hidden = true;
  suggestions.innerHTML = '';
  activeIdx = -1;
}

function moveSuggestion(dir) {
  const items = suggestions.querySelectorAll('.sug-item');
  if (!items.length) return;
  items[activeIdx]?.classList.remove('active');
  activeIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
  items[activeIdx].classList.add('active');
  items[activeIdx].scrollIntoView({ block: 'nearest' });
}

function selectActive() {
  const item = suggestions.querySelector('.sug-item.active');
  if (item) openEntry(item.dataset.rid, item.dataset.hw);
}

// ── Entry display ─────────────────────────────────────────────────────────────
async function openEntry(rid, hw) {
  hideSuggestions();
  searchInput.value = hw;
  clearBtn.hidden = false;

  entryView.innerHTML = '<div class="entry-loading">Loading…</div>';
  entryView.classList.remove('hidden');
  entryView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  collapseKeyboard();

  try {
    const entry = await dict.entry(rid);
    if (entry) renderEntry(entry);
    else entryView.innerHTML = '<p class="entry-err">Entry not found.</p>';
  } catch (e) {
    entryView.innerHTML = '<p class="entry-err">Could not load entry — are you offline?</p>';
  }
}

function renderEntry(entry) {
  const sensesHtml = buildSenses(entry.senses || []);
  const altHtml = entry.alt?.length
    ? `<div class="entry-alt">Also: <span dir="rtl" lang="he">${entry.alt.map(escHtml).join(', ')}</span></div>`
    : '';
  const morphHtml = entry.morph ? `<span class="entry-morph">${escHtml(entry.morph)}</span>` : '';
  const refsHtml = entry.refs?.length
    ? `<div class="entry-refs"><span class="refs-label">Refs:</span> ${entry.refs.map(escHtml).join(' · ')}</div>`
    : '';
  const navHtml = buildNav(entry);

  entryView.innerHTML = `
    <article class="entry-card">
      <header class="entry-header">
        <h2 class="entry-hw" dir="rtl" lang="he">${escHtml(entry.hw)}</h2>
        ${morphHtml}${altHtml}
      </header>
      <div class="entry-body">${sensesHtml}</div>
      ${refsHtml}
      ${navHtml}
      <footer class="entry-source">
        <em>A Dictionary of the Targumim, the Talmud Babli and Yerushalmi, and the Midrashic Literature</em>
        — Marcus Jastrow (1903). Public domain. Digitized by <a href="https://www.sefaria.org" target="_blank" rel="noopener">Sefaria</a>.
      </footer>
    </article>`;

  // Wire cross-reference links
  entryView.querySelectorAll('a.refLink, [data-ref]').forEach(a => {
    a.setAttribute('href', '#');
    a.addEventListener('click', e => {
      e.preventDefault();
      const hw = a.textContent.trim() || extractHwFromRef(a.dataset.ref);
      if (hw) {
        const results = dict.search(hw);
        if (results.length) openEntry(results[0].rid, results[0].hw);
      }
    });
  });
}

function buildSenses(senses, depth = 0) {
  if (!senses.length) return '';
  const tag = depth === 0 ? 'ol' : 'ul';
  const cls = depth === 0 ? 'senses' : 'senses-sub';
  let html = `<${tag} class="${cls}">`;
  for (const s of senses) {
    html += '<li class="sense">';
    if (s.gram) html += `<span class="sense-gram">${escHtml(s.gram)}</span> `;
    if (s.def)  html += `<span class="sense-def">${s.def}</span>`;   // HTML from Sefaria
    if (s.senses?.length) html += buildSenses(s.senses, depth + 1);
    html += '</li>';
  }
  html += `</${tag}>`;
  return html;
}

function buildNav(entry) {
  if (!entry.prev && !entry.next) return '';
  const prev = entry.prev
    ? `<button class="nav-btn" data-hw="${escAttr(entry.prev)}">← <span dir="rtl" lang="he">${escHtml(entry.prev)}</span></button>`
    : '<span class="nav-empty"></span>';
  const next = entry.next
    ? `<button class="nav-btn" data-hw="${escAttr(entry.next)}"><span dir="rtl" lang="he">${escHtml(entry.next)}</span> →</button>`
    : '<span class="nav-empty"></span>';
  return `<nav class="entry-nav">${prev}${next}</nav>`;
}

function extractHwFromRef(ref) {
  if (!ref) return '';
  // "Jastrow, הָבַב I 1" → "הָבַב"
  const m = ref.match(/Jastrow,\s*(.+?)(?:\s+[IVX]+)?\s+\d*$/);
  return m ? m[1].trim() : '';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) { return escHtml(s); }

// ── System keyboard toggle ────────────────────────────────────────────────────
let systemKbOn = false;
kbToggleBtn.addEventListener('click', () => {
  systemKbOn = !systemKbOn;
  searchInput.inputMode = systemKbOn ? 'text' : 'none';
  kbToggleBtn.textContent = systemKbOn ? 'עב' : 'ABC';
  kbToggleBtn.title = systemKbOn ? 'Hide system keyboard' : 'Show system keyboard';
  kbToggleBtn.setAttribute('aria-label', kbToggleBtn.title);
  kbToggleBtn.classList.toggle('active', systemKbOn);
  // Blur then refocus so Android picks up the inputmode change
  searchInput.blur();
  searchInput.focus();
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeBtn.textContent = dark ? '☀' : '☽';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

const savedTheme = localStorage.getItem('theme');
let dark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(dark);
themeBtn.addEventListener('click', () => { dark = !dark; applyTheme(dark); });

// ── Event wiring ──────────────────────────────────────────────────────────────
searchInput.addEventListener('input', triggerSearch);

searchInput.addEventListener('click', expandKeyboard);

searchInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
  else if (e.key === 'Enter')  { e.preventDefault(); selectActive(); }
  else if (e.key === 'Escape') { hideSuggestions(); }
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.hidden = true;
  hideSuggestions();
  entryView.classList.add('hidden');
  searchInput.focus();
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-area')) hideSuggestions();
});

// Entry nav via delegation
entryView.addEventListener('click', e => {
  const btn = e.target.closest('.nav-btn[data-hw]');
  if (!btn) return;
  const hw = btn.dataset.hw;
  const results = dict.search(hw);
  if (results.length) openEntry(results[0].rid, results[0].hw);
});

// ── PWA install ───────────────────────────────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') installBtn.hidden = true;
  deferredPrompt = null;
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  }

  try {
    const count = await dict.init();
    statusMsg.textContent = `${count.toLocaleString()} entries · Jastrow Dictionary`;
    searchInput.focus();
    // Background prefetch of all entry chunks for full offline support
    setTimeout(() => dict.prefetchAll().catch(() => {}), 5000);
  } catch {
    statusMsg.textContent = 'Failed to load — check your connection.';
  }
})();
