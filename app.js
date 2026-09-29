(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Pure logic (also used by tests/planner.test.js)                     */
  /* ------------------------------------------------------------------ */

  const GOALS = {
    cut: { label: 'Cut', kcalAdj: -0.15, proteinPerLb: 1.0,
      blurb: 'Moderate deficit with high protein to hold on to muscle.' },
    lose: { label: 'Lose weight', kcalAdj: -0.2, proteinPerLb: 0.8,
      blurb: 'Steady deficit with solid protein.' },
    maintain: { label: 'Maintain', kcalAdj: 0, proteinPerLb: 0.7,
      blurb: 'Eat at maintenance calories.' },
    bulk: { label: 'Build muscle', kcalAdj: 0.1, proteinPerLb: 0.9,
      blurb: 'Small surplus with plenty of protein.' },
    healthy: { label: 'Eat healthier', kcalAdj: 0, proteinPerLb: 0.6,
      blurb: 'Maintenance calories, favoring fiber and less sugar and sodium.' },
  };

  const ACTIVITY = [
    { v: 1.2, label: 'Mostly sitting, little exercise' },
    { v: 1.375, label: 'Light: 1 to 3 workouts a week' },
    { v: 1.55, label: 'Moderate: 3 to 5 workouts a week' },
    { v: 1.725, label: 'Heavy: 6 to 7 workouts a week' },
  ];

  const MEAL_ORDER = ['breakfast', 'brunch', 'lunch', 'late-lunch', 'dinner'];
  const MEAL_SHARE = { breakfast: 0.25, brunch: 0.35, lunch: 0.35, 'late-lunch': 0.25, dinner: 0.4 };

  const EXCLUDED_STATIONS =
    /topping|condiment|beverage|drink|juice|syrup|sauce|dressing|spread|seasoning|creamer|sweetener|coffee|\btea\b|soda|water/i;

  function computeTargets(profile) {
    const age = Number(profile.age);
    const weightLb = Number(profile.weightLb);
    const heightIn = Number(profile.heightIn);
    if (!(age >= 18 && age <= 90 && weightLb >= 70 && weightLb <= 500 && heightIn >= 48 && heightIn <= 90)) {
      return null;
    }
    const goal = GOALS[profile.goal] || GOALS.maintain;
    const bmr = 10 * weightLb * 0.45359237 + 6.25 * heightIn * 2.54 - 5 * age +
      (profile.sex === 'male' ? 5 : -161);
    const tdee = bmr * (Number(profile.activity) || 1.375);
    let kcal = tdee * (1 + goal.kcalAdj);
    const floor = profile.sex === 'male' ? 1500 : 1200;
    const floorApplied = kcal < floor;
    if (floorApplied) kcal = floor;
    return {
      tdee: Math.round(tdee),
      kcal: Math.round(kcal / 10) * 10,
      protein: Math.round(weightLb * goal.proteinPerLb),
      floorApplied,
      floor,
    };
  }

  function macroGuide(kcal, protein) {
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { cal: kcal, p: protein, c: carbs, f: fat };
  }

  function mealTargets(dailyKcal, dailyProtein, meal) {
    const share = MEAL_SHARE[meal] || 0.33;
    return {
      cal: Math.round((dailyKcal * share) / 10) * 10,
      protein: Math.round(dailyProtein * share),
    };
  }

  function sumPlate(entries) {
    const t = { cal: 0, p: 0, c: 0, f: 0, fi: 0, su: 0, na: 0 };
    for (const entry of entries) {
      const item = entry.item || entry;
      const qty = entry.qty || 1;
      for (const key of Object.keys(t)) t[key] += (Number(item[key]) || 0) * qty;
    }
    return t;
  }

  function parseWords(text) {
    return String(text || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
  }

  function buildPool(items, avoid) {
    return items.filter((item) => {
      if (!(item.cal >= 30)) return false;
      if (EXCLUDED_STATIONS.test(item.st || '')) return false;
      const haystack = (item.n + ' ' + (item.st || '')).toLowerCase();
      return !avoid.some((word) => haystack.includes(word));
    });
  }

  function allowedQuantities(item) {
    return item.cal >= 250 ? [0.5, 1, 2, 3] : [1, 2, 3];
  }

  function plateCost(totals, target, opts, entries) {
    const calErr = Math.abs(totals.cal - target.cal) / target.cal;
    const proteinShort = Math.max(0, target.protein - totals.p) / Math.max(target.protein, 1);
    const proteinOver = Math.max(0, totals.p - target.protein * 1.5) / Math.max(target.protein, 1);
    let cost = 3 * calErr + 2.5 * proteinShort + 0.5 * proteinOver;

    const fatShare = totals.cal > 0 ? (totals.f * 9) / totals.cal : 0;
    cost += 2 * Math.max(0, fatShare - 0.35);

    const sugarWeight = ['cut', 'lose', 'healthy'].includes(opts.goal) ? 1 : 0.3;
    cost += (sugarWeight * Math.max(0, totals.su - 25)) / 100;

    if (opts.goal === 'healthy') {
      cost -= Math.min(totals.fi, 10) / 50;
      cost += Math.max(0, totals.na - 1200) / 5000;
    }

    if (opts.like && opts.like.length) {
      const names = entries.map((e) => e.item.n.toLowerCase()).join(' | ');
      const hits = opts.like.filter((word) => names.includes(word)).length;
      cost -= 0.3 * Math.min(hits, 2);
    }
    return cost;
  }

  function randomPlate(pool, rng) {
    const size = 2 + Math.floor(rng() * 4);
    const entries = [];
    const perStation = {};
    let tries = 0;
    while (entries.length < size && tries < 40) {
      tries += 1;
      const item = pool[Math.floor(rng() * pool.length)];
      if (entries.some((e) => e.item === item)) continue;
      if ((perStation[item.st] || 0) >= 2) continue;
      perStation[item.st] = (perStation[item.st] || 0) + 1;
      entries.push({ item, qty: 1 });
    }
    return entries;
  }

  function improveQuantities(entries, target, opts) {
    let best = plateCost(sumPlate(entries), target, opts, entries);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const entry of entries) {
        for (const qty of allowedQuantities(entry.item)) {
          if (qty === entry.qty) continue;
          const previous = entry.qty;
          entry.qty = qty;
          const cost = plateCost(sumPlate(entries), target, opts, entries);
          if (cost < best - 1e-9) best = cost;
          else entry.qty = previous;
        }
      }
    }
    return best;
  }

  function suggestPlates(items, target, opts) {
    const options = Object.assign({ goal: 'maintain', like: [], avoid: [], iterations: 1500, count: 3, rng: Math.random }, opts);
    const pool = buildPool(items, options.avoid);
    if (pool.length < 2) return [];

    const candidates = [];
    for (let i = 0; i < options.iterations; i += 1) {
      const entries = randomPlate(pool, options.rng);
      if (entries.length < 2) continue;
      const cost = improveQuantities(entries, target, options);
      candidates.push({ entries, cost });
    }
    candidates.sort((a, b) => a.cost - b.cost);

    const results = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const signature = candidate.entries.map((e) => e.item.st + '|' + e.item.n).sort().join('~');
      if (seen.has(signature)) continue;
      seen.add(signature);
      results.push({
        entries: candidate.entries,
        totals: sumPlate(candidate.entries),
        cost: candidate.cost,
      });
      if (results.length >= options.count) break;
    }
    return results;
  }

  const api = {
    GOALS, ACTIVITY, MEAL_ORDER, MEAL_SHARE,
    computeTargets, macroGuide, mealTargets, sumPlate,
    parseWords, buildPool, plateCost, suggestPlates,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Planner = api;

  /* ------------------------------------------------------------------ */
  /* Browser UI                                                          */
  /* ------------------------------------------------------------------ */

  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const oneDecimal = (n) => (Math.round(n * 10) / 10).toString();

  const state = {
    data: null,
    hall: null,
    meal: null,
    date: null,
    view: [],
    plates: [],
    query: '',
    log: [],
    profile: {
      goal: 'cut', sex: 'male', age: '', weightLb: '', heightFt: '', heightIn: '',
      activity: 1.55, dailyKcal: 2300, dailyProtein: 150, calculated: false,
    },
  };

  function localDate(d) {
    const date = d || new Date();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + mm + '-' + dd;
  }

  function dateLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function mealLabel(key) {
    const text = key.replace(/-/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }
  function recall(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function setStatus(message) {
    $('status').textContent = message || '';
  }

  /* ---------- data loading and menu pickers ---------- */

  async function loadData() {
    try {
      const response = await fetch('data/menu.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      state.data = await response.json();
    } catch (error) {
      $('load-error').hidden = false;
      $('load-error').textContent =
        'Could not load the menu data. If you opened this file straight from your computer, ' +
        'it has to be served from a web address (your GitHub Pages link) for the menu to load.';
      return false;
    }
    return true;
  }

  function hallKeys() {
    return Object.keys(state.data.halls || {}).sort((a, b) =>
      state.data.halls[a].name.localeCompare(state.data.halls[b].name));
  }

  function mealKeys(hall) {
    const meals = Object.keys(state.data.halls[hall].meals);
    return meals.sort((a, b) => {
      const ia = MEAL_ORDER.indexOf(a); const ib = MEAL_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  function dateKeys(hall, meal) {
    return Object.keys(state.data.halls[hall].meals[meal]).sort();
  }

  function fillSelect(select, options, selected) {
    select.textContent = '';
    options.forEach(([value, label]) => {
      const option = el('option', { value, text: label });
      if (value === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  function pickDefaultDate(dates) {
    const today = localDate();
    if (dates.includes(today)) return today;
    const upcoming = dates.find((d) => d >= today);
    return upcoming || dates[dates.length - 1];
  }

  function chooseMealByClock(meals) {
    const hour = new Date().getHours();
    const wanted = hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : 'dinner';
    return meals.includes(wanted) ? wanted : meals[0];
  }

  function renderPickers() {
    const halls = hallKeys();
    if (!halls.length) return;
    if (!halls.includes(state.hall)) state.hall = halls[0];
    fillSelect($('hall'), halls.map((h) => [h, state.data.halls[h].name]), state.hall);

    const meals = mealKeys(state.hall);
    if (!meals.includes(state.meal)) state.meal = chooseMealByClock(meals);
    fillSelect($('meal'), meals.map((m) => [m, mealLabel(m)]), state.meal);

    const dates = dateKeys(state.hall, state.meal);
    if (!dates.includes(state.date)) state.date = pickDefaultDate(dates);
    fillSelect($('date'), dates.map((d) => [d, dateLabel(d)]), state.date);

    const updated = state.data.updated ? new Date(state.data.updated) : null;
    $('updated').textContent = updated && !isNaN(updated)
      ? 'Menu last updated ' + updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' at ' + updated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    $('sample-note').hidden = !state.data.sample;
  }

  function currentItems() {
    try { return state.data.halls[state.hall].meals[state.meal][state.date] || []; } catch (e) { return []; }
  }

  /* ---------- targets ---------- */

  function syncMealTargets() {
    const t = mealTargets(Number(state.profile.dailyKcal) || 0, Number(state.profile.dailyProtein) || 0, state.meal);
    $('meal-kcal').value = t.cal;
    $('meal-protein').value = t.protein;
  }

  function saveProfile() { store('pp:profile', state.profile); }

  function renderGoals() {
    const group = $('goals');
    group.textContent = '';
    Object.entries(GOALS).forEach(([key, goal]) => {
      const button = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.profile.goal === key), text: goal.label });
      button.addEventListener('click', () => {
        state.profile.goal = key;
        if (state.profile.calculated) applyCalculation(false);
        saveProfile();
        renderGoals();
        clearPlates();
      });
      group.appendChild(button);
    });
    $('goal-blurb').textContent = GOALS[state.profile.goal].blurb;
  }

  function readStatsForm() {
    const p = state.profile;
    p.sex = $('sex').value;
    p.age = $('age').value;
    p.weightLb = $('weight').value;
    const ft = Number($('height-ft').value) || 0;
    const inch = Number($('height-in').value) || 0;
    p.heightFt = $('height-ft').value;
    p.heightIn = $('height-in').value;
    p.activity = Number($('activity').value);
    return { sex: p.sex, age: p.age, weightLb: p.weightLb, heightIn: ft * 12 + inch, activity: p.activity, goal: p.goal };
  }

  function applyCalculation(showErrors) {
    const stats = readStatsForm();
    const result = computeTargets(stats);
    const note = $('calc-note');
    if (!result) {
      if (showErrors) {
        note.textContent = 'Enter an age of 18 or older, a weight in pounds, and your height to calculate targets.';
        note.className = 'note warn';
      }
      return;
    }
    state.profile.calculated = true;
    state.profile.dailyKcal = result.kcal;
    state.profile.dailyProtein = result.protein;
    $('daily-kcal').value = result.kcal;
    $('daily-protein').value = result.protein;
    note.className = 'note';
    note.textContent = 'Estimated maintenance is about ' + fmt(result.tdee) + ' calories a day.' +
      (result.floorApplied
        ? ' Your goal came out below ' + fmt(result.floor) + ', so calories are set to that minimum. Going lower should be supervised by a doctor or dietitian.'
        : '');
    saveProfile();
    syncMealTargets();
    renderToday();
  }

  function renderStatsForm() {
    const p = state.profile;
    fillSelect($('activity'), ACTIVITY.map((a) => [String(a.v), a.label]), String(p.activity));
    $('sex').value = p.sex;
    $('age').value = p.age;
    $('weight').value = p.weightLb;
    $('height-ft').value = p.heightFt;
    $('height-in').value = p.heightIn;
    $('daily-kcal').value = p.dailyKcal;
    $('daily-protein').value = p.dailyProtein;
  }

  /* ---------- suggestions ---------- */

  function clearPlates() {
    state.plates = [];
    $('plates').textContent = '';
    $('plates-empty').hidden = true;
  }

  function itemLine(entry) {
    const it = entry.item;
    const qty = entry.qty === 1 ? '' : oneDecimal(entry.qty) + ' \u00d7 ';
    return qty + it.n + (it.sv ? ' (' + it.sv + ')' : '');
  }

  function macroText(t) {
    return fmt(t.cal) + ' cal \u00b7 ' + fmt(t.p) + 'g protein \u00b7 ' + fmt(t.c) + 'g carbs \u00b7 ' + fmt(t.f) + 'g fat';
  }

  function renderPlates() {
    const holder = $('plates');
    holder.textContent = '';
    $('plates-empty').hidden = state.plates.length > 0;
    const target = { cal: Number($('meal-kcal').value) || 1, protein: Number($('meal-protein').value) || 0 };

    state.plates.forEach((plate, index) => {
      const list = el('ul', { class: 'plate-items' });
      plate.entries.forEach((entry) => list.appendChild(el('li', { text: itemLine(entry) })));
      const diff = plate.totals.cal - target.cal;
      const fit = Math.abs(diff) < 10 ? 'right on your calorie target'
        : fmt(Math.abs(diff)) + ' cal ' + (diff > 0 ? 'over' : 'under') + ' your target';
      const add = el('button', { type: 'button', class: 'btn', 'data-plate': String(index), text: 'Add to today' });
      holder.appendChild(el('article', { class: 'plate' }, [
        el('h3', { text: 'Option ' + (index + 1) }),
        list,
        el('p', { class: 'plate-total', text: macroText(plate.totals) }),
        el('p', { class: 'plate-fit', text: fit }),
        add,
      ]));
    });
  }

  function runSuggest() {
    const items = currentItems();
    const target = { cal: Number($('meal-kcal').value), protein: Number($('meal-protein').value) };
    if (!(target.cal > 0)) { setStatus('Enter a calorie target for this meal first.'); return; }
    state.plates = suggestPlates(items, target, {
      goal: state.profile.goal,
      like: parseWords($('like').value),
      avoid: parseWords($('avoid').value),
    });
    renderPlates();
    setStatus(state.plates.length ? 'Showing ' + state.plates.length + ' meal ideas.' : 'No meal ideas found.');
  }

  /* ---------- menu list ---------- */

  function renderMenu() {
    const items = currentItems();
    state.view = items;
    const holder = $('menu-list');
    holder.textContent = '';
    const query = state.query.trim().toLowerCase();

    const stations = [];
    const groups = {};
    items.forEach((item, index) => {
      if (query && !(item.n + ' ' + item.st).toLowerCase().includes(query)) return;
      const key = item.st || 'Other';
      if (!groups[key]) { groups[key] = []; stations.push(key); }
      groups[key].push({ item, index });
    });

    $('menu-empty').hidden = stations.length > 0;
    $('menu-count').textContent = items.length ? items.length + ' items' : '';

    stations.forEach((station) => {
      const section = el('section', { class: 'station' }, [el('h3', { text: station })]);
      groups[station].forEach(({ item, index }) => {
        const qty = el('select', { class: 'qty', 'aria-label': 'Servings of ' + item.n, 'data-qty': String(index) });
        ['0.5', '1', '1.5', '2', '3'].forEach((v) => {
          const option = el('option', { value: v, text: v + '\u00d7' });
          if (v === '1') option.selected = true;
          qty.appendChild(option);
        });
        const add = el('button', { type: 'button', class: 'btn small', 'data-add': String(index), text: 'Add' });
        section.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'row-name' }, [
            el('span', { class: 'name', text: item.n }),
            el('span', { class: 'serving', text: item.sv }),
          ]),
          el('div', { class: 'row-macros', text: fmt(item.cal) + ' cal \u00b7 ' + oneDecimal(item.p) + 'P \u00b7 ' + oneDecimal(item.c) + 'C \u00b7 ' + oneDecimal(item.f) + 'F' }),
          el('div', { class: 'row-add' }, [qty, add]),
        ]));
      });
      holder.appendChild(section);
    });
  }

  /* ---------- today's log ---------- */

  function logKey() { return 'pp:log:' + localDate(); }

  function addToLog(item, qty) {
    state.log.push(Object.assign({}, item, { qty, hall: state.data.halls[state.hall].name, meal: state.meal }));
    store(logKey(), state.log);
    renderToday();
  }

  function meter(label, value, goal, cls) {
    const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
    const over = goal > 0 && value > goal * 1.05;
    const bar = el('div', { class: 'bar' + (over ? ' over' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(goal)), 'aria-valuenow': String(Math.round(value)), 'aria-label': label }, [
      el('span', { class: 'fill ' + cls, style: 'width:' + pct + '%' }),
    ]);
    return el('div', { class: 'meter' }, [
      el('div', { class: 'meter-head' }, [
        el('span', { class: 'meter-label', text: label }),
        el('span', { class: 'meter-value', text: fmt(value) + ' of ' + fmt(goal) + (label === 'Calories' ? '' : 'g') }),
      ]),
      bar,
    ]);
  }

  function renderToday() {
    const totals = sumPlate(state.log);
    const kcal = Number(state.profile.dailyKcal) || 0;
    const protein = Number(state.profile.dailyProtein) || 0;
    const guide = macroGuide(kcal, protein);

    const summary = $('today-summary');
    summary.textContent = '';
    summary.appendChild(el('div', { class: 'big' }, [
      el('span', { class: 'big-num', text: fmt(totals.cal) }),
      el('span', { class: 'big-unit', text: 'calories eaten' }),
    ]));
    const left = kcal - totals.cal;
    summary.appendChild(el('p', { class: 'left', text: left >= 0 ? fmt(left) + ' left today' : fmt(-left) + ' over today' }));
    summary.appendChild(meter('Calories', totals.cal, kcal, 'cal'));
    summary.appendChild(meter('Protein', totals.p, protein, 'pro'));
    summary.appendChild(meter('Carbs', totals.c, guide.c, 'carb'));
    summary.appendChild(meter('Fat', totals.f, guide.f, 'fat'));
    summary.appendChild(el('p', { class: 'fine', text: 'Carb and fat targets are a general guide: about 25% of calories from fat, the rest from carbs after protein.' }));

    const list = $('log-list');
    list.textContent = '';
    $('log-empty').hidden = state.log.length > 0;
    $('clear-log').hidden = state.log.length === 0;
    state.log.forEach((entry, index) => {
      const qty = entry.qty === 1 ? '' : oneDecimal(entry.qty) + ' \u00d7 ';
      const remove = el('button', { type: 'button', class: 'btn ghost small', 'data-remove': String(index), 'aria-label': 'Remove ' + entry.n, text: 'Remove' });
      list.appendChild(el('li', null, [
        el('div', null, [
          el('span', { class: 'name', text: qty + entry.n }),
          el('span', { class: 'serving', text: fmt(entry.cal * entry.qty) + ' cal \u00b7 ' + oneDecimal(entry.p * entry.qty) + 'g protein' }),
        ]),
        remove,
      ]));
    });
  }

  /* ---------- wiring ---------- */

  function onMenuChange() {
    renderPickers();
    syncMealTargets();
    clearPlates();
    renderMenu();
  }

  function bindEvents() {
    $('hall').addEventListener('change', (e) => { state.hall = e.target.value; state.meal = null; state.date = null; onMenuChange(); });
    $('meal').addEventListener('change', (e) => { state.meal = e.target.value; state.date = null; onMenuChange(); });
    $('date').addEventListener('change', (e) => { state.date = e.target.value; onMenuChange(); });

    $('calc').addEventListener('click', () => applyCalculation(true));
    ['daily-kcal', 'daily-protein'].forEach((id) => $(id).addEventListener('input', () => {
      state.profile.dailyKcal = Number($('daily-kcal').value) || 0;
      state.profile.dailyProtein = Number($('daily-protein').value) || 0;
      state.profile.calculated = false;
      saveProfile();
      syncMealTargets();
      renderToday();
    }));

    $('suggest').addEventListener('click', runSuggest);
    $('plates').addEventListener('click', (e) => {
      const button = e.target.closest('[data-plate]');
      if (!button) return;
      const plate = state.plates[Number(button.dataset.plate)];
      plate.entries.forEach((entry) => addToLog(entry.item, entry.qty));
      setStatus('Added Option ' + (Number(button.dataset.plate) + 1) + ' to today.');
    });

    $('menu-list').addEventListener('click', (e) => {
      const button = e.target.closest('[data-add]');
      if (!button) return;
      const index = Number(button.dataset.add);
      const select = document.querySelector('[data-qty="' + index + '"]');
      const item = state.view[index];
      addToLog(item, Number(select.value));
      setStatus('Added ' + item.n + ' to today.');
    });
    $('search').addEventListener('input', (e) => { state.query = e.target.value; renderMenu(); });

    $('log-list').addEventListener('click', (e) => {
      const button = e.target.closest('[data-remove]');
      if (!button) return;
      state.log.splice(Number(button.dataset.remove), 1);
      store(logKey(), state.log);
      renderToday();
    });
    $('clear-log').addEventListener('click', () => {
      state.log = [];
      store(logKey(), state.log);
      renderToday();
      setStatus('Cleared today\u2019s log.');
    });
  }

  async function init() {
    const saved = recall('pp:profile');
    if (saved) Object.assign(state.profile, saved);
    state.log = recall(logKey()) || [];

    renderGoals();
    renderStatsForm();
    bindEvents();
    renderToday();

    if (!(await loadData())) return;
    if (!hallKeys().length) {
      $('load-error').hidden = false;
      $('load-error').textContent = 'The menu data file has no dining halls in it yet.';
      return;
    }
    onMenuChange();
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
