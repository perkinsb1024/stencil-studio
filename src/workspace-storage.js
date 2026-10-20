import { validPolygon } from './regions.js';

export const workspaceKey = 'stencil-studio.workspace.v1';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isContour = value => typeof value === 'string' && /^outline-\d+$/.test(value);
const isContourList = value => Array.isArray(value) && value.length <= 500 && value.every(isContour) && new Set(value).size === value.length;
const isTab = value => typeof value === 'string' && /^(auto-\d+|tab-[a-zA-Z0-9-]+)$/.test(value);
const isRegion = value => typeof value === 'string' && /^region-[a-zA-Z0-9-]+$/.test(value);
const validRegions = value => Array.isArray(value) && value.length <= 100 && new Set(value.map(r => r?.id)).size === value.length && value.every(r =>
  isObject(r) && isRegion(r.id) && (r.contourId === null || isContour(r.contourId)) && Number.isFinite(r.width) && r.width >= 0.2 && r.width <= 12 && (r.taperLength === undefined || Number.isFinite(r.taperLength) && r.taperLength >= 0.1 && r.taperLength <= 50) && validPolygon(r.points));
const ranges = { artworkWidth: [10, 1000], channelWidth: [0.2, 12], tabWidth: [0.5, 15], tabCount: [1, 24], tabOffset: [0, 100], margin: [0, 100] };
function validSnapshot(value) {
  return isObject(value) && (value.source === undefined || typeof value.source === 'string' && value.source.length <= 3_000_000 && typeof value.name === 'string' && (value.example === undefined || typeof value.example === 'string')) && (value.regions === undefined || validRegions(value.regions)) && ['hiddenContours', 'cutawayContours'].every(key => value[key] === undefined || isContourList(value[key])) && isObject(value.settings) && Object.entries(ranges).every(([key, [min, max]]) =>
    Number.isFinite(value.settings[key]) && value.settings[key] >= min && value.settings[key] <= max) &&
    (value.settings.roundedTabs === undefined || typeof value.settings.roundedTabs === 'boolean') &&
    (value.settings.roundedChannelCorners === undefined || typeof value.settings.roundedChannelCorners === 'boolean') &&
    Number.isInteger(value.settings.tabCount) && isObject(value.tabLayouts) && Object.entries(value.tabLayouts).every(([id, tabs]) =>
      isContour(id) && Array.isArray(tabs) && tabs.every(tab => isObject(tab) && isTab(tab.id) && Number.isFinite(tab.position) &&
        tab.position >= 0 && tab.position <= 1 && (tab.widthOverride === null || Number.isFinite(tab.widthOverride) && tab.widthOverride >= 0.5 && tab.widthOverride <= 15)));
}
export function readWorkspace(storage, key = workspaceKey) {
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!isObject(saved) || saved.version !== 1 || typeof saved.source !== 'string' || saved.source.length > 3_000_000 ||
      typeof saved.name !== 'string' || !validSnapshot(saved.document) || !isObject(saved.ui)) return null;
    const ui = saved.ui;
    if (['panX', 'panY'].some(key => ui[key] !== undefined && (!Number.isFinite(ui[key]) || Math.abs(ui[key]) > 1_000_000))) return null;
    // These optional fields preserve compatibility with workspaces and history
    // saved before outline visibility was editable.
    if (['editingOutlines', 'showHiddenOutlines', 'editingRegions', 'drawingRegion'].some(key => ui[key] !== undefined && typeof ui[key] !== 'boolean') ||
      ui.selectedOutlines !== undefined && !isContourList(ui.selectedOutlines) || ['editing', 'editingOutlines', 'editingRegions'].filter(key => ui[key]).length > 1) return null;
    if (ui.selectedRegion !== undefined && ui.selectedRegion !== null && !isRegion(ui.selectedRegion) ||
      ui.regionScope !== undefined && ui.regionScope !== 'all' && !isContour(ui.regionScope) ||
      ui.regionTaperLength !== undefined && (!Number.isFinite(ui.regionTaperLength) || ui.regionTaperLength < 0.1 || ui.regionTaperLength > 50) ||
      ui.regionWidth !== undefined && (!Number.isFinite(ui.regionWidth) || ui.regionWidth < 0.2 || ui.regionWidth > 12) ||
      ui.regionDraft !== undefined && (!Array.isArray(ui.regionDraft) || ui.regionDraft.length > 200 || !ui.regionDraft.every(p => isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1000 && Math.abs(p.y) <= 1000))) return null;
    if (!['material', 'cut'].includes(ui.view) || !Number.isFinite(ui.zoom) || ui.zoom < 0.25 || ui.zoom > 3 ||
      !['showTabs', 'showOriginal', 'editing', 'adding', 'selectCurrentOutlineOnly'].every(key => typeof ui[key] === 'boolean') ||
      !(ui.selectedContour === null || isContour(ui.selectedContour)) || !(ui.selectedTab === null || isTab(ui.selectedTab)) ||
      !Array.isArray(ui.selectedTabs) || !ui.selectedTabs.every(ref => isObject(ref) && isContour(ref.contourId) && isTab(ref.id))) return null;
    if (!isObject(saved.history) || !['past', 'future'].every(key => Array.isArray(saved.history[key]) && saved.history[key].length <= 100 && saved.history[key].every(validSnapshot))) return null;
    return saved;
  } catch { return null; }
}
export function writeWorkspace(storage, saved, key = workspaceKey) {
  // Keep the document even if the browser cannot fit a long undo history.
  let past = saved.history.past, future = saved.history.future;
  for (;;) {
    try {
      storage.setItem(key, JSON.stringify({ ...saved, history: { past, future } }));
      return { saved: true, historyTruncated: past.length !== saved.history.past.length || future.length !== saved.history.future.length };
    } catch {
      if (!past.length && !future.length) return { saved: false, historyTruncated: false };
      past = past.slice(Math.ceil(past.length / 2));
      future = future.slice(Math.ceil(future.length / 2));
    }
  }
}
