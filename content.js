// Rewrites CZK prices on sreality.cz into EUR/USD and adds a CZK | EUR | USD switcher to every page.
// "21 900 000 Kč", "25 000 Kč/měsíc", "1 234,50 Kč"; sreality separates thousands with a no-break space.
// shortcut: abbreviated amounts like "30 tis. Kč" stay in CZK, handle them if they show up in prices.
const PRICE = /(?<![\d,.])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:,(\d+))?[   ]?Kč/g;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
const state = new WeakMap(); // text node -> {orig, shown}
let currency = 'CZK';
let rates = null; // CZK per 1 EUR / 1 USD, from background.js
let format;

function convert(text) {
  if (currency === 'CZK' || !rates) return text;
  return text.replace(PRICE, (_, int, dec) => format.format(Number(`${int.replace(/\D/g, '')}.${dec || 0}`) / rates[currency]));
}

function convertNode(node) {
  const el = node.parentElement;
  if (!el || SKIP.has(el.nodeName)) return; // no parent: React removed it before the observer ran
  let s = state.get(node);
  if (!s || node.data !== s.shown) { // first visit, or the site re-rendered the text
    if (!node.data.includes('Kč')) return;
    s = {orig: node.data};
    state.set(node, s);
  }
  s.shown = convert(s.orig);
  if (node.data === s.shown) return;
  node.data = s.shown;
  const orig = s.orig.trim();
  if (s.shown !== s.orig) el.title = orig; // hover shows the original CZK price
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
  div { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 2px; padding: 3px;
        background: #fff; border-radius: 999px; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); font: 600 13px/1 system-ui, sans-serif; }
  button { all: unset; cursor: pointer; padding: 7px 11px; border-radius: 999px; color: #232b3a; }
  button[aria-pressed="true"] { background: #cc0000; color: #fff; }
  button:disabled { cursor: default; opacity: .4; }
  button:focus-visible { outline: 2px solid #232b3a; outline-offset: 1px; }
</style><div role="group" aria-label="Price currency">${['CZK', 'EUR', 'USD'].map(c => `<button data-c="${c}">${c}</button>`).join('')}</div>`;
const bar = shadow.querySelector('div');
bar.addEventListener('click', e => e.target.dataset.c && chrome.storage.sync.set({currency: e.target.dataset.c}));

function render() {
  format = new Intl.NumberFormat(undefined, {style: 'currency', currency, maximumFractionDigits: 0});
  for (const b of bar.children) b.setAttribute('aria-pressed', b.dataset.c === currency);
  walk(document.body);
}

Promise.all([
  chrome.storage.sync.get({currency: 'EUR'}),
  chrome.runtime.sendMessage('rates').catch(e => ({error: e.message})),
]).then(([stored, r]) => {
  if (r?.EUR) {
    rates = r;
    currency = stored.currency;
    bar.title = `ČNB rate of ${r.validFor}: 1 EUR = ${r.EUR} Kč, 1 USD = ${r.USD} Kč`;
  } else {
    bar.title = `Exchange rate unavailable: ${r?.error}`;
    for (const b of bar.children) b.disabled = b.dataset.c !== 'CZK';
  }
  document.body.append(host);
  render();
  // sreality is a React app: listings load and re-render after page load
  new MutationObserver(muts => {
    for (const m of muts) m.type === 'characterData' ? convertNode(m.target) : m.addedNodes.forEach(walk);
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  chrome.storage.onChanged.addListener(ch => {
    if (ch.currency && rates) {
      currency = ch.currency.newValue;
      render();
    }
  });
});
