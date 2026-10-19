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
