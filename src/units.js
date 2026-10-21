export const unitScale = state => state.units === 'in' ? 25.4 : 1;
export const toMillimeters = (value, state) => Number(value) * unitScale(state);
export const displayLength = (value, state) => Number((value / unitScale(state)).toFixed(state.units === 'in' ? 4 : 2));
export const formatLength = (value, state) => `${displayLength(value, state)} ${state.units === 'in' ? 'in' : 'mm'}`;

export function setLengthValue(input, value, state) {
  input.value = value === '' ? '' : input.type === 'range' ? value / unitScale(state) : displayLength(value, state);
}

// Preserve physical limits when switching the presentation units.
export function configureLengthControls(state) {
  const ids = ['artworkWidth', 'artworkHeight', 'channelWidth', 'tabWidth', 'selected-tab-width', 'region-width', 'region-taper-length', 'bridge-width', 'minimum-material-width', 'selected-bridge-width'];
  for (const id of ids) {
    for (const input of [document.getElementById(id), document.getElementById(`${id}-range`)].filter(Boolean)) {
      for (const attr of ['min', 'max', 'step']) {
        const key = `mm${attr}`;
        if (!(key in input.dataset)) input.dataset[key] = input.getAttribute(attr) ?? '';
        const original = input.dataset[key];
        if (original !== '' && original !== 'any') input.setAttribute(attr, Number(original) / unitScale(state));
      }
      const label = input.closest('.number-unit')?.querySelector('span');
      if (label) label.textContent = state.units === 'in' ? 'in' : 'mm';
    }
  }
  for (const [id, label] of [['region-width', 'Region Width'], ['region-taper-length', 'Taper Length']]) {
    document.querySelector(`label[for="${id}"]`).textContent = `${label} (${state.units === 'in' ? 'in' : 'mm'})`;
  }
}

export function gridMarkup(width, height, spacing) {
  return `<g id="preview-grid" pointer-events="none" aria-hidden="true"><defs><pattern id="preview-grid-pattern" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><path d="M ${spacing} 0 H 0 V ${spacing}" fill="none" stroke="#80718c" stroke-opacity="0.4" stroke-width="0.7" vector-effect="non-scaling-stroke"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#preview-grid-pattern)"/></g>`;
}
