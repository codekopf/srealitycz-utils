// Rewrites CZK prices on sreality.cz into another currency and m² into ft², with two switchers in the bottom-left corner.
// "21 900 000 Kč", "25 000 Kč/měsíc", "121 667 Kč/m²", "1 234,50 Kč", "180 m²"; sreality separates thousands with a no-break space.
// shortcut: abbreviated amounts like "30 tis. Kč" stay in CZK, handle them if they show up in prices.
// Nor after "4+": "Prodej bytu 4+1 124 m²" has 124 m², not 1 124 m².
const NUM = String.raw`(?<![\d,.]|\d\+)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:,(\d+))?[   ]?`;
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

// Kč, or Kč per m², in the shown currency and unit: "€899,384", "€4,524/m²", "€420/ft²"
function formatPrice(czk, perM2) {
  const {rate, amount} = rates[currency];
  return money.format(czk * amount / rate / (perM2 && settings.unit === 'ft²' ? SQFT_PER_M2 : 1)) + (perM2 ? `/${settings.unit}` : '');
}

function convert(text) {
  const sqft = settings.unit === 'ft²';
  return text
    .replace(PRICE, (m, int, dec, perM2) => currency === 'CZK' && !(perM2 && sqft) ? m : formatPrice(num(int, dec), perM2))
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
  // listing titles ("Prodej bytu 3+kk 68 m²", the card's first <p>) get " - €4,524/m²"; read before s.shown changes
  const card = el.closest('[data-e2e="estates-list"] > li');
  const perM2 = card?.querySelector('p') === el ? pricePerM2(card) : Infinity;
  s.shown = convert(s.orig) + (perM2 < Infinity ? ` - ${formatPrice(perM2, true)}` : '');
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

// Sorting by price per m² on sreality needs a premium account, so this sorts the listings already on the page.
const LOCAL_SORT = 'price_m2_asc_local';

// From the original texts ("Prodej bytu 4+1 124 m²", "18 060 650 Kč" or "1 500 Kč/m²"); listings without a price or area go last.
function pricePerM2(card) {
  const it = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let n; (n = it.nextNode());) {
    const s = state.get(n);
    text += (s && n.data === s.shown ? s.orig : n.data) + '\n'; // \n keeps "Praha 5" and "18 060 650 Kč" apart
  }
  const [price] = text.matchAll(PRICE), [area] = text.matchAll(AREA);
  if (price?.[3]) return num(price[1], price[2]); // already per m²
  return price && area ? num(price[1], price[2]) / num(area[1], area[2]) : Infinity;
}

// CSS order keeps the DOM as React left it, so React can still re-render the list correctly.
function sortListings() {
  const list = document.querySelector('[data-e2e="estates-list"]');
  if (!list) return;
  [...list.children].map(li => [pricePerM2(li), li]).sort((a, b) => a[0] - b[0]).forEach(([, li], i) => li.style.order = i);
}

// The sort menu (#estates-sorter-menu) mounts on open, with one <li data-e2e="price_asc"> etc. per option.
function addSortOption(root) {
  const last = root.querySelector?.('li[data-e2e="price_m2_desc"]');
  if (!last || last.parentElement.querySelector(`[data-e2e="${LOCAL_SORT}"]`)) return;
  // copy the look of an enabled, unselected option (the selected one has a check mark, premium ones are disabled for free accounts)
  const look = [...last.parentElement.children].find(li => li.dataset.e2e && li.tabIndex === 0 && !li.querySelector('svg')) || last;
  const li = Object.assign(document.createElement('li'), {className: look.className, tabIndex: 0, textContent: 'Od nejlevnější za m²/ft² (local)'});
  li.dataset.e2e = LOCAL_SORT;
  li.addEventListener('click', () => {
    sortListings();
    li.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); // closes the MUI menu
  });
  li.addEventListener('keydown', e => (e.code === 'Enter' || e.code === 'Space') && li.click());
  last.after(li);
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
  addSortOption(document.body); // the mobile sort drawer stays mounted, so it may be in the page already
  // sreality is a React app: listings load and re-render after page load
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') {
        convertNode(m.target);
        continue;
      }
      m.addedNodes.forEach(n => { walk(n); addSortOption(n); });
      // the site loaded or re-sorted listings: drop the local order, it no longer matches
      if (m.target.dataset?.e2e === 'estates-list') for (const li of m.target.children) li.style.order = '';
    }
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) settings[k] = changes[k].newValue ?? DEFAULTS[k];
    render();
  });
});
