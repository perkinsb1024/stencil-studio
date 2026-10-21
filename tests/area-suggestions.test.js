import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { suggestAreas, applyAreaSuggestions } = await import('../src/area-suggestions.js');
const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const paint = (color = '#000000', rgb = [0, 0, 0]) => ({ type: 'solid', color, rgb, alpha: 1 });
const white = paint('#ffffff', [1, 1, 1]);
function artwork(shapes) {
  const contours = [], sourceRegions = [];
  shapes.forEach((s, i) => {
    const members = (s.rings ?? [s.points ?? rect(10, 10, 80, 80)]).map(points => {
      const c = { id: `outline-${contours.length}`, regionId: `shape-${i}`, closed: s.closed ?? true, points, fillRule: s.fillRule ?? 'nonzero' };
      contours.push(c); return c;
    });
    sourceRegions.push({ id: `shape-${i}`, contourIds: members.map(c => c.id), drawingOrder: i, fillRule: 'nonzero', opacity: 1, fill: paint(), ...s });
  });
  return { contours, sourceRegions, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
}
const settings = { artworkWidth: 100, margin: 8, channelWidth: 1.5, minimumMaterialWidth: 0.5 };
const suggest = shapes => suggestAreas(artwork(shapes), settings).byRegion;

test('an isolated opaque filled region is automatically cut; open/stroked paths stay outlines', () => {
  const s = suggest([{ points: rect(10, 10, 30, 30) }, { points: rect(60, 10, 30, 30), fill: null, stroke: paint(), strokeWidth: 2 }, { points: [{ x: 20, y: 80 }, { x: 80, y: 80 }], closed: false }]);
  assert.equal(s['shape-0'].mode, 'cut'); assert.equal(s['shape-0'].confidence, 'high');
  assert.equal(s['shape-1'].mode, 'outline'); assert.equal(s['shape-2'].mode, 'outline');
  assert.equal(s['shape-0'].area, 900);
});

test('white alone, transparency, gradients, nested same-color shapes and overlapping colors are conservative', () => {
  for (const shapes of [[{ fill: white }], [{ opacity: 0.5 }], [{ fill: { type: 'gradient' } }], [{}, { points: rect(30, 30, 20, 20) }], [{}, { points: rect(50, 20, 45, 40), fill: paint('#ff0000', [1, 0, 0]) }]]) {
    for (const s of Object.values(suggest(shapes))) assert.equal(s.mode, 'outline');
  }
});

test('only exact redundant filled boundaries are automatically hidden; intervening detail prevents hiding', () => {
  const s = suggest([{}, { points: [...rect(10, 10, 80, 80)].reverse() }]);
  assert.equal(s['shape-0'].mode, 'hidden'); assert.equal(s['shape-0'].confidence, 'high');
  assert.equal(s['shape-1'].mode, 'cut');
  const nested = suggest([{}, { points: rect(30, 30, 20, 20) }, {}]);
  assert.ok(Object.values(nested).every(s => s.mode !== 'hidden' || s.confidence !== 'high'));
  assert.equal(nested['shape-1'].visibleArea, 0);
  assert.equal(nested['shape-1'].confidence, 'medium');
});

test('white overlays become Keep automatically, with detached islands reported separately', () => {
  const connected = suggest([{}, { points: rect(30, 0, 10, 100), fill: white }]);
  assert.equal(connected['shape-0'].mode, 'cut'); assert.equal(connected['shape-0'].confidence, 'high');
  assert.equal(connected['shape-1'].mode, 'keep'); assert.equal(connected['shape-1'].confidence, 'high');
  const art = artwork([{}, { points: rect(30, 30, 20, 20), fill: white }]);
  const s = suggestAreas(art, settings);
  assert.equal(s.byRegion['shape-1'].mode, 'keep');
  assert.equal(s.byRegion['shape-0'].confidence, 'high');
  assert.match(s.warnings.join(' '), /unsupported/);
  const target = {};
  applyAreaSuggestions(target, art, s);
  assert.equal(target.materialTreatments['shape-0'], 'cut'); assert.equal(target.materialTreatments['shape-1'], 'keep');
  const bridged = suggestAreas(art, { ...settings, regionBridges: [{ id: 'bridge-test', a: { x: 48, y: 48 }, b: { x: 48, y: 13 }, width: 3, automatic: false }] });
  assert.equal(bridged.byRegion['shape-0'].confidence, 'high');
});

test('compound holes use their fill rule and require support, while nonzero overlaps remain a single cut', () => {
  const rings = [rect(10, 10, 80, 80), rect(30, 30, 20, 20)];
  const even = suggest([{ rings, fillRule: 'evenodd' }])['shape-0'];
  assert.equal(even.mode, 'cut'); assert.equal(even.area, 6000); assert.equal(even.confidence, 'high');
  const nonzero = suggest([{ rings }])['shape-0'];
  assert.equal(nonzero.area, 6400); assert.equal(nonzero.confidence, 'high');
});

test('physical size affects narrow feature review without automatically hiding small details', () => {
  const art = artwork([{ points: rect(10, 10, 0.4, 50) }]);
  const small = suggestAreas(art, settings).byRegion['shape-0'];
  assert.equal(small.mode, 'cut'); assert.equal(small.confidence, 'medium');
  const large = suggestAreas(art, { ...settings, artworkWidth: 1000 }).byRegion['shape-0'];
  assert.equal(large.confidence, 'high');
});

test('reapplication protects manual visibility, treatment, custom tabs, order and bridges', () => {
  const art = artwork([{}, {}]); const s = suggestAreas(art, settings);
  const target = { materialTreatments: { 'shape-0': 'keep' }, areaOverrides: { 'shape-0': true }, hiddenContours: ['outline-0'], cutawayContours: ['outline-0'], tabLayouts: { 'outline-0': [] }, materialOrder: ['shape-1', 'shape-0'], regionBridges: [{ id: 'custom' }] };
  const before = structuredClone(target);
  applyAreaSuggestions(target, art, s);
  assert.equal(target.materialTreatments['shape-0'], 'keep'); assert.ok(target.hiddenContours.includes('outline-0')); assert.deepEqual(target.cutawayContours, before.cutawayContours);
  for (const key of ['tabLayouts', 'materialOrder', 'regionBridges']) assert.deepEqual(target[key], before[key]);
});

test('reapplication flags erased Keep after reordering and preserves manual Outline details', () => {
  const art = artwork([{}, { points: rect(30, 0, 10, 100), fill: white }]);
  const reordered = suggestAreas(art, { ...settings, materialOrder: ['shape-1', 'shape-0'] });
  assert.equal(reordered.byRegion['shape-0'].confidence, 'high');
  const target = {}; applyAreaSuggestions(target, art, reordered);
  assert.equal(target.materialTreatments['shape-0'], 'cut');
  assert.equal(target.materialTreatments['shape-1'], 'keep');
  assert.match(reordered.warnings.join(' '), /erase retained details/);
  const manual = suggestAreas(art, { ...settings, materialTreatments: { 'shape-1': 'outline' }, areaOverrides: { 'shape-1': true } });
  assert.equal(manual.byRegion['shape-0'].mode, 'outline');
});

test('narrow material types apply automatically, while ambiguous types and uncertain hiding stay Outline', () => {
  const art = artwork([{ points: rect(1, 10, 0.4, 50) }, { opacity: 0.5 }, { points: rect(30, 30, 20, 20) }, {}]);
  const suggestions = suggestAreas(art, settings), target = {};
  applyAreaSuggestions(target, art, suggestions);
  assert.equal(target.materialTreatments['shape-0'], 'cut');
  assert.equal(target.materialTreatments['shape-1'], 'outline');
  assert.equal(suggestions.byRegion['shape-2'].mode, 'hidden');
  assert.equal(suggestions.byRegion['shape-2'].confidence, 'medium');
  assert.equal(target.materialTreatments['shape-2'], 'outline');
  assert.ok(!target.hiddenContours.includes('outline-2'));
});
