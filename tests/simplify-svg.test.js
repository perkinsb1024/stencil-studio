import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { simplifyArtwork, nodeCount, simplifiedSvg } = await import('../src/simplify-svg.js');
const contour = (points, closed = true) => ({ points: points.map(([x, y]) => ({ x, y })), closed });
const artwork = contours => ({ contours, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 }, warnings: [] });
const neck = contour([[0, 0], [20, 0], [20, 9.5], [40, 9.5], [40, 0], [60, 0], [60, 20], [40, 20], [40, 10.5], [20, 10.5], [20, 20], [0, 20]]);
const filledAt = (result, x, y) => result.contours.filter(c => c.closed).reduce((inside, c) => inside ^ (ClipperLib.Clipper.PointInPolygon({ X: x * 10000, Y: y * 10000 }, c.points.map(p => ({ X: Math.round(p.x * 10000), Y: Math.round(p.y * 10000) }))) !== 0), 0);

test('opening splits a fragile neck into independent closed shapes at physical width', () => {
  const source = artwork([neck]);
  const result = simplifyArtwork(source, { width: 100, breakWidth: 2 });
  assert.equal(result.contours.length, 2);
  assert(result.contours.every(c => c.closed));
  assert.equal(filledAt(result, 10, 10), 1);
  assert.equal(filledAt(result, 50, 10), 1);
  assert.equal(filledAt(result, 30, 10), 0);
  assert.equal(simplifyArtwork(source, { width: 100, breakWidth: 0.5 }).contours.length, 1);
  assert.equal(simplifyArtwork(source, { width: 200, breakWidth: 1.5 }).contours.length, 1);
  assert.equal(simplifyArtwork(source, { width: 50, breakWidth: 1 }).contours.length, 2);
  assert.equal(source.contours[0].points.length, 12, 'Source stays unchanged');
  assert.deepEqual(result.bounds, source.bounds);
});

test('smoothing fills tiny notches, removes spikes and preserves substantial holes of either winding', () => {
  const outer = contour([[0, 0], [19, 0], [19, 2], [20, 2], [20, 0], [50, 0], [50, 30], [30, 30], [30, 33], [29, 33], [29, 30], [0, 30]]);
  const hole = contour([[5, 5], [15, 5], [15, 20], [5, 20]]);
  for (const points of [hole.points, [...hole.points].reverse()]) {
    const result = simplifyArtwork(artwork([outer, { ...hole, points }]), { width: 100, smooth: 1.2 });
    assert.equal(filledAt(result, 19.5, 1), 1, 'Notch is smoothed');
    assert.equal(filledAt(result, 29.5, 32), 0, 'Spike is removed');
    assert.equal(filledAt(result, 10, 10), 0, 'Hole stays empty');
    assert.equal(filledAt(result, 25, 15), 1, 'Outer area remains filled');
  }
});

test('node reduction preserves open endpoints and valid closed boundaries', () => {
  const line = contour(Array.from({ length: 101 }, (_, i) => [i, 5 + Math.sin(i) * 0.02]), false);
  const square = contour([[0, 0], [10, 0.01], [20, 0], [20, 20], [10, 20.01], [0, 20], [0, 0]]);
  const source = artwork([square, line]);
  const result = simplifyArtwork(source, { width: 100, tolerance: 0.1 });
  const open = result.contours.find(c => !c.closed);
  assert.deepEqual(open.points, [line.points[0], line.points.at(-1)]);
  assert.equal(result.contours.find(c => c.closed).points.length, 4);
  assert(nodeCount(result.contours) < nodeCount(source.contours) / 10);
  assert.equal(filledAt(result, 10, 10), 1);
});

test('zero settings preserve geometry; duplicate closing vertices are counted once', () => {
  const source = artwork([neck]);
  assert.deepEqual(simplifyArtwork(source, { width: 100 }).contours[0].points, neck.points);
  assert.equal(nodeCount([contour([[0, 0], [10, 0], [10, 10], [0, 0]])]), 3);
});

test('strong opening can remove all shapes and leaves open paths alone', () => {
  const small = contour([[1, 1], [2, 1], [2, 2], [1, 2]]);
  assert.equal(simplifyArtwork(artwork([small]), { width: 100, breakWidth: 3 }).contours.length, 0);
  const line = contour([[0, 0], [20, 20]], false);
  assert.deepEqual(simplifyArtwork(artwork([small, line]), { width: 100, breakWidth: 3 }).contours[0].points, line.points);
});

test('serialization keeps the coordinate frame, compound holes and open outlines', () => {
  const source = artwork([neck, contour([[5, 5], [10, 5], [10, 10], [5, 10]]), contour([[1, 1], [3, 4]], false)]);
  const svg = simplifiedSvg(source);
  assert.match(svg, /viewBox="0 0 100 50" data-stencil-frame="0 0 100 50"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /fill="none" stroke="black" d="M1 1L3 4"/);
  assert.equal(svg.match(/Z/g).length, 2);
});

test('invalid physical settings are rejected', () => {
  for (const options of [{ width: 0 }, { width: NaN }, { width: 100, tolerance: -1 }, { width: 100, smooth: Infinity }]) {
    assert.throws(() => simplifyArtwork(artwork([neck]), options));
  }
});
