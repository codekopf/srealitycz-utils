// Rewrites CZK prices on sreality.cz into another currency and m² into ft², with two switchers in the bottom-left corner.
// "21 900 000 Kč", "25 000 Kč/měsíc", "121 667 Kč/m²", "1 234,50 Kč", "180 m²"; sreality separates thousands with a no-break space.
// shortcut: abbreviated amounts like "30 tis. Kč" stay in CZK, handle them if they show up in prices.
const NUM = String.raw`(?<![\d,.])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:,(\d+))?[   ]?`;
const PRICE = new RegExp(NUM + 'Kč(/m²)?', 'g');
const AREA = new RegExp(NUM + 'm²', 'g');
const SQFT_PER_M2 = 10.7639;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
const DEFAULTS = {currency: 'EUR', favorites: ['EUR', 'USD'], unit: 'm²'};
const state = new WeakMap(); // text node -> {orig, shown}
const areaFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 0});
const currencyNames = new Intl.DisplayNames(undefined, {type: 'currency'});
let settings = {...DEFAULTS};
let rates = {CZK: {rate: 1, amount: 1}}; // `amount` units of the currency cost `rate` Kč
let ratesError;
let currency, money; // the currency shown (settings.currency if its rate is known) and its formatter

const num = (int, dec) => Number(`${int.replace(/\D/g, '')}.${dec || 0}`);

function convert(text) {
  const sqft = settings.unit === 'ft²';
  return text
    .replace(PRICE, (m, int, dec, perM2) => {
      if (currency === 'CZK' && !(perM2 && sqft)) return m;
      const {rate, amount} = rates[currency];
      return money.format(num(int, dec) * amount / rate / (perM2 && sqft ? SQFT_PER_M2 : 1)) + (perM2 ? `/${settings.unit}` : '');
    })
    .replace(AREA, (m, int, dec) => sqft ? `${areaFormat.format(num(int, dec) * SQFT_PER_M2)} ft²` : m);
}

function convertNode(node) {
  const el = node.parentElement;
  if (!el || SKIP.has(el.nodeName)) return; // no parent: React removed it before the observer ran
  let s = state.get(node);
  if (!s || node.data !== s.shown) { // first visit, or the site re-rendered the text
    if (!/Kč|m²/.test(node.data)) return;
    s = {orig: node.data};
    state.set(node, s);
  }
  s.shown = convert(s.orig);
  if (node.data === s.shown) return;
  node.data = s.shown;
  const orig = s.orig.trim();
  if (s.shown !== s.orig) el.title = orig; // hover shows the original text
  else if (el.title === orig) el.removeAttribute('title');
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return convertNode(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = it.nextNode());) convertNode(n);
}

const host = document.createElement('div');
const shadow = host.attachShadow({mode: 'open'});
shadow.innerHTML = `<style>
  .bar { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px;
         max-width: calc(100vw - 32px); font: 600 13px/1 system-ui, sans-serif; }
  .pill { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: #fff; border-radius: 17px; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); }
  span { display: contents; }
  button, select { all: unset; cursor: pointer; padding: 7px 11px; border-radius: 999px; color: #232b3a; }
  [aria-pressed="true"] { background: #cc0000; color: #fff; }
  select { width: 1ch; text-align: center; } /* otherwise as wide as the longest currency name */
  button:disabled { cursor: default; opacity: .4; }
  :focus-visible { outline: 2px solid #232b3a; outline-offset: 1px; }
</style><div class="bar">
  <div class="pill" role="group" aria-label="Price currency"><span></span><select aria-label="Add or remove a favorite currency"></select></div>
  <div class="pill" role="group" aria-label="Area unit"></div>
</div>`;
const [currencyPill, unitPill] = shadow.querySelectorAll('.pill');
const [favs, picker] = currencyPill.children;

function button(key, value) {
  const b = document.createElement('button');
  b.textContent = value;
  Object.assign(b.dataset, {key, value});
  return b;
}

unitPill.append(button('unit', 'm²'), button('unit', 'ft²'));
shadow.querySelector('.bar').addEventListener('click', e => {
  const {key, value} = e.target.dataset;
  if (key) chrome.storage.sync.set({[key]: value});
});
picker.addEventListener('change', () => {
  const c = picker.value, {favorites} = settings;
  picker.value = '';
  chrome.storage.sync.set(favorites.includes(c)
    ? {favorites: favorites.filter(f => f !== c), currency: settings.currency === c ? 'CZK' : settings.currency}
    : {favorites: [...favorites, c], currency: c});
});

function renderFavorites() {
  const list = ['CZK', ...settings.favorites]; // CZK always first
  if (favs.dataset.list === String(list)) return; // rebuilding would drop keyboard focus
  favs.dataset.list = list;
  favs.replaceChildren(...list.map(c => Object.assign(button('currency', c), {disabled: !rates[c]})));
  const group = (label, codes) => {
    const g = document.createElement('optgroup');
    g.label = label;
    g.append(...codes.map(c => new Option(`${c} – ${rates[c] ? currencyNames.of(c) : 'no rate available'}`, c)));
    return g;
  };
  const plus = Object.assign(new Option('+', ''), {hidden: true});
  const others = Object.keys(rates).filter(c => c !== 'CZK' && !settings.favorites.includes(c)).sort();
  picker.replaceChildren(plus, group('Add', others), group('Remove', settings.favorites));
}

function render() {
  currency = rates[settings.currency] ? settings.currency : 'CZK';
  money = new Intl.NumberFormat(currency === 'CZK' ? 'cs-CZ' : undefined, {style: 'currency', currency, maximumFractionDigits: 0});
  renderFavorites();
  for (const b of shadow.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', b.dataset.value === (b.dataset.key === 'unit' ? settings.unit : currency));
  }
  const r = rates[currency];
  currencyPill.title = ratesError ? `Exchange rate unavailable: ${ratesError}`
    : currency === 'CZK' ? '' : `${r.source}, ${r.validFor}: ${r.amount} ${currency} = ${r.rate} Kč`;
  walk(document.body);
}

Promise.all([
  chrome.storage.sync.get(DEFAULTS),
  chrome.runtime.sendMessage('rates').catch(e => ({error: e.message})),
]).then(([stored, r]) => {
  settings = stored;
  if (r?.EUR) Object.assign(rates, r);
  else ratesError = r?.error;
  document.body.append(host);
  render();
  // sreality is a React app: listings load and re-render after page load
  new MutationObserver(muts => {
    for (const m of muts) m.type === 'characterData' ? convertNode(m.target) : m.addedNodes.forEach(walk);
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) settings[k] = changes[k].newValue ?? DEFAULTS[k];
    render();
  });
});
