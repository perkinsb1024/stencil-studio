import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { moveBefore, moveByAction } from '../src/ordered-list.js';

const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { decideLayerType, pendingTypeReviews, previewLayerType } = await import('../src/type-review.js');
const { applyAreaSuggestions } = await import('../src/area-suggestions.js');
const { generateStencil, measureContour } = await import('../src/geometry.js');
const { channelWidthAt } = await import('../src/regions.js');
const square = (id, regionId, min, max) => ({ id, regionId, fillRule: 'nonzero', ...measureContour([{ x: min, y: min }, { x: max, y: min }, { x: max, y: max }, { x: min, y: max }], true) });
function fixture() {
  const contours = [square('outline-0', 'shape-0', 10, 90), square('outline-1', 'shape-1', 30, 70)];
  return { artwork: { contours, sourceRegions: contours.map(c => ({ id: c.regionId, contourIds: [c.id] })) }, materialTreatments: {}, materialOrder: ['shape-0', 'shape-1'], areaOverrides: {}, areaDecisions: {}, hiddenContours: [], cutawayContours: [], tabLayouts: {}, areaSuggestions: { byRegion: { 'shape-0': { mode: 'cut', confidence: 'low' }, 'shape-1': { mode: 'keep', confidence: 'low' } } } };
}
const options = { channelWidth: 1, tabWidth: 3, tabCount: 4, tabOffset: 0, materialVersion: 1, sheet: { width: 100, height: 100 }, analyzeMaterial: true };
const cutsAt = (result, point) => result.paths.reduce((inside, path) => inside ^ (ClipperLib.Clipper.PointInPolygon({ X: Math.round(point.x * 10000), Y: Math.round(point.y * 10000) }, path.map(p => ({ X: Math.round(p.x * 10000), Y: Math.round(p.y * 10000) }))) !== 0), 0);

test('review-only connectivity analysis leaves Outline cut paths unchanged', () => {
  const state = fixture();
  const before = generateStencil(state.artwork.contours, { ...options, ...state, analyzeMaterial: false });
  const reviewed = generateStencil(state.artwork.contours, { ...options, ...state, analyzeMaterial: true });
  assert.deepEqual(reviewed.paths, before.paths);
  assert.ok(reviewed.components.length);
});

test('top-first reorder changes actual Keep/Cut Away composition and preserves source identities', () => {
  const state = fixture();
  state.materialTreatments = { 'shape-0': 'cut', 'shape-1': 'keep' };
  const before = generateStencil(state.artwork.contours, { ...options, ...state });
  assert.equal(cutsAt(before, { x: 50, y: 50 }), 0);
  const displayed = [...state.materialOrder].reverse();
  state.materialOrder = moveBefore(displayed, 'shape-0', 'shape-1').reverse();
  const after = generateStencil(state.artwork.contours, { ...options, ...state });
  assert.equal(cutsAt(after, { x: 50, y: 50 }), 1);
  assert.deepEqual(state.artwork.contours.map(c => c.id), ['outline-0', 'outline-1']);
  assert.deepEqual(state.materialTreatments, { 'shape-0': 'cut', 'shape-1': 'keep' });
});

test('region reorder applies the displayed top region last in the width model', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const regions = [{ id: 'region-a', width: 0.5, points, contourId: null }, { id: 'region-b', width: 3, points, contourId: null }];
  assert.equal(channelWidthAt({ x: 20, y: 20 }, 'outline-0', { channelWidth: 1, regions }), 3);
  const displayed = regions.map(r => r.id).reverse();
  const reordered = moveByAction(displayed, 'region-a', 'top').reverse().map(id => regions.find(r => r.id === id));
  assert.equal(channelWidthAt({ x: 20, y: 20 }, 'outline-0', { channelWidth: 1, regions: reordered }), 0.5);
  assert.equal(reordered[0], regions[1]);
});

test('no-op/invalid reorder and boundary moves keep the original order without mutating it', () => {
  const ids = ['a', 'b', 'c'];
  for (const next of [moveBefore(ids, 'a', 'a'), moveBefore(ids, 'missing', 'a'), moveBefore(ids, 'b', 'missing'), moveByAction(ids, 'a', 'up'), moveByAction(ids, 'c', 'down')]) assert.deepEqual(next, ids);
  assert.deepEqual(moveBefore(ids, 'a'), ['b', 'c', 'a']);
  assert.deepEqual(moveByAction(ids, 'a', 'down'), ['b', 'a', 'c']);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('keeping the fallback Outline resolves uncertainty and protects it from reapplication', () => {
  const state = fixture();
  const before = generateStencil(state.artwork.contours, { ...options, ...state });
  assert.equal(decideLayerType(state, 'shape-0', 'kept'), true);
  assert.deepEqual(pendingTypeReviews(state), ['shape-1']);
  assert.equal(state.areaDecisions['shape-0'], 'kept');
  const after = generateStencil(state.artwork.contours, { ...options, ...state });
  assert.deepEqual(after.paths, before.paths);
  applyAreaSuggestions(state, state.artwork, { byRegion: { 'shape-0': { mode: 'cut', confidence: 'high' } } });
  assert.equal(state.materialTreatments['shape-0'], 'outline');
});

test('accepting a proposal changes the actual cuts and supports restoring the prior unresolved document', () => {
  const state = fixture(), before = structuredClone(state);
  assert.equal(cutsAt(generateStencil(state.artwork.contours, { ...options, ...state }), { x: 20, y: 20 }), 0);
  decideLayerType(state, 'shape-0', 'accepted');
  assert.equal(cutsAt(generateStencil(state.artwork.contours, { ...options, ...state }), { x: 20, y: 20 }), 1);
  assert.equal(state.areaDecisions['shape-0'], 'accepted');
  Object.assign(state, before);
  assert.deepEqual(pendingTypeReviews(state), ['shape-0', 'shape-1']);
  assert.equal(cutsAt(generateStencil(state.artwork.contours, { ...options, ...state }), { x: 20, y: 20 }), 0);
});

test('Hidden acceptance keeps the underlying treatment and saved tabs, while Keep Visible unhides it', () => {
  const state = fixture();
  state.materialTreatments['shape-0'] = 'keep';
  state.tabLayouts['outline-0'] = [{ id: 'tab-kept', position: 0.4, widthOverride: 2 }];
  state.areaSuggestions.byRegion['shape-0'].mode = 'hidden';
  decideLayerType(state, 'shape-0', 'accepted');
  assert.deepEqual(state.hiddenContours, ['outline-0']);
  assert.equal(state.materialTreatments['shape-0'], 'keep');
  assert.equal(state.tabLayouts['outline-0'][0].widthOverride, 2);
  decideLayerType(state, 'shape-0', 'kept');
  assert.deepEqual(state.hiddenContours, []);
  assert.equal(state.materialTreatments['shape-0'], 'keep');
});

test('compound decisions apply to the parent and reject invalid open-path types', () => {
  const state = fixture();
  state.artwork.contours[1].regionId = 'shape-0';
  decideLayerType(state, 'shape-0', 'accepted');
  assert.deepEqual(state.selectedOutlines, ['outline-0', 'outline-1']);
  state.artwork.contours[1].closed = false;
  const before = structuredClone(state);
  assert.equal(decideLayerType(state, 'shape-0', 'manual', 'keep'), false);
  assert.deepEqual(state, before);
});

test('confirming an explicit visible type reveals a hidden object and preserves its tabs', () => {
  const state = fixture();
  state.hiddenContours = ['outline-0'];
  state.tabLayouts['outline-0'] = [{ id: 'saved-tab', position: 0.4 }];
  assert.equal(decideLayerType(state, 'shape-0', 'manual', 'outline'), true);
  assert.deepEqual(state.hiddenContours, []);
  assert.equal(state.materialTreatments['shape-0'], 'outline');
  assert.equal(state.tabLayouts['outline-0'][0].id, 'saved-tab');
});

test('type previews use the confirmed geometry rules while leaving the document and queue unchanged', () => {
  const state = fixture(), before = structuredClone(state);
  for (const mode of ['outline', 'keep', 'cut', 'hidden']) {
    const preview = previewLayerType(state, 'shape-0', mode);
    const confirmed = structuredClone(state);
    decideLayerType(confirmed, 'shape-0', 'manual', mode);
    assert.deepEqual(generateStencil(state.artwork.contours, { ...options, ...preview }).paths, generateStencil(state.artwork.contours, { ...options, ...confirmed }).paths);
    assert.deepEqual(state, before);
    assert.deepEqual(pendingTypeReviews(state), ['shape-0', 'shape-1']);
  }
});
