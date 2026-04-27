// Standard Israeli keyboard layout (matches physical keyboard positions)
const ROWS = [
  ['ק','ר','א','ט','ו','ן','ם','פ'],          // Q W E R T Y U I O P
  ['ש','ד','ג','כ','ע','י','ח','ל','ך','ף'],  // A S D F G H J K L ;
  ['ז','ס','ב','ה','נ','מ','צ','ת','ץ'],       // Z X C V B N M , .
];

export class HebrewKeyboard {
  constructor(container, onKey) {
    this.container = container;
    this.onKey = onKey;
    this.#render();
  }

  #render() {
    this.container.innerHTML = '';

    for (const row of ROWS) {
      const el = this.#row();
      for (const ch of row) el.appendChild(this.#key(ch, 'letter'));
      this.container.appendChild(el);
    }

    const bottom = this.#row('controls');
    bottom.appendChild(this.#key('⌫', 'action bksp', 'Backspace', 'Backspace'));
    bottom.appendChild(this.#key('space', 'action space', ' ', 'Space'));
    this.container.appendChild(bottom);
  }

  #row(extra = '') {
    const d = document.createElement('div');
    d.className = `kb-row${extra ? ' kb-' + extra : ''}`;
    return d;
  }

  #key(label, cls, value, ariaLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kb-key ${cls}`;
    btn.textContent = label;
    btn.dataset.value = value !== undefined ? value : label;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => this.onKey(btn.dataset.value));
    return btn;
  }
}
