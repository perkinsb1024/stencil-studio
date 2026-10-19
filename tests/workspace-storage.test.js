import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkspace, writeWorkspace, workspaceKey } from '../src/workspace-storage.js';
const document = { settings: { artworkWidth: 150, channelWidth: 12, tabWidth: 3, tabCount: 4, tabOffset: 0, margin: 8 }, tabLayouts: { 'outline-0': [{ id: 'auto-0', position: 0.25, widthOverride: null }] } };
const workspace = {
  version: 1, source: '<svg/>', name: 'Saved.svg', document,
  ui: { view: 'cut', zoom: 1.25, showTabs: true, showOriginal: true, editing: true, adding: false, selectCurrentOutlineOnly: false, selectedContour: 'outline-0', selectedTab: 'auto-0', selectedTabs: [{ contourId: 'outline-0', id: 'auto-0' }] },
  history: { past: [document, document, document], future: [document] },
};
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('workspace round trip preserves source, selection, endpoint settings and undo/redo', () => {
  const store = storage();
  assert.deepEqual(writeWorkspace(store, workspace), { saved: true, historyTruncated: false });
  assert.deepEqual(readWorkspace(store), workspace);
});
test('outline visibility, edit mode and mixed old/new history survive storage', () => {
  const store = storage();
  const hidden = { ...document, hiddenContours: ['outline-0'] };
  const saved = { ...workspace, document: hidden, ui: { ...workspace.ui, editing: false, adding: false, editingOutlines: true, showHiddenOutlines: false, selectedOutlines: ['outline-0'] }, history: { past: [document, hidden], future: [hidden] } };
  writeWorkspace(store, saved);
  assert.deepEqual(readWorkspace(store), saved);
});
test('invalid visibility lists and conflicting editing modes are rejected', () => {
  const store = storage();
  for (const hiddenContours of [null, 'outline-0', ['bad-id'], ['outline-0', 'outline-0'], [12]]) {
    store.setItem(workspaceKey, JSON.stringify({ ...workspace, document: { ...document, hiddenContours } }));
    assert.equal(readWorkspace(store), null);
  }
  for (const ui of [{ editingOutlines: true }, { selectedOutlines: null }, { selectedOutlines: ['unknown'] }, { showHiddenOutlines: 'true' }]) {
    store.setItem(workspaceKey, JSON.stringify({ ...workspace, ui: { ...workspace.ui, ...ui } }));
    assert.equal(readWorkspace(store), null);
  }
  store.setItem(workspaceKey, JSON.stringify({ ...workspace, history: { past: [{ ...document, hiddenContours: null }], future: [] } }));
  assert.equal(readWorkspace(store), null);
});
test('corrupt or incompatible workspace data is ignored', () => {
  const store = storage();
  for (const invalid of ['{', 'null', JSON.stringify({ ...workspace, version: 2 }), JSON.stringify({ ...workspace, document: { ...document, settings: { ...document.settings, artworkWidth: -1 } } }), JSON.stringify({ ...workspace, ui: { ...workspace.ui, selectedTabs: null } })]) {
    store.setItem(workspaceKey, invalid);
    assert.equal(readWorkspace(store), null);
  }
});
test('full storage retains the document and recent history where possible', () => {
  const store = storage(), original = store.setItem;
  store.setItem = (key, value) => { if (JSON.parse(value).history.past.length > 1) throw new Error('QuotaExceededError'); original(key, value); };
  assert.deepEqual(writeWorkspace(store, workspace), { saved: true, historyTruncated: true });
  assert.deepEqual(readWorkspace(store).document, workspace.document);
  assert.equal(readWorkspace(store).history.past.length, 1);
  assert.equal(workspace.history.past.length, 3);
});
test('blocked browser storage fails without breaking the editor', () => {
  const store = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.equal(readWorkspace(store), null);
  assert.equal(writeWorkspace(store, workspace).saved, false);
});

test('cut-away choices survive storage and mixed old/new undo history', () => {
  const store = storage();
  const cutaway = { ...document, cutawayContours: ['outline-0'] };
  const saved = { ...workspace, document: cutaway, history: { past: [document], future: [cutaway] } };
  writeWorkspace(store, saved);
  assert.deepEqual(readWorkspace(store), saved);
  for (const cutawayContours of [null, 'outline-0', ['bad-id'], ['outline-0', 'outline-0'], [12]]) {
    store.setItem(workspaceKey, JSON.stringify({ ...saved, document: { ...document, cutawayContours } }));
    assert.equal(readWorkspace(store), null);
    store.setItem(workspaceKey, JSON.stringify({ ...saved, history: { past: [{ ...document, cutawayContours }], future: [] } }));
    assert.equal(readWorkspace(store), null);
  }
});

const widthRegion = { id: 'region-saved', width: 0.8, taperLength: 9, contourId: 'outline-0', points: [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0, y: 0.3 }] };
test('regions, layer scopes, pending polygons and mixed-version history survive storage', () => {
  const store = storage();
  const regional = { ...document, regions: [widthRegion] };
  const saved = { ...workspace, document: regional, ui: { ...workspace.ui, editing: false, editingRegions: true, selectedRegion: null, drawingRegion: true, regionDraft: widthRegion.points.slice(0, 2), regionWidth: 0.6, regionTaperLength: 12, regionScope: 'all' }, history: { past: [document, regional], future: [regional] } };
  writeWorkspace(store, saved);
  assert.deepEqual(readWorkspace(store), saved);
});
test('invalid region geometry, widths, scopes and UI are rejected in documents and history', () => {
  const store = storage();
  for (const region of [{ ...widthRegion, taperLength: 0 }, { ...widthRegion, taperLength: 51 }, { ...widthRegion, taperLength: null }, { ...widthRegion, width: 0 }, { ...widthRegion, width: 13 }, { ...widthRegion, contourId: 'oops' }, { ...widthRegion, id: '<script>' }, { ...widthRegion, points: [] }, { ...widthRegion, points: [widthRegion.points[0], widthRegion.points[2], widthRegion.points[1], widthRegion.points[3]] }]) {
    for (const change of [{ document: { ...document, regions: [region] } }, { history: { past: [{ ...document, regions: [region] }], future: [] } }]) {
      store.setItem(workspaceKey, JSON.stringify({ ...workspace, ...change }));
      assert.equal(readWorkspace(store), null);
    }
  }
  for (const change of [{ editingRegions: true }, { regionWidth: 100 }, { regionTaperLength: -1 }, { regionTaperLength: 51 }, { regionScope: 'oops' }, { selectedRegion: 'oops' }, { regionDraft: [null] }, { drawingRegion: 'yes' }]) {
    store.setItem(workspaceKey, JSON.stringify({ ...workspace, ui: { ...workspace.ui, ...change } }));
    assert.equal(readWorkspace(store), null);
  }
});

test('regions saved before adjustable tapers still load alongside new regions and history', () => {
  const store = storage(), { taperLength, ...legacyRegion } = widthRegion;
  const saved = { ...workspace, document: { ...document, regions: [legacyRegion] }, history: { past: [{ ...document, regions: [widthRegion] }], future: [] } };
  writeWorkspace(store, saved);
  assert.deepEqual(readWorkspace(store), saved);
});

test('rounded tab setting survives storage and validates mixed old/new history', () => {
  const store = storage();
  const rounded = { ...document, settings: { ...document.settings, roundedTabs: true } };
  const saved = { ...workspace, document: rounded, history: { past: [document], future: [rounded] } };
  writeWorkspace(store, saved);
  assert.deepEqual(readWorkspace(store), saved);
  for (const roundedTabs of ['true', 1, null]) {
    store.setItem(workspaceKey, JSON.stringify({ ...saved, document: { ...document, settings: { ...document.settings, roundedTabs } } }));
    assert.equal(readWorkspace(store), null);
  }
});
