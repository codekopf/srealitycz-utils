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
const DEFAULTS = {currency: 'EUR', favorites: ['EUR', 'USD'], unit: 'm²', limit: 0, sort: '', sizeSort: '', priceSort: '', ads: false};
const DETAIL = '[data-e2e="detail-heading"]'; // the detail page's title: <h1>Prodej rodinného domu 180 m², pozemek 444 m²<br>Medkova, Praha</h1>
const state = new WeakMap(); // text node -> {orig, shown}
const areaFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 0});
const currencyNames = new Intl.DisplayNames(undefined, {type: 'currency'});
let settings = {...DEFAULTS};
let rates = {CZK: {rate: 1, amount: 1}}; // `amount` units of the currency cost `rate` Kč
let ratesError;
let currency, money; // the currency shown (settings.currency if its rate is known) and its formatter

const num = (int, dec) => Number(`${int.replace(/\D/g, '')}.${dec || 0}`);

const shown = czk => czk * rates[currency].amount / rates[currency].rate; // Kč in the shown currency
const perUnit = () => settings.unit === 'ft²' ? SQFT_PER_M2 : 1; // shown units in a m²

// Kč, or Kč per m², in the shown currency and unit: "€899,384", "€4,524/m²", "€420/ft²"
function formatPrice(czk, perM2) {
  return money.format(shown(czk) / (perM2 ? perUnit() : 1)) + (perM2 ? `/${settings.unit}` : '');
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
  // listing titles ("Prodej bytu 3+kk 68 m²", the card's first <p>, or the detail page's heading followed by its price)
  // get " - €4,524/m²"; read before s.shown changes
  const card = el.matches(DETAIL) ? el.parentElement : el.closest('[data-e2e="estates-list"] > li');
  const perM2 = card?.querySelector(`p, ${DETAIL}`) === el ? pricePerM2(card) : Infinity;
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
// settings.priceSort sorts by price, settings.sort by price per m², settings.sizeSort by area; setting one clears the others.
const NEXT_SORT = {'': 'asc', asc: 'desc', desc: ''}; // '': sreality's order
const SORTS = {priceSort: wholePrice, sort: pricePerM2, sizeSort: size}; // the setting -> the listing's value it sorts by

// The card's original texts ("Prodej bytu 4+1 124 m²", "18 060 650 Kč" or "1 500 Kč/m²").
function cardText(card) {
  const it = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let n; (n = it.nextNode());) {
    const s = state.get(n);
    text += (s && n.data === s.shown ? s.orig : n.data) + '\n'; // \n keeps "Praha 5" and "18 060 650 Kč" apart
  }
  return text;
}

// The card's first price in Kč, whether that's per m², and its first area in m² (the one in its title); Infinity if missing.
function cardNumbers(card) {
  const text = cardText(card);
  const [price] = text.matchAll(PRICE), [area] = text.matchAll(AREA);
  return {czk: price ? num(price[1], price[2]) : Infinity, perM2: !!price?.[3], m2: area ? num(area[1], area[2]) : Infinity};
}

// What the listings sort by. Listings without it (Infinity) go last.
function pricePerM2(card) {
  const {czk, perM2, m2} = cardNumbers(card);
  return perM2 ? czk : m2 < Infinity ? czk / m2 : Infinity;
}

// The price of the whole listing (a rent is per month): a price per m² times the area.
function wholePrice(card) {
  const {czk, perM2, m2} = cardNumbers(card);
  return !perM2 ? czk : m2 < Infinity ? czk * m2 : Infinity;
}

function size(card) {
  return cardNumbers(card).m2;
}

// CSS order keeps the DOM as React left it, so React can still re-render the list correctly.
function sortListings() {
  const key = Object.keys(SORTS).find(k => settings[k]);
  const dir = {asc: 1, desc: -1}[settings[key]];
  for (const list of document.querySelectorAll(LIST)) {
    if (!dir) {
      for (const li of list.children) li.style.order = '';
      continue;
    }
    [...list.children].map(li => [SORTS[key](li), li])
      .sort(([a], [b]) => (a === Infinity) - (b === Infinity) || dir * (a - b) || 0) // no value: last either way
      .forEach(([, li], i) => li.style.order = i);
  }
}

// Listings per page: sreality shows 20 (+2 tips) and its URLs take no page size, but its API takes any limit.
// Its server turns the page URL into API filters, so this asks the server for them (_next/data) and then calls the API itself.
const LIMITS = [0, 50, 100, 250, 500, 750, 1000, 2000, 2500, 5000]; // 0: sreality's own pages
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
  // sreality's photo carousel is React state the copy doesn't have: keep one slide and switch its photo with our own arrows
  const slides = li.querySelector('ul');
  while (slides?.children.length > 1) slides.lastElementChild.remove();
  const photos = r.advert_images || [], imgs = li.querySelectorAll('img');
  let shown = 0;
  const show = n => {
    shown = (n + photos.length) % photos.length;
    for (const img of imgs) img.src = photos[shown] + (img.getAttribute('src') || '').replace(/^[^?]*/, ''); // keeps the template's size options (?fl=res,800,600,...)
  };
  for (const img of imgs) {
    img.removeAttribute('srcset');
    img.style.opacity = 1; // sreality fades the photo in over a blurred thumbnail on React's onLoad, which copies don't have
    if (!photos.length) img.remove();
  }
  if (photos.length) show(0);
  if (photos.length > 1 && slides) {
    slides.parentElement.append(...[[-1, 'Previous photo', '‹'], [1, 'Next photo', '›']].map(([step, label, text]) => {
      const b = Object.assign(document.createElement('button'), {type: 'button', className: `sru-photo sru-${step < 0 ? 'prev' : 'next'}`, textContent: text});
      b.ariaLabel = label;
      b.addEventListener('click', e => {
        e.preventDefault(); // the card is a link
        e.stopPropagation();
        show(shown + step);
      });
      return b;
    }));
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
  limitPill.hidden = adsPill.hidden = !search;
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
    limitTitle('');
  } catch (e) {
    if (run !== refreshes) return;
    html.removeAttribute('data-sru-limit');
    ours?.remove();
    limitTitle(`Could not load the listings: ${e.message}`);
  }
}

document.head.append(Object.assign(document.createElement('style'), {
  textContent: `html[data-sru-limit] :is(${LIST}:not([data-sru]), [data-e2e="pagination"]) { display: none !important; }
    html:not([data-sru-ads]) ${LIST} > li:is([id*="tip-item"], [data-e2e="nativni"]) { display: none !important; } /* sreality's tips (broker-tip-item-1-172703) and native ads (estate-list-native-8) */
    .sru-photo { position: absolute; top: 50%; z-index: 2; translate: 0 -50%; display: flex; align-items: center; justify-content: center;
                 width: 32px; height: 32px; padding: 0 0 3px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .9); color: #232b3a;
                 font: 600 24px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 1px 4px rgba(0, 0, 0, .3); opacity: 0; transition: opacity .2s; }
    .sru-prev { left: 8px; }
    .sru-next { right: 8px; }
    li:hover .sru-photo, .sru-photo:focus-visible { opacity: 1; }
    @media (hover: none) { .sru-photo { opacity: 1; } }`,
}));

const host = document.createElement('div');
const shadow = host.attachShadow({mode: 'open'});
shadow.innerHTML = `<style>
  .bar { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px;
         max-width: calc(100vw - 180px); font: 600 13px/1 system-ui, sans-serif; } /* leaves room for the mortgage button */
  .pill { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: #fff; border-radius: 17px; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); }
  .pill > span { display: contents; }
  button, select { all: unset; cursor: pointer; padding: 7px 11px; border-radius: 999px; color: #232b3a; }
  [aria-pressed="true"] { background: #cc0000; color: #fff; }
  .pill:first-child select { width: 1ch; text-align: center; } /* otherwise as wide as the longest currency name */
  button:disabled { cursor: default; opacity: .4; }
  :focus-visible { outline: 2px solid #232b3a; outline-offset: 1px; }
  [hidden] { display: none !important; }
  .calc { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          max-height: calc(100vh - 32px); font: 600 13px/1 system-ui, sans-serif; color: #232b3a; }
  form { box-sizing: border-box; width: 300px; max-width: calc(100vw - 32px); min-height: 0; overflow: auto; padding: 12px; background: #fff;
         border-radius: 17px; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); font-weight: 400; line-height: 1.4; }
  label { display: grid; grid-template-columns: 1fr 8em 4.5em; align-items: center; gap: 6px; margin-bottom: 6px; }
  .check { display: flex; }
  input[type="number"] { font: inherit; color: inherit; min-width: 0; padding: 3px 6px; border: 1px solid #c9ccd3; border-radius: 6px; text-align: right; }
  input:disabled, input[readonly] { background: #f1f2f4; }
  p { margin: 8px 0; }
  .sum b { font-size: 18px; }
  .chart { display: block; width: 100%; height: 80px; }
  .chart rect { stroke: #fff; } /* the gap between the bars and their two parts */
  .chart .hit { fill: transparent; stroke: none; }
  .chart g:hover .hit { fill: #f1f2f4; }
  .p { fill: #2a78d6; background: #2a78d6; }
  .i { fill: #eb6834; background: #eb6834; }
  .legend { color: #626d82; font-size: 12px; }
  .legend i { display: inline-block; width: 10px; height: 10px; margin-right: 4px; border-radius: 2px; vertical-align: -1px; }
  summary { cursor: pointer; font-weight: 600; }
  .scroll { max-height: 180px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  th, td { padding: 2px 4px; text-align: right; }
  th { position: sticky; top: 0; background: #fff; }
</style><div class="bar">
  <div class="pill" role="group" aria-label="Price currency"><span></span><select aria-label="Add or remove a favorite currency"></select></div>
  <div class="pill" role="group" aria-label="Area unit"></div>
  <div class="pill" role="group" aria-label="Listings" hidden><select aria-label="Listings per page"></select><select aria-label="Page"></select><button></button><button></button><button></button></div>
  <div class="pill" role="group" aria-label="Advertisements" hidden><button></button></div>
</div><div class="calc">
  <form aria-label="Mortgage calculator" hidden>
    <label class="check"><input type="checkbox" name="fromArea" checked><span data-u="Price from area × price per m²"></span></label>
    <label>Area<input type="number" name="area" min="0" step="any"><span data-u="m²"></span></label>
    <label><span data-u="Price per m²"></span><input type="number" name="perArea" min="0" step="any"><span data-u="¤/m²"></span></label>
    <label>Price<input type="number" name="price" min="0" step="any"><span data-u="¤"></span></label>
    <label>Loan<input type="number" name="loan" min="0" step="any"><span data-u="¤"></span></label>
    <label>Interest<input type="number" name="rate" min="0" step="any" value="4.5"><span>% a year</span></label>
    <label>Term<input type="number" name="years" min="1" max="50" step="any" value="30"><span>years</span></label>
    <p class="hint">Fill in the loan, the interest and the term.</p>
    <div class="out">
      <p class="sum"></p>
      <svg class="chart" viewBox="0 0 276 80" preserveAspectRatio="none" role="img" aria-label="Principal and interest paid each year"></svg>
      <p class="legend"><i class="p"></i>Principal <i class="i"></i>Interest, paid each year. Hover a year for its numbers.</p>
      <details><summary>All payments</summary><div class="scroll"><table>
        <thead><tr><th>#</th><th>Interest</th><th>Principal</th><th>Balance</th></tr></thead><tbody></tbody>
      </table></div></details>
    </div>
  </form>
  <div class="pill"><button type="button" aria-expanded="false" title="Mortgage calculator: monthly payment, interest and all payments">⌂ mortgage</button></div>
</div>`;
const [currencyPill, unitPill, limitPill, adsPill] = shadow.querySelectorAll('.bar .pill');
const [favs, picker] = currencyPill.children;
const [limitSelect, pageSelect, priceButton, sortButton, sizeButton] = limitPill.children;
const adsButton = adsPill.firstElementChild;

function button(key, value, title) {
  const b = document.createElement('button');
  b.textContent = value;
  b.title = title;
  Object.assign(b.dataset, {key, value});
  return b;
}

unitPill.append(button('unit', 'm²', 'Show areas in m², as sreality does'), button('unit', 'ft²', 'Show areas in ft² and prices per ft²'));
picker.title = 'Add or remove a favorite currency';

// Hovering a select shows its own title, not the bubble's, so the error goes on all three.
function limitTitle(error) {
  limitPill.title = error;
  limitSelect.title = error || 'Listings per page';
  pageSelect.title = error || 'Go to another page of the listings';
}
limitTitle('');
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
for (const [b, key] of [[priceButton, 'priceSort'], [sortButton, 'sort'], [sizeButton, 'sizeSort']]) {
  b.addEventListener('click', () => chrome.storage.sync.set({priceSort: '', sort: '', sizeSort: '', [key]: NEXT_SORT[settings[key]]}));
}
adsButton.addEventListener('click', () => chrome.storage.sync.set({ads: !settings.ads}));

function renderFavorites() {
  const list = ['CZK', ...settings.favorites]; // CZK always first
  if (favs.dataset.list === String(list)) return; // rebuilding would drop keyboard focus
  favs.dataset.list = list;
  favs.replaceChildren(...list.map(c => {
    const r = rates[c];
    const title = c === 'CZK' ? 'Show the original prices in Kč'
      : r ? `Show prices in ${currencyNames.of(c)} (${r.source}, ${r.validFor}: ${r.amount} ${c} = ${r.rate} Kč)` : `${c}: no rate available`;
    return Object.assign(button('currency', c, title), {disabled: !r});
  }));
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
  for (const b of shadow.querySelectorAll('button[data-key]')) {
    b.setAttribute('aria-pressed', b.dataset.value === (b.dataset.key === 'unit' ? settings.unit : currency));
  }
  const {unit, ads} = settings;
  const symbol = money.formatToParts(0).find(p => p.type === 'currency').value; // "€", "Kč", "$"
  for (const [b, key, label, by, low, high] of [
    [priceButton, 'priceSort', symbol, 'price', 'cheapest first', 'most expensive first'],
    [sortButton, 'sort', `${symbol}/${unit}`, `price per ${unit}`, 'cheapest first', 'most expensive first'],
    [sizeButton, 'sizeSort', 'size', 'size', 'smallest first', 'largest first'],
  ]) {
    const dir = settings[key];
    b.textContent = `⇅ ${dir ? `${dir} ` : ''}${label}`;
    b.setAttribute('aria-pressed', !!dir);
    b.title = b.ariaLabel = `Sort the listings on this page by ${by}: ${{'': "sreality's order", asc: low, desc: high}[dir]}`;
  }
  document.documentElement.toggleAttribute('data-sru-ads', ads);
  adsButton.textContent = `adv ${ads ? '✓' : '✕'}`;
  adsButton.setAttribute('aria-pressed', ads);
  adsButton.title = adsButton.ariaLabel = `Advertisements (sreality's tips) among the listings: ${ads ? 'shown' : 'hidden'}`;
  const r = rates[currency];
  currencyPill.title = ratesError ? `Exchange rate unavailable: ${ratesError}`
    : currency === 'CZK' ? '' : `${r.source}, ${r.validFor}: ${r.amount} ${currency} = ${r.rate} Kč`;
  for (const e of calcForm.querySelectorAll('[data-u]')) e.textContent = e.dataset.u.replace('¤', symbol).replace('m²', unit);
  fillCalc();
  walk(document.body);
}

// The mortgage calculator in the bottom-right corner. It keeps amounts in Kč and areas in m², so switching the currency or unit converts them.
const LTV = 0.8; // the loan sreality's own calculator assumes: 80 % of the price
const calc = {area: NaN, perArea: NaN, price: NaN, loan: NaN, filledFrom: ''}; // m², Kč per m², Kč, Kč; the detail page it was filled from
const toShown = {area: m2 => m2 * perUnit(), perArea: czk => shown(czk) / perUnit(), price: shown, loan: shown};
const calcBox = shadow.querySelector('.calc');
const [calcForm, calcPill] = calcBox.children;
const calcButton = calcPill.firstElementChild;
const calcInputs = calcForm.elements;
const [hint, out] = calcForm.querySelectorAll('.hint, .out');
const [sum, chart, tbody] = out.querySelectorAll('.sum, .chart, tbody');

// A loan repaid in equal monthly payments: the payment, and for each month the interest, the principal and the balance left after it.
function mortgage(loan, ratePerYear, years) {
  const r = ratePerYear / 1200, n = Math.round(years * 12);
  const pay = r ? loan * r / (1 - (1 + r) ** -n) : loan / n;
  const months = [];
  for (let balance = loan; months.length < n;) {
    const interest = balance * r;
    balance -= pay - interest;
    months.push({interest, principal: pay - interest, balance: Math.max(balance, 0)}); // max: rounding leaves -0.000001 at the end
  }
  return {pay, months};
}

// Writes the fields, except the one being typed in, in the shown currency and unit, and the results.
function fillCalc(typing) {
  for (const k in toShown) if (k !== typing) calcInputs[k].value = Number.isFinite(calc[k]) ? Math.round(toShown[k](calc[k])) : '';
  const fromArea = calcInputs.fromArea.checked, rate = calcInputs.rate.valueAsNumber, years = calcInputs.years.valueAsNumber, {loan, price} = calc;
  calcInputs.area.disabled = calcInputs.perArea.disabled = !fromArea;
  calcInputs.price.readOnly = fromArea;
  const ok = loan > 0 && loan < Infinity && rate >= 0 && years > 0 && years <= 50;
  hint.hidden = ok;
  out.hidden = !ok;
  if (!ok) return;
  const {pay, months} = mortgage(loan, rate, years);
  const m = czk => money.format(shown(czk));
  const total = (list, k) => list.reduce((s, x) => s + x[k], 0);
  sum.innerHTML = `<b>${m(pay)}</b> a month, ${months.length} payments<br>`
    + `Loan ${m(loan)}${price > 0 && price < Infinity ? `, ${Math.round(loan / price * 100)} % of ${m(price)}` : ''}<br>`
    + `Interest ${m(total(months, 'interest'))}, paid in total ${m(pay * months.length)}`;
  const yearly = [];
  for (let i = 0; i < months.length; i += 12) yearly.push(months.slice(i, i + 12));
  const max = Math.max(...yearly.map(y => total(y, 'principal') + total(y, 'interest'))), w = 276 / yearly.length;
  chart.innerHTML = yearly.map((y, i) => {
    const principal = total(y, 'principal'), interest = total(y, 'interest'), hp = principal / max * 80, hi = interest / max * 80;
    return `<g><title>Year ${i + 1}: principal ${m(principal)}, interest ${m(interest)}, balance ${m(y.at(-1).balance)}</title>`
      + `<rect class="hit" x="${i * w}" width="${w}" height="80"/><rect class="p" x="${i * w}" y="${80 - hp}" width="${w}" height="${hp}"/>`
      + `<rect class="i" x="${i * w}" y="${80 - hp - hi}" width="${w}" height="${hi}"/></g>`;
  }).join('');
  tbody.innerHTML = months.map((x, i) => `<tr><td>${i + 1}</td><td>${m(x.interest)}</td><td>${m(x.principal)}</td><td>${m(x.balance)}</td></tr>`).join('');
}

function toggleCalc(open) {
  const card = document.querySelector(DETAIL)?.parentElement;
  if (open && card && calc.filledFrom !== location.pathname) { // a listing's detail page not filled in yet: start from its price
    Object.assign(calc, {filledFrom: location.pathname, area: size(card), perArea: pricePerM2(card), price: wholePrice(card)});
    calc.loan = calc.price * LTV;
  }
  calcForm.hidden = !open;
  calcButton.setAttribute('aria-expanded', open);
  if (open) fillCalc();
}

calcForm.addEventListener('input', ({target: {name, valueAsNumber, checked}}) => {
  if (name in toShown) calc[name] = valueAsNumber / toShown[name](1);
  if (['area', 'perArea', 'price'].includes(name) || name === 'fromArea' && checked) { // a new price, which resets the loan
    if (calcInputs.fromArea.checked) calc.price = calc.area * calc.perArea;
    calc.loan = calc.price * LTV;
  }
  fillCalc(name);
});
calcButton.addEventListener('click', () => toggleCalc(calcForm.hidden));
// closes on a click outside it; capture, as sreality's own handlers may stop the click
document.addEventListener('click', e => !calcForm.hidden && !e.composedPath().includes(calcBox) && toggleCalc(false), true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || calcForm.hidden) return;
  toggleCalc(false);
  calcButton.focus();
});

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
  sortListings();
  // sreality is a React app: listings load and re-render after page load
  new MutationObserver(muts => {
    if (location.href !== shownHref) refresh(); // sreality changed the search (filters, sort) without reloading
    let listChanged = false;
    for (const m of muts) {
      if (m.type === 'characterData') {
        convertNode(m.target);
        continue;
      }
      m.addedNodes.forEach(walk);
      if (m.target.dataset?.e2e === 'estates-list') listChanged = true;
    }
    if (listChanged) sortListings(); // other listings loaded (next page, filter, sreality's sort): sort them too
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) settings[k] = changes[k].newValue ?? DEFAULTS[k];
    render();
    if (changes.limit) refresh();
    if (Object.keys(SORTS).some(k => changes[k])) sortListings();
  });
});
