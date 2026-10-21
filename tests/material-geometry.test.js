import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { snapRegionBridge, composeMaterial, generateRegionBridges, pointInMaterial, scaleBridges, unscaleBridge, bridgeKey } = await import('../src/material-geometry.js');
const { generateStencil, measureContour, exportSvg } = await import('../src/geometry.js');
const rectangle = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const shape = (index, points, extras = {}) => ({ ...measureContour(points, true), id: `outline-${index}`, regionId: `shape-${index}`, fillRule: 'nonzero', ...extras });
const outer = shape(0, rectangle(10, 10, 80, 80)), island = shape(1, rectangle(40, 40, 20, 20));
const options = { sheet: { width: 100, height: 100 }, artworkWidth: 80, padding: 10, channelWidth: 2, tabWidth: 3, tabCount: 4, tabOffset: 0, materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep' }, bridgeWidth: 3, minimumMaterialWidth: 0.5 };
const cut = (result, x, y) => pointInMaterial({ x, y }, result.paths);

test('Keep subtracts an island from Cut Away with exact boundaries and diagnoses support', () => {
  const result = generateStencil([outer, island], options);
  assert.equal(cut(result, 20, 20), true);
  assert.equal(cut(result, 50, 50), false);
  assert.equal(cut(result, 9.9, 20), false);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.bridges.length, 0);
  assert.equal(result.components.length, 2);
});

test('layer order supports both cuts inside Keep and Keep inside cuts', () => {
  const hole = shape(2, rectangle(47, 47, 6, 6));
  const settings = { ...options, materialTreatments: { ...options.materialTreatments, 'shape-2': 'cut' } };
  assert.equal(cut(generateStencil([outer, island, hole], settings), 50, 50), true);
  assert.equal(cut(generateStencil([outer, island, hole], { ...settings, materialOrder: ['shape-0', 'shape-2', 'shape-1'] }), 50, 50), false);
});

test('compound fill rules preserve holes and honor nonzero winding', () => {
  const inner = shape(1, rectangle(40, 40, 20, 20), { regionId: 'shape-0', fillRule: 'evenodd' });
  const settings = { ...options, materialTreatments: { 'shape-0': 'cut' } };
  const even = generateStencil([{ ...outer, fillRule: 'evenodd' }, inner], settings);
  assert.equal(cut(even, 50, 50), false);
  const nonzero = generateStencil([outer, { ...inner, fillRule: 'nonzero' }], settings);
  assert.equal(cut(nonzero, 50, 50), true);
  const reversed = generateStencil([outer, { ...inner, points: [...inner.points].reverse(), fillRule: 'nonzero' }], settings);
  assert.equal(cut(reversed, 50, 50), false);
});

test('legacy cut-away contours keep independent interiors under material analysis', () => {
  const legacy = { ...options, materialTreatments: {}, cutawayContours: ['outline-0', 'outline-1'] };
  const before = generateStencil([outer, island], { ...legacy, sheet: undefined });
  const after = generateStencil([outer, island], { ...legacy, analyzeMaterial: true });
  for (const [x, y] of [[5, 5], [20, 20], [50, 50], [95, 95]]) assert.equal(cut(after, x, y), cut(before, x, y));
});

test('a bridge joins the retained island to the sheet and exports only final cut boundaries', () => {
  const bridge = { id: 'bridge-test', a: { x: 50, y: 45 }, b: { x: 50, y: 5 }, width: 3, automatic: false };
  const result = generateStencil([outer, island], { ...options, regionBridges: [bridge] });
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.components.length, 1);
  assert.equal(result.regionBridges[0].valid, true);
  assert.equal(cut(result, 50, 25), false);
  assert.equal(cut(result, 51.6, 25), true);
  assert.equal(cut(result, 48.4, 25), true);
  const svg = exportSvg(result, 100, 100);
  assert.match(svg, /width="100mm"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.doesNotMatch(svg, /bridge-test|data-material|M0 0L100/);
});

test('automatic bridges connect material and regenerate deterministically', () => {
  const first = generateRegionBridges([outer, island], [], options);
  assert.equal(first.length, 1);
  assert.deepEqual(generateRegionBridges([outer, island], [], options), first);
  const result = composeMaterial([outer, island], [], { ...options, regionBridges: first });
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.regionBridges[0].valid, true);
  const custom = { ...first[0], id: 'bridge-custom', automatic: false };
  assert.deepEqual(generateRegionBridges([outer, island], [], { ...options, regionBridges: [custom] }), [custom]);
});

test('automatic exclusions prevent an identical removed connection from returning', () => {
  const first = generateRegionBridges([outer, island], [], options)[0];
  const excluded = bridgeKey(first, options.artworkWidth, options.padding);
  const next = generateRegionBridges([outer, island], [], { ...options, bridgeExclusions: [excluded] });
  assert.ok(next.every(b => bridgeKey(b, options.artworkWidth, options.padding) !== excluded));
});

test('football-style bands already join the sheet; central laces receive a bridge', () => {
  const left = shape(1, rectangle(20, 5, 10, 90)), right = shape(2, rectangle(70, 5, 10, 90));
  const laces = shape(3, rectangle(45, 35, 10, 30));
  const settings = { ...options, materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep', 'shape-3': 'keep' } };
  const shapes = [outer, left, right, laces];
  const before = composeMaterial(shapes, [], settings);
  assert.equal(before.unsupported.length, 1);
  const bridges = generateRegionBridges(shapes, [], settings);
  const after = composeMaterial(shapes, [], { ...settings, regionBridges: bridges });
  assert.equal(bridges.length, 1);
  assert.equal(after.components.length, 1);
});

test('point contact does not count as support, and narrow necks are diagnosed', () => {
  const point = shape(1, [{ x: 10, y: 10 }, { x: 30, y: 20 }, { x: 20, y: 30 }]);
  const touching = composeMaterial([outer, point], [], options);
  assert.equal(touching.unsupported.length, 1);
  const neck = shape(2, rectangle(49.9, 5, 0.2, 40));
  const narrow = composeMaterial([outer, island, neck], [], { ...options, materialTreatments: { ...options.materialTreatments, 'shape-2': 'keep' } });
  assert.equal(narrow.unsupported.length, 0);
  assert.equal(narrow.narrowConnections, true);
});

test('bridges override crossing channels, invalid anchors warn, and hidden regions contribute nothing', () => {
  const line = { ...measureContour([{ x: 20, y: 25 }, { x: 80, y: 25 }], false), id: 'outline-2', regionId: 'shape-2' };
  const bridge = { id: 'bridge-test', a: { x: 50, y: 45 }, b: { x: 50, y: 5 }, width: 3, automatic: false };
  const result = generateStencil([outer, island, line], { ...options, regionBridges: [bridge], tabLayouts: { 'outline-2': [] } });
  assert.equal(cut(result, 50, 25), false);
  assert.equal(result.unsupported.length, 0);
  const invalid = composeMaterial([outer, island], [], { ...options, regionBridges: [{ ...bridge, b: { x: 20, y: 20 } }] });
  assert.equal(invalid.regionBridges[0].valid, false);
  assert.ok(invalid.warnings.some(w => w.includes('invalid anchor')));
  const hidden = composeMaterial([outer, island], [], { ...options, hiddenContours: ['outline-1'] });
  assert.equal(cut(hidden, 50, 50), true);
});

test('bridge end footprints attach even when their centers sit inside the cut', () => {
  for (const control of [undefined, { x: 50, y: 25 }]) {
    const bridge = { id: 'cap-overlap', a: { x: 50, y: 39 }, b: { x: 50, y: 11 }, width: 3, ...(control ? { control } : {}) };
    const result = composeMaterial([outer, island], [], { ...options, regionBridges: [bridge] });
    assert.equal(pointInMaterial(bridge.a, result.baseMaterial), false);
    assert.equal(pointInMaterial(bridge.b, result.baseMaterial), false);
    assert.equal(result.regionBridges[0].valid, true);
    assert.equal(result.unsupported.length, 0);
    assert.ok(!result.warnings.some(w => w.includes('invalid anchor')));
  }
});

test('bridge caps must overlap material with positive area at both ends', () => {
  for (const y of [11.5, 12]) {
    const bridge = { id: 'detached-end', a: { x: 50, y: 39 }, b: { x: 50, y }, width: 3 };
    const result = composeMaterial([outer, island], [], { ...options, regionBridges: [bridge] });
    assert.equal(result.regionBridges[0].valid, false);
    if (y > 11.5) assert.equal(result.unsupported.length, 1);
  }
  const floating = { id: 'floating', a: { x: 20, y: 20 }, b: { x: 20, y: 30 }, width: 3 };
  const noCut = { id: 'no-cut', a: { x: 2, y: 2 }, b: { x: 2, y: 8 }, width: 3 };
  for (const bridge of [floating, noCut]) {
    const result = composeMaterial([outer, island], [], { ...options, regionBridges: [bridge] });
    assert.equal(result.regionBridges[0].valid, false);
  }
});

test('bridge coordinates scale with artwork while physical width remains fixed', () => {
  const bridge = { id: 'bridge-scale', a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: -0.05 }, width: 3, automatic: false };
  const first = scaleBridges([bridge], 100, 8)[0], second = scaleBridges([bridge], 200, 12)[0];
  assert.equal(first.a.x, 58); assert.equal(second.a.x, 112);
  assert.equal(second.width, first.width);
  assert.deepEqual(unscaleBridge(second, 200, 12), bridge);
});
test('reinforcement adds separated support and custom automatic IDs do not collide', () => {
  const generated = generateRegionBridges([outer, island], [], { ...options, bridgeReinforcement: true });
  assert.equal(generated.length, 2);
  assert.equal(composeMaterial([outer, island], [], { ...options, regionBridges: generated }).unsupported.length, 0);
  const other = shape(2, rectangle(65, 65, 10, 10));
  const custom = { ...generated[0], automatic: false };
  const next = generateRegionBridges([outer, island, other], [], { ...options, materialTreatments: { ...options.materialTreatments, 'shape-2': 'keep' }, regionBridges: [custom] });
  assert.equal(new Set(next.map(b => b.id)).size, next.length);
  assert.equal(composeMaterial([outer, island, other], [], { ...options, materialTreatments: { ...options.materialTreatments, 'shape-2': 'keep' }, regionBridges: next }).unsupported.length, 0);
});
test('a severed outer sheet is diagnosed and automatic bridges can join its sections', () => {
  const split = shape(0, rectangle(45, 0, 10, 100));
  const settings = { ...options, materialTreatments: { 'shape-0': 'cut' } };
  const before = composeMaterial([split], [], settings);
  assert.equal(before.components.length, 2);
  assert.ok(before.warnings.some(w => w.includes('outer sheet')));
  const bridges = generateRegionBridges([split], [], settings);
  assert.equal(composeMaterial([split], [], { ...settings, regionBridges: bridges }).components.length, 1);
});
test('feature-aware placement continues the lace spine, aligns flush and matches its width', () => {
  const band = shape(1, rectangle(20, 5, 10, 90));
  const spine = shape(2, rectangle(45, 47, 30, 6));
  const cross = shape(3, rectangle(47, 35, 6, 30), { regionId: 'shape-2' });
  const settings = { ...options, materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep' } };
  const bridges = generateRegionBridges([outer, band, spine, cross], [], settings);
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].a.y, 50);
  assert.equal(bridges[0].b.y, 50);
  assert.equal(bridges[0].width, 6);
});
test('curved bridges retain a continuous fixed-width strip along their centerline', () => {
  const bridge = { id: 'bridge-curve', a: { x: 50, y: 45 }, b: { x: 50, y: 5 }, control: { x: 20, y: 25 }, width: 3, automatic: false };
  const result = composeMaterial([outer, island], [], { ...options, regionBridges: [bridge] });
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.regionBridges[0].valid, true);
  assert.equal(cut(result, 35, 25), false);
  assert.equal(cut(result, 32, 25), true);
  assert.equal(cut(result, 38, 25), true);
  assert.deepEqual(unscaleBridge(scaleBridges([{ ...bridge, a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0 }, control: { x: 0.3, y: 0.2 } }], 100, 8)[0], 100, 8).control, { x: 0.3, y: 0.2 });
});
test('automatic curved continuations follow a retained arc into supported material', () => {
  const arc = (from, to, inner, outer) => {
    const ring = (radius, reverse) => Array.from({ length: 61 }, (_, i) => {
      const t = (reverse ? 60 - i : i) / 60, angle = (from + (to - from) * t) * Math.PI / 180;
      return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
    });
    return [...ring(outer, false), ...ring(inner, true)];
  };
  const curve = shape(1, arc(60, 120, 18, 22)), support = shape(2, rectangle(20, 5, 13, 90));
  const settings = { ...options, materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep' } };
  const bridges = generateRegionBridges([outer, curve, support], [], settings);
  assert.equal(bridges.length, 1);
  assert.ok(bridges[0].control, 'Expected a curved continuation rather than a straight nearest-gap strip');
  assert.equal(composeMaterial([outer, curve, support], [], { ...settings, regionBridges: bridges }).unsupported.length, 0);
  const manual = { ...bridges[0], id: 'manual-curve', automatic: false, width: 2 };
  delete manual.control;
  const snapped = snapRegionBridge([outer, curve, support], [], { ...settings, regionBridges: [manual] }, manual);
  assert.ok(snapped?.control, 'Snapping should restore the feature curvature');
  assert.equal(snapped.automatic, false);
  assert.ok(snapped.width > 3 && snapped.width < 5);
  assert.equal(composeMaterial([outer, curve, support], [], { ...settings, regionBridges: [snapped] }).unsupported.length, 0);
});

test('manual snapping fits the nearby spine even when another bridge already supports it', () => {
  const band = shape(1, rectangle(20, 5, 10, 90));
  const spine = shape(2, rectangle(45, 47, 30, 6));
  const cross = shape(3, rectangle(47, 35, 6, 30), { regionId: 'shape-2' });
  const shapes = [outer, band, spine, cross];
  const other = { id: 'left', a: { x: 46, y: 50 }, b: { x: 28, y: 50 }, width: 6, automatic: true };
  const manual = { id: 'manual', a: { x: 73, y: 49 }, b: { x: 92, y: 53 }, width: 2, automatic: false };
  const settings = { ...options, bridgeMatchFeatures: false, materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep' }, regionBridges: [other, manual] };
  const snapped = snapRegionBridge(shapes, [], settings, manual);
  assert.ok(snapped);
  assert.equal(snapped.id, manual.id);
  assert.equal(snapped.automatic, false);
  assert.equal(snapped.a.y, 50);
  assert.equal(snapped.b.y, 50);
  assert.equal(snapped.width, 6);
  assert.ok(snapped.a.x > 60 && snapped.b.x > 60, 'Must stay on the right side');
  assert.deepEqual(settings.regionBridges, [other, manual]);
  assert.equal(composeMaterial(shapes, [], { ...settings, regionBridges: [other, snapped] }).unsupported.length, 0);
});

test('manual snapping returns no fit when no elongated feature is available', () => {
  const manual = { id: 'manual', a: { x: 50, y: 45 }, b: { x: 50, y: 5 }, width: 3, automatic: false };
  assert.equal(snapRegionBridge([outer, island], [], { ...options, regionBridges: [manual] }, manual), null);
});
