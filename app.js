/* RAMEN SHO POS — app
   Views: HOME / ORDER / KITCHEN / EXPENSE / STOCK / REPORT / HISTORY (+ SHIFT, RECIPE)
   All records live in localStorage first and are mirrored to the sheet by SheetSync. */

/* ── storage ───────────────────────────────────────────── */
const K = {
  orders: 'sho_orders', expenses: 'sho_expenses', register: 'sho_register', clockedIn: 'sho_clocked_in', audit: 'sho_audit',
  staff: 'sho_staff', curStaff: 'sho_current_staff', served: 'sho_served', target: 'sho_month_target',
  moves: 'sho_moves', meal: 'sho_meal_allowance',
};
const load = (k, def = []) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch (e) { return def; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const orders = () => load(K.orders);
const expenses = () => load(K.expenses);
const moves = () => load(K.moves);
const sessions = () => load(K.register);
const clockedIn = () => load(K.clockedIn);
const staffList = () => load(K.staff);
const currentStaff = () => localStorage.getItem(K.curStaff) || '';
const servedIds = () => new Set(load(K.served));
function addAudit(entry) {
  const a = load(K.audit); a.push({ at: new Date().toISOString(), ...entry });
  save(K.audit, a.slice(-2000));
}

/* ── helpers ───────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
// Wall-clock stamp used for register windows and the time clock; sorts correctly as text.
const stampOf = (d = new Date()) => `${dateKey(d)} ${timeKey(d)}:${pad(d.getSeconds())}`;
const hhmm = st => String(st || '').slice(11, 16);
function hoursSince(st) {
  const m = String(st).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/); if (!m) return 0;
  return (Date.now() - new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime()) / 3600000;
}
const dur = h => `${Math.floor(h)}h ${pad(Math.floor((h % 1) * 60))}m`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clone = o => JSON.parse(JSON.stringify(o));
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1800);
}
function stampLabel(iso) {
  if (!iso) return 'never';
  const d = new Date(iso); return `${dateKey(d)} ${timeKey(d)}`;
}

/* ── menu ──────────────────────────────────────────────── */
const CAT_ORDER = ['Ramen', 'B1T1', 'Don', 'Side', 'Drink'];
const CAT_ICON = { Ramen: '🍜', B1T1: '🍜🍜', Don: '🍚', Side: '🍗', Drink: '🥤' };
const MENU = { items: [], toppings: [], sets: [], source: 'built-in', fetchedAt: null };

// Stock the POS subtracts from sales (same keys as USE in Code.gs). Soup bases are in bowls; the
// stock screen converts them to bags (Settings base_servings_per_bag, 40).
const USE_KEYS = ['noodleW', 'noodleY', 'ajitama', 'karaage', 'baseTon', 'baseTan', 'kaeshi'];
// usage recorded in bowls / ml, counted in bags / bottles: divide by the container size (Settings)
const PER_CONTAINER = { baseTon: () => servingsPerBag(), baseTan: () => servingsPerBag(), kaeshi: () => Number(localStorage.getItem('sho_kaeshi_ml')) || 500 };
// The stock check list: count items (number) and level items (Enough / Low / Out). The "Stock Items" sheet overrides it.
let STOCK_ITEMS = (() => { const c = load('sho_stock_items', null); return Array.isArray(c) && c.length ? c : DEFAULT_STOCK_ITEMS.slice(); })();
const LEVELS = ['Enough', 'Low', 'Out'];
const servingsPerBag = () => Number(localStorage.getItem('sho_servings_per_bag')) || 40;
// usage values: number, or null = not known yet (never guessed as 0)
function normUsage(u) {
  return Object.fromEntries(USE_KEYS.map(k => {
    const v = u ? u[k] : undefined;
    return [k, v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v)];
  }));
}
function addUsage(total, u, times = 1) {
  USE_KEYS.forEach(k => { total[k] = total[k] === null || u[k] === null ? null : total[k] + u[k] * times; });
  return total;
}

function truthy(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
function applyMenu(rows, source, fetchedAt) {
  const norm = rows.map(r => ({
    type: String(r.type || '').toUpperCase(), id: String(r.id || ''), name: String(r.name || ''),
    category: String(r.category || ''), price: Number(r.price) || 0, bowls: Number(r.bowls) || 0,
    icon: r.icon || '', active: r.active === undefined ? true : truthy(r.active), for: String(r.for || ''),
    usage: normUsage(r.usage), fee: Number(r.fee) || 0, dineInOnly: truthy(r.dineInOnly),
  })).filter(r => r.id && r.name && r.active);
  MENU.items = norm.filter(r => r.type === 'ITEM')
    .sort((a, b) => rank(a.category) - rank(b.category));
  MENU.toppings = norm.filter(r => r.type === 'TOPPING');
  MENU.sets = norm.filter(r => r.type === 'SET');
  MENU.source = source; MENU.fetchedAt = fetchedAt;
}
function rank(c) { const i = CAT_ORDER.indexOf(c); return i < 0 ? CAT_ORDER.length : i; }
function categories() { return [...new Set(MENU.items.map(i => i.category))]; }
function iconOf(item) { return item.icon || CAT_ICON[item.category] || '🍽️'; }
function itemById(id) { return MENU.items.find(i => i.id === id); }
function isRamen(item) { return Number(item.bowls) > 0; }
function setsFor(item) { return MENU.sets.filter(s => s.for === item.id); }

function initMenu() {
  const c = SheetSync.cachedMenu();
  if (c && c.rows && c.rows.length) applyMenu(c.rows, 'sheet', c.fetchedAt);
  else applyMenu(DEFAULT_MENU, 'built-in', null);
}
async function refreshMenu(silent) {
  try {
    const p = await SheetSync.fetchMenu();
    if (!p.rows.length) throw new Error('empty menu');
    applyMenu(p.rows, 'sheet', p.fetchedAt);
    if (!silent) toast('Menu updated');
  } catch (e) {
    if (!silent) alert(SheetSync.enabled ? 'Could not reach the sheet. Using the saved menu.' : 'Sheet link is not set up yet (config.js). Using the built-in menu.');
  }
  if (state.view === 'order' && !state.detail) render();
}

/* ── order lines ───────────────────────────────────────── */
// line: {id,name,category,bowls,price,qty,set:{id,name,price}|null,toppings:[{id,name,price,qty}],note,usage}
// set.price = amount charged on top of the ramen (set total − ramen price).
// usage = stock used by ONE unit of the line, frozen at sale time so later menu edits never rewrite it.
function unitPrice(l) {
  return l.price + (l.set ? l.set.price : 0) + (l.toppings || []).reduce((a, t) => a + t.price * t.qty, 0);
}
function lineTotal(l) { return unitPrice(l) * l.qty; }
function lineKey(l) {
  return JSON.stringify([l.id, l.set?.id || '', (l.toppings || []).map(t => t.id + 'x' + t.qty).sort(), l.note || '']);
}
function lineExtras(l) {
  const parts = [];
  if (l.set) parts.push(l.set.name);
  (l.toppings || []).forEach(t => parts.push(`+${t.name}${t.qty > 1 ? ' ×' + t.qty : ''}`));
  if (l.note) parts.push(`“${l.note}”`);
  return parts;
}
function cartTotal() { return state.cart.reduce((a, l) => a + lineTotal(l), 0); }
// Take-out container fee (flyer: ₱15 noodles / rice dishes, ₱10 sides), one per unit, added automatically.
function feeLines() {
  if (state.mode !== 'TAKEOUT') return [];
  const byFee = {};
  state.cart.forEach(l => { if (!isFee(l) && l.fee > 0) byFee[l.fee] = (byFee[l.fee] || 0) + l.qty; });
  return Object.entries(byFee).map(([fee, qty]) => ({
    id: 'FEE-' + fee, name: 'Take-out container ₱' + fee, category: 'Fee', bowls: 0, price: Number(fee), qty,
    set: null, toppings: [], note: '', usage: normUsage(Object.fromEntries(USE_KEYS.map(k => [k, 0]))), fee: 0,
  }));
}
function orderLines() { return [...state.cart.filter(l => !isFee(l)), ...feeLines()]; }
function orderTotal() { return orderLines().reduce((a, l) => a + lineTotal(l), 0); }
const dineInOnlyInCart = () => state.cart.filter(l => l.dineInOnly);
function guestsDefault() { return Math.max(1, state.cart.reduce((a, l) => a + (Number(l.bowls) || 0) * l.qty, 0)); }
function cartQty() { return state.cart.reduce((a, l) => a + l.qty, 0); }
function addLine(line) {
  const same = state.cart.find(l => lineKey(l) === lineKey(line));
  if (same) same.qty = Math.min(99, same.qty + line.qty); else state.cart.push(line);
}
function baseLine(item, qty = 1) {
  return { id: item.id, name: item.name, category: item.category, bowls: item.bowls, price: item.price, qty, set: null, toppings: [], note: '', usage: normUsage(item.usage),
    fee: Number(item.fee) || 0, dineInOnly: !!item.dineInOnly };
}

/* ── metrics ───────────────────────────────────────────── */
function orderBowls(o) { return o.items.reduce((a, l) => a + (Number(l.bowls) || 0) * l.qty, 0); }
function orderHasSide(o) { return o.items.some(l => l.set || l.category === 'Side' || l.category === 'Don'); }
const isFee = l => l.category === 'Fee';
// Only Purchase / Expense are spending. Top-up / Removal / Transfer just move money.
const isSpend = e => !e.kind || e.kind === 'Purchase' || e.kind === 'Expense';
function summarize(os) {
  const sales = os.reduce((a, o) => a + o.total, 0);
  const bowls = os.reduce((a, o) => a + orderBowls(o), 0);
  const ramenOrders = os.filter(o => orderBowls(o) > 0);
  const attached = ramenOrders.filter(orderHasSide).length;
  const toppingBowls = os.reduce((a, o) => a + o.items.filter(l => l.toppings && l.toppings.length).reduce((s, l) => s + l.qty, 0), 0);
  const cash = os.filter(o => o.payment === 'CASH').reduce((a, o) => a + o.total, 0);
  return {
    sales, bowls, orders: os.length, cash, gcash: sales - cash, guests: os.reduce((a, o) => a + (Number(o.guests) || 1), 0),
    avg: os.length ? sales / os.length : 0,
    attach: ramenOrders.length ? attached / ramenOrders.length : 0,
    toppingRate: bowls ? toppingBowls / bowls : 0,
    dineIn: os.filter(o => o.mode !== 'TAKEOUT').length, takeout: os.filter(o => o.mode === 'TAKEOUT').length,
  };
}
function totals(date = dateKey()) {
  const os = orders().filter(o => o.date === date), es = expenses().filter(e => e.date === date && isSpend(e));
  const s = summarize(os);
  const exp = es.reduce((a, e) => a + e.amount, 0);
  const cashExp = es.filter(e => e.payment === 'CASH').reduce((a, e) => a + e.amount, 0);
  return { ...s, exp, cashExp, net: s.sales - exp, expectedCash: s.cash - cashExp };
}
const pct = x => Math.round(x * 100) + '%';

/* ── state ─────────────────────────────────────────────── */
const state = {
  view: 'home', cart: [], menuCat: null, detail: null, checkout: false,
  payment: 'CASH', mode: 'DINEIN', ref: '', cashGiven: '', orderDateTime: null, editingOrderId: null,
  kitchenShowServed: false,
  expPreset: null, expManual: false, editingExpenseId: null,
  stockCat: null, stockOnlyLow: false, stockEdit: null,
  historyTab: 'sales', historyDate: null, reportMonth: null, recipeId: null,
  regClosing: false, checkoutAfterClose: false, moneyForm: false, moneyKind: null, moveForm: null, stockCheck: false, soldOutMode: false,
};
const PRESETS = { rows: [], fetchedAt: null };
const INVENTORY = { rows: [], fetchedAt: null };

/* ── render ────────────────────────────────────────────── */
const VIEWS = {
  home: homeView, order: orderView, kitchen: kitchenView, expense: expenseView, stock: stockView,
  report: reportView, history: historyView, shift: shiftView, recipe: recipeView,
};
function render() {
  $('#app').innerHTML = (VIEWS[state.view] || homeView)();
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  const q = cartQty(), badge = $('[data-order-badge]');
  badge.textContent = q > 99 ? '99+' : q; badge.hidden = q === 0;
  const waiting = kitchenQueue().length, kb = $('[data-kitchen-badge]');
  kb.textContent = waiting; kb.hidden = waiting === 0;
  updateSyncBadge();
  bind();
}
function updateSyncBadge() {
  const pend = SheetSync.pending(), sb = $('#syncState');
  const last = localStorage.getItem('sho_last_sync');
  sb.textContent = !SheetSync.enabled ? 'LOCAL ONLY' : pend ? `⏳ ${pend} to send` : last ? `✓ synced ${timeKey(new Date(last))}` : 'not synced yet';
  sb.className = 'sync ' + (!SheetSync.enabled ? 'off' : pend || !last ? 'wait' : 'ok');
}
function go(view) {
  state.view = view; state.detail = null; state.checkout = false; state.expPreset = null; state.expManual = false;
  state.editingExpenseId = null; state.stockEdit = null; state.recipeId = null; state.historyDate = null; state.regClosing = false; state.moneyForm = false; state.moveForm = null; state.laborPay = null; state.stockCheck = false; state.soldOutMode = false;
  render(); window.scrollTo(0, 0);
}

/* ── HOME ──────────────────────────────────────────────── */
function staffCard() {
  const cur = currentStaff(), list = [...new Set([...staffList(), cur].filter(Boolean))];
  const me = myClock();
  return `<div class="card staff-card">
    <div class="section-title">👤 Who is using this phone</div>
    <div class="staff-row">
      <select id="staffSelect" class="input"><option value="">-- Select --</option>
        ${list.map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <button class="btn" data-add-staff>＋ Add</button>
    </div>
    ${cur ? (me
      ? `<div class="clock-row on"><span>🟢 On duty since <b>${hhmm(me.in)}</b> · ${dur(hoursSince(me.in))}</span><button class="btn danger" data-clock-out>CHECK OUT</button></div>`
      : `<div class="clock-row"><span>⚪ Not checked in</span><button class="btn primary" data-clock-in>CHECK IN</button></div>`) : ''}
  </div>`;
}
function registerCard() {
  const s = openSession();
  if (!s) return `<button class="card reg-card closed" data-go="shift"><b>🔒 Register is closed</b><small>Open it at the start of your shift →</small></button>`;
  const f = sessionFigures(s);
  return `<button class="card reg-card" data-go="shift"><b>💵 Register open · since ${hhmm(s.openedAt)} (${esc(s.openedBy)})</b>
    <small>Cash that should be in the drawer now: <b>${peso(f.expectedCash)}</b> · GCash sales ${peso(f.gcashSales)}</small></button>`;
}
function homeView() {
  const t = totals();
  const waiting = kitchenQueue().length;
  return `${staffCard()}${registerCard()}
  ${needsAfternoonCheck() ? '<button class="card todo check" data-stock-check-go><b>⏰ 15:00 stock check</b><small>Check before the dinner rush so there is time to prep.</small></button>' : ''}
  ${todoCard(false)}
  <div class="card hero">
    <div class="label">TODAY SALES · ${dateKey()}</div>
    <div class="big">${peso(t.sales)}</div>
    <div class="kpis">
      <div><b>${t.bowls}</b><small>bowls</small></div>
      <div><b>${t.guests}</b><small>guests</small></div>
      <div><b>${peso(Math.round(t.avg))}</b><small>avg ticket</small></div>
      <div><b>${pct(t.attach)}</b><small>side attach</small></div>
    </div>
  </div>
  <div class="grid2">
    <button class="btn big-btn primary" data-go="order">🍜 ORDER<small>Take an order</small></button>
    <button class="btn big-btn kitchen-btn" data-go="kitchen">👨‍🍳 KITCHEN<small>${waiting} waiting</small></button>
    <button class="btn big-btn" data-go="expense">🧾 EXPENSE<small>Record a cost</small></button>
    <button class="btn big-btn danger-soft" data-go="shift">💵 SHIFT<small>Open / close register</small></button>
  </div>
  <button class="btn btn-wide" data-go="recipe">📖 RECIPES <small>Bowl SOP</small></button>
  <div class="card">
    <div class="section-title">Today’s summary <small class="muted">(all devices)</small></div>
    <div class="row"><span>Cash</span><b>${peso(t.cash)}</b></div>
    <div class="row"><span>GCash</span><b>${peso(t.gcash)}</b></div>
    <div class="row"><span>Dine-in / Take-out</span><b>${t.dineIn} / ${t.takeout}</b></div>
    <div class="row"><span>Expenses</span><b>-${peso(t.exp)}</b></div>
    <div class="row total-row"><span>Net</span><b>${peso(t.net)}</b></div>
  </div>`;
}

/* ── ORDER ─────────────────────────────────────────────── */
function orderView() {
  if (state.checkout) return checkoutView();
  if (state.detail) return detailView();
  const cats = categories();
  const list = MENU.items.filter(i => !state.menuCat || i.category === state.menuCat);
  const inCart = id => state.cart.filter(l => l.id === id).reduce((a, l) => a + l.qty, 0);
  const sold = soldOutIds(), short = shortItems();
  return `${state.cart.length ? `<div class="sticky-sum">
      <div><b>Current order (${cartQty()})</b><span>${peso(cartTotal())}</span></div>
      <button class="btn primary" data-checkout>🛒 CHECKOUT</button></div>` : ''}
    ${state.editingOrderId ? '<div class="notice">Editing a past order — add items, then CHECKOUT to save.</div>' : ''}
    ${state.soldOutMode ? '<div class="notice alert">⛔ Tap an item to mark it SOLD OUT (tap again when it is back). Every phone sees it.</div>' : ''}
    <div class="tabs">
      <button class="tab ${state.menuCat ? '' : 'active'}" data-menu-cat="">ALL</button>
      ${cats.map(c => `<button class="tab ${state.menuCat === c ? 'active' : ''}" data-menu-cat="${esc(c)}">${CAT_ICON[c] || ''} ${esc(c)}</button>`).join('')}
    </div>
    <div class="menu-grid">${list.map(i => {
      const q = inCart(i.id), out = sold.has(i.id), low = short[i.id];
      return `<button class="menu-card ${isRamen(i) ? 'is-ramen' : ''} ${out ? 'sold-out' : ''}" data-item="${esc(i.id)}">
        <span class="menu-icon">${iconOf(i)}${q ? `<span class="qty-badge">${q}</span>` : ''}</span>
        <span class="menu-name">${esc(i.name)}</span>
        <span class="menu-price">${out ? '<b class="bad">SOLD OUT</b>' : peso(i.price)}</span>
        ${!out && low ? `<small class="bad">⚠ ${esc(low)} may be out</small>` : ''}
      </button>`;
    }).join('')}</div>
    <p class="help">Ramen opens options (toppings). Sides &amp; drinks are added with one tap.</p>
    <button class="btn wide ${state.soldOutMode ? 'danger' : ''}" data-sold-out-mode>${state.soldOutMode ? '✓ Done marking sold out' : '⛔ Mark an item sold out'}</button>
    <div class="meta"><small class="muted">Menu: ${MENU.source === 'sheet' ? 'sheet, ' + stampLabel(MENU.fetchedAt) : 'built-in list'}</small>
      <button class="btn small" data-menu-refresh>🔄 Refresh menu</button></div>`;
}

// Sets are "this ramen + a don". Nothing is pre-selected: staff offer the set once, and
// "ramen only" stays if the customer says no (メニュー・原価設計: 押し売りにしない).
function openDetail(item) {
  state.detail = { item, qty: 1, note: '', setId: '', tops: {} };
}
function setUpgrade(item, set) { return set.price - item.price; }
// For a SET row, Category holds the ID of the item it adds (e.g. D-KAD), used to show the saving.
function setSaving(item, set) {
  const added = MENU.items.find(i => i.id === set.category);
  return added ? item.price + added.price - set.price : 0;
}
function detailLine() {
  const d = state.detail, it = d.item;
  const set = setsFor(it).find(s => s.id === d.setId);
  const tops = MENU.toppings.filter(t => d.tops[t.id] > 0);
  const usage = normUsage(it.usage);
  if (set) addUsage(usage, set.usage);
  // extra noodles follow the bowl: kaedama on a tantanmen (yellow noodles only) uses a yellow portion
  const yellowBowl = normUsage(it.usage).noodleY > 0 && !(normUsage(it.usage).noodleW > 0);
  tops.forEach(t => {
    const u = normUsage(t.usage);
    if (yellowBowl && u.noodleW > 0 && !u.noodleY) { u.noodleY = u.noodleW; u.noodleW = 0; }
    addUsage(usage, u, d.tops[t.id]);
  });
  return {
    ...baseLine(it, d.qty),
    set: set ? { id: set.id, name: set.name, price: setUpgrade(it, set) } : null,
    toppings: tops.map(t => ({ id: t.id, name: t.name, price: t.price, qty: d.tops[t.id] })),
    note: d.note.trim(), usage,
  };
}
function detailView() {
  const d = state.detail, it = d.item, line = detailLine();
  const sets = setsFor(it);
  return `<button class="btn back" data-detail-back>← Back</button>
  <div class="card detail">
    <div class="detail-head"><span class="menu-icon lg">${iconOf(it)}</span>
      <div><div class="detail-name">${esc(it.name)}</div><div class="muted">${peso(it.price)}</div></div></div>

    ${sets.length ? `<div class="field"><label>Set? <small class="muted">Say once: “Set with a don is about ₱30 cheaper.”</small></label>
      <div class="choice-list">
        <button class="choice ${!d.setId ? 'active' : ''}" data-set="">Ramen only <b>${peso(it.price)}</b></button>
        ${sets.map(s => `<button class="choice ${d.setId === s.id ? 'active' : ''}" data-set="${esc(s.id)}">
          <span>${s.icon || ''} ${esc(s.name)}${setSaving(it, s) > 0 ? `<small class="save">save ${peso(setSaving(it, s))}</small>` : ''}</span><b>${peso(s.price)}</b></button>`).join('')}
      </div></div>` : ''}

    ${MENU.toppings.length ? `<div class="field"><label>Toppings <small class="muted">(per bowl)</small></label>
      <div class="top-list">${MENU.toppings.map(t => {
        const n = d.tops[t.id] || 0;
        return `<div class="top-row ${n ? 'on' : ''}">
          <span>${t.icon || ''} ${esc(t.name)} <small class="muted">+${peso(t.price)}</small></span>
          <span class="stepper"><button data-top-minus="${esc(t.id)}">−</button><b>${n}</b><button data-top-plus="${esc(t.id)}">＋</button></span>
        </div>`;
      }).join('')}</div></div>` : ''}

    <div class="field"><label>Note for kitchen</label>
      <input class="input" id="lineNote" maxlength="60" placeholder="e.g. less spicy, no onion" value="${esc(d.note)}"></div>

    <div class="field"><label>Quantity</label>
      <span class="stepper big"><button data-dqty="-1">−</button><b>${d.qty}</b><button data-dqty="1">＋</button></span></div>

    <div class="row total-row"><span>${peso(unitPrice(line))} × ${d.qty}</span><b>${peso(lineTotal(line))}</b></div>
    <button class="btn primary wide" data-detail-add>ADD TO ORDER</button>
  </div>`;
}

function checkoutView() {
  const total = orderTotal(), isEdit = !!state.editingOrderId, fees = feeLines();
  const guests = state.guests ?? guestsDefault(), blocked = state.mode === 'TAKEOUT' && dineInOnlyInCart().length;
  const given = Number(state.cashGiven) || 0;
  const dt = state.orderDateTime || `${dateKey()}T${timeKey()}`;
  return `<div class="section-title">${isEdit ? 'Edit order' : 'Order review'}</div>
  ${isEdit ? '<div class="notice">Saving will recalculate sales for that date.</div>' : ''}
  <div class="card list">${state.cart.map((l, i) => `<div class="cart-line">
      <div class="cart-main"><b>${esc(l.name)}</b>
        ${lineExtras(l).length ? `<small>${lineExtras(l).map(esc).join(' · ')}</small>` : ''}
        <span class="stepper"><button data-cart-minus="${i}">−</button><b>${l.qty}</b><button data-cart-plus="${i}">＋</button></span></div>
      <div class="cart-side"><b>${peso(lineTotal(l))}</b><button class="link-danger" data-cart-remove="${i}">Remove</button></div>
    </div>`).join('') || '<div class="muted">No items.</div>'}
    ${fees.map(l => `<div class="cart-line fee"><div class="cart-main"><b>🥡 ${esc(l.name)} × ${l.qty}</b><small>added for take-out</small></div><div class="cart-side"><b>${peso(lineTotal(l))}</b></div></div>`).join('')}</div>
  ${blocked ? `<div class="notice alert">B1T1 is dine-in only. Remove it or switch to DINE-IN.</div>` : ''}
  ${setOffers().map((o, i) => `<div class="notice set-offer"><span>🍜＋${o.don.icon || '🍚'} <b>${esc(o.ramen.name)} + ${esc(o.don.name)}</b> can be a set — save ${peso(o.saving)}</span>
    <button class="btn small primary" data-make-set="${i}">Make set</button></div>`).join('')}
  <button class="btn wide" data-add-more>＋ Add items</button>
  <div class="card">
    <div class="field"><label>Dine-in / Take-out</label>
      <div class="grid2">
        <button class="btn ${state.mode === 'DINEIN' ? 'primary' : ''}" data-mode="DINEIN">🍽️ DINE-IN</button>
        <button class="btn ${state.mode === 'TAKEOUT' ? 'primary' : ''}" data-mode="TAKEOUT">🥡 TAKE-OUT</button>
      </div></div>
    <div class="field"><label>Guests <small class="muted">(people)</small></label>
      <span class="stepper big"><button data-guests="-1">−</button><b>${guests}</b><button data-guests="1">＋</button></span></div>
    <div class="field"><label>Table no. / customer name</label>
      <input class="input" id="orderRef" maxlength="20" placeholder="e.g. T3 or Maria" value="${esc(state.ref)}"></div>
    <div class="field"><label>Payment</label>
      <div class="grid2">
        <button class="btn ${state.payment === 'CASH' ? 'primary' : ''}" data-pay="CASH">CASH</button>
        <button class="btn ${state.payment === 'GCASH' ? 'primary' : ''}" data-pay="GCASH">GCASH</button>
      </div></div>
    ${state.payment === 'CASH' ? `<div class="field"><label>Cash received</label>
      <input class="input" id="cashGiven" inputmode="decimal" placeholder="optional" value="${esc(state.cashGiven)}">
      <div class="quick-cash">${[total, 200, 300, 500, 1000].filter((v, i, a) => v >= total && a.indexOf(v) === i).slice(0, 4).map(v => `<button class="chip" data-cash="${v}">${peso(v)}</button>`).join('')}</div>
      ${given ? `<div class="row change ${given < total ? 'short' : ''}"><span>${given < total ? 'Short' : 'Change'}</span><b>${peso(Math.abs(given - total))}</b></div>` : ''}
    </div>` : ''}
    <div class="field"><label>Order date &amp; time</label>
      <input class="input" id="orderDateTime" type="datetime-local" value="${dt}">
      <small class="muted">Only change this for a missed entry.</small></div>
    <div class="row total-row"><span>TOTAL</span><b class="grand">${peso(total)}</b></div>
    <button class="btn primary wide" data-complete>${isEdit ? 'SAVE CHANGES' : 'COMPLETE ORDER'}</button>
    ${isEdit ? '<button class="btn wide" data-cancel-edit>Cancel edit</button>' : ''}
  </div>`;
}
// A ramen and a don rung up separately would be charged more than the set: offer to combine them.
function setOffers() {
  const offers = [];
  state.cart.forEach((r, ri) => {
    if (r.set || !(Number(r.bowls) > 0)) return;
    const ramen = itemById(r.id); if (!ramen) return;
    state.cart.forEach((d, di) => {
      if (d.category !== 'Don' || d.set) return;
      const set = setsFor(ramen).find(s => s.category === d.id);
      if (set && !offers.some(o => o.ri === ri || o.di === di)) offers.push({ ri, di, set, ramen, don: itemById(d.id) || d, saving: setSaving(ramen, set) });
    });
  });
  return offers;
}
function makeSet(i) {
  const o = setOffers()[i]; if (!o) return;
  const r = state.cart[o.ri], d = state.cart[o.di];
  const one = { ...clone(r), qty: 1, set: { id: o.set.id, name: o.set.name, price: setUpgrade(o.ramen, o.set) }, usage: addUsage(normUsage(r.usage), o.set.usage) };
  r.qty -= 1; d.qty -= 1;
  state.cart = state.cart.filter(l => l.qty > 0);
  addLine(one);
  toast(`Set applied — saved ${peso(o.saving)}`);
}
function keepCheckoutInputs() {
  const r = $('#orderRef'); if (r) state.ref = r.value;
  const c = $('#cashGiven'); if (c) state.cashGiven = c.value;
  const d = $('#orderDateTime'); if (d) state.orderDateTime = d.value;
}
function resetOrder() {
  Object.assign(state, { cart: [], checkout: false, detail: null, editingOrderId: null, orderDateTime: null, ref: '', cashGiven: '', payment: 'CASH', mode: 'DINEIN', guests: null });
}
function completeOrder() {
  keepCheckoutInputs();
  if (!state.cart.length) return alert('Please add an item.');
  if (state.mode === 'TAKEOUT' && dineInOnlyInCart().length) return alert('B1T1 is dine-in only. Remove it or switch to DINE-IN.');
  const raw = state.orderDateTime || `${dateKey()}T${timeKey()}`;
  const [d, tRaw] = raw.split('T'); const t = (tRaw || '00:00').slice(0, 5);
  const now = new Date(), backdated = (now - new Date(`${d}T${t}:00`)) > 10 * 60 * 1000;
  const arr = orders();
  const body = { date: d, time: t, items: clone(orderLines()), total: orderTotal(), payment: state.payment, mode: state.mode, ref: state.ref.trim(), guests: state.guests ?? guestsDefault() };
  if (state.editingOrderId) {
    const idx = arr.findIndex(o => o.id === state.editingOrderId);
    if (idx < 0) return alert('The order to edit could not be found.');
    const before = clone(arr[idx]);
    arr[idx] = { ...arr[idx], ...body, backdated: arr[idx].backdated || backdated, editedAt: now.toISOString() };
    save(K.orders, arr); SheetSync.orderEdit(arr[idx]);
    addAudit({ action: 'order_edit', orderId: arr[idx].id, before, after: arr[idx] });
    resetOrder(); state.historyTab = 'sales'; toast('Order updated'); go('history');
    return;
  }
  if (!currentStaff()) return alert('Select the staff on duty (HOME) before completing the order.');
  // Numbering continues from the highest number seen on any phone (as of the last sync).
  const no = Math.max(0, ...arr.filter(o => o.date === d).map(o => Number(o.no) || 0)) + 1;
  const rec = { id: uid(), no, ...body, backdated, staff: currentStaff(), createdAt: stampOf(now) };
  arr.push(rec); save(K.orders, arr); SheetSync.orderAdd(rec);
  addAudit({ action: 'order_add', orderId: rec.id, after: rec });
  resetOrder();
  toast(`Order #${no} recorded`); go('home');
  syncSoon();
}
function beginEditOrder(id) {
  const o = orders().find(x => x.id === id); if (!o) return;
  if (state.cart.length && !state.editingOrderId && !confirm('Discard the current unfinished order and edit this one?')) return;
  Object.assign(state, {
    editingOrderId: o.id, cart: clone(o.items.filter(l => !isFee(l))), guests: o.guests || null, payment: o.payment, mode: o.mode || 'DINEIN', ref: o.ref || '',
    orderDateTime: `${o.date}T${o.time}`, cashGiven: '', detail: null, checkout: true, view: 'order',
  });
  render();
}
function deleteOrder(id) {
  const arr = orders(), idx = arr.findIndex(o => o.id === id); if (idx < 0) return;
  const o = arr[idx];
  if (!confirm(`Delete this order?\n${o.date} ${o.time} / ${peso(o.total)}`)) return;
  arr.splice(idx, 1); save(K.orders, arr); SheetSync.orderDelete(id);
  addAudit({ action: 'order_delete', orderId: id, before: o });
  toast('Order deleted'); render();
}

/* ── KITCHEN ───────────────────────────────────────────── */
function kitchenQueue() {
  const served = servedIds();
  return orders().filter(o => o.date === dateKey() && !served.has(o.id)).sort((a, b) => (a.time + a.id).localeCompare(b.time + b.id));
}
function minutesAgo(o) {
  const [h, m] = o.time.split(':').map(Number), now = new Date();
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - (h * 60 + m));
}
function ticket(o, served) {
  const mins = minutesAgo(o);
  return `<div class="ticket ${served ? 'served' : mins >= 15 ? 'late' : ''}">
    <div class="ticket-head">
      <b>#${o.no || '—'} ${o.mode === 'TAKEOUT' ? '🥡 TAKE-OUT' : '🍽️ DINE-IN'}${o.ref ? ' · ' + esc(o.ref) : ''}</b>
      <span>${o.time}${served ? '' : ` · ${mins} min`}</span></div>
    <ul>${o.items.filter(l => !isFee(l)).map(l => `<li><b>${l.qty}×</b> ${esc(l.name)}${lineExtras(l).length ? `<small>${lineExtras(l).map(esc).join(' · ')}</small>` : ''}</li>`).join('')}</ul>
    ${served ? `<button class="btn small" data-unserve="${o.id}">↩ Undo</button>` : `<button class="btn primary wide" data-serve="${o.id}">✓ SERVED</button>`}
  </div>`;
}
function kitchenView() {
  const q = kitchenQueue();
  const served = servedIds();
  const done = state.kitchenShowServed ? orders().filter(o => o.date === dateKey() && served.has(o.id)).reverse() : [];
  return `${todoCard(true)}<div class="section-title">Kitchen <small class="muted">${q.length} waiting · auto-refresh</small></div>
    ${q.length ? `<div class="tickets">${q.map(o => ticket(o, false)).join('')}</div>` : '<div class="card muted center">No orders waiting 🎉</div>'}
    <button class="btn wide" data-toggle-served>${state.kitchenShowServed ? 'Hide' : 'Show'} served orders</button>
    ${done.length ? `<div class="tickets">${done.map(o => ticket(o, true)).join('')}</div>` : ''}`;
}

/* ── EXPENSE ───────────────────────────────────────────── */
// Same split as the staff sales sheet: 食材 / 消耗品 / 設備 / その他 (+ labor, rent & utilities)
const EXPENSE_CATS = ['Ingredients', 'Supplies', 'Equipment', 'Labor', 'Rent / Utilities', 'Other'];
const PURCHASE_CATS = ['Ingredients', 'Supplies']; // recorded as Kind = Purchase (仕入れ); the rest are Expense (経費)
// Pay handed out from the register: shown in Payroll as already paid (advance is deducted on payday).
const LABOR_PAY = { ADVANCE: { label: '💸 Salary advance', item: 'Salary advance', amount: '' }, ONCALL: { label: '📞 On-call day pay', item: 'On-call day pay', amount: 600 } };
// Only CASH comes out of the register drawer, so only CASH is subtracted in the shift cash count.
const PAY_FROM = [
  ['CASH', '💵 Register cash', 'Taken from the drawer'],
  ['GCASH', '📱 Store GCash', 'Paid from the shop GCash'],
  ['OWNER', '👤 Owner / outside', 'Not from the register'],
];
const payLabel = v => (PAY_FROM.find(p => p[0] === v) || [v, v])[1];
function initPresets() { const c = SheetSync.cachedPresets(); if (c) Object.assign(PRESETS, { rows: c.rows, fetchedAt: c.fetchedAt }); }
async function refreshPresets(silent) {
  try { const p = await SheetSync.fetchPresets(); Object.assign(PRESETS, { rows: p.rows, fetchedAt: p.fetchedAt }); if (!silent) toast('Expense list updated'); }
  catch (e) { if (!silent) alert('Could not reach the sheet.'); }
  if (state.view === 'expense' && !state.expPreset && !state.expManual) render();
}
function expenseView() {
  if (state.laborPay) return laborPayForm();
  const ed = state.editingExpenseId ? expenses().find(e => e.id === state.editingExpenseId) : null;
  if (ed || state.expManual || state.expPreset) return expenseForm(ed);
  const rows = PRESETS.rows.filter(p => truthy(p.active ?? true));
  return `<div class="section-title">Record expense</div>
    ${rows.length ? `<p class="help">Tap what you bought.</p>
    <div class="preset-grid">${rows.map(p => `<button class="preset" data-preset="${PRESETS.rows.indexOf(p)}">
      <b>${esc(p.name)}</b><small>${p.price ? peso(p.price) : '—'}${p.unit ? ' / ' + esc(p.unit) : ''}</small><small class="muted">${esc(p.category || '')}</small></button>`).join('')}</div>` :
      `<div class="notice">No quick-pick list yet. Add rows to the “Expense Preset” sheet, or enter manually.</div>`}
    <button class="btn wide primary" data-exp-manual>＋ Enter manually</button>
    <div class="grid2">${Object.entries(LABOR_PAY).map(([k, v]) => `<button class="btn" data-labor-pay="${k}">${v.label}</button>`).join('')}</div>
    <div class="meta"><small class="muted">Expense list: ${stampLabel(PRESETS.fetchedAt)}</small>
      <button class="btn small" data-preset-refresh>🔄 Refresh</button></div>`;
}
function expenseForm(ed) {
  const p = state.expPreset;
  const item = ed ? ed.item : p ? p.name : '';
  const cat = ed ? ed.category : p ? p.category : '';
  const packs = ed ? ed.packs || 1 : 1;
  const amount = ed ? ed.amount : p && p.price ? p.price : '';
  const pay = ed ? ed.payment : 'CASH';
  const cats = [...new Set([...EXPENSE_CATS, ...PRESETS.rows.map(r => r.category).filter(Boolean), cat].filter(Boolean))];
  return `<button class="btn back" data-exp-back>← Back</button>
  <div class="section-title">${ed ? 'Edit expense' : 'Record expense'}</div>
  <div class="card">
    <div class="field"><label>Item</label><input class="input" id="expItem" value="${esc(item)}" placeholder="e.g. Pork belly 2kg"></div>
    <div class="field"><label>Category</label><select class="input" id="expCat">${cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Quantity ${p && p.unit ? `(${esc(p.unit)})` : ''}</label>
      <input class="input" id="expPacks" inputmode="decimal" value="${packs}" ${p && p.price ? `data-unit-price="${p.price}"` : ''}></div>
    <div class="field"><label>Amount (₱)</label><input class="input" id="expAmount" inputmode="decimal" value="${amount}" placeholder="e.g. 850"></div>
    <div class="field"><label>Paid from</label>
      <div class="pay-from">${PAY_FROM.map(([v, label, sub]) => `<button class="choice ${pay === v ? 'active' : ''}" data-exp-pay="${v}">${label}<small>${sub}</small></button>`).join('')}</div>
      <input type="hidden" id="expPay" value="${pay}"></div>
    <div class="field"><label>Memo</label><input class="input" id="expMemo" value="${esc(ed ? ed.memo : '')}" placeholder="optional"></div>
    <button class="btn primary wide" data-save-exp>${ed ? 'UPDATE' : 'SAVE EXPENSE'}</button>
  </div>`;
}
function laborPayForm() {
  const v = LABOR_PAY[state.laborPay], names = staffList();
  return `<button class="btn back" data-labor-back>← Back</button>
  <div class="card"><div class="section-title">${v.label}</div>
    <p class="help">Paid from the register cash. The owner sees it in Payroll as already paid${state.laborPay === 'ADVANCE' ? ' and deducts it on payday' : ''}.</p>
    <div class="field"><label>Paid to</label>
      <div class="pay-from">${names.map((n, i) => `<button class="choice ${i === 0 ? 'active' : ''}" data-labor-staff="${esc(n)}">${esc(n)}</button>`).join('') || '<div class="muted">Add staff names on HOME first.</div>'}</div>
      <input type="hidden" id="laborStaff" value="${esc(names[0] || '')}"></div>
    <div class="field"><label>Amount (₱)</label><input class="input big-input" id="laborAmt" inputmode="decimal" value="${v.amount}"></div>
    <div class="field"><label>Memo</label><input class="input" id="laborMemo" maxlength="60"></div>
    <button class="btn primary wide" data-labor-save>SAVE</button>
  </div>`;
}
function saveLaborPay() {
  const who = $('#laborStaff').value, amt = Number($('#laborAmt').value);
  if (!who) return alert('Choose who is paid.');
  if (!(amt > 0)) return alert('Enter the amount.');
  if (!currentStaff()) return alert('Select your name on HOME first.');
  const v = LABOR_PAY[state.laborPay], now = new Date();
  const rec = {
    id: uid(), date: dateKey(now), time: timeKey(now), item: `${v.item} – ${who}`, category: 'Labor', kind: 'Expense', packs: 1, amount: amt,
    payment: 'CASH', toAccount: '', memo: $('#laborMemo').value.trim(), staff: currentStaff(), forStaff: who, presetId: state.laborPay, createdAt: stampOf(now),
  };
  save(K.expenses, [...expenses(), rec]); SheetSync.expenseAdd(rec); addAudit({ action: 'labor_pay', after: rec });
  state.laborPay = null; toast(`${v.item} ${peso(amt)} to ${who}`); go('home');
}
function saveExpense() {
  const amount = Number($('#expAmount').value), item = $('#expItem').value.trim();
  if (!item) return alert('Enter the item.');
  if (!amount) return alert('Enter the amount.');
  const now = new Date(), arr = expenses();
  const cat = $('#expCat').value;
  const fields = { item, category: cat, kind: PURCHASE_CATS.includes(cat) ? 'Purchase' : 'Expense', packs: Number($('#expPacks').value) || 1, amount, payment: $('#expPay').value, memo: $('#expMemo').value.trim() };
  if (state.editingExpenseId) {
    const idx = arr.findIndex(e => e.id === state.editingExpenseId); if (idx < 0) return alert('Expense not found.');
    const before = clone(arr[idx]);
    arr[idx] = { ...arr[idx], ...fields, editedAt: now.toISOString() };
    save(K.expenses, arr); SheetSync.expenseEdit(arr[idx]); addAudit({ action: 'expense_edit', before, after: arr[idx] });
    state.historyTab = 'expense'; toast('Expense updated'); go('history'); return;
  }
  if (!currentStaff()) return alert('Select the staff on duty (HOME) first.');
  const rec = { id: uid(), date: dateKey(now), time: timeKey(now), ...fields, staff: currentStaff(), presetId: state.expPreset?.id || '', createdAt: stampOf(now) };
  arr.push(rec); save(K.expenses, arr); SheetSync.expenseAdd(rec); addAudit({ action: 'expense_add', after: rec });
  toast('Expense recorded'); go('home');
}
function deleteExpense(id) {
  const arr = expenses(), idx = arr.findIndex(e => e.id === id); if (idx < 0) return;
  const e = arr[idx];
  if (!confirm(`Delete this expense?\n${e.date} ${e.item} ${peso(e.amount)}`)) return;
  arr.splice(idx, 1); save(K.expenses, arr); SheetSync.expenseDelete(id); addAudit({ action: 'expense_delete', before: e });
  toast('Expense deleted'); render();
}

/* ── STOCK ─────────────────────────────────────────────── */
function initInventory() { const c = SheetSync.cachedInventory(); if (c) Object.assign(INVENTORY, { rows: c.rows, fetchedAt: c.fetchedAt }); }
async function refreshInventory(silent) {
  try { const p = await SheetSync.fetchInventory(); Object.assign(INVENTORY, { rows: p.rows, fetchedAt: p.fetchedAt }); if (!silent) toast('Stock updated'); }
  catch (e) { if (!silent) alert('Could not reach the sheet.'); }
  if (state.view === 'stock' && !state.stockEdit) render();
}
const isLow = i => Number(i.reorder) > 0 && Number(i.stock) <= Number(i.reorder);
/* ── stock check: catch items before they run out ──────────
   Goal (owner 2026-10-01): never lose a sale because something ran out.
   Count items (noodles, ajitama, karaage, soup bases, bottles) are counted at open / close / a quick check;
   between counts the POS subtracts what the orders used, so "now" is a live estimate.
   Level items (chashu meat, ground pork, chili oil, green onion, lard) are Enough / Low / Out.
   At or below the prep point → on the To prep / buy list (prep takes 1 day, KANDS delivery 2 days). */
const isCount = it => it.type !== 'level';
const nfmt = (v, unit) => (v === null || v === undefined ? '—' : unit === 'bags' ? String(+(+v).toFixed(1)) : String(+(+v).toFixed(1)));
const DOT = { out: '⛔', red: '🔴', yellow: '🟡', green: '🟢', unknown: '⚪' };
function statusOf(it, v) {
  if (!isCount(it)) return v === 'Out' ? 'out' : v === 'Low' ? 'red' : v === 'Enough' ? 'green' : 'unknown';
  if (v === null || v === undefined) return 'unknown';
  if (v <= 0) return 'out';
  if (it.prep === null || it.prep === undefined || it.prep === '') return 'green';
  if (v <= it.prep) return 'red';
  return v <= it.prep * 1.3 ? 'yellow' : 'green';
}
function todoText(it, v) {
  const left = isCount(it) ? `${nfmt(v, it.unit)} ${it.unit} left` : (v || '?');
  return `${it.action} ${it.name} — ${left}${isCount(it) && it.prep != null ? ` (prep point ${it.prep})` : ''}${it.lead ? ` · takes ${it.lead}` : ''}`;
}
// Stock inside a register session: from the latest count (the opening count, or a later quick check),
// plus received, minus waste / staff food / other out, minus what the orders used since then.
function stockNow(s) {
  const from = s.openedAt, to = s.closedAt || null;
  const inWin = r => { const t = recStamp(r); return t >= from && (!to || t <= to); };
  const os = orders().filter(inWin), mv = moves().filter(inWin);
  const opening = (s.stock && s.stock.opening) || {};
  const out = {};
  STOCK_ITEMS.forEach(it => {
    const k = it.k;
    const last = mv.filter(m => m.type === 'Count' && m.item === k).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const base = last ? (isCount(it) ? last.qty : last.level) : (opening[k] ?? null);
    const since = r => (last ? recStamp(r) > last.createdAt : true);
    const meta = { name: it.name, unit: it.unit, type: it.type, prep: it.prep, action: it.action, lead: it.lead, opening: opening[k] ?? null, checkedAt: last ? last.createdAt : from };
    if (!isCount(it)) { out[k] = { ...meta, level: base || null }; return; }
    const moved = (type, all) => mv.filter(m => m.item === k && m.type === type && (all || since(m))).reduce((a, m) => a + (Number(m.qty) || 0), 0);
    const used = all => {
      if (!USE_KEYS.includes(k)) return 0;
      let u = 0;
      os.filter(o => all || since(o)).forEach(o => o.items.forEach(l => {
        const x = l.usage ? l.usage[k] : 0;
        u = u === null || x === null ? null : u + (Number(x) || 0) * l.qty;
      }));
      return u === null ? null : PER_CONTAINER[k] ? u / PER_CONTAINER[k]() : u;
    };
    const usage = used(false);
    const expected = base === null || base === undefined || usage === null ? null
      : +(Number(base) + moved('Received') - moved('Waste') - moved('Staff food') - moved('Other out') - usage).toFixed(3);
    const usageAll = used(true);
    out[k] = { ...meta, received: moved('Received', true), waste: moved('Waste', true), staff: moved('Staff food', true), other: moved('Other out', true),
      usage: usageAll === null ? null : +usageAll.toFixed(3), expected, unknownUsage: usage === null };
  });
  return out;
}
// What the shop has now: the live estimate while the register is open, otherwise the last close.
function currentStock() {
  const s = openSession();
  if (s) {
    const now = stockNow(s);
    return STOCK_ITEMS.map(it => { const x = now[it.k]; const v = isCount(it) ? x.expected : x.level; return { it, v, x, status: x.unknownUsage ? 'unknown' : statusOf(it, v), live: true }; });
  }
  const prev = lastClosed(), items = (prev && prev.stock && prev.stock.items) || {};
  return STOCK_ITEMS.map(it => { const x = items[it.k] || {}; const v = isCount(it) ? (x.counted ?? null) : (x.level || null); return { it, v, x, status: statusOf(it, v), live: false }; });
}
const todoList = () => currentStock().filter(x => x.status === 'red' || x.status === 'out');
// menu items that need something the POS estimates is gone (e.g. karaage at 0) → warn on the ORDER screen
function shortItems() {
  if (!openSession()) return {};
  const gone = currentStock().filter(x => x.status === 'out' && USE_KEYS.includes(x.it.k));
  const out = {};
  MENU.items.forEach(i => { const u = normUsage(i.usage); const g = gone.find(x => u[x.it.k] > 0); if (g) out[i.id] = g.it.name; });
  return out;
}
function todoCard(compact) {
  const list = todoList(), unknown = currentStock().filter(x => x.status === 'unknown');
  if (!list.length) return compact ? '' : `<div class="card todo ok"><b>✓ Stock OK</b><small>${unknown.length ? unknown.length + ' item(s) not counted yet' : 'Nothing to prep or buy right now'}</small></div>`;
  return `<button class="card todo" data-go="stock"><b>🧾 To prep / buy today (${list.length})</b>
    ${list.map(({ it, v, status }) => `<small>${DOT[status]} ${esc(todoText(it, v))}</small>`).join('')}</button>`;
}
// 15:00 check before the dinner rush (the middle shift arrives at 15:00)
function needsAfternoonCheck() {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  if (h < 14.75 || h >= 17 || !openSession()) return false;
  const since = `${dateKey()} 14:45:00`;
  return !moves().some(m => m.type === 'Count' && m.createdAt >= since);
}

// sold out: marked on the ORDER screen, shared with every phone, cleared when a new register opens
function soldOutIds() {
  const s = openSession() || lastClosed(); const from = s ? s.openedAt : `${dateKey()} 00:00:00`;
  const state_ = {};
  moves().filter(m => (m.type === 'Sold out' || m.type === 'Available') && m.createdAt >= from)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(m => { state_[m.item] = m.type === 'Sold out'; });
  return new Set(Object.keys(state_).filter(k => state_[k]));
}
function toggleSoldOut(itemId) {
  if (!currentStaff()) return alert('Select your name on HOME first.');
  const on = !soldOutIds().has(itemId), item = itemById(itemId), now = new Date();
  const m = { id: uid(), date: dateKey(now), createdAt: stampOf(now), staff: currentStaff(), item: itemId, type: on ? 'Sold out' : 'Available', qty: null, note: item ? item.name : '' };
  save(K.moves, [...moves(), m]); SheetSync.moveAdd(m); addAudit({ action: 'sold_out', after: m });
  toast(`${item ? item.name : itemId}: ${on ? 'SOLD OUT' : 'available again'}`);
}

// inputs for the whole checklist: numbers for count items, Enough / Low / Out for level items
function stockInputs(prefix, values, extra) {
  return `<div class="stock-grid">${STOCK_ITEMS.map(it => {
    const v = values ? values[it.k] : null;
    if (!isCount(it)) return `<div class="stock-cell level"><span>${esc(it.name)}</span>
      <div class="level-chips">${LEVELS.map(l => `<button class="chip ${v === l ? 'active' : ''} lv-${l.toLowerCase()}" data-level="${prefix}|${it.k}|${l}">${l}</button>`).join('')}</div>
      <input type="hidden" id="${prefix}-${it.k}" value="${v || ''}"></div>`;
    return `<label class="stock-cell"><span>${esc(it.name)} <small>${esc(it.unit)}</small></span>
      <input class="input" id="${prefix}-${it.k}" inputmode="decimal" value="${v != null && v !== '' ? v : ''}">${extra ? extra(it) : ''}</label>`;
  }).join('')}</div>`;
}
function readStock(prefix) {
  return Object.fromEntries(STOCK_ITEMS.map(it => {
    const v = $(`#${prefix}-${it.k}`).value;
    return [it.k, isCount(it) ? (v === '' || isNaN(Number(v)) ? null : Number(v)) : (v || null)];
  }));
}
function lastCounts() {
  const prev = lastClosed(), items = prev && prev.stock && prev.stock.items;
  return items ? Object.fromEntries(STOCK_ITEMS.map(it => [it.k, items[it.k] ? (isCount(it) ? items[it.k].counted : items[it.k].level) : null])) : null;
}

// STOCK screen: live picture, to-do, quick check, received / waste / staff food
function shiftStockCard() {
  const cur = currentStock(), s = openSession();
  return `<div class="card"><div class="section-title">🍜 Stock now <small class="muted">${s ? 'live estimate since the last count' : 'at the last close'}</small></div>
    <table class="stock-table"><thead><tr><th></th><th>Now</th><th>Prep at</th><th></th></tr></thead><tbody>
    ${cur.map(({ it, v, status, x }) => `<tr class="st-${status}"><td>${esc(it.name)}<small>${esc(it.unit || 'level')}${x && x.checkedAt ? ' · counted ' + hhmm(x.checkedAt) : ''}</small></td>
      <td><b>${isCount(it) ? (x && x.unknownUsage ? 'SET RECIPE' : nfmt(v, it.unit)) : esc(v || '—')}</b></td><td>${isCount(it) ? (it.prep ?? '—') : 'Low'}</td><td>${DOT[status]}</td></tr>`).join('')}
    </tbody></table>
    ${s ? `<button class="btn primary wide" data-stock-check>🔄 Quick check (count now)</button>
    <div class="move-btns">${MOVE_TYPES.map(([t, label]) => `<button class="btn small" data-move-form="${t}">${label}</button>`).join('')}</div>` : '<div class="muted">Open the register (SHIFT) to update the stock.</div>'}
    ${s ? movesListHTML(s) : ''}
    <p class="help">Prep / buy when an item reaches its prep point — prep takes 1 day, noodles &amp; soup base take 2 days. Change prep points in the “Stock Items” sheet.</p>
  </div>`;
}
function movesListHTML(s) {
  const list = sessionFigures(s).moves.filter(m => MOVE_TYPES.some(t => t[0] === m.type) || m.type === 'Count').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) return '';
  const nameOf = k => (STOCK_ITEMS.find(x => x.k === k) || {}).name || k;
  return `<div class="muted small-title">Recorded this shift</div>${list.slice(0, 30).map(m => `<div class="row sub"><span>${hhmm(m.createdAt)} ${esc(m.type)} · ${esc(nameOf(m.item))} ${m.level ? esc(m.level) : m.qty ?? ''}${m.note ? ' · ' + esc(m.note) : ''} · ${esc(m.staff || '')}</span>${m.type === 'Count' ? '' : `<button class="link-danger" data-move-del="${m.id}">Delete</button>`}</div>`).join('')}`;
}
function stockCheckView() {
  const cur = Object.fromEntries(currentStock().map(({ it, v }) => [it.k, isCount(it) ? (v === null ? null : Math.max(0, Math.round(v * 10) / 10)) : v]));
  return `<button class="btn back" data-stock-check-back>← Back</button>
  <div class="card"><div class="section-title">🔄 Quick check</div>
    <p class="help">Pre-filled with what the POS thinks is left. Count and fix any number that is wrong, pick Enough / Low / Out.</p>
    ${stockInputs('qc', cur)}
    <button class="btn primary wide" data-stock-check-save>SAVE CHECK</button></div>`;
}
function saveStockCheck() {
  if (!currentStaff()) return alert('Select your name on HOME first.');
  if (!openSession()) return alert('Open the register first (SHIFT).');
  const vals = readStock('qc'), now = new Date(), created = stampOf(now);
  const recs = STOCK_ITEMS.filter(it => vals[it.k] !== null).map(it => ({
    id: uid(), date: dateKey(now), createdAt: created, staff: currentStaff(), item: it.k, type: 'Count',
    qty: isCount(it) ? vals[it.k] : null, level: isCount(it) ? '' : vals[it.k], note: '',
  }));
  save(K.moves, [...moves(), ...recs]); recs.forEach(m => SheetSync.moveAdd(m)); addAudit({ action: 'stock_check', after: recs });
  state.stockCheck = false;
  const todo = todoList();
  alert(todo.length ? `Check saved.\n\nTo prep / buy today:\n${todo.map(x => '• ' + todoText(x.it, x.v)).join('\n')}` : 'Check saved. Stock OK ✓');
  render();
}
function moveFormView() {
  const type = state.moveForm, label = (MOVE_TYPES.find(t => t[0] === type) || [])[1];
  const items = STOCK_ITEMS.filter(isCount);
  return `<button class="btn back" data-move-back>← Back</button>
  <div class="card"><div class="section-title">${label}</div>
    <div class="field"><label>Item</label><div class="pay-from">${items.map((it, i) => `<button class="choice ${i === 0 ? 'active' : ''}" data-move-item="${it.k}">${esc(it.name)} <small>${esc(it.unit)}</small></button>`).join('')}</div>
      <input type="hidden" id="moveItem" value="${items[0].k}"></div>
    <div class="field"><label>Quantity</label><input class="input big-input" id="moveQty" inputmode="decimal"></div>
    <div class="field"><label>Note</label><input class="input" id="moveNote" maxlength="60" placeholder="${type === 'Received' ? 'e.g. made 30 ajitama' : 'e.g. dropped, broken'}"></div>
    <button class="btn primary wide" data-move-save>SAVE</button>
    ${type === 'Received' ? '<p class="help">Paid for it? Record the money in EXPENSE separately.</p>' : ''}
  </div>`;
}
function saveMove() {
  const qty = Number($('#moveQty').value);
  if (!(qty > 0)) return alert('Enter the quantity.');
  if (!currentStaff()) return alert('Select your name on HOME first.');
  if (!openSession()) return alert('Open the register first (SHIFT).');
  const now = new Date();
  const m = { id: uid(), date: dateKey(now), createdAt: stampOf(now), staff: currentStaff(), item: $('#moveItem').value, type: state.moveForm, qty, note: $('#moveNote').value.trim() };
  save(K.moves, [...moves(), m]); SheetSync.moveAdd(m); addAudit({ action: 'stock_move', after: m });
  state.moveForm = null; toast(`${m.type}: ${qty} recorded`); render();
}
function deleteMove(id) {
  const m = moves().find(x => x.id === id); if (!m || !confirm(`Delete this entry?\n${m.type} ${m.item} ${m.qty}`)) return;
  save(K.moves, moves().filter(x => x.id !== id)); SheetSync.moveDelete(id); addAudit({ action: 'stock_move_delete', before: m }); render();
}
function stockView() {
  if (state.stockCheck) return stockCheckView();
  if (state.moveForm) return moveFormView();
  if (state.stockEdit) return stockCountView();
  const supplies = !INVENTORY.rows.length ? `<div class="card"><div class="section-title">📦 Other supplies</div>
    <div class="muted">None yet. Add rows to the “Inventory” sheet (LPG, containers…), then tap 🔄.</div></div>
    <div class="meta"><small class="muted">Supplies: ${stampLabel(INVENTORY.fetchedAt)}</small><button class="btn small" data-stock-refresh>🔄 Refresh</button></div>` : null;
  if (supplies) return `<div class="section-title">Stock</div>${shiftStockCard()}${supplies}`;
  const low = INVENTORY.rows.filter(isLow);
  const cats = [...new Set(INVENTORY.rows.map(i => i.category).filter(Boolean))];
  let list = state.stockOnlyLow ? low : INVENTORY.rows.filter(i => !state.stockCat || i.category === state.stockCat);
  return `<div class="section-title">Stock</div>${shiftStockCard()}
    <div class="section-title">📦 Other supplies</div>
    ${low.length ? `<div class="notice alert">🔴 Need to buy: ${low.length} item(s)</div>` : ''}
    <div class="tabs">
      <button class="tab ${!state.stockCat && !state.stockOnlyLow ? 'active' : ''}" data-stock-cat="">ALL</button>
      <button class="tab ${state.stockOnlyLow ? 'active' : ''}" data-stock-low>🛒 To buy</button>
      ${cats.map(c => `<button class="tab ${state.stockCat === c ? 'active' : ''}" data-stock-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="card list">${list.map(i => `<button class="stock-row" data-stock-edit="${esc(i.id)}">
      <span>${isLow(i) ? '🔴' : '🟢'}</span>
      <span class="stock-name">${esc(i.name)}<small>reorder at ${i.reorder || '—'} ${esc(i.unit || '')}${i.lastCount ? ' · counted ' + esc(String(i.lastCount).slice(0, 10)) : ''}</small></span>
      <b>${Number(i.stock || 0).toLocaleString()} ${esc(i.unit || '')}</b></button>`).join('')}</div>
    <p class="help">Tap an item to enter today’s count.</p>
    <div class="meta"><small class="muted">Stock: ${stampLabel(INVENTORY.fetchedAt)}</small><button class="btn small" data-stock-refresh>🔄 Refresh</button></div>`;
}
function stockCountView() {
  const i = INVENTORY.rows.find(r => r.id === state.stockEdit);
  return `<button class="btn back" data-stock-back>← Back</button>
  <div class="section-title">Count: ${esc(i.name)}</div>
  <div class="card">
    <div class="row"><span>Current record</span><b>${Number(i.stock || 0).toLocaleString()} ${esc(i.unit || '')}</b></div>
    <div class="field"><label>Actual count now (${esc(i.unit || '')})</label><input class="input" id="stockQty" inputmode="decimal" value=""></div>
    <button class="btn primary wide" data-stock-save>SAVE COUNT</button>
  </div>`;
}
function saveStockCount() {
  const v = $('#stockQty').value; if (v === '' || isNaN(Number(v))) return alert('Enter a number.');
  if (!currentStaff()) return alert('Select the staff on duty (HOME) first.');
  const i = INVENTORY.rows.find(r => r.id === state.stockEdit), now = new Date();
  const c = { id: i.id, name: i.name, qty: Number(v), before: Number(i.stock) || 0, date: dateKey(now), time: timeKey(now), staff: currentStaff() };
  i.stock = c.qty; i.lastCount = `${c.date} ${c.time}`;
  SheetSync.rememberInventory({ rows: INVENTORY.rows, fetchedAt: INVENTORY.fetchedAt });
  SheetSync.stockCount(c); addAudit({ action: 'stock_count', after: c });
  state.stockEdit = null; toast('Count saved'); render();
}

/* ── SHIFT: register sessions + time clock ─────────────────
   A register session runs from OPEN (count cash, GCash balance and the 6 stock items) to CLOSE
   (count them again). Everything recorded while it is open belongs to it, whichever phone recorded it.
     Expected cash  = opening cash  + cash sales  + cash in  − cash out
     Expected GCash = opening GCash + GCash sales + GCash in − GCash out
     Expected stock = opening + received − waste − staff food − other out − order usage
   "in / out" = purchases & expenses paid from that account, owner top-ups / removals, transfers.
   (Same rules as the 2026-09-22 management sheet, now calculated automatically.) */
function openSession() { return sessions().filter(s => !s.closedAt).sort((a, b) => a.openedAt.localeCompare(b.openedAt)).at(-1) || null; }
function lastClosed() { return sessions().filter(s => s.closedAt).sort((a, b) => a.closedAt.localeCompare(b.closedAt)).at(-1) || null; }
const recStamp = r => r.createdAt || `${r.date} ${r.time}:00`;
// Shifts (owner 2026-10-01): 昼番 09-17 Jess / 中間 15-23 Jake Mama / 夜番 16-24 Aira. Weather as on the staff sales sheet.
const SHIFTS = ['Lunch 09-17', 'Middle 15-23', 'Night 16-24'];
const WEATHER = ['☀️ Sunny', '☁️ Cloudy', '🌧 Rain', 'Other'];
const defaultShift = () => { const h = new Date().getHours(); return h >= 5 && h < 15 ? SHIFTS[0] : h === 15 ? SHIFTS[1] : SHIFTS[2]; };
const MOVE_TYPES = [
  ['Received', '📥 Received / prepared', 1], ['Waste', '🗑 Waste', -1], ['Staff food', '🍜 Staff food / free', -1], ['Other out', '↗ Other out', -1],
];
function accountFlow(es, acct) {
  const sum = f => es.filter(f).reduce((a, e) => a + e.amount, 0);
  return {
    in: sum(e => (e.kind === 'Top-up' && e.payment === acct) || (e.kind === 'Transfer' && e.toAccount === acct)),
    out: sum(e => e.payment === acct && (isSpend(e) || e.kind === 'Removal' || e.kind === 'Transfer')),
  };
}
function sessionFigures(s) {
  const from = s.openedAt, to = s.closedAt || null;
  const inWin = r => { const t = recStamp(r); return t >= from && (!to || t <= to); };
  const os = orders().filter(inWin), es = expenses().filter(inWin), mv = moves().filter(inWin);
  const m = summarize(os);
  const cash = accountFlow(es, 'CASH'), gc = accountFlow(es, 'GCASH');
  const stock = stockNow(s);
  return {
    orders: m.orders, bowls: m.bowls, guests: m.guests, totalSales: m.sales, cashSales: m.cash, gcashSales: m.gcash,
    cashIn: cash.in, cashOut: cash.out, gcashIn: gc.in, gcashOut: gc.out,
    ownerSpend: es.filter(e => e.payment === 'OWNER' && isSpend(e)).reduce((a, e) => a + e.amount, 0),
    expectedCash: (Number(s.openingCash) || 0) + m.cash + cash.in - cash.out,
    expectedGcash: s.openingGcash == null ? null : Number(s.openingGcash) + m.gcash + gc.in - gc.out,
    entries: es, moves: mv, stock,
  };
}
// A closed session is stale when an order / payment inside it was changed afterwards.
function sessionStale(s) {
  if (!s.closedAt || s.cashSales == null) return false;
  const f = sessionFigures(s), r = Math.round;
  return r(f.cashSales) !== r(s.cashSales) || r(f.gcashSales) !== r(s.gcashSales || 0) || r(f.cashOut) !== r(s.cashOut || 0) || r(f.gcashOut) !== r(s.gcashOut || 0);
}
function outsideSessions(date = dateKey()) {
  const ss = sessions();
  return orders().filter(o => o.date === date && !ss.some(s => { const t = recStamp(o); return t >= s.openedAt && (!s.closedAt || t <= s.closedAt); }));
}
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + peso(Math.abs(n));
const diffClass = n => (Math.abs(n) < 1 ? 'ok' : 'bad');
const stockDiffText = d => (Math.abs(d) <= 0.001 ? '✓' : (d > 0 ? '+' : '') + d);
const entryLabel = e => e.kind === 'Transfer' ? `${payLabel(e.payment)} → ${payLabel(e.toAccount)}` : e.kind && !isSpend(e) ? `${e.kind} · ${payLabel(e.payment)}` : payLabel(e.payment);

function shiftView() {
  const s = openSession();
  const onDuty = clockedIn();
  const out = outsideSessions();
  const multi = sessions().filter(x => !x.closedAt).length > 1;
  const head = `<div class="section-title">Shift &amp; register</div>
    <div class="card"><div class="section-title">🕘 On duty now</div>
      ${onDuty.length ? onDuty.map(c => `<div class="row"><span>${esc(c.staff)}</span><b>since ${hhmm(c.in)} · ${dur(hoursSince(c.in))}</b></div>`).join('') : '<div class="muted">Nobody is checked in.</div>'}
      ${currentStaff() ? (myClock() ? `<button class="btn danger wide" data-clock-out>CHECK OUT (${esc(currentStaff())})</button>` : `<button class="btn primary wide" data-clock-in>CHECK IN (${esc(currentStaff())})</button>`) : '<div class="notice">Select your name on HOME first.</div>'}
    </div>
    ${multi ? '<div class="notice alert">Two registers are open (opened on two phones). Close both and count once.</div>' : ''}
    ${out.length ? `<div class="notice">⚠ ${out.length} order(s) today were taken while the register was closed (${peso(out.reduce((a, o) => a + (o.payment === 'CASH' ? o.total : 0), 0))} cash). They are not in any shift count.</div>` : ''}`;
  if (!s) return head + openRegisterForm() + sessionHistory();
  if (state.regClosing) return closeRegisterForm(s);
  if (state.moneyForm) return moneyForm();
  const f = sessionFigures(s);
  const moneyRows = f.entries.filter(e => e.payment !== 'OWNER' || isSpend(e));
  return `${head}
  <div class="card">
    <div class="section-title">💵 Register open <small class="muted">since ${hhmm(s.openedAt)} · ${esc(s.openedBy)}</small></div>
    <div class="row"><span>Opening cash</span><b>${peso(s.openingCash)}</b></div>
    <div class="row"><span>+ Cash sales <small class="muted">(${f.orders} orders)</small></span><b>${peso(f.cashSales)}</b></div>
    ${f.cashIn ? `<div class="row"><span>+ Cash in (top-up / transfer)</span><b>${peso(f.cashIn)}</b></div>` : ''}
    <div class="row"><span>− Cash out (paid from drawer)</span><b>${peso(f.cashOut)}</b></div>
    <div class="row total-row"><span>Should be in the drawer</span><b>${peso(f.expectedCash)}</b></div>
    <hr>
    <div class="row"><span>📱 GCash: opening ${s.openingGcash == null ? '—' : peso(s.openingGcash)} + sales ${peso(f.gcashSales)}${f.gcashIn ? ' + in ' + peso(f.gcashIn) : ''} − out ${peso(f.gcashOut)}</span></div>
    <div class="row total-row"><span>GCash balance should be</span><b>${f.expectedGcash == null ? '—' : peso(f.expectedGcash)}</b></div>
    ${moneyRows.length ? `<hr><div class="muted small-title">Money in / out this shift</div>${moneyRows.map(e => `<div class="row sub"><span>${esc(e.item)} · ${entryLabel(e)}${e.staff ? ' · ' + esc(e.staff) : ''}</span><span>${peso(e.amount)}</span></div>`).join('')}` : ''}
    ${f.ownerSpend ? `<div class="row sub"><span>Paid by owner (not in the count)</span><span>${peso(f.ownerSpend)}</span></div>` : ''}
    <div class="row"><span>Total sales this shift</span><b>${peso(f.totalSales)}</b></div>
    <button class="btn wide" data-money-form>💱 Money in / out (top-up · removal · transfer)</button>
    <button class="btn danger wide" data-reg-close>CLOSE REGISTER · count cash, GCash &amp; stock</button>
  </div>${sessionHistory()}`;
}
function openRegisterForm() {
  const prev = lastClosed();
  const left = prev && prev.leftInDrawer != null ? prev.leftInDrawer : null;
  const gcLeft = prev && prev.countedGcash != null ? prev.countedGcash : null;
  const stockLeft = lastCounts();
  return `<div class="card">
    <div class="section-title">🔓 Open the register</div>
    ${left != null ? `<div class="row"><span>Left by ${esc(prev.closedBy)} (${hhmm(prev.closedAt)})</span><b>cash ${peso(left)}${gcLeft != null ? ' · GCash ' + peso(gcLeft) : ''}</b></div>` : ''}
    <div class="field"><label>1. Count the cash in the drawer now (₱)</label>
      <input class="input big-input" id="openCash" inputmode="decimal" value="${left != null ? left : ''}" data-left="${left ?? ''}">
      <div class="live" id="openDiff"></div></div>
    <div class="field"><label>2. Store GCash balance now — from the GCash app (₱)</label>
      <input class="input" id="openGcash" inputmode="decimal" value="${gcLeft != null ? gcLeft : ''}"></div>
    <div class="field"><label>Shift</label>
      <div class="chips-row">${SHIFTS.map(s => `<button class="choice ${s === defaultShift() ? 'active' : ''}" data-open-shift="${s}">${s}</button>`).join('')}</div>
      <input type="hidden" id="openShift" value="${defaultShift()}"></div>
    <div class="field"><label>Weather</label>
      <div class="chips-row">${WEATHER.map((w, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-open-weather="${w}">${w}</button>`).join('')}</div>
      <input type="hidden" id="openWeather" value="${WEATHER[0]}"></div>
    <div class="field"><label>3. Count the stock <small class="muted">(pre-filled with the last close — change if different)</small></label>
      ${stockInputs('os', stockLeft)}</div>
    <button class="btn primary wide" data-reg-open>OPEN REGISTER</button>
  </div>`;
}
function closeRegisterForm(s) {
  const f = sessionFigures(s);
  return `<button class="btn back" data-reg-cancel>← Back</button>
  <div class="card">
    <div class="section-title">🔒 Close the register <small class="muted">opened ${hhmm(s.openedAt)} by ${esc(s.openedBy)}</small></div>
    <div class="row sub"><span>Opening ${peso(s.openingCash)} + cash sales ${peso(f.cashSales)}${f.cashIn ? ' + in ' + peso(f.cashIn) : ''} − paid from drawer ${peso(f.cashOut)}</span></div>
    <div class="row total-row"><span>Should be in the drawer</span><b id="expCash" data-v="${f.expectedCash}">${peso(f.expectedCash)}</b></div>
    <div class="field"><label>1. Count the cash in the drawer (₱)</label>
      <input class="input big-input" id="countCash" inputmode="decimal"><div class="live" id="cashDiff"></div></div>
    <div class="field"><label>2. Store GCash balance now — from the GCash app (₱)</label>
      <div class="row sub"><span>Should be</span><b id="expGcash" data-v="${f.expectedGcash ?? ''}">${f.expectedGcash == null ? '— (no opening balance)' : peso(f.expectedGcash)}</b></div>
      <input class="input" id="countGcash" inputmode="decimal"><div class="live" id="gcashDiff"></div></div>
    <div class="field"><label>3. Count the stock</label>
      ${stockInputs('cs', null, it => { const x = f.stock[it.k], e = x.expected; return `<small class="exp" data-exp="${e ?? ''}" id="cx-${it.k}">${e == null ? (x.unknownUsage ? 'SET RECIPE in Menu' : 'not counted at open') : 'should be about ' + nfmt(e, it.unit)}</small><small class="live" id="cd-${it.k}"></small>`; })}</div>
    <div class="field"><label>4. Cash taken out for the owner / deposit (₱)</label>
      <input class="input" id="cashRemoved" inputmode="decimal" placeholder="0">
      <div class="row sub"><span>Left in drawer for next shift</span><b id="leftDrawer">—</b></div></div>
    <div class="field"><label>Note</label><input class="input" id="regNote" maxlength="80" placeholder="e.g. reason for a difference"></div>
    <button class="btn danger wide" data-reg-save>CLOSE REGISTER${state.checkoutAfterClose ? ' &amp; CHECK OUT' : ''}</button>
  </div>`;
}
function sessionHistory() {
  const list = sessions().filter(s => s.closedAt).sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 8);
  if (!list.length) return '';
  return `<div class="card"><div class="section-title">Recent shift checks</div>
    ${list.map(s => {
      const off = (s.stock && s.stock.todo) || [];
      return `<div class="sess-row">
      <span><b>${s.openedAt.slice(5, 10)} ${esc(s.shift || '')} ${hhmm(s.openedAt)}–${hhmm(s.closedAt)}</b><small>${esc(s.closedBy || s.openedBy)} · sales ${peso(s.totalSales)}${s.guests ? ' · ' + s.guests + ' guests' : ''}${s.weather ? ' · ' + esc(s.weather) : ''}${s.note ? ' · ' + esc(s.note) : ''}</small>
        ${off.length ? `<small class="warn">To prep / buy: ${esc(off.join(' / '))}</small>` : ''}
        ${sessionStale(s) ? '<small class="warn">Orders / payments changed after this close — recount if needed</small>' : ''}</span>
      <span class="right"><b class="${diffClass(s.cashDiff || 0)}">cash ${signed(s.cashDiff || 0)}</b>${s.gcashDiff != null ? `<small class="${diffClass(s.gcashDiff)}">GCash ${signed(s.gcashDiff)}</small>` : ''}</span>
    </div>`;
    }).join('')}</div>`;
}
function bindShiftLive() {
  const num = id => { const v = $(id)?.value; return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); };
  const oc = $('#openCash');
  if (oc) oc.oninput = () => {
    const left = oc.dataset.left === '' ? null : Number(oc.dataset.left), v = num('#openCash');
    $('#openDiff').innerHTML = left == null || v == null ? '' : `<span class="${diffClass(v - left)}">vs left by previous shift: ${signed(v - left)}</span>`;
  };
  if ($('#countCash')) {
    const match = (a, b) => `<span class="${diffClass(a - b)}">${Math.abs(a - b) < 1 ? '✓ Matches' : (a > b ? 'Over ' : 'Short ') + peso(Math.abs(a - b))}</span>`;
    const upd = () => {
      const counted = num('#countCash'), exp = Number($('#expCash').dataset.v), rem = num('#cashRemoved') || 0;
      const gc = num('#countGcash'), eg = $('#expGcash').dataset.v === '' ? null : Number($('#expGcash').dataset.v);
      $('#cashDiff').innerHTML = counted == null ? '' : match(counted, exp);
      $('#gcashDiff').innerHTML = gc == null || eg == null ? '' : match(gc, eg);
      $('#leftDrawer').textContent = counted == null ? '—' : peso(counted - rem);
      STOCK_ITEMS.filter(isCount).forEach(({ k }) => {
        const c = num('#cs-' + k), e = $('#cx-' + k).dataset.exp;
        $('#cd-' + k).innerHTML = c == null || e === '' ? '' : `<span class="${Math.abs(c - Number(e)) < 1 ? 'ok' : 'bad'}">${stockDiffText(+(c - Number(e)).toFixed(1))}</span>`;
      });
    };
    ['#countCash', '#countGcash', '#cashRemoved', ...STOCK_ITEMS.filter(isCount).map(({ k }) => '#cs-' + k)].forEach(id => { $(id).oninput = upd; });
  }
}
function openRegister() {
  const v = $('#openCash').value;
  if (v === '' || isNaN(Number(v))) return alert('Count the cash in the drawer and enter it.');
  if (!currentStaff()) return alert('Select your name on HOME first.');
  if (openSession()) return alert('The register is already open.');
  const opening = readStock('os');
  const missing = STOCK_ITEMS.filter(({ k }) => opening[k] === null).map(x => x.name);
  if (missing.length && !confirm(`Not checked: ${missing.join(', ')}.\nThe POS cannot warn you before these run out. Open anyway?`)) return;
  if (!myClock() && confirm('You are not checked in yet. Check in now?')) clockIn(true);
  const prev = lastClosed(), g = $('#openGcash').value;
  const s = {
    id: uid(), date: dateKey(), openedAt: stampOf(), openedBy: currentStaff(), openingCash: Number(v),
    openingGcash: g === '' || isNaN(Number(g)) ? null : Number(g), leftByPrevious: prev ? prev.leftInDrawer ?? null : null, stock: { opening },
    shift: $('#openShift').value, weather: $('#openWeather').value,
  };
  save(K.register, [...sessions(), s]); SheetSync.register(s); addAudit({ action: 'register_open', after: s });
  toast(`Register opened with ${peso(s.openingCash)}`);
  ensureMyMeal(); render();
}
async function startClose() {
  state.regClosing = true; render(); window.scrollTo(0, 0);
  const btn = $('[data-reg-save]'); if (btn) { btn.disabled = true; btn.textContent = 'Getting latest orders…'; }
  await syncFromSheet(); // include orders just taken on the other phone
  if (state.view === 'shift' && state.regClosing) render();
}
function saveClose() {
  const s = openSession(); if (!s) return;
  const counted = $('#countCash').value;
  if (counted === '' || isNaN(Number(counted))) return alert('Count the cash in the drawer and enter it.');
  const counts = readStock('cs');
  const missing = STOCK_ITEMS.filter(({ k }) => counts[k] === null).map(x => x.name);
  if (missing.length && !confirm(`Stock not checked: ${missing.join(', ')}.\nClose anyway?`)) return;
  const gV = $('#countGcash').value, remV = $('#cashRemoved').value;
  const closed = { ...s, closedAt: stampOf(), closedBy: currentStaff() || s.openedBy };
  const f = sessionFigures(closed);
  const gc = gV === '' || isNaN(Number(gV)) ? null : Number(gV), removed = Number(remV) || 0;
  const items = {};
  const todo = [];
  STOCK_ITEMS.forEach(it => {
    const x = f.stock[it.k], c = counts[it.k];
    const rec = isCount(it)
      ? { ...x, counted: c, diff: c === null || x.expected === null ? null : +(c - x.expected).toFixed(3) }
      : { ...x, level: c };
    rec.status = statusOf(it, c);
    if (rec.status === 'red' || rec.status === 'out') todo.push(todoText(it, c));
    items[it.k] = rec;
  });
  Object.assign(closed, {
    cashSales: f.cashSales, cashIn: f.cashIn, cashOut: f.cashOut, expectedCash: f.expectedCash, countedCash: Number(counted), cashDiff: Number(counted) - f.expectedCash,
    gcashSales: f.gcashSales, gcashIn: f.gcashIn, gcashOut: f.gcashOut, expectedGcash: f.expectedGcash, countedGcash: gc,
    gcashDiff: gc === null || f.expectedGcash === null ? null : gc - f.expectedGcash,
    cashRemoved: removed, leftInDrawer: Number(counted) - removed, orders: f.orders, bowls: f.bowls, totalSales: f.totalSales, guests: f.guests,
    note: $('#regNote').value.trim(), stock: { opening: (s.stock && s.stock.opening) || {}, items, todo },
  });
  save(K.register, sessions().map(x => (x.id === s.id ? closed : x))); SheetSync.register(closed); addAudit({ action: 'register_close', after: closed });
  const off = STOCK_ITEMS.filter(it => isCount(it) && items[it.k].diff !== null && Math.abs(items[it.k].diff) >= 1).map(it => `${it.name} ${items[it.k].diff > 0 ? '+' : ''}${items[it.k].diff} ${it.unit}`);
  alert(`Register closed.\nCash: ${Math.abs(closed.cashDiff) < 1 ? 'matches ✓' : signed(closed.cashDiff)}` +
    (closed.gcashDiff != null ? `\nGCash: ${Math.abs(closed.gcashDiff) < 1 ? 'matches ✓' : signed(closed.gcashDiff)}` : '') +
    `\nStock count vs POS: ${off.length ? off.join(', ') : 'matches ✓'}` +
    `\n\nTo prep / buy:\n${todo.length ? todo.map(x => '• ' + x).join('\n') : 'nothing ✓'}` +
    `\nLeft in drawer: ${peso(closed.leftInDrawer)}`);
  const andOut = state.checkoutAfterClose;
  state.regClosing = false; state.checkoutAfterClose = false;
  if (andOut) doClockOut(); else render();
}

/* money that is not a sale or a purchase: owner top-up, owner removal, transfer between cash and GCash */
const MONEY_KINDS = [
  ['topup-CASH', 'Top-up', 'CASH', '', '➕ Owner adds cash to the drawer'],
  ['topup-GCASH', 'Top-up', 'GCASH', '', '➕ Owner adds to store GCash'],
  ['removal-CASH', 'Removal', 'CASH', '', '➖ Owner takes cash from the drawer'],
  ['removal-GCASH', 'Removal', 'GCASH', '', '➖ Owner takes from store GCash'],
  ['tr-CG', 'Transfer', 'CASH', 'GCASH', '🔁 Cash from drawer → store GCash'],
  ['tr-GC', 'Transfer', 'GCASH', 'CASH', '🔁 Store GCash → cash in drawer'],
];
function moneyForm() {
  const sel = state.moneyKind || 'removal-CASH';
  return `<button class="btn back" data-money-back>← Back</button>
  <div class="card">
    <div class="section-title">💱 Money in / out</div>
    <p class="help">Not a sale and not a purchase. Purchases go in EXPENSE.</p>
    <div class="pay-from">${MONEY_KINDS.map(([id, , , , label]) => `<button class="choice ${sel === id ? 'active' : ''}" data-money-kind="${id}">${label}</button>`).join('')}</div>
    <div class="field"><label>Amount (₱)</label><input class="input big-input" id="moneyAmt" inputmode="decimal"></div>
    <div class="field"><label>Note</label><input class="input" id="moneyNote" maxlength="60" placeholder="e.g. change for the drawer"></div>
    <button class="btn primary wide" data-money-save>SAVE</button>
  </div>`;
}
function saveMoney() {
  const amt = Number($('#moneyAmt').value);
  if (!(amt > 0)) return alert('Enter the amount.');
  if (!currentStaff()) return alert('Select your name on HOME first.');
  const [, kind, from, to, label] = MONEY_KINDS.find(m => m[0] === (state.moneyKind || 'removal-CASH'));
  const now = new Date();
  const rec = {
    id: uid(), date: dateKey(now), time: timeKey(now), item: label.replace(/^\S+\s/, ''), category: 'Money move', kind, packs: 1, amount: amt,
    payment: from, toAccount: to, memo: $('#moneyNote').value.trim(), staff: currentStaff(), presetId: '', createdAt: stampOf(now),
  };
  save(K.expenses, [...expenses(), rec]); SheetSync.expenseAdd(rec); addAudit({ action: 'money_move', after: rec });
  state.moneyForm = false; state.moneyKind = null; toast(`${kind} ${peso(amt)} recorded`); render();
}

/* meal allowance: handed over from register cash when the staff checks in (owner rule, ₱100/day) */
function mealAmount() { const v = localStorage.getItem(K.meal); return v === null || v === '' ? 100 : Number(v) || 0; }
function ensureMyMeal() {
  const me = myClock(); if (!me || !openSession()) return false; // no open register yet → paid when it opens
  const amt = mealAmount(); if (!amt) return false;
  const day = me.in.slice(0, 10);
  if (expenses().some(e => e.presetId === 'MEAL' && e.staff === me.staff && e.date === day)) return false;
  const now = new Date();
  const rec = {
    id: uid(), date: day, time: timeKey(now), item: `Meal allowance – ${me.staff}`, category: 'Labor', kind: 'Expense', packs: 1, amount: amt,
    payment: 'CASH', toAccount: '', memo: 'auto at check-in', staff: me.staff, forStaff: me.staff, presetId: 'MEAL', createdAt: stampOf(now),
  };
  save(K.expenses, [...expenses(), rec]); SheetSync.expenseAdd(rec); addAudit({ action: 'meal_allowance', after: rec });
  toast(`Meal allowance ${peso(amt)} — take it from the drawer`);
  return true;
}

/* time clock — check-in / check-out go to the Timesheet sheet, where pay is calculated */
function myClock() { const n = currentStaff(); return n ? clockedIn().find(c => c.staff === n) || null : null; }
function clockIn(quiet) {
  const n = currentStaff(); if (!n) return alert('Select your name first.');
  if (myClock()) return;
  const c = { id: uid(), staff: n, in: stampOf() };
  save(K.clockedIn, [...clockedIn(), c]); SheetSync.clockIn(c); addAudit({ action: 'clock_in', after: c });
  if (quiet) return;
  if (!openSession()) { toast('Checked in — now open the register'); go('shift'); }
  else { if (!ensureMyMeal()) toast(`Checked in at ${hhmm(c.in)}`); render(); }
}
function clockOutFlow() {
  const me = myClock(); if (!me) return;
  // Prompt the person who opened the register (shift handover), or whoever leaves last.
  const s = openSession(), others = clockedIn().filter(c => c.staff !== me.staff);
  const why = s && s.openedBy === me.staff ? 'You opened the register this shift.' : 'You are the last one on duty.';
  if (s && (s.openedBy === me.staff || !others.length) && confirm(`${why}\nClose the register (count cash, GCash and stock) before checking out?`)) {
    state.view = 'shift'; state.checkoutAfterClose = true; startClose(); return;
  }
  doClockOut();
}
function doClockOut() {
  const me = myClock(); if (!me) return;
  let out = stampOf();
  if (hoursSince(me.in) > 14) { // forgot to check out last time
    const t = prompt(`You checked in at ${me.in.slice(0, 16)}.\nWhat time did you actually leave? (HH:MM)`, '');
    if (t === null) return;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return alert('Use HH:MM, e.g. 21:30');
    const [y, mo, d] = me.in.slice(0, 10).split('-').map(Number);
    let when = new Date(y, mo - 1, d, +m[1], +m[2]);
    if (stampOf(when) <= me.in) when = new Date(y, mo - 1, d + 1, +m[1], +m[2]);
    out = stampOf(when);
  }
  const c = { ...me, out };
  save(K.clockedIn, clockedIn().filter(x => x.id !== me.id)); SheetSync.clockOut(c); addAudit({ action: 'clock_out', after: c });
  toast(`Checked out ${hhmm(out)} — thank you!`); go('home');
}

/* ── REPORT ────────────────────────────────────────────── */
const monthTarget = () => Number(localStorage.getItem(K.target) || 0);
function shiftMonth(mk, d) { const [y, m] = mk.split('-').map(Number); return monthKey(new Date(y, m - 1 + d, 1)); }
function monthLabel(mk) { const [y, m] = mk.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); }
function reportView() {
  const mk = state.reportMonth || monthKey();
  const os = orders().filter(o => o.date.startsWith(mk)), es = expenses().filter(e => e.date.startsWith(mk) && isSpend(e));
  const s = summarize(os), exp = es.reduce((a, e) => a + e.amount, 0);
  const days = [...new Set(os.map(o => o.date))].length;
  const target = monthTarget();

  const byDay = {}; os.forEach(o => { byDay[o.date] = (byDay[o.date] || 0) + o.total; });
  const [y, m] = mk.split('-').map(Number), nDays = new Date(y, m, 0).getDate();
  const dayVals = Array.from({ length: nDays }, (_, i) => byDay[`${mk}-${pad(i + 1)}`] || 0);
  const maxDay = Math.max(1, ...dayVals);

  const prod = {};
  const bump = (name, qty, amt) => { prod[name] = prod[name] || { qty: 0, amt: 0 }; prod[name].qty += qty; prod[name].amt += amt; };
  os.forEach(o => o.items.forEach(l => {
    bump(l.name, l.qty, l.price * l.qty);
    if (l.set) bump('SET: ' + l.set.name, l.qty, l.set.price * l.qty);
    (l.toppings || []).forEach(t => bump('TOP: ' + t.name, t.qty * l.qty, t.price * t.qty * l.qty));
  }));
  const ranking = Object.entries(prod).sort((a, b) => b[1].amt - a[1].amt);
  const expCat = {}; es.forEach(e => { expCat[e.category] = (expCat[e.category] || 0) + e.amount; });
  const expRank = Object.entries(expCat).sort((a, b) => b[1] - a[1]);

  return `<div class="month-nav">
      <button class="btn small" data-month="-1">◀</button><b>${monthLabel(mk)}</b>
      <button class="btn small" data-month="1" ${mk >= monthKey() ? 'disabled' : ''}>▶</button></div>
    <div class="card hero">
      <div class="label">MONTH SALES</div><div class="big">${peso(s.sales)}</div>
      ${target ? `<div class="bar"><span style="width:${Math.min(100, s.sales / target * 100)}%"></span></div>
        <small>${pct(s.sales / target)} of goal ${peso(target)}</small>` : ''}
      <button class="btn small ghost" data-edit-target>🎯 ${target ? 'Change' : 'Set'} monthly goal</button>
    </div>
    <div class="kpi-grid">
      <div class="card kpi"><small>Bowls</small><b>${s.bowls}</b><small>${days ? (s.bowls / days).toFixed(1) : 0} / day</small></div>
      <div class="card kpi"><small>Avg ticket</small><b>${peso(Math.round(s.avg))}</b><small>${s.orders} orders</small></div>
      <div class="card kpi"><small>Side attach</small><b>${pct(s.attach)}</b><small>goal 30%+</small></div>
      <div class="card kpi"><small>Topping rate</small><b>${pct(s.toppingRate)}</b><small>of bowls</small></div>
      <div class="card kpi"><small>Expenses</small><b>${peso(exp)}</b><small>recorded in POS</small></div>
      <div class="card kpi"><small>Net</small><b>${peso(s.sales - exp)}</b><small>sales − expenses</small></div>
    </div>
    <div class="card"><div class="section-title">Daily sales</div>
      <div class="daybars">${dayVals.map((v, i) => `<div title="${i + 1}: ${peso(v)}"><span style="height:${v / maxDay * 100}%"></span><small>${(i + 1) % 5 === 1 ? i + 1 : ''}</small></div>`).join('')}</div></div>
    <div class="card"><div class="section-title">Mix</div>
      <div class="row"><span>Cash / GCash</span><b>${peso(s.cash)} / ${peso(s.gcash)}</b></div>
      <div class="row"><span>Dine-in / Take-out orders</span><b>${s.dineIn} / ${s.takeout}</b></div></div>
    <div class="card"><div class="section-title">Product ranking (by ₱)</div>
      ${ranking.map(([n, v]) => `<div class="row"><span>${esc(n)} <small class="muted">×${v.qty}</small></span><b>${peso(v.amt)}</b></div>`).join('') || '<div class="muted">No sales.</div>'}</div>
    <div class="card"><div class="section-title">Expenses by category</div>
      ${expRank.map(([n, v]) => `<div class="row"><span>${esc(n)}</span><b>${peso(v)}</b></div>`).join('') || '<div class="muted">No expenses.</div>'}
      <hr><div class="row sub"><span>Purchases (ingredients, packaging)</span><span>${peso(es.filter(e => e.kind === 'Purchase').reduce((a, e) => a + e.amount, 0))}</span></div>
      <div class="row sub"><span>Other expenses</span><span>${peso(es.filter(e => e.kind !== 'Purchase').reduce((a, e) => a + e.amount, 0))}</span></div>
      <div class="row sub"><span>… of which meal allowance</span><span>${peso(es.filter(e => e.presetId === 'MEAL').reduce((a, e) => a + e.amount, 0))}</span></div>
      <hr>${PAY_FROM.map(([v, label]) => `<div class="row sub"><span>${label}</span><span>${peso(es.filter(e => e.payment === v).reduce((a, e) => a + e.amount, 0))}</span></div>`).join('')}</div>
    ${(() => {
      const cl = sessions().filter(s => s.closedAt && s.openedAt.startsWith(mk));
      if (!cl.length) return '';
      const cash = cl.reduce((a, s) => a + (s.cashDiff || 0), 0), gc = cl.filter(s => s.gcashDiff != null).reduce((a, s) => a + s.gcashDiff, 0);
      const off = cl.filter(s => Math.abs(s.cashDiff || 0) >= 1 || Math.abs(s.gcashDiff || 0) >= 1).length;
      const stockOff = cl.filter(s => ((s.stock && s.stock.todo) || []).length).length;
      return `<div class="card"><div class="section-title">Register checks</div>
        <div class="row"><span>Shifts closed</span><b>${cl.length}</b></div>
        <div class="row"><span>Shifts with a difference</span><b class="${off ? 'bad' : 'ok'}">${off}</b></div>
        <div class="row"><span>Cash over / short (total)</span><b class="${diffClass(cash)}">${signed(cash)}</b></div>
        <div class="row"><span>GCash over / short (total)</span><b class="${diffClass(gc)}">${signed(gc)}</b></div>
        <div class="row"><span>Shifts that ended with items to prep / buy</span><b class="${stockOff ? 'bad' : 'ok'}">${stockOff}</b></div></div>`;
    })()}
    ${(() => {
      const so = moves().filter(m => m.type === 'Sold out' && String(m.createdAt).startsWith(mk));
      if (!so.length) return '';
      const by = {}; so.forEach(m => { by[m.note || m.item] = (by[m.note || m.item] || 0) + 1; });
      return `<div class="card"><div class="section-title">⛔ Sold out this month <small class="muted">(lost sales)</small></div>
        ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<div class="row"><span>${esc(n)}</span><b>${c}×</b></div>`).join('')}
        <p class="help">Items that sold out often need a higher prep point in the “Stock Items” sheet.</p></div>`;
    })()}`;
}

/* ── HISTORY ───────────────────────────────────────────── */
function historyView() {
  const sales = state.historyTab === 'sales';
  let body;
  if (sales && state.historyDate) {
    const os = orders().filter(o => o.date === state.historyDate).sort((a, b) => a.time.localeCompare(b.time));
    const s = summarize(os);
    body = `<button class="btn back" data-history-back>← All days</button>
      <div class="card hero small"><div class="label">${state.historyDate}</div><div class="big">${peso(s.sales)}</div><small>${s.orders} orders · ${s.bowls} bowls</small></div>
      ${os.map(o => `<div class="card order-card">
        <div class="order-head"><div><b>#${o.no || '—'} · ${o.time}</b> <small>${o.payment} · ${o.mode === 'TAKEOUT' ? 'Take-out' : 'Dine-in'}${o.ref ? ' · ' + esc(o.ref) : ''}${o.staff ? ' · 👤 ' + esc(o.staff) : ''}</small>
          ${o.backdated ? '<span class="badge">BACKDATED</span>' : ''}${o.editedAt ? '<span class="badge">EDITED</span>' : ''}</div>
          <b>${peso(o.total)}</b></div>
        ${o.items.map(l => `<div class="order-line"><span>${l.qty}× ${esc(l.name)}${lineExtras(l).length ? `<small>${lineExtras(l).map(esc).join(' · ')}</small>` : ''}</span><span>${peso(lineTotal(l))}</span></div>`).join('')}
        <div class="order-actions"><button class="btn small" data-edit-order="${o.id}">Edit</button><button class="btn small danger" data-delete-order="${o.id}">Delete</button></div>
      </div>`).join('')}`;
  } else if (sales) {
    const map = {};
    orders().forEach(o => { (map[o.date] = map[o.date] || []).push(o); });
    const days = Object.keys(map).sort().reverse();
    body = days.map(d => { const s = summarize(map[d]); return `<button class="card day-row" data-history-day="${d}">
      <span><b>${d}</b><small>${s.orders} orders · ${s.bowls} bowls</small></span><b>${peso(s.sales)}</b></button>`; }).join('') || '<div class="muted center">No sales yet.</div>';
  } else {
    body = expenses().slice().reverse().slice(0, 60).map(e => `<div class="card order-card">
      <div class="order-head"><div><b>${esc(e.item || e.category)}</b> <small>${e.date} ${e.time} · ${esc(e.category)} · ${entryLabel(e)}${e.staff ? ' · 👤 ' + esc(e.staff) : ''}${e.memo ? ' · ' + esc(e.memo) : ''}</small></div><b>-${peso(e.amount)}</b></div>
      <div class="order-actions"><button class="btn small" data-edit-expense="${e.id}">Edit</button><button class="btn small danger" data-delete-expense="${e.id}">Delete</button></div>
    </div>`).join('') || '<div class="muted center">No expenses yet.</div>';
  }
  return `<div class="tabs">
      <button class="tab ${sales ? 'active' : ''}" data-history-tab="sales">SALES</button>
      <button class="tab ${!sales ? 'active' : ''}" data-history-tab="expense">EXPENSES</button></div>
    ${body}
    <button class="btn wide" data-export>⬇ Export CSV</button>`;
}
function exportCSV() {
  const rows = [['type', 'date', 'time', 'order_no', 'mode', 'ref', 'staff', 'payment', 'item', 'category', 'set', 'toppings', 'qty', 'unit_price', 'amount']];
  orders().forEach(o => o.items.forEach(l => rows.push(['sale', o.date, o.time, o.no || '', o.mode || '', o.ref || '', o.staff || '', o.payment, l.name, l.category, l.set ? l.set.name : '', (l.toppings || []).map(t => `${t.name}x${t.qty}`).join(' '), l.qty, unitPrice(l), lineTotal(l)])));
  expenses().forEach(e => rows.push(['expense', e.date, e.time, '', '', '', e.staff || '', e.payment, e.item || '', e.category, '', e.memo || '', e.packs || 1, '', -e.amount]));
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `ramen-sho-pos-${dateKey()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ── RECIPE ────────────────────────────────────────────── */
function recipeView() {
  const r = RECIPES.find(x => x.id === state.recipeId);
  if (!r) return `<div class="section-title">Recipes (bowl SOP)</div>
    <div class="menu-grid">${RECIPES.map(x => `<button class="menu-card" data-recipe="${x.id}"><span class="menu-icon">${x.icon}</span><span class="menu-name">${esc(x.name)}</span></button>`).join('')}</div>
    <p class="help">TBD = not measured yet. Update menu-default.js when the SOP is fixed.</p>`;
  return `<button class="btn back" data-recipe-back>← Recipes</button>
    <div class="section-title">${r.icon} ${esc(r.name)}</div>
    <div class="card list">${r.steps.map((s, i) => `<div class="recipe-step"><span class="step-no">${i + 1}</span>
      <span><b>${esc(s.n)}</b>${s.how ? `<small>${esc(s.how)}</small>` : ''}</span><b class="${s.q.startsWith('TBD') ? 'tbd' : ''}">${esc(s.q)}</b></div>`).join('')}</div>`;
}

/* ── multi-phone sync ──────────────────────────────────
   Each staff member uses their own phone. The sheet is the master copy: every sync
   replaces this phone's records from the 1st of last month onward with the sheet's,
   except changes still waiting in this phone's send queue. Older months stay as they are. */
const SYNC_KEY = 'sho_last_sync';
function syncSince() { const d = new Date(); return dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
function mirror(local, server, since, pend) {
  const byId = new Map(local.map(x => [x.id, x]));
  const older = local.filter(x => x.date < since);
  const fromSheet = server
    .filter(x => !pend.remove.has(x.id) && !pend.upsert.has(x.id))
    .map(x => { const l = byId.get(x.id); return l ? { ...x, backdated: l.backdated, editedAt: l.editedAt } : x; });
  const unsent = local.filter(x => x.date >= since && pend.upsert.has(x.id));
  const out = new Map(); // later wins: sheet over older local copy, unsent over sheet
  [...older, ...fromSheet, ...unsent].forEach(x => { out.delete(x.id); out.set(x.id, x); });
  return [...out.values()];
}
// Callers that arrive mid-sync (e.g. CLOSE REGISTER) wait for the running sync.
let syncing = null;
function syncFromSheet() {
  if (!SheetSync.enabled) return Promise.resolve();
  if (!syncing) syncing = runSync().finally(() => { syncing = null; });
  return syncing;
}
async function runSync() {
  const since = syncSince();
  // A change can leave the queue while the sheet is being read, so protect anything
  // that was unsent either before or after the read.
  const pendBefore = SheetSync.pendingChanges();
  const j = await SheetSync.fetchSync(since, dateKey());
  if (!j) return;
  const pend = SheetSync.pendingChanges();
  pendBefore.upsert.forEach(id => { if (!pend.remove.has(id)) pend.upsert.add(id); });
  pendBefore.remove.forEach(id => { if (!pend.upsert.has(id)) pend.remove.add(id); });
  pendBefore.served.forEach((on, id) => { if (!pend.served.has(id)) pend.served.set(id, on); });
  pendBefore.staff.forEach(n => pend.staff.add(n));
  pend.settings = { ...pendBefore.settings, ...pend.settings };
  pendBefore.sessions.forEach((s, id) => { if (!pend.sessions.has(id)) pend.sessions.set(id, s); });
  pendBefore.clock.forEach((c, id) => { if (!pend.clock.has(id)) pend.clock.set(id, c); });
  const snapshot = () => JSON.stringify([orders(), expenses(), moves(), sessions(), clockedIn(), load(K.served), staffList(), monthTarget(), STOCK_ITEMS]);
  const before = snapshot();

  save(K.orders, mirror(orders(), j.orders || [], since, pend));
  save(K.expenses, mirror(expenses(), j.expenses || [], since, pend));
  save(K.moves, mirror(moves(), j.moves || [], since, pend));
  save(K.register, mirror(sessions(), j.register || [], since, { upsert: new Set(pend.sessions.keys()), remove: new Set() }));

  // who is checked in: sheet's open entries, adjusted by this phone's unsent check-ins / check-outs
  const clocks = new Map((j.clockedIn || []).map(c => [c.id, c]));
  pend.clock.forEach((c, id) => { if (c.out) clocks.delete(id); else clocks.set(id, c); });
  save(K.clockedIn, [...clocks.values()]);

  const served = new Set(j.served || []);
  pend.served.forEach((on, id) => { if (on) served.add(id); else served.delete(id); });
  save(K.served, [...served]);

  save(K.staff, [...new Set([...(j.staff || []), ...pend.staff])]);
  const spb = (j.settings || {}).base_servings_per_bag;
  if (spb) localStorage.setItem('sho_servings_per_bag', String(spb));
  const kml = (j.settings || {}).kaeshi_ml_per_bottle;
  if (kml) localStorage.setItem('sho_kaeshi_ml', String(kml));
  if (Array.isArray(j.stockItems) && j.stockItems.length) { save('sho_stock_items', j.stockItems); STOCK_ITEMS = j.stockItems; }
  const meal = (j.settings || {}).meal_allowance;
  if (meal !== undefined && meal !== '') localStorage.setItem(K.meal, String(meal));
  const target = pend.settings.month_target ?? (j.settings || {}).month_target;
  if (target !== undefined && target !== '') localStorage.setItem(K.target, String(target));

  // someone else opened the register after I checked in → my meal allowance is paid now
  if (!state.regClosing) ensureMyMeal();
  localStorage.setItem(SYNC_KEY, new Date().toISOString());
  const changed = before !== snapshot();
  const idle = !state.detail && !state.checkout && !state.expPreset && !state.expManual && !state.editingExpenseId && !state.stockEdit && !state.regClosing;
  if (idle && (changed || state.view === 'kitchen') && ['home', 'kitchen', 'history', 'report', 'shift'].includes(state.view) && !$('#openCash:focus')) render();
  else updateSyncBadge();
}
function syncSoon() { clearTimeout(syncSoon.h); syncSoon.h = setTimeout(syncFromSheet, 1500); }

/* ── events ────────────────────────────────────────────── */
function on(sel, fn, ev = 'onclick') { $$(sel).forEach(el => { el[ev] = () => fn(el); }); }
function bind() {
  on('[data-go]', b => go(b.dataset.go));
  const ss = $('#staffSelect'); if (ss) ss.onchange = () => { localStorage.setItem(K.curStaff, ss.value); render(); };
  on('[data-add-staff]', () => {
    const n = (prompt('Staff name') || '').trim(); if (!n) return;
    const l = staffList(); if (!l.includes(n)) { l.push(n); save(K.staff, l); SheetSync.staffAdd(n, dateKey()); }
    localStorage.setItem(K.curStaff, n); render();
  });

  // order
  on('[data-menu-cat]', b => { state.menuCat = b.dataset.menuCat || null; render(); });
  on('[data-menu-refresh]', b => { b.disabled = true; b.textContent = '…'; refreshMenu(false); });
  on('[data-item]', b => {
    const it = itemById(b.dataset.item); if (!it) return;
    if (state.soldOutMode) { toggleSoldOut(it.id); render(); return; }
    if (soldOutIds().has(it.id)) return alert(`${it.name} is SOLD OUT.\nTap “Mark an item sold out” and tap it again when it is back.`);
    if (isRamen(it)) { openDetail(it); render(); window.scrollTo(0, 0); }
    else { addLine(baseLine(it)); toast(`+1 ${it.name}`); render(); }
  });
  on('[data-sold-out-mode]', () => { state.soldOutMode = !state.soldOutMode; render(); });
  on('[data-stock-check]', () => { state.stockCheck = true; render(); window.scrollTo(0, 0); });
  on('[data-stock-check-go]', () => { state.view = 'stock'; state.stockCheck = true; render(); window.scrollTo(0, 0); });
  on('[data-stock-check-back]', () => { state.stockCheck = false; render(); });
  on('[data-stock-check-save]', saveStockCheck);
  on('[data-level]', b => { // Enough / Low / Out chips: no re-render so typed numbers stay
    const [prefix, k, level] = b.dataset.level.split('|');
    $$(`[data-level^="${prefix}|${k}|"]`).forEach(x => x.classList.toggle('active', x === b));
    $(`#${prefix}-${k}`).value = level;
  });
  on('[data-make-set]', b => { keepCheckoutInputs(); makeSet(+b.dataset.makeSet); render(); });
  on('[data-detail-back]', () => { state.detail = null; render(); });
  const note = $('#lineNote'); if (note) note.oninput = () => { state.detail.note = note.value; };
  on('[data-set]', b => { state.detail.setId = b.dataset.set; render(); });
  on('[data-top-plus]', b => { const t = state.detail.tops; t[b.dataset.topPlus] = Math.min(9, (t[b.dataset.topPlus] || 0) + 1); render(); });
  on('[data-top-minus]', b => { const t = state.detail.tops; t[b.dataset.topMinus] = Math.max(0, (t[b.dataset.topMinus] || 0) - 1); render(); });
  on('[data-dqty]', b => { state.detail.qty = Math.max(1, Math.min(99, state.detail.qty + Number(b.dataset.dqty))); render(); });
  on('[data-detail-add]', () => { const l = detailLine(); addLine(l); state.detail = null; toast(`+${l.qty} ${l.name}`); render(); });
  on('[data-checkout]', () => { state.checkout = true; render(); window.scrollTo(0, 0); });
  on('[data-add-more]', () => { keepCheckoutInputs(); state.checkout = false; render(); });
  on('[data-cart-plus]', b => { keepCheckoutInputs(); const l = state.cart[+b.dataset.cartPlus]; l.qty = Math.min(99, l.qty + 1); render(); });
  on('[data-cart-minus]', b => { keepCheckoutInputs(); const l = state.cart[+b.dataset.cartMinus]; l.qty = Math.max(1, l.qty - 1); render(); });
  on('[data-cart-remove]', b => { keepCheckoutInputs(); state.cart.splice(+b.dataset.cartRemove, 1); render(); });
  on('[data-mode]', b => { keepCheckoutInputs(); state.mode = b.dataset.mode; render(); });
  on('[data-guests]', b => { keepCheckoutInputs(); state.guests = Math.max(1, (state.guests ?? guestsDefault()) + Number(b.dataset.guests)); render(); });
  on('[data-pay]', b => { keepCheckoutInputs(); state.payment = b.dataset.pay; render(); });
  on('[data-cash]', b => { keepCheckoutInputs(); state.cashGiven = b.dataset.cash; render(); });
  const cg = $('#cashGiven'); if (cg) cg.onchange = () => { keepCheckoutInputs(); render(); };
  on('[data-complete]', completeOrder);
  on('[data-cancel-edit]', () => { resetOrder(); go('history'); });

  // kitchen
  on('[data-serve]', b => {
    const id = b.dataset.serve, s = load(K.served); s.push(id); save(K.served, s.slice(-500));
    SheetSync.served(id, dateKey(), timeKey(), currentStaff()); render();
  });
  on('[data-unserve]', b => { save(K.served, load(K.served).filter(x => x !== b.dataset.unserve)); SheetSync.unserved(b.dataset.unserve); render(); });
  on('[data-toggle-served]', () => { state.kitchenShowServed = !state.kitchenShowServed; render(); });

  // expense
  on('[data-preset]', b => { state.expPreset = PRESETS.rows[+b.dataset.preset]; state.payment = 'CASH'; render(); });
  on('[data-exp-manual]', () => { state.expManual = true; render(); });
  on('[data-labor-pay]', b => { state.laborPay = b.dataset.laborPay; render(); });
  on('[data-labor-back]', () => { state.laborPay = null; render(); });
  on('[data-labor-staff]', b => { $$('[data-labor-staff]').forEach(x => x.classList.toggle('active', x === b)); $('#laborStaff').value = b.dataset.laborStaff; });
  on('[data-labor-save]', saveLaborPay);
  on('[data-exp-back]', () => { const wasEdit = !!state.editingExpenseId; state.expPreset = null; state.expManual = false; state.editingExpenseId = null; if (wasEdit) { state.historyTab = 'expense'; go('history'); } else render(); });
  on('[data-preset-refresh]', b => { b.disabled = true; b.textContent = '…'; refreshPresets(false); });
  const packs = $('#expPacks');
  if (packs && packs.dataset.unitPrice) packs.oninput = () => { $('#expAmount').value = Math.round(Number(packs.dataset.unitPrice) * (Number(packs.value) || 0) * 100) / 100; };
  on('[data-exp-pay]', b => { // no re-render, so typed values stay
    $$('[data-exp-pay]').forEach(x => x.classList.toggle('active', x === b)); $('#expPay').value = b.dataset.expPay;
  });
  on('[data-save-exp]', saveExpense);

  // stock
  on('[data-stock-cat]', b => { state.stockCat = b.dataset.stockCat || null; state.stockOnlyLow = false; render(); });
  on('[data-stock-low]', () => { state.stockOnlyLow = !state.stockOnlyLow; state.stockCat = null; render(); });
  on('[data-stock-refresh]', b => { b.disabled = true; b.textContent = '…'; refreshInventory(false); });
  on('[data-stock-edit]', b => { state.stockEdit = b.dataset.stockEdit; render(); setTimeout(() => $('#stockQty')?.focus(), 50); });
  on('[data-stock-back]', () => { state.stockEdit = null; render(); });
  on('[data-stock-save]', saveStockCount);

  // close / report / history / recipe
  // shift / register / time clock
  on('[data-clock-in]', () => clockIn(false));
  on('[data-clock-out]', clockOutFlow);
  on('[data-reg-open]', openRegister);
  on('[data-open-shift]', b => { $$('[data-open-shift]').forEach(x => x.classList.toggle('active', x === b)); $('#openShift').value = b.dataset.openShift; });
  on('[data-open-weather]', b => { $$('[data-open-weather]').forEach(x => x.classList.toggle('active', x === b)); $('#openWeather').value = b.dataset.openWeather; });
  on('[data-reg-close]', startClose);
  on('[data-reg-cancel]', () => { state.regClosing = false; state.checkoutAfterClose = false; render(); });
  on('[data-reg-save]', saveClose);
  on('[data-money-form]', () => { state.moneyForm = true; render(); window.scrollTo(0, 0); });
  on('[data-money-back]', () => { state.moneyForm = false; render(); });
  on('[data-money-kind]', b => { $$('[data-money-kind]').forEach(x => x.classList.toggle('active', x === b)); state.moneyKind = b.dataset.moneyKind; });
  on('[data-money-save]', saveMoney);
  on('[data-move-form]', b => { state.moveForm = b.dataset.moveForm; render(); window.scrollTo(0, 0); });
  on('[data-move-back]', () => { state.moveForm = null; render(); });
  on('[data-move-item]', b => { $$('[data-move-item]').forEach(x => x.classList.toggle('active', x === b)); $('#moveItem').value = b.dataset.moveItem; });
  on('[data-move-save]', saveMove);
  on('[data-move-del]', b => deleteMove(b.dataset.moveDel));
  bindShiftLive();
  on('[data-month]', b => { const next = shiftMonth(state.reportMonth || monthKey(), +b.dataset.month); if (next <= monthKey()) { state.reportMonth = next; render(); } });
  on('[data-edit-target]', () => {
    const v = prompt('Monthly sales goal (₱)', String(monthTarget() || '')); if (v === null) return;
    const n = Number(v); if (!(n >= 0)) return alert('Enter a number.'); localStorage.setItem(K.target, String(n)); SheetSync.setting('month_target', n); render();
  });
  on('[data-history-tab]', b => { state.historyTab = b.dataset.historyTab; state.historyDate = null; render(); });
  on('[data-history-day]', b => { state.historyDate = b.dataset.historyDay; render(); window.scrollTo(0, 0); });
  on('[data-history-back]', () => { state.historyDate = null; render(); });
  on('[data-edit-order]', b => beginEditOrder(b.dataset.editOrder));
  on('[data-delete-order]', b => deleteOrder(b.dataset.deleteOrder));
  on('[data-edit-expense]', b => { state.editingExpenseId = b.dataset.editExpense; state.view = 'expense'; render(); });
  on('[data-delete-expense]', b => deleteExpense(b.dataset.deleteExpense));
  on('[data-export]', exportCSV);
  on('[data-recipe]', b => { state.recipeId = b.dataset.recipe; render(); });
  on('[data-recipe-back]', () => { state.recipeId = null; render(); });
}

/* ── boot ──────────────────────────────────────────────── */
$$('.nav button').forEach(b => { b.onclick = () => go(b.dataset.view); });
function tick() { $('#clock').textContent = new Date().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
tick(); setInterval(tick, 15000);
initMenu(); initPresets(); initInventory();
render();
if (SheetSync.enabled) {
  refreshMenu(true); refreshPresets(true); refreshInventory(true);
  syncFromSheet(); setInterval(syncFromSheet, 30000);
  // Phones pause timers in the background: sync as soon as the app is brought back.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFromSheet(); });
  window.addEventListener('online', syncSoon);
}
setInterval(() => { if (state.view === 'kitchen') render(); }, 60000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
