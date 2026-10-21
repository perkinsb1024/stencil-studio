import test from 'node:test';
import assert from 'node:assert/strict';

// A preview must not start polygon operations on the UI thread, including for
// curved bridges and regional tapers. Any use of Clipper fails these checks.
globalThis.ClipperLib = new Proxy({}, { get() { throw new Error('Polygon calculation during live preview'); } });
const { measureContour } = await import('../src/geometry.js');
const { livePreviewMarkup } = await import('../src/live-preview.js');

function fixture() {
  const contour = { ...measureContour([{ x: 8, y: 8 }, { x: 108, y: 8 }, { x: 108, y: 108 }, { x: 8, y: 108 }], true), id: 'outline-0', regionId: 'shape-0' };
  return {
    scaled: { contours: [contour], width: 116, height: 116, padding: 8 },
    artworkWidth: 100, channelWidth: 2, tabWidth: 4, tabCount: 4, tabOffset: 0,
    tabLayouts: {}, regions: [], hiddenContours: [], cutawayContours: [],
    materialTreatments: {}, materialOrder: [], regionBridges: [], selectedRegionBridges: [],
    result: { paths: [[{ x: 99, y: 99 }]] }, view: 'material',
  };
}

test('live widths and tab positions change without touching the final geometry or document', () => {
  const state = fixture(), before = structuredClone(state);
  const initial = livePreviewMarkup(state, 0.5);
  assert.deepEqual(state, before);
  const changed = livePreviewMarkup({ ...state, channelWidth: 5, tabWidth: 9, tabOffset: 50 }, 0.5);
  assert.notEqual(changed.markup, initial.markup);
  assert.equal(changed.tabs[0].width, 9);
  assert.equal(changed.tabs[0].channelWidth, 5);
  assert.notDeepEqual(changed.tabs[0].point, initial.tabs[0].point);
  assert.deepEqual(state, before);
});

test('regional width and taper previews sample the current region without polygon offsets', () => {
  const state = fixture();
  state.regions = [{ id: 'region-0', contourId: 'outline-0', points: [{ x: 0.3, y: -0.1 }, { x: 0.7, y: -0.1 }, { x: 0.7, y: 0.2 }, { x: 0.3, y: 0.2 }], width: 6, taperLength: 5 }];
  const before = structuredClone(state), initial = livePreviewMarkup(state, 0.5);
  const changed = livePreviewMarkup({ ...state, regions: [{ ...state.regions[0], width: 1, taperLength: 12 }] }, 0.5);
  assert.equal(initial.tabs[0].channelWidth, 6);
  assert.equal(changed.tabs[0].channelWidth, 1);
  assert.notEqual(initial.markup, changed.markup);
  assert.doesNotMatch(changed.markup, /NaN|Infinity/);
  assert.deepEqual(state, before);
});

test('straight and curved selected bridges resize visually without changing saved widths', () => {
  const state = fixture();
  state.regionBridges = [
    { id: 'straight', a: { x: 0.1, y: 0.1 }, b: { x: 0.8, y: 0.1 }, width: 2 },
    { id: 'curved', a: { x: 0.1, y: 0.3 }, b: { x: 0.8, y: 0.3 }, control: { x: 0.5, y: 0.7 }, width: 3 },
  ];
  state.selectedRegionBridges = ['straight', 'curved'];
  const before = structuredClone(state), initial = livePreviewMarkup(state, 0.5);
  const changed = livePreviewMarkup(state, 0.5, { selectedBridgeWidth: 8 });
  assert.notEqual(changed.markup, initial.markup);
  assert.match(changed.markup, /data-live-bridge="straight"[^>]*stroke-width="8"/);
  assert.match(changed.markup, /data-live-bridge="curved"[^>]*Q[^>]*stroke-width="8"/);
  assert.deepEqual(state, before);
});
