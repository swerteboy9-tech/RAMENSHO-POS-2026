/* RAMEN SHO POS — built-in menu.
   Used only until the "Menu" sheet has been fetched once, or when the sheet
   cannot be reached on first install. The sheet is the source of truth.
   Prices: flyer prices on the staff sales sheet「スタッフ用販売確認.xlsx」(2026-09-29, チラシ確認済み).
   Usage (owner 2026-10-01): tonkotsu & chashu-men = white Hokkaido noodles + tonkotsu base,
   tantan = yellow Hokkaido noodles + tantan base; ajitama ½ per tonkotsu / tantan / chashu don.

   type    ITEM = sellable product · SET = "ramen + don" (not on the flyer → inactive) · TOPPING = add-on per bowl
   bowls   ramen bowls the product counts as (B1T1 = 2, dons / sides = 0)
   usage   stock the POS subtracts per unit sold (null = unknown → shown as SET RECIPE, never guessed as 0)
           white noodles · yellow noodles · ajitama pcs · karaage pcs · tonkotsu base bowls · tantan base bowls · kaeshi ml
           (kaeshi 15ml per bowl for all three ramen incl. tantanmen, 500ml bottle — owner 2026-10-01)
   fee     take-out container fee per unit (₱15 noodles / rice dishes, ₱10 sides)
   dineInOnly  B1T1 cannot be taken out */
const U = (noodleW, noodleY, ajitama, karaage, baseTon, baseTan, kaeshi = 0) => ({ noodleW, noodleY, ajitama, karaage, baseTon, baseTan, kaeshi });
const DEFAULT_MENU = [
  { type: 'ITEM', id: 'R-TON', name: 'Tonkotsu Ramen', category: 'Ramen', price: 199, bowls: 1, icon: '🍜', active: true, usage: U(1, 0, 0.5, 0, 1, 0, 15), fee: 15 },
  { type: 'ITEM', id: 'R-TAN', name: 'Tantanmen', category: 'Ramen', price: 210, bowls: 1, icon: '🌶️', active: true, usage: U(0, 1, 0.5, 0, 0, 1, 15), fee: 15 },
  { type: 'ITEM', id: 'R-CHM', name: 'Chashu-men', category: 'Ramen', price: 299, bowls: 1, icon: '🥩', active: true, usage: U(1, 0, 0, 0, 1, 0, 15), fee: 15 },
  { type: 'ITEM', id: 'B-TT', name: 'B1T1 Tonkotsu × Tonkotsu', category: 'B1T1', price: 280, bowls: 2, icon: '🍜', active: true, usage: U(2, 0, 1, 0, 2, 0, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'B-TD', name: 'B1T1 Tonkotsu × Tantan', category: 'B1T1', price: 285, bowls: 2, icon: '🍜', active: true, usage: U(1, 1, 1, 0, 1, 1, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'B-DD', name: 'B1T1 Tantan × Tantan', category: 'B1T1', price: 290, bowls: 2, icon: '🌶️', active: true, usage: U(0, 2, 1, 0, 0, 2, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'B-TC', name: 'B1T1 Tonkotsu × Chashu-men', category: 'B1T1', price: 335, bowls: 2, icon: '🥩', active: true, usage: U(2, 0, 0.5, 0, 2, 0, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'B-DC', name: 'B1T1 Tantan × Chashu-men', category: 'B1T1', price: 340, bowls: 2, icon: '🥩', active: true, usage: U(1, 1, 0.5, 0, 1, 1, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'B-CC', name: 'B1T1 Chashu-men × Chashu-men', category: 'B1T1', price: 390, bowls: 2, icon: '🥩', active: true, usage: U(2, 0, 0, 0, 2, 0, 30), fee: 15, dineInOnly: false },
  { type: 'ITEM', id: 'D-CHD', name: 'Chashu Don', category: 'Don', price: 160, bowls: 0, icon: '🍚', active: true, usage: U(0, 0, 0.5, 0, 0, 0), fee: 15 },
  { type: 'ITEM', id: 'D-KAD', name: 'Karaage Don', category: 'Don', price: 180, bowls: 0, icon: '🍗', active: true, usage: U(0, 0, 0, 4, 0, 0), fee: 15 },
  { type: 'ITEM', id: 'S-RICE', name: 'Rice (1 bowl)', category: 'Don', price: 40, bowls: 0, icon: '🍙', active: true, usage: U(0, 0, 0, 0, 0, 0), fee: 15 },
  { type: 'ITEM', id: 'S-KA3', name: 'Karaage 3pcs', category: 'Side', price: 120, bowls: 0, icon: '🍗', active: true, usage: U(0, 0, 0, 3, 0, 0), fee: 10 },
  { type: 'ITEM', id: 'S-KA5', name: 'Karaage 5pcs', category: 'Side', price: 150, bowls: 0, icon: '🍗', active: true, usage: U(0, 0, 0, 5, 0, 0), fee: 10 },
  { type: 'ITEM', id: 'S-GYO', name: 'Gyoza 5pcs', category: 'Side', price: 110, bowls: 0, icon: '🥟', active: true, usage: U(0, 0, 0, 0, 0, 0), fee: 10 },
  { type: 'ITEM', id: 'X-COKE', name: 'Coca-Cola', category: 'Drink', price: 60, bowls: 0, icon: '🥤', active: true, usage: U(0, 0, 0, 0, 0, 0) },
  { type: 'ITEM', id: 'X-SPRITE', name: 'Sprite', category: 'Drink', price: 60, bowls: 0, icon: '🥤', active: true, usage: U(0, 0, 0, 0, 0, 0) },
  { type: 'ITEM', id: 'X-ROYAL', name: 'Royal', category: 'Drink', price: 60, bowls: 0, icon: '🥤', active: true, usage: U(0, 0, 0, 0, 0, 0) },

  // kaedama switches to yellow noodles on a tantanmen (see detailLine in app.js)
  { type: 'TOPPING', id: 'T-KAE', name: 'Kaedama (extra noodles)', price: 60, icon: '➕', active: true, usage: U(1, 0, 0, 0, 0, 0) },
  { type: 'TOPPING', id: 'T-EGG', name: 'Ajitama', price: 30, icon: '🥚', active: true, usage: U(0, 0, 1, 0, 0, 0) },
  { type: 'TOPPING', id: 'T-CH1', name: 'Chashu +1 slice', price: 30, icon: '🥓', active: true, usage: U(0, 0, 0, 0, 0, 0) },
  { type: 'TOPPING', id: 'T-CH2', name: 'Chashu +2 slices', price: 55, icon: '🥓', active: true, usage: U(0, 0, 0, 0, 0, 0) },

  // Obsidian ramen + don sets — not on the flyer, hidden
  { type: 'SET', id: 'SET-TON-KAD', name: 'Tonkotsu + Karaage Don Set', category: 'D-KAD', price: 329, for: 'R-TON', icon: '🍗', active: false, usage: U(0, 0, 0, 4, 0, 0) },
  { type: 'SET', id: 'SET-TON-CHD', name: 'Tonkotsu + Chashu Don Set', category: 'D-CHD', price: 349, for: 'R-TON', icon: '🍚', active: false, usage: U(0, 0, 0.5, 0, 0, 0) },
];

// The owner's stock check list (2026-10-01). Same as the "Stock Items" sheet, which overrides this.
// prep = prep / order at or below this number (busiest day of 2026-09-22〜29 × lead time).
const DEFAULT_STOCK_ITEMS = [
  { k: 'noodleW', name: 'White noodles', unit: 'portions', type: 'count', prep: 68, action: 'Order', lead: '2 days (KANDS)' },
  { k: 'noodleY', name: 'Yellow noodles', unit: 'portions', type: 'count', prep: 36, action: 'Order', lead: '2 days (KANDS)' },
  { k: 'ajitama', name: 'Ajitama', unit: 'pcs', type: 'count', prep: 22, action: 'Prep', lead: '1 day' },
  { k: 'karaage', name: 'Karaage (marinated)', unit: 'pcs', type: 'count', prep: 44, action: 'Prep', lead: '1 day' },
  { k: 'baseTon', name: 'Tonkotsu soup base', unit: 'bags', type: 'count', prep: 2, action: 'Order', lead: '2 days (KANDS)' },
  { k: 'baseTan', name: 'Tantan soup base', unit: 'bags', type: 'count', prep: 1, action: 'Order', lead: '2 days (KANDS)' },
  { k: 'kaeshi', name: 'Kaeshi (500ml bottle)', unit: 'bottles', type: 'count', prep: 2, action: 'Prep', lead: '1 day' },
  { k: 'mayo', name: 'Mayonnaise', unit: 'bottles', type: 'count', prep: 1, action: 'Buy', lead: '' },
  { k: 'sweet', name: 'Sweet sauce', unit: 'bottles', type: 'count', prep: 1, action: 'Prep', lead: '' },
  { k: 'chashuMeat', name: 'Chashu (cooked)', unit: '', type: 'level', prep: null, action: 'Prep', lead: '1 day' },
  { k: 'mince', name: 'Tantan ground pork', unit: '', type: 'level', prep: null, action: 'Prep', lead: '' },
  { k: 'chiliOil', name: 'Chili oil', unit: '', type: 'level', prep: null, action: 'Prep', lead: '' },
  { k: 'greenOnion', name: 'Green onion', unit: '', type: 'level', prep: null, action: 'Buy', lead: '' },
  { k: 'lard', name: 'Lard', unit: '', type: 'level', prep: null, action: 'Prep', lead: '' },
  // added 2026-10-01 (owner). Drinks use the menu item ID as key, so each can sold counts down. Prep points are provisional.
  { k: 'rice', name: 'Rice (uncooked)', unit: 'kg', type: 'count', prep: 5, action: 'Buy', lead: '' },
  { k: 'nori', name: 'Nori', unit: '', type: 'level', prep: null, action: 'Buy', lead: '' },
  { k: 'X-COKE', name: 'Coca-Cola (can)', unit: 'cans', type: 'count', prep: 12, action: 'Buy', lead: '' },
  { k: 'X-SPRITE', name: 'Sprite (can)', unit: 'cans', type: 'count', prep: 12, action: 'Buy', lead: '' },
  { k: 'X-ROYAL', name: 'Royal (can)', unit: 'cans', type: 'count', prep: 12, action: 'Buy', lead: '' },
  { k: 'water', name: 'Water dispenser (spare bottles)', unit: 'bottles', type: 'count', prep: 1, action: 'Buy', lead: '' },
  { k: 'lpgUse', name: 'LPG (tank in use)', unit: '', type: 'level', prep: null, action: 'Buy', lead: 'same day' },
  { k: 'lpgSpare', name: 'LPG (full spare tanks)', unit: 'tanks', type: 'count', prep: 0, action: 'Buy', lead: 'same day' },
];
/* Kitchen SOP shown on the RECIPE screen (same source). "TBC" = not measured yet. */
const RECIPES = [
  {
    id: 'R-TON', name: 'Tonkotsu Ramen · ₱199', icon: '🍜',
    steps: [
      { n: 'Hokkaido WHITE noodles', q: '1 portion', how: 'Boil 45 s – 1 min' },
      { n: 'Tonkotsu soup base', q: '1 serving (1 bag = 40)', how: '' },
      { n: 'Chashu', q: '1 slice (~15 g)', how: 'Slice thickness TBC (mm for 15 g)' },
      { n: 'Ajitama', q: '½ egg', how: '' },
      { n: 'Green onion · kikurage · nori', q: '1 sheet nori', how: '' },
      { n: 'Kaeshi', q: '15 ml', how: '1 bottle = 500 ml' },
      { n: 'Aroma oil', q: 'TBC', how: '' },
    ],
  },
  {
    id: 'R-TAN', name: 'Tantanmen · ₱210', icon: '🌶️',
    steps: [
      { n: 'Hokkaido YELLOW noodles', q: '1 portion', how: 'Boil 45 s – 1 min' },
      { n: 'Tantan base', q: '50 ml (1 bag = 40)', how: '+ hot water 200 ml' },
      { n: 'Niku-miso (ground pork)', q: 'TBC', how: '' },
      { n: 'Bok choy · green onion', q: 'TBC', how: '' },
      { n: 'Sesame · sesame paste · peanuts · chili oil', q: 'TBC', how: '' },
      { n: 'Ajitama', q: '½ egg', how: 'No chashu' },
    ],
  },
  {
    id: 'R-CHM', name: 'Chashu-men · ₱299', icon: '🥩',
    steps: [
      { n: 'Hokkaido WHITE noodles', q: '1 portion', how: '' },
      { n: 'Tonkotsu soup base', q: '1 serving (1 bag = 40)', how: '' },
      { n: 'Chashu', q: '5 slices', how: 'Ring around the bowl, covering the soup' },
      { n: 'Green onion · kikurage', q: 'TBC', how: 'In the centre' },
      { n: 'Nori', q: '1 sheet', how: 'No ajitama' },
    ],
  },
  {
    id: 'D-KAD', name: 'Karaage Don · ₱180', icon: '🍗',
    steps: [
      { n: 'Cooked rice', q: '180 g', how: '' },
      { n: 'Karaage', q: '4 pcs (~20 g each, TBC 20–25 g)', how: '' },
      { n: 'Tare · mayonnaise · green onion', q: 'TBC', how: '' },
    ],
  },
  {
    id: 'D-CHD', name: 'Chashu Don · ₱160', icon: '🍚',
    steps: [
      { n: 'Cooked rice', q: '180 g', how: '' },
      { n: 'Chashu', q: '5 slices (~75 g)', how: '' },
      { n: 'Ajitama', q: '½ egg', how: '' },
      { n: 'Shredded nori · tare · green onion', q: 'TBC', how: '' },
    ],
  },
  {
    id: 'S-KA', name: 'Karaage 3 pcs ₱120 / 5 pcs ₱150', icon: '🍗',
    steps: [
      { n: 'Chicken', q: '~20 g per piece (TBC 20–25 g)', how: 'Final weight after test fry' },
      { n: 'Batter · marinade · brine · oil', q: 'TBC', how: 'Per batch' },
    ],
  },
];
