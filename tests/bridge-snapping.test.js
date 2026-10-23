import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeSnapLines, snapBridgeToLines, snapBridgeToAngles } from '../src/bridge-snapping.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const lines = bridgeSnapLines([[{ x: 10, y: 0 }, { x: 10, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }]], 2);

test('angle snapping covers all eight directions and keeps the opposite anchor and length', () => {
  for (let step = -4; step < 4; step++) for (const end of ['a', 'b']) {
    const angle = step * Math.PI / 4 + 0.05;
    const bridge = { a: { x: 20, y: 20 }, b: { x: 20 + 10 * Math.cos(angle), y: 20 + 10 * Math.sin(angle) }, width: 3 };
    const snapped = snapBridgeToAngles(bridge, end);
    assert.deepEqual(snapped[end === 'a' ? 'b' : 'a'], bridge[end === 'a' ? 'b' : 'a']);
    near(snapped.b.x - snapped.a.x, 10 * Math.cos(step * Math.PI / 4));
    near(snapped.b.y - snapped.a.y, 10 * Math.sin(step * Math.PI / 4));
    assert.equal(snapped.width, 3);
    near(bridge.b.x, 20 + 10 * Math.cos(angle));
  }
});

test('whole bridge angle snapping preserves its center', () => {
  const bridge = { a: { x: 2, y: 3 }, b: { x: 12, y: 3.5 } };
  const snapped = snapBridgeToAngles(bridge);
  near((snapped.a.x + snapped.b.x) / 2, 7);
  near((snapped.a.y + snapped.b.y) / 2, 3.25);
  near(snapped.a.y, snapped.b.y);
  near(Math.hypot(snapped.b.x - snapped.a.x, snapped.b.y - snapped.a.y), Math.sqrt(100.25));
});

test('axis and diagonal snaps can be enabled independently in every direction', () => {
  for (const axes of [false, true]) for (const diagonal of [false, true]) {
    for (let step = -4; step < 4; step++) for (const end of [null, 'a', 'b']) {
      const angle = step * Math.PI / 4 + 0.05;
      const bridge = { a: { x: 20, y: 20 }, b: { x: 20 + 10 * Math.cos(angle), y: 20 + 10 * Math.sin(angle) }, width: 3 };
      const snapped = snapBridgeToAngles(bridge, end, { axes, diagonal });
      if (step % 2 === 0 ? axes : diagonal) {
        near(snapped.b.x - snapped.a.x, 10 * Math.cos(step * Math.PI / 4));
        near(snapped.b.y - snapped.a.y, 10 * Math.sin(step * Math.PI / 4));
      } else assert.equal(snapped, bridge);
    }
  }
});

test('angle snapping ignores curves, bend handles, zero length, and angles outside tolerance', () => {
  const bridge = { a: { x: 0, y: 0 }, b: { x: 10, y: 4 } };
  assert.equal(snapBridgeToAngles(bridge), bridge);
  const curved = { ...bridge, control: { x: 5, y: 2 } };
  assert.equal(snapBridgeToAngles(curved), curved);
  assert.equal(snapBridgeToAngles(bridge, 'control'), bridge);
  const zero = { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } };
  assert.equal(snapBridgeToAngles(zero), zero);
});

test('angle snapping attracts angles below five degrees and releases above five degrees', () => {
  for (const degrees of [-5.1, -4.9, 4.9, 5.1]) {
    const angle = degrees * Math.PI / 180;
    const bridge = { a: { x: 0, y: 0 }, b: { x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) } };
    const snapped = snapBridgeToAngles(bridge, 'b');
    if (Math.abs(degrees) > 5) assert.equal(snapped, bridge);
    else { near(snapped.b.x, 10); near(snapped.b.y, 0); }
  }
});

test('a dragged bridge side snaps flush and parallel, eliminating a tiny gap or overlap', () => {
  for (const x of [11.8, 12.2]) {
    const bridge = { a: { x, y: 5 }, b: { x: x + 0.1, y: 30 }, width: 4 };
    const snapped = snapBridgeToLines(bridge, lines, 0.5);
    near(snapped.a.x, 12); near(snapped.b.x, 12);
    near(Math.hypot(snapped.b.x - snapped.a.x, snapped.b.y - snapped.a.y), Math.hypot(0.1, 25));
    assert.equal(snapped.width, 4);
    assert.equal(bridge.a.x, x);
  }
});

test('snapping follows a slanted line, in either drawing direction and from either side', () => {
  const u = { x: 0.6, y: 0.8 }, n = { x: -0.8, y: 0.6 };
  for (const reverse of [false, true]) for (const side of [-1, 1]) {
    const edge = { a: { x: 0, y: 0 }, b: { x: 30, y: 40 }, length: 50 };
    if (reverse) [edge.a, edge.b] = [edge.b, edge.a];
    const p = t => ({ x: u.x * t + n.x * side * 2.2, y: u.y * t + n.y * side * 2.2 });
    const snapped = snapBridgeToLines({ a: p(5), b: p(25), width: 4 }, [edge], 0.5);
    for (const point of [snapped.a, snapped.b]) near(point.x * n.x + point.y * n.y, side * 2);
  }
});

test('endpoint drags can match the nearby angle without changing bridge width or length', () => {
  for (const end of ['a', 'b']) {
    const bridge = { a: { x: 12.1, y: 5 }, b: { x: 12.2, y: 30 }, width: 4 };
    const snapped = snapBridgeToLines(bridge, lines, 0.5, end);
    near(snapped.a.x, 12); near(snapped.b.x, 12);
    near(Math.hypot(snapped.b.x - snapped.a.x, snapped.b.y - snapped.a.y), Math.hypot(0.1, 25));
  }
});

test('distant, perpendicular and short curve segments do not attract a bridge', () => {
  const bridge = { a: { x: 15, y: 5 }, b: { x: 15, y: 30 }, width: 4 };
  assert.equal(snapBridgeToLines(bridge, lines, 0.5), bridge);
  const distant = { a: { x: 12.1, y: 100 }, b: { x: 12.1, y: 120 }, width: 4 };
  assert.equal(snapBridgeToLines(distant, lines, 0.5), distant);
  assert.deepEqual(bridgeSnapLines([[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0 }]], 2), []);
  const horizontal = { a: { x: 5, y: 10 }, b: { x: 20, y: 10 }, width: 4 };
  assert.equal(snapBridgeToLines(horizontal, lines, 0.5), horizontal);
  assert.equal(snapBridgeToLines({ ...bridge, control: { x: 5, y: 15 } }, lines, 0.5).control.x, 5);
});
