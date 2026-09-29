// Run with: node tests/planner.test.js
// Uses SYNTHETIC menu items (not real dining hall data) to check the logic.
const assert = require('assert');
const P = require('../app.js');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const item = (n, st, cal, p, c, f, extra) => Object.assign({ n, st, sv: '1 serving', cal, p, c, f, fi: 0, su: 0, na: 0 }, extra);
const menu = [
  item('Scrambled Eggs', 'Breakfast', 160, 13, 0, 13),
  item('Hard Boiled Egg', 'Breakfast', 80, 7, 0, 6),
  item('Turkey Sausage', 'Breakfast', 110, 10, 1, 7),
  item('Greek Yogurt', 'Yogurt', 120, 15, 8, 2, { su: 6 }),
  item('Oatmeal', 'Oatmeal', 150, 5, 27, 3, { fi: 4 }),
  item('Banana', 'Whole Fruit', 105, 1, 27, 0, { fi: 3, su: 14 }),
  item('Blueberry Muffin', 'Pastries', 420, 6, 60, 17, { su: 34 }),
  item('Bagel Sandwich', 'Breakfast', 600, 22, 61, 30),
  item('Maple Syrup', 'Waffle and Pancake Toppings', 200, 0, 50, 0, { su: 48 }),
  item('Orange Juice', 'Juice', 110, 2, 26, 0, { su: 22 }),
];

// computeTargets
const cut = P.computeTargets({ goal: 'cut', sex: 'male', age: 20, weightLb: 180, heightIn: 71, activity: 1.55 });
assert.ok(cut.kcal > 1500 && cut.kcal < cut.tdee, 'cut is below maintenance');
assert.strictEqual(cut.protein, 180, 'cut protein is 1 g per lb');
const bulk = P.computeTargets({ goal: 'bulk', sex: 'male', age: 20, weightLb: 180, heightIn: 71, activity: 1.55 });
assert.ok(bulk.kcal > bulk.tdee, 'bulk is above maintenance');
const tiny = P.computeTargets({ goal: 'lose', sex: 'female', age: 30, weightLb: 100, heightIn: 60, activity: 1.2 });
assert.strictEqual(tiny.kcal, 1200, 'calorie floor applies');
assert.ok(tiny.floorApplied);
assert.strictEqual(P.computeTargets({ goal: 'cut', sex: 'male', age: 16, weightLb: 150, heightIn: 68, activity: 1.55 }), null, 'under 18 rejected');
assert.strictEqual(P.computeTargets({ goal: 'cut', sex: 'male', age: 20, weightLb: '', heightIn: 68, activity: 1.55 }), null, 'blank weight rejected');

// mealTargets and macroGuide
const mt = P.mealTargets(2400, 160, 'dinner');
assert.strictEqual(mt.cal, 960);
const guide = P.macroGuide(2400, 160);
assert.ok(Math.abs(guide.p * 4 + guide.c * 4 + guide.f * 9 - 2400) < 30, 'macro guide adds up');

// pool filtering
const pool = P.buildPool(menu, ['sausage']);
assert.ok(!pool.some((i) => i.n === 'Turkey Sausage'), 'avoid words excluded');
assert.ok(!pool.some((i) => i.st === 'Juice'), 'juice station excluded');
assert.ok(!pool.some((i) => i.n === 'Maple Syrup'), 'topping station excluded');

// suggestions land near target
const target = { cal: 500, protein: 40 };
const plates = P.suggestPlates(menu, target, { goal: 'cut', rng: mulberry32(7) });
assert.strictEqual(plates.length, 3, 'three distinct plates');
plates.forEach((pl) => {
  assert.ok(Math.abs(pl.totals.cal - target.cal) <= 75, 'within 75 cal: ' + pl.totals.cal);
  assert.ok(pl.totals.p >= 30, 'protein reasonably high: ' + pl.totals.p);
});
const sigs = new Set(plates.map((pl) => pl.entries.map((e) => e.item.n).sort().join('|')));
assert.strictEqual(sigs.size, 3, 'plates are distinct');

// avoid and like are respected
const noEgg = P.suggestPlates(menu, target, { goal: 'cut', avoid: ['egg'], rng: mulberry32(3) });
noEgg.forEach((pl) => pl.entries.forEach((e) => assert.ok(!/egg/i.test(e.item.n))));
const likeYogurt = P.suggestPlates(menu, target, { goal: 'cut', like: ['yogurt'], rng: mulberry32(5) });
assert.ok(likeYogurt[0].entries.some((e) => /yogurt/i.test(e.item.n)), 'best plate includes liked item');

// tiny menus don't crash
assert.deepStrictEqual(P.suggestPlates([menu[0]], target, {}), []);
assert.deepStrictEqual(P.suggestPlates([], target, {}), []);

console.log('All planner tests passed.');
