const ROWS = [
  ['א','ב','ג','ד','ה','ו','ז','ח','ט','י'],
  ['כ','ל','מ','נ','ס','ע','פ','צ','ק','ר'],
  ['ש','ת'],
];
const FINALS = ['ך','ם','ן','ף','ץ']; // ך ם ן ף ץ

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

    const bottom = this.#row('finals');
    bottom.appendChild(this.#key('⌫', 'action bksp', 'Backspace', 'Backspace'));
    for (const ch of FINALS) bottom.appendChild(this.#key(ch, 'final'));
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
