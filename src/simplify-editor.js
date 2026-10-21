import { createBusyTask } from './busy-task.js';
import { nodeCount, vertices, simplifiedSvg } from './simplify-svg.js';
import { pathData } from './geometry.js';
import { createPreviewPan } from './preview-pan.js';

export function createSimplifyEditor({ state, commit, apply, download }) {
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="simplify-dialog" class="simplify-dialog" aria-labelledby="simplify-title" aria-describedby="simplify-description">
      <button id="close-simplify" class="icon-button dialog-close" aria-label="Close simplification">✕</button>
      <h2 id="simplify-title">Simplify SVG</h2>
      <p id="simplify-description">Smooth tiny details and separate fragile connections before making your stencil.</p>
      <div class="simplify-layout">
        <div class="simplify-preview-column">
          <div class="simplify-preview-options">
            <label class="check-label"><input type="checkbox" id="simplify-original" checked><span>Show Original SVG</span></label>
            <label class="check-label"><input type="checkbox" id="simplify-nodes"><span>Show Nodes</span></label>
            <div class="simplify-zoom"><button id="simplify-zoom-out" class="small-button" aria-label="Zoom simplification out">−</button><output id="simplify-zoom-label">100%</output><button id="simplify-zoom-in" class="small-button" aria-label="Zoom simplification in">+</button><button id="simplify-fit" class="small-button">Fit</button></div>
          </div>
          <div class="simplify-preview-frame">
            <div id="simplify-stage" class="simplify-stage" tabindex="0" aria-label="Simplification preview. Zoom in and drag or scroll to inspect details.">
              <div id="simplify-sheet" class="simplify-sheet"><svg id="simplify-svg" role="img" aria-label="Simplified artwork preview"></svg></div>
            </div>
            <div id="simplify-busy" class="simplify-busy" hidden><div class="preview-busy-card"><span class="busy-spinner" aria-hidden="true"></span><p role="status" aria-live="polite">Updating preview…</p><button id="cancel-simplify-preview" class="small-button">Cancel</button></div></div>
          </div>
          <div class="simplify-statistics" id="simplify-statistics" role="status" aria-live="polite"></div>
          <p class="control-hint">Zoom in and drag to pan; Fit recenters. Purple is the result. The dashed blue line is the original. Nodes include sampled curves.</p>
        </div>
        <div class="simplify-controls">
          <p class="simplify-scale" id="simplify-scale"></p>
          ${[
            ['smooth', 'Smooth Small Details', 5, 0.05, 'Radius that rounds corners and removes small notches and protrusions. May close tiny holes.'],
            ['breakWidth', 'Break Narrow Connections', 10, 0.05, 'Separate necks narrower than this width. Thin slivers and small islands may disappear.'],
            ['tolerance', 'Reduce Nodes', 2, 0.01, 'Maximum outline deviation for node reduction. Higher values make a simpler, more angular outline.'],
          ].map(([key, label, max, step, hint]) => `<div class="control"><div class="control-label"><label for="simplify-${key}">${label}</label><div class="number-unit"><input type="number" id="simplify-${key}" min="0" max="${max}" step="${step}" value="0" aria-describedby="simplify-${key}-hint"><span>mm</span></div></div><input type="range" id="simplify-${key}-range" aria-label="${label} slider" aria-describedby="simplify-${key}-hint" min="0" max="${max}" step="${step}" value="0"><p class="control-hint" id="simplify-${key}-hint">${hint}</p></div>`).join('')}
          <button id="simplify-reset" class="small-button">Reset Adjustments</button>
          <p class="simplify-scope">Uses all artwork, including hidden layers. Nested closed layers become holes; overlapping layers may change. Open paths only use node reduction.</p>
          <p class="simplify-replace-note">Download SVG saves the simplified artwork at the current artwork size. Apply replaces the SVG and resets layer, tab, bridge, and width-region edits. Stencil settings stay in place. Undo restores the previous artwork and edits.</p>
        </div>
      </div>
      <div class="simplify-footer"><p id="simplify-status" role="status" aria-live="polite"></p><div><button id="cancel-simplify" class="small-button">Cancel</button><button id="download-simplify" class="small-button" disabled>Download Simplified SVG</button><button id="apply-simplify" class="download-button" disabled>Apply Simplification</button></div></div>
    </dialog>`);
  const $ = selector => document.querySelector(selector), dialog = $('#simplify-dialog');
  const keys = ['smooth', 'breakWidth', 'tolerance'];
  let original, result, zoom = 1, completedPreview;
  let options = {};
  const busy = createBusyTask({
    root: dialog, overlay: $('#simplify-busy'), stage: $('#simplify-stage'),
    onCancel() {
      restorePreview();
      $('#simplify-status').textContent = 'Calculation cancelled. Previous preview restored.';
    },
    onError(message) { restorePreview(); $('#simplify-status').textContent = message; },
  });
  function restorePreview() {
    options = { ...completedPreview.options }; result = completedPreview.result;
    paintInputs(); draw(); updateResultButtons();
  }
  function updateResultButtons() {
    const available = result?.contours.length && keys.some(key => options[key] > 0);
    $('#apply-simplify').disabled = !available;
    $('#download-simplify').disabled = !available;
  }
  const pan = createPreviewPan({
    viewport: $('#simplify-stage'), enabled: () => zoom > 1, active: () => dialog.open,
    getPosition: () => ({ x: -$('#simplify-stage').scrollLeft, y: -$('#simplify-stage').scrollTop }),
    setPosition: ({ x, y }) => { $('#simplify-stage').scrollLeft = -x; $('#simplify-stage').scrollTop = -y; },
  });
  function paintInputs() {
    for (const key of keys) {
      $(`#simplify-${key}`).value = options[key];
      const range = $(`#simplify-${key}-range`);
      range.value = options[key];
      range.style.setProperty('--range', `${options[key] / Number(range.max) * 100}%`);
    }
  }
  function draw() {
    if (!original) return;
    const svg = $('#simplify-svg'), b = original.bounds;
    const width = b.maxX - b.minX, height = b.maxY - b.minY, pad = Math.max(width, height) * 0.04;
    svg.setAttribute('viewBox', `${b.minX - pad} ${b.minY - pad} ${width + pad * 2} ${height + pad * 2}`);
    const paths = (art, closed) => art.contours.filter(c => c.closed === closed).map(c => pathData(c.points, c.closed)).join('');
    const art = result ?? original;
    svg.innerHTML = `<path class="simplify-result" d="${paths(art, true)}" fill="#502c6c" fill-rule="evenodd"/><path d="${paths(art, false)}" fill="none" stroke="#502c6c" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    if ($('#simplify-original').checked) svg.innerHTML += `<g fill="none" stroke="#608ac1" stroke-dasharray="4 3" stroke-width="1" opacity="0.8">${original.contours.map(c => `<path d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
    if ($('#simplify-nodes').checked) {
      const matrix = svg.getScreenCTM();
      const radius = matrix?.a ? 2.2 / Math.hypot(matrix.a, matrix.b) : width / (Math.max($('#simplify-stage').clientWidth, 200) * zoom) * 2.2;
      svg.innerHTML += `<g class="simplify-node-markers" fill="#fff" stroke="#9c427e" stroke-width="1">${art.contours.flatMap(c => vertices(c).map(p => `<circle cx="${p.x}" cy="${p.y}" r="${radius}" vector-effect="non-scaling-stroke"/>`)).join('')}</g>`;
    }
    const before = nodeCount(original.contours), after = nodeCount(art.contours);
    const percent = before ? Math.round((1 - after / before) * 100) : 0;
    $('#simplify-statistics').innerHTML = `<span>Nodes <strong>${before.toLocaleString()} → ${after.toLocaleString()}</strong><small>${Math.abs(percent)}% ${percent >= 0 ? 'fewer' : 'more'}</small></span><span>Contours <strong>${original.contours.length} → ${art.contours.length}</strong></span>`;
  }
  function requestPreview() {
    result = null; updateResultButtons();
    if (!keys.some(key => options[key] > 0)) {
      result = structuredClone(original); draw();
      completedPreview = { options: { ...options }, result };
      $('#simplify-status').textContent = 'Adjust a slider to preview changes.';
      return;
    }
    $('#simplify-status').textContent = 'Updating preview…';
    busy.run('simplify', { artwork: original, options: { ...options, width: state.artworkWidth } }, 'Updating preview…', artwork => {
      result = artwork; draw(); updateResultButtons();
      completedPreview = { options: { ...options }, result };
      $('#simplify-status').textContent = result.contours.length ? 'Preview ready. Zoom in to inspect small details.' : 'These settings remove all artwork. Lower the adjustments to keep some shapes.';
    });
  }
  for (const key of keys) {
    for (const suffix of ['', '-range']) {
      const field = $(`#simplify-${key}${suffix}`);
      field.addEventListener(suffix ? 'input' : 'change', () => {
        const value = field.value === '' ? options[key] : Number(field.value);
        if (!Number.isFinite(value)) return paintInputs();
        options[key] = Math.min(Number(field.max), Math.max(0, value));
        paintInputs(); requestPreview();
      });
    }
  }
  function setZoom(value) {
    zoom = Math.max(1, Math.min(8, value));
    const sheet = $('#simplify-sheet');
    sheet.style.width = `${zoom * 100}%`; sheet.style.height = `${zoom * 100}%`;
    $('#simplify-zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    $('#simplify-zoom-out').disabled = zoom <= 1; $('#simplify-zoom-in').disabled = zoom >= 8;
    pan.refresh();
    draw();
  }
  $('#simplify-zoom-in').addEventListener('click', () => setZoom(zoom * 1.5));
  $('#simplify-zoom-out').addEventListener('click', () => setZoom(zoom / 1.5));
  $('#simplify-fit').addEventListener('click', () => { setZoom(1); $('#simplify-stage').scrollTo(0, 0); });
  for (const key of ['original', 'nodes']) $(`#simplify-${key}`).addEventListener('change', draw);
  $('#simplify-reset').addEventListener('click', () => { options = { smooth: 0, breakWidth: 0, tolerance: 0 }; paintInputs(); requestPreview(); });
  for (const id of ['close-simplify', 'cancel-simplify']) $(`#${id}`).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { pan.reset(); result = original = completedPreview = null; });
  // Keep editor shortcuts from acting on the underlying artwork while modal.
  dialog.addEventListener('keydown', event => { event.stopPropagation(); });
  $('#apply-simplify').addEventListener('click', () => {
    if (!result?.contours.length || $('#apply-simplify').disabled) return;
    try { apply(simplifiedSvg(result)); dialog.close(); }
    catch (error) { $('#simplify-status').textContent = error.message; }
  });
  $('#download-simplify').addEventListener('click', () => {
    if (!result?.contours.length || $('#download-simplify').disabled) return;
    try {
      const name = state.name.replace(/(?:-simplified)?\.svg$/i, '') + '-simplified.svg';
      download(simplifiedSvg(result, state.artworkWidth), 'image/svg+xml', name);
      $('#simplify-status').textContent = 'Simplified SVG downloaded. You can keep adjusting this preview or close it.';
    } catch (error) { $('#simplify-status').textContent = error.message; }
  });
  return {
    open() {
      commit(); original = structuredClone(state.artwork); result = null;
      options = { smooth: 0, breakWidth: 0, tolerance: 0 };
      $('#simplify-scale').textContent = `Adjustments at ${state.artworkWidth} mm artwork width.`;
      $('#simplify-original').checked = true; $('#simplify-nodes').checked = false;
      paintInputs(); dialog.showModal(); setZoom(1); requestPreview();
    },
  };
}
