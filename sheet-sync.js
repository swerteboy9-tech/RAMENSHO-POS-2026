/* RAMEN SHO POS — Google Sheets link (Apps Script web app).
   Writes are queued in localStorage when offline and replayed in order.
   Reads (menu / presets / inventory / today) are cached so the register
   keeps working without a connection. */
const SheetSync = (() => {
  const CFG = SHO_CONFIG;
  const ENABLED = !!CFG.URL;
  const QUEUE_KEY = 'sho_sheet_queue';
  const CACHE = { menu: 'sho_menu_cache', presets: 'sho_preset_cache', inventory: 'sho_inventory_cache' };

  function queue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; } }
  function setQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  function enqueue(p) { const q = queue(); q.push(p); setQueue(q); }

  async function send(p) {
    // No Content-Type header: sent as text/plain so the browser skips the CORS preflight.
    const r = await fetch(CFG.URL, { method: 'POST', body: JSON.stringify(p) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'sheet error');
  }

  // One flush at a time; callers that arrive mid-flush wait for the running one.
  let flushing = null;
  function flush() {
    if (!ENABLED) return Promise.resolve();
    if (!flushing) flushing = (async () => {
      await null; // let `flushing` be assigned before the finally below can clear it
      try {
        // Send one at a time, oldest first, so an edit never arrives before its add.
        while (queue().length) {
          const q = queue();
          try { await send(q[0]); } catch (e) { break; }
          setQueue(queue().slice(1));
        }
      } finally { flushing = null; }
    })();
    return flushing;
  }

  function post(payload) {
    if (!ENABLED) return;
    enqueue({ ...payload, token: CFG.TOKEN, store: CFG.STORE });
    flush();
  }

  async function get(action, extra = '') {
    if (!ENABLED) throw new Error('sheet link not configured');
    const url = `${CFG.URL}?action=${action}&token=${encodeURIComponent(CFG.TOKEN)}&store=${encodeURIComponent(CFG.STORE)}${extra}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || `${action} fetch error`);
    return j;
  }

  function cached(key) { try { return JSON.parse(localStorage.getItem(CACHE[key]) || 'null'); } catch (e) { return null; } }
  function remember(key, v) { try { localStorage.setItem(CACHE[key], JSON.stringify(v)); } catch (e) { /* quota: ignore */ } }

  async function fetchList(action, key, field) {
    const j = await get(action);
    const payload = { fetchedAt: new Date().toISOString(), rows: j[field] || [] };
    remember(key, payload);
    return payload;
  }

  function orderPayload(type, o) {
    return {
      type, orderId: o.id, no: o.no || '', date: o.date, time: o.time, createdAt: o.createdAt || '', staff: o.staff || '',
      pay: o.payment, mode: o.mode || '', ref: o.ref || '', total: o.total, guests: o.guests || '',
      lines: o.items.map(i => ({ ...i })),
    };
  }

  window.addEventListener('online', flush);
  window.addEventListener('load', flush);
  setInterval(flush, 60000);

  return {
    enabled: ENABLED,
    pending: () => queue().length,
    flush,
    fetchMenu: () => fetchList('menu', 'menu', 'rows'),
    fetchPresets: () => fetchList('presets', 'presets', 'rows'),
    fetchInventory: () => fetchList('inventory', 'inventory', 'rows'),
    cachedMenu: () => cached('menu'),
    cachedPresets: () => cached('presets'),
    cachedInventory: () => cached('inventory'),
    rememberInventory: v => remember('inventory', v),
    // Sends anything queued first, then returns the sheet's copy from `since` (null on failure).
    async fetchSync(since, date) {
      if (!ENABLED) return null;
      await flush();
      try { return await get('sync', `&since=${encodeURIComponent(since)}&date=${encodeURIComponent(date)}`); }
      catch (e) { console.warn('sync failed', e); return null; }
    },
    // Changes not yet on the sheet. The phone keeps its own version of these when mirroring the sheet.
    pendingChanges() {
      const p = { upsert: new Set(), remove: new Set(), served: new Map(), staff: new Set(), settings: {}, sessions: new Map(), clock: new Map() };
      queue().forEach(q => {
        if (q.type === 'order_add' || q.type === 'order_edit') { p.upsert.add(q.orderId); p.remove.delete(q.orderId); }
        if (q.type === 'order_delete') { p.remove.add(q.orderId); p.upsert.delete(q.orderId); }
        if (q.type === 'expense_add' || q.type === 'expense_edit') { p.upsert.add(q.expense.id); p.remove.delete(q.expense.id); }
        if (q.type === 'expense_delete') { p.remove.add(q.expenseId); p.upsert.delete(q.expenseId); }
        if (q.type === 'move_add') { p.upsert.add(q.move.id); p.remove.delete(q.move.id); }
        if (q.type === 'move_delete') { p.remove.add(q.moveId); p.upsert.delete(q.moveId); }
        if (q.type === 'home_add') { p.upsert.add(q.home.id); p.remove.delete(q.home.id); }
        if (q.type === 'home_delete') { p.remove.add(q.homeId); p.upsert.delete(q.homeId); }
        if (q.type === 'register') p.sessions.set(q.session.id, q.session);
        if (q.type === 'clock_in' || q.type === 'clock_out') p.clock.set(q.clock.id, q.clock);
        if (q.type === 'served') p.served.set(q.orderId, true);
        if (q.type === 'unserved') p.served.set(q.orderId, false);
        if (q.type === 'staff_add') p.staff.add(q.name);
        if (q.type === 'setting') p.settings[q.key] = q.value;
      });
      return p;
    },
    served: (orderId, date, time, staff) => post({ type: 'served', orderId, date, time, staff }),
    unserved: orderId => post({ type: 'unserved', orderId }),
    staffAdd: (name, date) => post({ type: 'staff_add', name, date }),
    setting: (key, value) => post({ type: 'setting', key, value }),
    orderAdd: o => post(orderPayload('order_add', o)),
    orderEdit: o => post(orderPayload('order_edit', o)),
    orderDelete: id => post({ type: 'order_delete', orderId: id }),
    expenseAdd: e => post({ type: 'expense_add', expense: e }),
    expenseEdit: e => post({ type: 'expense_edit', expense: e }),
    expenseDelete: id => post({ type: 'expense_delete', expenseId: id }),
    stockCount: c => post({ type: 'stock_count', count: c }),
    moveAdd: m => post({ type: 'move_add', move: m }),
    moveDelete: id => post({ type: 'move_delete', moveId: id }),
    homeAdd: h => post({ type: 'home_add', home: h }),
    homeDelete: id => post({ type: 'home_delete', homeId: id }),
    register: s => post({ type: 'register', session: s }),
    clockIn: c => post({ type: 'clock_in', clock: c }),
    clockOut: c => post({ type: 'clock_out', clock: c }),
  };
})();
