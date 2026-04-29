import { JastrowSearch, isHebrew } from './search.js';
import { HebrewKeyboard } from './keyboard.js';

// ── DOM refs ────────────────────────────────────────────────────────────────
const searchInput      = document.getElementById('searchInput');
const suggestions      = document.getElementById('suggestions');
const clearBtn         = document.getElementById('clearBtn');
const kbToggleBtn      = document.getElementById('kbToggleBtn');
const entryView        = document.getElementById('entryView');
const kbContainer      = document.getElementById('keyboard');
const statusMsg        = document.getElementById('statusMsg');
const themeBtn         = document.getElementById('themeBtn');
const offlineBtn       = document.getElementById('offlineBtn');
const offlineLoading   = document.getElementById('offlineLoading');
const offlineRingFill  = document.getElementById('offlineRingFill');
const installModal     = document.getElementById('installModal');
const installInstr     = document.getElementById('installInstructions');
const installModalClose = document.getElementById('installModalClose');
const welcomeModal     = document.getElementById('welcomeModal');
const welcomeModalClose = document.getElementById('welcomeModalClose');

// ── State ───────────────────────────────────────────────────────────────────
const dict = new JastrowSearch();
const isInstalledPWA = window.matchMedia('(display-mode: standalone)').matches
                    || navigator.standalone === true;
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
async function openEntry(rid, hw, { skipHistory = false, replaceHistory = false, scrollTo = null } = {}) {
  hideSuggestions();
  searchInput.value = hw;
  clearBtn.hidden = false;

  if (!skipHistory) {
    const method = replaceHistory ? 'replaceState' : 'pushState';
    history[method]({ rid, hw }, '', `?q=${encodeURIComponent(hw)}`);
  }

  entryView.innerHTML = '<div class="entry-loading">Loading…</div>';
  entryView.classList.remove('hidden');
  collapseKeyboard();

  try {
    const members = dict.groupFor(hw);
    const group = members.length ? members : [{ hw, rid }];
    const entries = (await Promise.all(group.map(m => dict.entry(m.rid)))).filter(Boolean);
    if (entries.length) {
      renderEntries(entries);
      if (scrollTo) {
        document.getElementById(`entry-${scrollTo}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      entryView.innerHTML = '<p class="entry-err">Entry not found.</p>';
    }
  } catch (e) {
    entryView.innerHTML = '<p class="entry-err">Could not load entry — are you offline?</p>';
  }
}

function renderEntries(entries) {
  entryView.innerHTML = entries.map(entryCardHtml).join('');
  entryView.querySelectorAll('a.refLink, [data-ref]').forEach(a => {
    const hw = a.textContent.trim() || extractHwFromRef(a.dataset.ref);
    a.setAttribute('href', hw ? `?q=${encodeURIComponent(hw)}` : '#');
    a.addEventListener('click', e => {
      e.preventDefault();
      if (hw) {
        const results = dict.search(hw);
        if (results.length) openEntry(results[0].rid, results[0].hw, { scrollTo: results[0].rid });
      }
    });
  });
}

function entryCardHtml(entry) {
  const sensesHtml = buildSenses(entry.senses || []);
  const altHtml = entry.alt?.length
    ? `<div class="entry-alt">Also: <span dir="rtl" lang="he">${entry.alt.map(escHtml).join(', ')}</span></div>`
    : '';
  const morphHtml = entry.morph ? `<span class="entry-morph">${escHtml(entry.morph)}</span>` : '';
  const refsHtml = entry.refs?.length
    ? `<div class="entry-refs"><span class="refs-label">Refs:</span> ${entry.refs.map(escHtml).join(' · ')}</div>`
    : '';
  return `
    <article class="entry-card" id="entry-${escAttr(entry.rid)}">
      <header class="entry-header">
        <button class="back-top-btn" aria-label="Back to top">↑ Top</button>
        <div class="entry-hw-wrap">
          <h2 class="entry-hw" dir="rtl" lang="he">${escHtml(entry.hw)}</h2>
          ${morphHtml}${altHtml}
        </div>
      </header>
      <div class="entry-body">${sensesHtml}</div>
      ${refsHtml}
    </article>`;
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

function extractHwFromRef(ref) {
  if (!ref) return '';
  // "Jastrow, הָבַב I 1" → "הָבַב I"  (keep Roman numeral, strip only trailing page number)
  const m = ref.match(/Jastrow,\s*(.+)/);
  return m ? m[1].replace(/\s+\d+\s*$/, '').trim() : '';
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

searchInput.addEventListener('click', () => {
  expandKeyboard();
  triggerSearch(); // re-shows suggestions if text is already present
});

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
  history.pushState({ view: 'home' }, '', location.pathname);
  searchInput.focus();
  expandKeyboard();
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-area') && !e.target.closest('#keyboard')) {
    hideSuggestions();
    collapseKeyboard();
  }
});

// ── Browser back/forward ──────────────────────────────────────────────────────
window.addEventListener('popstate', e => {
  if (e.state?.rid) {
    openEntry(e.state.rid, e.state.hw, { skipHistory: true });
  } else {
    entryView.classList.add('hidden');
    searchInput.value = '';
    clearBtn.hidden = true;
    hideSuggestions();
    expandKeyboard();
  }
});

entryView.addEventListener('click', e => {
  if (e.target.closest('.back-top-btn')) window.scrollTo(0, 0);
});

// ── Offline install modal ──────────────────────────────────────────────────────
function installInstructions() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !/Chrome/.test(ua))
    return 'Tap the Share button (the box with an arrow pointing up) at the bottom of Safari, then tap "Add to Home Screen".';
  if (/SamsungBrowser/.test(ua))
    return 'Tap the menu icon (☰) and select "Add page to" → "Home screen".';
  if (/Android/.test(ua))
    return 'Tap the menu (⋮) in the top-right corner of Chrome and select "Add to Home screen" or "Install app".';
  if (/Edg\//.test(ua))
    return 'Click the install icon (+) in the address bar, or open the menu (…) and choose "Apps" → "Install this site as an app".';
  if (/Firefox/.test(ua))
    return 'Tap the menu (⋮) and look for "Install" or "Add to Home Screen". Some Firefox versions may not support installation.';
  return 'Look for an install icon in your browser\'s address bar, or find "Add to Home Screen" / "Install app" in the browser menu.';
}

offlineBtn.addEventListener('click', () => {
  installInstr.textContent = installInstructions();
  installModal.classList.remove('hidden');
});
installModalClose.addEventListener('click', () => installModal.classList.add('hidden'));
installModal.addEventListener('click', e => { if (e.target === installModal) installModal.classList.add('hidden'); });

// ── Hide install UI when already running as installed PWA ─────────────────────
if (isInstalledPWA) {
  document.querySelector('.offline-wrap').style.display = 'none';
}

// ── Welcome modal ──────────────────────────────────────────────────────────────
function dismissWelcome() {
  welcomeModal.style.display = 'none';
  localStorage.setItem('welcomed', '1');
}
if (localStorage.getItem('welcomed') || isInstalledPWA) {
  welcomeModal.style.display = 'none';
}
welcomeModalClose.addEventListener('click', dismissWelcome);
welcomeModal.addEventListener('click', e => { if (e.target === welcomeModal) dismissWelcome(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { installModal.classList.add('hidden'); dismissWelcome(); } });


// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  }

  try {
    const count = await dict.init();
    statusMsg.textContent = `${count.toLocaleString()} entries · Jastrow Dictionary`;

    // Open entry from shared/bookmarked URL, or settle on home state
    const initQ = new URLSearchParams(location.search).get('q');
    if (initQ) {
      searchInput.value = initQ;
      clearBtn.hidden = false;
      const results = dict.search(initQ);
      if (results.length) {
        await openEntry(results[0].rid, results[0].hw, { replaceHistory: true, scrollTo: results[0].rid });
      } else {
        history.replaceState({ view: 'home' }, '', location.pathname);
        searchInput.focus();
      }
    } else {
      history.replaceState({ view: 'home' }, '', location.pathname);
      searchInput.focus();
    }

    // Background prefetch of all entry chunks for full offline support
    dict.prefetchAll(p => {
      offlineRingFill.style.strokeDashoffset = (100 * (1 - p)).toFixed(1);
      if (p >= 1) {
        offlineLoading.hidden = true;
        offlineBtn.hidden = false;
      }
    }).catch(() => {});
  } catch {
    statusMsg.textContent = 'Failed to load — check your connection.';
  }
})();
