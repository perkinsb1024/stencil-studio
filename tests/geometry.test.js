import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { measureContour, generateStencil, exportSvg } = await import('../src/geometry.js');
const options = { channelWidth: 2, tabWidth: 4, tabCount: 4, tabOffset: 0 };
const square = measureContour([{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }], true);
const insideCuts = (result, p) => result.paths.reduce((v, poly) => v ^ (ClipperLib.Clipper.PointInPolygon({ X: Math.round(p.x * 10000), Y: Math.round(p.y * 10000) }, poly.map(v => ({ X: Math.round(v.x * 10000), Y: Math.round(v.y * 10000) }))) !== 0), 0);

test('square channels have the specified width and four intact bridges', () => {
  const result = generateStencil([square], options);
  assert.equal(result.paths.length, 4);
  assert.equal(result.bridges.length, 4);
  assert.equal(result.warnings.length, 0);
  assert.equal(insideCuts(result, { x: 30, y: 10 }), 1);
  assert.equal(insideCuts(result, { x: 30, y: 10.9 }), 1);
  assert.equal(insideCuts(result, { x: 30, y: 11.1 }), 0);
  for (const b of result.bridges) assert.equal(insideCuts(result, b.point), 0);
  assert.equal(insideCuts(result, { x: 60, y: 60 }), 0);
});

test('a tab wrapping the closed-path seam does not leave a tiny extra cut', () => {
  const result = generateStencil([square], { ...options, tabOffset: 50 });
  assert.equal(result.paths.length, 4);
  assert.equal(insideCuts(result, { x: 10, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 10.5, y: 10 }), 0);
});

test('retaining tabs create a real gap of the requested width', () => {
  const result = generateStencil([square], options);
  assert.equal(insideCuts(result, { x: 58.1, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 61.9, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 57.9, y: 10 }), 1);
  assert.equal(insideCuts(result, { x: 62.1, y: 10 }), 1);
});

test('short contours retain room for channels and report reduced tabs', () => {
  const tiny = measureContour([{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }], true);
  const result = generateStencil([tiny], options);
  assert.ok(result.paths.length > 0);
  assert.equal(result.bridges.length, 1);
  assert.ok(result.warnings.some(w => w.includes('small contours')));
});

test('open lines produce closed rectangular cut regions separated by tabs', () => {
  const line = measureContour([{ x: 10, y: 10 }, { x: 110, y: 10 }], false);
  const result = generateStencil([line], { ...options, tabCount: 1 });
  assert.equal(result.paths.length, 2);
  assert.equal(insideCuts(result, { x: 60, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 30, y: 10 }), 1);
});

test('crossing channels merge and conflicting bridges are reported', () => {
  const horizontal = measureContour([{ x: 0, y: 50 }, { x: 100, y: 50 }], false);
  const vertical = measureContour([{ x: 50, y: 0 }, { x: 50, y: 100 }], false);
  const result = generateStencil([horizontal, vertical], { ...options, tabCount: 2 });
  assert.equal(insideCuts(result, { x: 50, y: 50 }), 1);
  const crossingBridge = measureContour([{ x: 33.3333, y: 0 }, { x: 33.3333, y: 100 }], false);
  const conflict = generateStencil([horizontal, crossingBridge], { ...options, tabCount: 2 });
  assert.ok(conflict.warnings.some(w => w.includes('intersect')));
});

test('export has physical millimeter dimensions and only closed cut geometry', () => {
  const result = generateStencil([square], options);
  const svg = exportSvg(result, 120, 120, '<unsafe> & stencil');
  assert.match(svg, /width="120mm" height="120mm"/);
  assert.match(svg, /viewBox="0 0 120 120"/);
  assert.match(svg, /fill-rule="evenodd" stroke="none"/);
  assert.equal((svg.match(/Z/g) || []).length, 4);
  assert.ok(!svg.includes('<unsafe>'));
  assert.ok(!svg.includes('<rect'));
});
