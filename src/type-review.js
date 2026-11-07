import { isAutomaticSuggestion } from './area-suggestions.js';
import { materialMode } from './material-geometry.js';

export function pendingTypeReviews(state) {
  return Object.entries(state.areaSuggestions?.byRegion ?? {}).filter(([id, suggestion]) => !isAutomaticSuggestion(suggestion) && !state.areaOverrides[id]).map(([id]) => id);
}

export function typeReviewIds(state) {
  const ids = new Set(Object.keys(state.areaSuggestions?.byRegion ?? {}));
  return [...new Set([...state.materialOrder, ...state.artwork.contours.map(contour => contour.regionId)])].reverse().filter(id => ids.has(id));
}

// Preview a choice with the same rules as confirmation, without editing the document.
export function previewLayerType(state, id, mode) {
  const preview = { ...state, materialTreatments: { ...state.materialTreatments }, areaOverrides: { ...state.areaOverrides }, areaDecisions: { ...state.areaDecisions } };
  return decideLayerType(preview, id, 'manual', mode) ? preview : state;
}

// Review decisions are document edits, including approving the unchanged type.
export function decideLayerType(state, id, choice, explicitMode = null) {
  const members = state.artwork.contours.filter(contour => contour.regionId === id);
  const suggestion = state.areaSuggestions?.byRegion[id];
  if (!members.length || !suggestion || !['accepted', 'kept', 'manual'].includes(choice)) return false;
  const mode = explicitMode ?? (choice === 'accepted' ? suggestion.mode : materialMode(members[0], state));
  if (!['outline', 'keep', 'cut', 'hidden'].includes(mode) || ['keep', 'cut'].includes(mode) && members.some(contour => !contour.closed)) return false;
  const ids = new Set(members.map(contour => contour.id));
  if (mode === 'hidden') {
    // Visibility is separate: preserve the underlying treatment and custom edits.
    state.hiddenContours = [...new Set([...state.hiddenContours, ...ids])];
  } else {
    state.materialTreatments[id] = mode;
    state.cutawayContours = state.cutawayContours.filter(contourId => !ids.has(contourId));
    if (explicitMode !== null || choice === 'accepted' || choice === 'kept' && suggestion.mode === 'hidden') state.hiddenContours = state.hiddenContours.filter(contourId => !ids.has(contourId));
  }
  state.areaOverrides[id] = true;
  state.areaDecisions ??= {};
  state.areaDecisions[id] = choice;
  state.selectedOutlines = [...ids];
  return true;
}
