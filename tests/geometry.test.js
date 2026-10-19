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

const { customizeContour, resolveTabs, nearestOnContour } = await import('../src/tab-layout.js');
const identifiedSquare = { ...square, id: 'outline-0' };
const tab = (id, position, widthOverride = null) => ({ id, position, widthOverride });

test('custom positions and counts survive global placement and channel changes', () => {
  const tabLayouts = {};
  const tabs = customizeContour(tabLayouts, identifiedSquare, options);
  tabs.splice(1, 1); tabs.push(tab('replacement', 0.36));
  const originalPositions = tabs.map(t => t.position);
  const result = generateStencil([identifiedSquare], { ...options, tabLayouts, tabCount: 12, tabOffset: 73, channelWidth: 3 });
  assert.deepEqual(result.bridges.map(b => b.position), originalPositions);
  assert.equal(result.bridges.length, 4);
  assert.ok(result.bridges.every(b => b.custom));
});

test('default widths propagate except for individual overrides, which can be cleared', () => {
  const tabLayouts = { 'outline-0': [tab('inherited', 0.125), tab('override', 0.375, 7)] };
  let result = generateStencil([identifiedSquare], { ...options, tabWidth: 6, tabLayouts });
  assert.deepEqual(result.bridges.map(b => b.width), [6, 7]);
  assert.equal(insideCuts(result, { x: 57.1, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 56.9, y: 10 }), 1);
  tabLayouts['outline-0'][1].widthOverride = null;
  result = generateStencil([identifiedSquare], { ...options, tabWidth: 6, tabLayouts });
  assert.deepEqual(result.bridges.map(b => b.width), [6, 6]);
});

test('mixed custom and automatic outlines retain independent behavior', () => {
  const second = { ...measureContour([{ x: 200, y: 10 }, { x: 300, y: 10 }], false), id: 'outline-1' };
  const result = generateStencil([identifiedSquare, second], { ...options, tabCount: 2, tabLayouts: { 'outline-0': [tab('custom', 0.1)] } });
  assert.equal(result.bridges.filter(b => b.contourId === 'outline-0').length, 1);
  assert.equal(result.bridges.filter(b => b.contourId === 'outline-1').length, 2);
  assert.equal(result.bridges[0].custom, true);
  assert.equal(result.bridges[1].custom, false);
});

test('resizing preserves proportional custom locations and millimeter widths', () => {
  const scaled = { ...measureContour(identifiedSquare.points.map(p => ({ x: p.x * 2, y: p.y * 2 })), true), id: 'outline-0' };
  const opts = { ...options, tabLayouts: { 'outline-0': [tab('custom', 0.125, 5)] } };
  const first = generateStencil([identifiedSquare], opts).bridges[0];
  const second = generateStencil([scaled], opts).bridges[0];
  assert.equal(second.point.x, first.point.x * 2);
  assert.equal(second.point.y, first.point.y * 2);
  assert.equal(second.width, 5);
});

test('custom tabs crossing a closed seam highlight both sides and remove the cut', () => {
  const result = generateStencil([identifiedSquare], { ...options, tabLayouts: { 'outline-0': [tab('seam', 0, 6)] } });
  assert.equal(result.bridges[0].segments.length, 2);
  assert.equal(insideCuts(result, { x: 10, y: 12 }), 0);
  assert.equal(insideCuts(result, { x: 12, y: 10 }), 0);
  assert.equal(insideCuts(result, { x: 14, y: 10 }), 1);
  assert.equal(result.paths.length, 1);
});

test('removing the last closed-outline tab produces a continuous ring and warning', () => {
  const result = generateStencil([identifiedSquare], { ...options, tabLayouts: { 'outline-0': [] } });
  assert.equal(result.bridges.length, 0);
  assert.equal(insideCuts(result, { x: 10, y: 10 }), 1);
  assert.equal(insideCuts(result, { x: 60, y: 60 }), 0);
  assert.equal(insideCuts(result, { x: 60, y: 10 }), 1);
  assert.ok(result.warnings.some(w => w.includes('no tabs')));
  const svg = exportSvg(result, 120, 120);
  assert.equal((svg.match(/Z/g) || []).length, 2);
});

test('open outlines can have no tabs and endpoint tabs report actual clipped widths', () => {
  const line = { ...measureContour([{ x: 10, y: 10 }, { x: 110, y: 10 }], false), id: 'outline-0' };
  const result = generateStencil([line], { ...options, tabLayouts: { 'outline-0': [] } });
  assert.equal(result.paths.length, 1);
  assert.equal(result.warnings.length, 0);
  const endpoint = generateStencil([line], { ...options, tabLayouts: { 'outline-0': [tab('endpoint', 0, 6)] } });
  assert.equal(endpoint.bridges[0].width, 3);
  assert.equal(insideCuts(endpoint, { x: 12, y: 10 }), 0);
  assert.equal(insideCuts(endpoint, { x: 14, y: 10 }), 1);
  assert.ok(endpoint.warnings.some(w => w.includes('requested 6.0 mm tab is 3.0 mm')));
});

test('small custom outlines preserve tabs and report limited widths without changing requested widths', () => {
  const tiny = { ...measureContour([{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }], true), id: 'outline-0' };
  const tabLayouts = { 'outline-0': [tab('one', 0.1, 6), tab('two', 0.6)] };
  const result = generateStencil([tiny], { ...options, tabLayouts });
  assert.equal(result.bridges.length, 2);
  assert.equal(result.bridges[0].requestedWidth, 6);
  assert.ok(Math.abs(result.bridges[0].width - 1.4) < 1e-8);
  assert.ok(result.warnings.some(w => w.includes('to fit')));
  assert.equal(tabLayouts['outline-0'][0].widthOverride, 6);
});

test('overlapping custom tabs are merged geometrically and warned about, including across seam', () => {
  for (const positions of [[0.2, 0.205], [0.999, 0.001]]) {
    const result = generateStencil([identifiedSquare], { ...options, tabLayouts: { 'outline-0': positions.map((p, i) => tab(`tab-${i}`, p, 6)) } });
    assert.equal(result.bridges.length, 2);
    assert.ok(result.warnings.some(w => w.includes('overlapping')));
    assert.ok(result.paths.length > 0);
  }
});

test('resetting a custom outline restores automatic count, placement, and width inheritance', () => {
  const tabLayouts = { 'outline-0': [tab('custom', 0.1, 9)] };
  delete tabLayouts['outline-0'];
  const result = generateStencil([identifiedSquare], { ...options, tabLayouts });
  assert.equal(result.bridges.length, 4);
  assert.ok(result.bridges.every(b => !b.custom && b.width === 4));
});

test('nearest-point projection snaps within segments and handles duplicate vertices', () => {
  const projection = nearestOnContour(identifiedSquare, { x: 40, y: 8 });
  assert.deepEqual(projection.point, { x: 40, y: 10 });
  assert.equal(projection.position, 30 / 400);
  assert.equal(projection.distance, 2);
  const duplicated = measureContour([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], false);
  assert.equal(nearestOnContour(duplicated, { x: 50, y: 1 }).position, 0.5);
});

test('curved marker segments follow contour vertices rather than drawing across corners', () => {
  const tabs = resolveTabs(identifiedSquare, options, [tab('corner', 0.25, 6)]);
  assert.equal(tabs[0].width, 6);
  const result = generateStencil([identifiedSquare], { ...options, tabLayouts: { 'outline-0': [tab('corner', 0.25, 6)] } });
  assert.ok(result.bridges[0].segments[0].some(p => p.x === 110 && p.y === 10));
});

test('tabs inside an uncut ring interior are not falsely reported as crossed', () => {
  const inner = { ...measureContour([{ x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }], true), id: 'outline-1' };
  const result = generateStencil([identifiedSquare, inner], { ...options, tabLayouts: { 'outline-0': [] } });
  assert.ok(!result.warnings.some(w => w.includes('intersect')));
});
