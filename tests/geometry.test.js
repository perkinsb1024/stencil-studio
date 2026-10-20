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

test('hidden outlines contribute no cuts, bridges or intersection warnings', () => {
  const horizontal = { ...measureContour([{ x: 0, y: 50 }, { x: 100, y: 50 }], false), id: 'outline-0' };
  const crossing = { ...measureContour([{ x: 100 / 3, y: 0 }, { x: 100 / 3, y: 100 }], false), id: 'outline-1' };
  const settings = { ...options, tabCount: 2 };
  assert.ok(generateStencil([horizontal, crossing], settings).warnings.some(w => w.includes('intersect')));
  const result = generateStencil([horizontal, crossing], { ...settings, hiddenContours: ['outline-1'] });
  assert.deepEqual(result, generateStencil([horizontal], settings));
  assert.equal(insideCuts(result, { x: 100 / 3, y: 30 }), 0);
});

test('hiding a nested outline preserves custom tabs and restores identical geometry', () => {
  const inner = { ...measureContour([{ x: 35, y: 35 }, { x: 85, y: 35 }, { x: 85, y: 85 }, { x: 35, y: 85 }], true), id: 'outline-1' };
  const tabLayouts = { 'outline-1': [tab('tab-saved', 0.32, 6)] };
  const settings = { ...options, tabLayouts };
  const before = generateStencil([identifiedSquare, inner], settings);
  const originalLayouts = structuredClone(tabLayouts);
  const hidden = generateStencil([identifiedSquare, inner], { ...settings, hiddenContours: ['outline-1'] });
  assert.deepEqual(hidden, generateStencil([identifiedSquare], settings));
  assert.deepEqual(tabLayouts, originalLayouts);
  assert.deepEqual(generateStencil([identifiedSquare, inner], { ...settings, hiddenContours: [] }), before);
  assert.equal(exportSvg(hidden, 120, 120), exportSvg(generateStencil([identifiedSquare], settings), 120, 120));
});

test('hidden outlines keep warning numbers stable and suppress their own warnings', () => {
  const contours = [identifiedSquare, { ...square, id: 'outline-1' }, { ...square, id: 'outline-2' }];
  const result = generateStencil(contours, { ...options, tabLayouts: { 'outline-0': [], 'outline-2': [] }, hiddenContours: ['outline-0', 'outline-1'] });
  assert.deepEqual(result.warnings, ['Outline 3 has no tabs; its inner piece may come loose.']);
  assert.ok(result.bridges.every(b => b.contourId === 'outline-2'));
});

test('hiding every outline yields empty cuts, tabs and warnings', () => {
  const result = generateStencil([identifiedSquare], { ...options, hiddenContours: ['outline-0'], tabLayouts: { 'outline-0': [] } });
  assert.equal(result.paths.length, 0);
  assert.equal(result.bridges.length, 0);
  assert.equal(result.warnings.length, 0);
});

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

test('full cut-aways use one original boundary, remove the interior and ignore channel and tab settings', () => {
  const settings = { ...options, cutawayContours: ['outline-0'], tabLayouts: { 'outline-0': [tab('saved', 0.3, 9)] } };
  const before = structuredClone(settings);
  const result = generateStencil([identifiedSquare], settings);
  assert.equal(result.paths.length, 1);
  assert.equal(result.bridges.length, 0);
  assert.deepEqual(result.warnings, []);
  assert.equal(insideCuts(result, { x: 60, y: 60 }), 1);
  assert.equal(insideCuts(result, { x: 60, y: 9.99 }), 0);
  assert.equal(insideCuts(result, { x: 60, y: 10.01 }), 1);
  assert.deepEqual(generateStencil([identifiedSquare], { ...settings, channelWidth: 12, tabCount: 24, tabWidth: 15, tabOffset: 75 }), result);
  assert.deepEqual(settings, before);
  const svg = exportSvg(result, 120, 120);
  assert.equal((svg.match(/Z/g) || []).length, 1);
  assert.match(svg, /fill-rule="evenodd" stroke="none"/);
  assert.match(svg, /width="120mm" height="120mm"/);
});

test('cut-aways merge overlapping and nested removed areas regardless of source winding', () => {
  const reversed = { ...measureContour([...square.points].reverse(), true), id: 'outline-0' };
  const inner = { ...measureContour([{ x: 30, y: 30 }, { x: 90, y: 30 }, { x: 90, y: 90 }, { x: 30, y: 90 }], true), id: 'outline-1' };
  const overlap = { ...measureContour([{ x: 80, y: 30 }, { x: 140, y: 30 }, { x: 140, y: 90 }, { x: 80, y: 90 }], true), id: 'outline-2' };
  const result = generateStencil([reversed, inner, overlap], { ...options, cutawayContours: ['outline-0', 'outline-1', 'outline-2'] });
  assert.equal(result.paths.length, 1);
  for (const x of [20, 50, 85, 120]) assert.equal(insideCuts(result, { x, y: 60 }), 1);
  assert.equal(insideCuts(result, { x: 140.01, y: 60 }), 0);
  const withChannel = generateStencil([reversed, inner], { ...options, cutawayContours: ['outline-0'], tabLayouts: { 'outline-1': [] } });
  assert.equal(withChannel.paths.length, 1, 'Inner channels must not leave holes in a removed area');
  assert.equal(insideCuts(withChannel, { x: 60, y: 60 }), 1);
});

test('hidden cut-aways contribute nothing and switching back restores custom channel geometry', () => {
  const settings = { ...options, tabLayouts: { 'outline-0': [tab('saved', 0.3, 6)] } };
  const original = generateStencil([identifiedSquare], settings);
  generateStencil([identifiedSquare], { ...settings, cutawayContours: ['outline-0'] });
  assert.deepEqual(generateStencil([identifiedSquare], settings), original);
  assert.deepEqual(generateStencil([identifiedSquare], { ...settings, cutawayContours: ['outline-0'], hiddenContours: ['outline-0'] }), generateStencil([identifiedSquare], { ...settings, hiddenContours: ['outline-0'] }));
  const tiny = { ...measureContour([{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }], true), id: 'outline-0' };
  assert.deepEqual(generateStencil([tiny], { ...settings, cutawayContours: ['outline-0'] }).warnings, []);
});

test('cut-aways warn when they remove another outline’s retaining tabs', () => {
  const inner = { ...measureContour([{ x: 30, y: 30 }, { x: 90, y: 30 }, { x: 90, y: 90 }, { x: 30, y: 90 }], true), id: 'outline-1' };
  const result = generateStencil([identifiedSquare, inner], { ...options, cutawayContours: ['outline-0'] });
  assert.ok(result.warnings.some(w => w.includes('4 tabs intersect') && w.includes('full cut-away')));
});

test('open paths cannot become filled cut-aways', () => {
  const open = { ...measureContour([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }], false), id: 'outline-0' };
  assert.deepEqual(generateStencil([open], { ...options, cutawayContours: ['outline-0'] }), generateStencil([open], options));
});

const region = (points, width = 1, contourId = null) => ({ id: 'region-test', points, width, contourId });
const rect = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
const regionalLine = { ...measureContour([{ x: 10, y: 50 }, { x: 110, y: 50 }], false), id: 'outline-0' };
const noTabs = { ...options, channelWidth: 8, tabLayouts: { 'outline-0': [] } };

test('polygon widths preserve the requested interior width and the global width beyond the taper', () => {
  const result = generateStencil([regionalLine], { ...noTabs, regions: [region(rect(30, 40, 70, 60), 1)] });
  assert.equal(insideCuts(result, { x: 50, y: 50.49 }), 1);
  assert.equal(insideCuts(result, { x: 50, y: 50.51 }), 0);
  assert.equal(insideCuts(result, { x: 22, y: 53.9 }), 1);
  assert.equal(insideCuts(result, { x: 78, y: 53.9 }), 1);
  assert.equal(insideCuts(result, { x: 80, y: 54.1 }), 0);
  assert.equal(result.paths.length, 1, 'Transitions must stay connected');
  const svg = exportSvg(result, 120, 100);
  assert.ok(!svg.includes('region-test'));
  assert.equal((svg.match(/Z/g) || []).length, 1);
});

test('regions can widen a channel and use true polygon edges rather than a bounding rectangle', () => {
  const triangle = region([{ x: 30, y: 40 }, { x: 70, y: 40 }, { x: 50, y: 60 }], 10);
  const result = generateStencil([regionalLine], { ...noTabs, channelWidth: 2, regions: [triangle] });
  assert.equal(insideCuts(result, { x: 50, y: 54 }), 1);
  assert.equal(insideCuts(result, { x: 32, y: 54 }), 0, 'Outside the triangle but inside its bounding box');
  assert.equal(insideCuts(result, { x: 20, y: 51.1 }), 0);
});

test('region scope applies to individual outlines before union, or to all layers', () => {
  const other = { ...measureContour([{ x: 10, y: 70 }, { x: 110, y: 70 }], false), id: 'outline-1' };
  const settings = { ...noTabs, tabLayouts: { 'outline-0': [], 'outline-1': [] } };
  const shape = rect(30, 35, 70, 85);
  const individual = generateStencil([regionalLine, other], { ...settings, regions: [region(shape, 1, 'outline-0')] });
  assert.equal(insideCuts(individual, { x: 50, y: 53 }), 0);
  assert.equal(insideCuts(individual, { x: 50, y: 73 }), 1);
  const all = generateStencil([regionalLine, other], { ...settings, regions: [region(shape)] });
  assert.equal(insideCuts(all, { x: 50, y: 73 }), 0);
  // A different, intersecting outline must keep its own cut inside the region.
  const crossing = { ...measureContour([{ x: 50, y: 40 }, { x: 50, y: 60 }], false), id: 'outline-1' };
  const mixed = generateStencil([regionalLine, crossing], { ...settings, regions: [region(shape, 1, 'outline-0')] });
  assert.equal(insideCuts(mixed, { x: 53, y: 53 }), 1);
});

test('later matching regions win overlaps without overriding other scopes', () => {
  const first = region(rect(20, 35, 80, 65), 1);
  const second = { ...region(rect(40, 35, 100, 65), 4), id: 'region-second' };
  const result = generateStencil([regionalLine], { ...noTabs, regions: [first, second] });
  assert.equal(insideCuts(result, { x: 30, y: 51 }), 0);
  assert.equal(insideCuts(result, { x: 50, y: 51.9 }), 1);
  assert.equal(insideCuts(result, { x: 50, y: 52.1 }), 0);
  const reversed = generateStencil([regionalLine], { ...noTabs, regions: [second, first] });
  assert.equal(insideCuts(reversed, { x: 50, y: 51.9 }), 0);
  const wrongScope = generateStencil([regionalLine], { ...noTabs, regions: [first, { ...second, contourId: 'outline-1' }] });
  assert.equal(insideCuts(wrongScope, { x: 50, y: 51.9 }), 0);
});

test('regions keep retaining gaps and custom layouts while updating preview widths', () => {
  const tabLayouts = { 'outline-0': [tab('saved', 0.5, 6)] };
  const settings = { ...noTabs, tabLayouts, regions: [region(rect(30, 35, 90, 65), 1)] };
  const original = structuredClone(settings);
  const result = generateStencil([regionalLine], settings);
  assert.equal(insideCuts(result, { x: 60, y: 50 }), 0);
  assert.equal(insideCuts(result, { x: 56.9, y: 50 }), 1);
  assert.equal(result.bridges[0].channelWidth, 1);
  assert.equal(result.bridges[0].width, 6);
  assert.deepEqual(settings, original);
  assert.deepEqual(result.warnings, []);
});

test('regions preserve closed-channel holes, ignore cut-aways and stay harmless when hidden', () => {
  const settings = { ...noTabs, regions: [region(rect(0, 0, 120, 120), 1)] };
  const result = generateStencil([identifiedSquare], settings);
  assert.equal(insideCuts(result, { x: 60, y: 60 }), 0);
  assert.equal(insideCuts(result, { x: 60, y: 10.49 }), 1);
  assert.equal(insideCuts(result, { x: 60, y: 10.51 }), 0);
  assert.equal(result.paths.length, 2);
  assert.deepEqual(generateStencil([identifiedSquare], { ...settings, cutawayContours: ['outline-0'] }), generateStencil([identifiedSquare], { ...noTabs, cutawayContours: ['outline-0'] }));
  assert.equal(generateStencil([identifiedSquare], { ...settings, hiddenContours: ['outline-0'] }).paths.length, 0);
});

test('width transitions taper continuously with flat ends and no vertical shoulders', () => {
  const result = generateStencil([regionalLine], { ...noTabs, regions: [region(rect(30, 40, 70, 60), 1)] });
  const expected = [[23, 4], [24.75, 3.453125], [26.5, 2.25], [28.25, 1.046875], [30, 0.5]];
  for (const [x, radius] of expected) {
    assert.equal(insideCuts(result, { x, y: 50 + radius - 0.01 }), 1, `Missing cut at ${x}`);
    assert.equal(insideCuts(result, { x, y: 50 + radius + 0.01 }), 0, `Too wide at ${x}`);
    assert.equal(insideCuts(result, { x: 100 - x, y: 50 + radius - 0.01 }), 1);
  }
  for (const path of result.paths) for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    if (a.x > 10.01 && a.x < 109.99) assert.ok(Math.abs(a.x - b.x) > 0.0001 || Math.abs(a.y - b.y) < 0.02, 'A hard width shoulder remains');
  }
});

test('tapered channels keep round corners and closed seams without filling the interior', () => {
  const result = generateStencil([identifiedSquare], { ...noTabs, regions: [region(rect(0, 0, 30, 30), 1)] });
  assert.equal(result.paths.length, 2);
  assert.equal(insideCuts(result, { x: 60, y: 60 }), 0);
  assert.equal(insideCuts(result, { x: 9.7, y: 9.7 }), 1, 'Narrow seam corner must stay rounded');
  assert.equal(insideCuts(result, { x: 9.6, y: 9.6 }), 0);
  assert.equal(insideCuts(result, { x: 112.5, y: 7.5 }), 1, 'Wide corner must stay rounded');
  assert.equal(insideCuts(result, { x: 113, y: 7 }), 0);
});

test('channel corners can stay sharp with regional widths and either tab cap style', () => {
  for (const vertices of [square.points.slice(0, -1), square.points.slice(0, -1).reverse()]) {
    const contour = { ...measureContour(vertices, true), id: 'outline-0' };
    for (const roundedTabs of [false, true]) {
      for (const regions of [[], [region(rect(0, 0, 30, 30), 1)]]) {
        const settings = { ...options, roundedTabs, regions };
        const radius = regions.length ? 0.5 : 1;
        const point = { x: 10 - radius * 0.9, y: 10 - radius * 0.9 };
        const rounded = generateStencil([contour], settings);
        const sharp = generateStencil([contour], { ...settings, roundedChannelCorners: false });
        assert.equal(insideCuts(rounded, point), 0);
        assert.equal(insideCuts(sharp, point), 1);
        assert.equal(insideCuts(sharp, { x: 60, y: 60 }), 0);
        for (const bridge of sharp.bridges) assert.equal(insideCuts(sharp, bridge.point), 0);
      }
    }
  }
  const sharpClosed = generateStencil([square], { ...options, tabCount: 0, roundedChannelCorners: false });
  assert.equal(sharpClosed.paths.length, 2);
  assert.equal(insideCuts(sharpClosed, { x: 9.1, y: 9.1 }), 1);
  assert.equal(insideCuts(sharpClosed, { x: 60, y: 60 }), 0);
});

test('regional widths on sampled curves leave continuous boundaries without hairline slits', () => {
  const points = Array.from({ length: 96 }, (_, i) => ({ x: 50 + 30 * Math.cos(i * Math.PI / 48), y: 50 + 30 * Math.sin(i * Math.PI / 48) }));
  for (const vertices of [points, points.toReversed()]) {
    const contour = { ...measureContour(vertices, true), id: 'outline-0' };
    for (const [channelWidth, width] of [[8, 2], [2, 8]]) {
      const result = generateStencil([contour], { ...noTabs, channelWidth, regions: [{ ...region(rect(45, 10, 90, 90), width), taperLength: 5 }] });
      assert.equal(result.paths.length, 2, 'A closed channel must have only its outer boundary and inner hole');
      assert.equal(insideCuts(result, { x: 50, y: 50 }), 0);
      for (const p of result.paths.flat()) {
        const nearest = Math.min(...contour.points.slice(1).map((b, i) => {
          const a = contour.points[i], dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
        }));
        assert.ok(nearest >= 0.98, `A crack reaches inside the minimum channel radius at ${p.x}, ${p.y}`);
      }
      assert.equal((exportSvg(result, 100, 100).match(/Z/g) || []).length, 2);
    }
    for (const roundedTabs of [false, true]) {
      const result = generateStencil([contour], { ...options, roundedTabs, channelWidth: 8, regions: [{ ...region(rect(45, 10, 90, 90), 2), taperLength: 5 }] });
      assert.equal(result.paths.length, 4, 'Each pair of tabs must bound one continuous cut');
      for (const bridge of result.bridges) assert.equal(insideCuts(result, bridge.point), 0);
      assert.deepEqual(result.warnings, []);
    }
  }
});

test('a tab in a taper retains square ends and its full gap, without round caps intruding', () => {
  const result = generateStencil([regionalLine], { ...noTabs, tabLayouts: { 'outline-0': [tab('taper-tab', 0.15, 6)] }, regions: [region(rect(30, 40, 70, 60), 1)] });
  assert.equal(result.bridges.length, 1);
  assert.equal(result.bridges[0].width, 6);
  assert.equal(insideCuts(result, { x: 21.99, y: 50 }), 1);
  assert.equal(insideCuts(result, { x: 22.01, y: 50 }), 0);
  assert.equal(insideCuts(result, { x: 27.99, y: 50 }), 0);
  assert.equal(insideCuts(result, { x: 28.01, y: 50 }), 1);
  assert.deepEqual(result.warnings, []);
});

test('a tiny region on a long straight segment reaches its requested width', () => {
  const result = generateStencil([regionalLine], { ...noTabs, regions: [region(rect(47.13, 49, 47.15, 51), 0.2)] });
  assert.equal(insideCuts(result, { x: 47.14, y: 50.09 }), 1);
  assert.equal(insideCuts(result, { x: 47.14, y: 50.11 }), 0);
  assert.equal(insideCuts(result, { x: 60, y: 53.99 }), 1);
});

test('explicit regional taper lengths control the exported transition while preserving interior width', () => {
  for (const taperLength of [2, 12]) {
    const result = generateStencil([regionalLine], { ...noTabs, regions: [{ ...region(rect(30, 40, 70, 60), 1), taperLength }] });
    for (const x of [30 - taperLength / 2, 70 + taperLength / 2]) {
      assert.equal(insideCuts(result, { x, y: 52.24 }), 1);
      assert.equal(insideCuts(result, { x, y: 52.26 }), 0);
    }
    assert.equal(insideCuts(result, { x: 50, y: 50.49 }), 1);
    assert.equal(insideCuts(result, { x: 50, y: 50.51 }), 0);
    assert.equal(insideCuts(result, { x: 30 - taperLength, y: 53.99 }), 1);
  }
});

test('rounded tab caps curve inward while preserving the gap and open endpoints', () => {
  const line = measureContour([{ x: 10, y: 10 }, { x: 110, y: 10 }], false);
  const settings = { ...options, tabCount: 1 };
  const squareEnds = generateStencil([line], settings);
  const rounded = generateStencil([line], { ...settings, roundedTabs: true });
  assert.equal(rounded.paths.length, 2);
  for (const x of [58.1, 60, 61.9]) assert.equal(insideCuts(rounded, { x, y: 10 }), 0);
  for (const x of [57.9, 62.1]) assert.equal(insideCuts(rounded, { x, y: 10 }), 1);
  assert.equal(insideCuts(squareEnds, { x: 57.9, y: 10.9 }), 1);
  assert.equal(insideCuts(rounded, { x: 57.9, y: 10.9 }), 0);
  assert.equal(insideCuts(rounded, { x: 10.1, y: 10.9 }), 1);
  assert.equal(insideCuts(rounded, { x: 109.9, y: 10.9 }), 1);
  assert.match(exportSvg(rounded, 120, 20), /Z/);
});

test('rounded caps support seams, very short cuts and width regions', () => {
  for (const contour of [square, measureContour([{ x: 0, y: 0 }, { x: 0.4, y: 0 }], false)]) {
    const result = generateStencil([contour], { ...options, tabOffset: 50, roundedTabs: true });
    assert.ok(result.paths.length > 0);
    assert.ok(result.paths.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    for (const bridge of result.bridges) assert.equal(insideCuts(result, bridge.point), 0);
  }
  const line = measureContour([{ x: 10, y: 10 }, { x: 110, y: 10 }], false);
  const rounded = generateStencil([line], { ...options, tabCount: 1, roundedTabs: true, regions: [{ id: 'region-test', contourId: null, width: 4, taperLength: 5, points: [{ x: 55, y: 5 }, { x: 65, y: 5 }, { x: 65, y: 15 }, { x: 55, y: 15 }] }] });
  assert.equal(rounded.paths.length, 2);
  assert.equal(insideCuts(rounded, { x: 57.9, y: 10 }), 1);
  assert.equal(insideCuts(rounded, { x: 57.9, y: 11.9 }), 0);
  assert.equal(insideCuts(rounded, { x: 60, y: 10 }), 0);
});
