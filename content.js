// Rewrites CZK prices on sreality.cz into another currency and m² into ft², and shows more listings per page,
// with switchers in the bottom-left corner.
// "21 900 000 Kč", "25 000 Kč/měsíc", "121 667 Kč/m²", "1 234,50 Kč", "180 m²"; sreality separates thousands with a no-break space.
// shortcut: abbreviated amounts like "30 tis. Kč" stay in CZK, handle them if they show up in prices.
// Nor after "4+": "Prodej bytu 4+1 124 m²" has 124 m², not 1 124 m².
const NUM = String.raw`(?<![\d,.]|\d\+)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:,(\d+))?[   ]?`;
const PRICE = new RegExp(NUM + 'Kč(/m²)?', 'g');
const AREA = new RegExp(NUM + 'm²', 'g');
const SQFT_PER_M2 = 10.7639;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
const DEFAULTS = {currency: 'EUR', favorites: ['EUR', 'USD'], unit: 'm²', limit: 0};
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

// Listings per page: sreality shows 20 (+2 tips) and its URLs take no page size, but its API takes any limit.
// Its server turns the page URL into API filters, so this asks the server for them (_next/data) and then calls the API itself.
const LIMITS = [0, 50, 100, 250, 500]; // 0: sreality's own pages
const MAX_RESULTS = 1e4; // the API refuses offset + limit above this, and sreality's pages stop there too
const SEARCH_PATH = /^(\/[a-z]{2})?\/(hledani|search)(\/|$)/;
const LIST = '[data-e2e="estates-list"]';
// the API names that aren't the snake_case of sreality's own (module 74720 of its bundle); timestamps and tips aren't needed
const API_NAMES = {priceSqMeterFrom: 'price_m2_from', priceSqMeterTo: 'price_m2_to', parkingLotsFrom: 'parking_from', premiseId: 'premise',
  brokerId: 'user', discounted: 'discounted_estate', reserved: 'reserved_estate', priceOnRequest: 'price_on_request_estate'};
const NOT_API = /^(page|limit|timestamp|timestampFrom|include.*)$/;
const PRICE_UNITS = {2: '/měsíc', 6: '/rok', 7: '/den', 8: '/hod.'}; // the other units except 1 (whole estate) are per m²
const czNumber = new Intl.NumberFormat('cs-CZ', {maximumFractionDigits: 0});
let buildId, shownHref, refreshes = 0;
let ours; // the list shown instead of sreality's while a limit is set

const lang = () => document.documentElement.lang || 'cs';

function currentPage() {
  const q = new URLSearchParams(location.search);
  return Number(q.get('strana') || q.get('page')) || 1;
}

function pageUrl(n) {
  const url = new URL(location.href);
  url.searchParams.delete('strana');
  url.searchParams.delete('page');
  if (n > 1) url.searchParams.set(lang() === 'cs' ? 'strana' : 'page', n);
  return url.href;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.split('?')[0]} returned ${res.status}`);
  return res.json();
}

// The filters and result count sreality's server parsed from the page URL.
async function searchData() {
  buildId ??= JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}').buildId;
  const path = location.pathname.replace(/\/$/, '');
  const locale = path.startsWith(`/${lang()}/`) ? '' : `/${lang()}`; // the default locale (cs) has no prefix in page URLs
  const data = await getJson(`/_next/data/${buildId}${locale}${path}.json${location.search}`);
  const q = data.pageProps?.dehydratedState?.queries?.find(q => q.queryKey[0] === 'estatesSearch');
  if (!q) throw new Error('sreality sent no search for this page');
  return {filters: q.queryKey[1], pagination: q.state.data.pagination};
}

function apiParams(filters, limit, offset) {
  const q = new URLSearchParams({limit, offset});
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || NOT_API.test(k) || (typeof v === 'object' && !Array.isArray(v))) continue;
    q.set(API_NAMES[k] || k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), Array.isArray(v) ? v.join(k === 'localitySearchName' ? '|' : ',') : v);
  }
  const poiDistances = filters.pois?.map(p => filters.poisDistanceList?.[p]); // poisDistanceList is keyed by POI
  if (poiDistances?.length && !poiDistances.includes(undefined)) q.set('pois_distance_list', poiDistances);
  return q;
}

// As sreality writes them on its cards: "Dělnická, Praha - Holešovice", "10 590 000 Kč", "25 000 Kč/měsíc"
function locality({street, city, citypart, country, country_id}) {
  return (street ? `${street}, ` : '') + (city || '') + (citypart && citypart !== city ? ` - ${citypart}` : '')
    + (country && country_id !== 112 ? `, ${country}` : ''); // 112: Czech Republic
}

function priceText({price_summary_czk: czk, price_summary_unit_cb: unit}) {
  if (!(czk >= 6)) return 'Cena na vyžádání'; // sreality's own cut-off
  return `${czNumber.format(Math.floor(czk))} Kč${unit?.value > 1 ? PRICE_UNITS[unit.value] || '/m²' : ''}`;
}

// A copy of one of sreality's cards (template) showing the API result r.
function listing(template, r) {
  const li = template.cloneNode(true);
  li.id = `sru-${r.hash_id}`;
  li.querySelectorAll('button, .MuiChip-root').forEach(e => e.remove()); // copies lose React's handlers; badges belong to the template
  const slides = li.querySelector('ul');
  while (slides?.children.length > 1) slides.lastElementChild.remove();
  const image = r.advert_images?.[0];
  for (const img of li.querySelectorAll('img')) {
    img.removeAttribute('srcset');
    img.style.opacity = 1; // sreality fades the photo in over a blurred thumbnail on React's onLoad, which copies don't have
    if (image) img.src = image + (img.getAttribute('src') || '').replace(/^[^?]*/, ''); // keeps the template's size options (?fl=res,800,600,...)
    else img.remove();
  }
  const a = li.querySelector('a');
  // shortcut: keeps the template's category in the path and sreality redirects to the listing's own; build it from codebooks if that redirect goes away
  a.href = a.getAttribute('href').replace(/\d+$/, r.hash_id);
  const [title, place, price, ...rest] = li.querySelectorAll('p');
  rest.forEach(p => p.remove());
  [[title, r.advert_name], [place, locality(r.locality || {})], [price, priceText(r)]].forEach(([p, text]) => {
    p.textContent = text;
    p.removeAttribute('title'); // the template's original-text tooltip
  });
  return li;
}

function showListings(results) {
  const list = document.querySelector(`${LIST}:not([data-sru])`);
  const template = list?.querySelector('li[id^="estate-list-item-"]');
  if (!template) throw new Error('no sreality listing on the page to copy');
  if (!ours) {
    ours = list.cloneNode(false);
    ours.dataset.sru = '';
  }
  list.before(ours); // before sreality's list, so the local sort finds it first
  ours.replaceChildren(...results.map(r => listing(template, r)));
}

// Fills the page picker and, with a limit set, shows that page of listings instead of sreality's.
async function refresh() {
  shownHref = location.href;
  const run = ++refreshes, {limit} = settings, html = document.documentElement;
  const search = SEARCH_PATH.test(location.pathname);
  limitPill.hidden = !search;
  html.toggleAttribute('data-sru-limit', search && limit > 0); // hides sreality's list and pager right away
  if (!search || !limit) ours?.remove();
  if (!search) return;
  try {
    const {filters, pagination} = await searchData();
    const perPage = limit || pagination.limit;
    const total = limit ? pagination.total : pagination.totalWithPromo ?? pagination.total; // sreality's pages include promoted listings
    const pages = Math.ceil(Math.min(total, Math.floor(MAX_RESULTS / perPage) * perPage) / perPage);
    const page = Math.max(1, Math.min(currentPage(), pages));
    const found = limit && await getJson(`/api/v1/estates/search?${apiParams(filters, limit, (page - 1) * limit)}`);
    if (run !== refreshes) return; // the URL or the limit changed meanwhile
    pageSelect.replaceChildren(...Array.from({length: pages}, (_, i) => new Option(`Page ${i + 1} / ${pages}`, i + 1)));
    pageSelect.value = page;
    if (found) showListings(found.results);
    limitPill.title = '';
  } catch (e) {
    if (run !== refreshes) return;
    html.removeAttribute('data-sru-limit');
    ours?.remove();
    limitPill.title = `Could not load the listings: ${e.message}`;
  }
}

document.head.append(Object.assign(document.createElement('style'), {
  textContent: `html[data-sru-limit] :is(${LIST}:not([data-sru]), [data-e2e="pagination"]) { display: none !important; }`,
}));

const host = document.createElement('div');
const shadow = host.attachShadow({mode: 'open'});
shadow.innerHTML = `<style>
  .bar { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px;
         max-width: calc(100vw - 32px); font: 600 13px/1 system-ui, sans-serif; }
  .pill { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: #fff; border-radius: 17px; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); }
  span { display: contents; }
  button, select { all: unset; cursor: pointer; padding: 7px 11px; border-radius: 999px; color: #232b3a; }
  [aria-pressed="true"] { background: #cc0000; color: #fff; }
  .pill:first-child select { width: 1ch; text-align: center; } /* otherwise as wide as the longest currency name */
  button:disabled { cursor: default; opacity: .4; }
  :focus-visible { outline: 2px solid #232b3a; outline-offset: 1px; }
  [hidden] { display: none !important; }
</style><div class="bar">
  <div class="pill" role="group" aria-label="Price currency"><span></span><select aria-label="Add or remove a favorite currency"></select></div>
  <div class="pill" role="group" aria-label="Area unit"></div>
  <div class="pill" role="group" aria-label="Pages" hidden><select aria-label="Listings per page"></select><select aria-label="Page"></select></div>
</div>`;
const [currencyPill, unitPill, limitPill] = shadow.querySelectorAll('.pill');
const [favs, picker] = currencyPill.children;
const [limitSelect, pageSelect] = limitPill.children;

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
limitSelect.append(...LIMITS.map(n => new Option(n ? `${n} / page` : 'Sreality default', n)));
limitSelect.addEventListener('change', async () => {
  await chrome.storage.sync.set({limit: Number(limitSelect.value)});
  if (currentPage() > 1) location.assign(pageUrl(1)); // a new page size starts on page 1
});
pageSelect.addEventListener('change', () => location.assign(pageUrl(Number(pageSelect.value))));

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
  limitSelect.value = settings.limit;
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
  refresh();
  addSortOption(document.body); // the mobile sort drawer stays mounted, so it may be in the page already
  // sreality is a React app: listings load and re-render after page load
  new MutationObserver(muts => {
    if (location.href !== shownHref) refresh(); // sreality changed the search (filters, sort) without reloading
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
    if (changes.limit) refresh();
  });
});
