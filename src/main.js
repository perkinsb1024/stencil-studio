import { importSvg, scaleArtwork, examples } from './import-svg.js';
import { generateStencil, pathData, exportSvg } from './geometry.js';

const icons = {
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  leaf: '<path d="M5 19C-1 6 10 2 21 3c1 11-4 20-16 16Zm0 0L16 8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const defaults = { artworkWidth: 150, channelWidth: 1.5, tabWidth: 3, tabCount: 4, tabOffset: 0, margin: 8 };
const state = { ...defaults, artwork: null, name: 'Bloom.svg', view: 'material', showTabs: true, showOriginal: false, zoom: 1, sourceWarnings: [], result: null, scaled: null };
const $ = s => document.querySelector(s);

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Stencil Studio home"><span>stencil<span class="brand-light">studio</span><span class="brand-dot">.</span></span></a>
    <div class="header-right"><button class="text-button" id="help">${icon('help')} How it works</button></div>
  </header>
  <main>
    <section class="intro"><h1>Make the cut<span>.</span></h1></section>
    <div class="workspace">
      <aside class="inspector" aria-label="Stencil settings">
        <section class="control-section source-section"><div class="section-heading"><span class="step">01</span><h2>Your artwork</h2><span class="format-tag">SVG</span></div>
          <input type="file" id="file-input" accept=".svg,image/svg+xml" hidden />
          <button class="upload-zone" id="upload">${icon('upload')}<strong>Drop your SVG here</strong><span>or click to browse · up to 3 MB</span></button>
          <div class="current-file">${icon('file')}<div><strong id="filename">Bloom.svg</strong><span id="source-info">2 vector contours</span></div><span class="file-check">${icon('check')}</span></div>
          <div class="examples"><span>Try a sample</span><button data-example="bloom" class="active" title="Bloom example">Bloom</button><button data-example="orbit" title="Orbit example">Orbit</button><button data-example="arch" title="Arch example">Arch</button></div>
        </section>
        <section class="control-section"><div class="section-heading"><span class="step">02</span><h2>Shape your stencil</h2><button class="icon-button reset" id="reset" title="Reset settings" aria-label="Reset settings">${icon('reset')}</button></div>
          <div class="control"><div class="control-label"><label for="artworkWidth">Artwork width</label><div class="number-unit"><input id="artworkWidth" type="number" min="10" max="1000" step="1" value="150" /><span>mm</span></div></div><p class="control-hint">Height scales with your artwork.</p></div>
          <div class="control"><div class="control-label"><label for="channelWidth">Channel width</label><div class="number-unit"><input id="channelWidth" type="number" min="0.2" max="12" step="0.1" value="1.5" /><span>mm</span></div></div><input type="range" id="channelWidth-range" aria-label="Channel width slider" min="0.2" max="12" step="0.1" value="1.5" /><div class="range-labels"><span>Fine</span><span>Bold</span></div></div>
          <div class="tab-divider"><span>RETAINING TABS</span><span class="tiny-bridge"><i></i><i></i></span></div>
          <div class="control"><div class="control-label"><label for="tabWidth">Tab width</label><div class="number-unit"><input id="tabWidth" type="number" min="0.5" max="15" step="0.1" value="3" /><span>mm</span></div></div><input type="range" id="tabWidth-range" aria-label="Tab width slider" min="0.5" max="15" step="0.1" value="3" /></div>
          <div class="control"><div class="control-label"><label for="tabCount">Tabs per contour</label><div class="stepper"><button id="tabs-minus" aria-label="Fewer tabs">${icon('minus')}</button><input type="number" id="tabCount" min="1" max="24" step="1" value="4" /><button id="tabs-plus" aria-label="More tabs">${icon('plus')}</button></div></div></div>
          <div class="control position-control"><div class="control-label"><label for="tabOffset">Tab position</label><output id="offset-value">0%</output></div><input type="range" id="tabOffset" min="0" max="100" step="1" value="0" aria-label="Tab position" /><p class="control-hint">Slide tabs around closed outlines.</p></div>
        </section>
        <section class="control-section output-section"><div class="section-heading"><span class="step">03</span><h2>Ready for your cutter</h2></div><button id="download" class="download-button">${icon('download')}<span>Download stencil</span><span class="download-type">.svg</span></button><p class="export-note">Closed vector paths · actual-size export</p></section>
        <div class="privacy-note">Your files stay on your device.</div>
      </aside>
      <section class="preview-panel" aria-label="Stencil preview">
        <div class="preview-toolbar"><div class="preview-heading"><span class="live-dot"></span><h2>Live preview</h2></div><div class="view-switch" role="group" aria-label="Preview mode"><button id="material-view" class="active" aria-pressed="true">Stencil</button><button id="cut-view" aria-pressed="false">Cut paths</button></div></div>
        <div class="preview-options"><label class="check-label"><input type="checkbox" id="show-tabs" checked /><span>Highlight tabs</span><span class="swatch amber"></span></label><label class="check-label"><input type="checkbox" id="show-original" /><span>Original outline</span></label><span class="preview-units">UNITS: MM</span></div>
        <div class="canvas-area" id="canvas-area">
          <div class="canvas-viewport" id="canvas-viewport">
            <div class="canvas-corner top-left"></div><div class="canvas-corner bottom-right"></div>
            <div class="sheet-wrap" id="sheet-wrap"><svg id="preview-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated stencil with cut channels and retaining tabs"></svg><div class="dimension-width" id="dimension-width">150 mm</div><div class="dimension-height" id="dimension-height">150 mm</div></div>
          </div>
          <div class="canvas-bottom-bar">
            <div class="canvas-label"><span class="status-dot"></span> LIVE VECTOR PREVIEW</div>
            <div class="zoom-controls"><button id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><span class="zoom-divider"></span><button id="zoom-fit" title="Fit to view" aria-label="Fit to view">${icon('fit')}</button></div>
          </div>
        </div>
        <div class="preview-footer"><div class="legend"><span><i class="legend-cut"></i> Cut away</span><span><i class="legend-material"></i> Keep material</span><span><i class="legend-tab"></i> Retaining tab</span></div><span id="cut-count">8 cut regions</span></div>
      </section>
    </div>
  </main>
  <div id="notice" class="notice" role="status" hidden></div>
  <dialog id="help-dialog"><button id="close-help" class="icon-button dialog-close" aria-label="Close help">${icon('close')}</button><div class="eyebrow">A QUICK FIELD GUIDE</div><h2>A cut above.</h2><p>Make a reusable outline stencil in three steps.</p><ol><li><strong>Bring your vectors.</strong><span>Upload an SVG with paths or shapes. Convert text, masks, and clipping to plain paths in your drawing app first.</span></li><li><strong>Make room for the cut.</strong><span>Channel width sets the strip of material to remove along each outline. Tabs leave small uncut bridges that hold the inner pieces in place.</span></li><li><strong>Send it to your cutter.</strong><span>Download the SVG, import it into your cutter’s software, and cut the edges of the black shapes. Match the imported size to the SVG dimensions.</span></li></ol><div class="help-tip"><strong>Before the big cut</strong><p>Black areas come out; light areas stay. Yellow is only a preview of your tabs. Inspect small details and overlapping outlines, and test-cut a sample for your material. The sheet boundary is not exported as a cut.</p></div><button id="got-it" class="download-button">Got it ${icon('check')}</button></dialog>
`;

let noticeTimer;
function notify(message, kind = 'success') {
  const el = $('#notice');
  clearTimeout(noticeTimer); el.textContent = message; el.className = `notice ${kind}`; el.hidden = false;
  if (kind !== 'warning') noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function render() {
  if (!state.artwork) return;
  state.scaled = scaleArtwork(state.artwork, state.artworkWidth, Math.max(state.margin, state.channelWidth / 2 + 2));
  state.result = generateStencil(state.scaled.contours, state);
  const { width, height, contours, artworkHeight } = state.scaled;
  const svg = $('#preview-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.aspectRatio = `${width} / ${height}`;
  const cuts = state.result.paths.map(p => pathData(p)).join('');
  svg.innerHTML = `<rect width="${width}" height="${height}" fill="#fffef9"/><path class="cut-shape" d="${cuts}" fill="${state.view === 'material' ? '#502c6c' : 'none'}" stroke="${state.view === 'cut' ? '#502c6c' : 'none'}" stroke-width="0.14" fill-rule="evenodd"/>`;
  if (state.showOriginal) svg.innerHTML += `<g fill="none" stroke="#6f8bca" stroke-width="0.18" stroke-dasharray="1 0.7">${contours.map(c => `<path d="${pathData(c.points, c.closed)}"/>`).join('')}</g>`;
  if (state.showTabs) svg.innerHTML += `<g class="tab-markers" fill="none" stroke="#d9a752" stroke-width="${state.channelWidth + 0.65}" stroke-linecap="butt" opacity="0.62">${state.result.bridges.map(b => `<path d="M${b.before.x} ${b.before.y}L${b.after.x} ${b.after.y}"/>`).join('')}</g>`;
  $('#dimension-width').textContent = `${width.toFixed(1)} mm`;
  $('#dimension-height').textContent = `${height.toFixed(1)} mm`;
  $('#cut-count').textContent = `${state.result.paths.length} cut regions · ${state.result.bridges.length} tabs`;
  $('#source-info').textContent = `${state.artwork.contours.length} contours · ${state.artworkWidth} × ${artworkHeight.toFixed(1)} mm`;
  $('#offset-value').textContent = `${state.tabOffset}%`;
  fitSheet();
  const warnings = [...state.sourceWarnings, ...state.result.warnings];
  $('#download').disabled = state.result.paths.length === 0;
  if (warnings.length) notify(warnings.join(' '), 'warning');
  else if ($('#notice').classList.contains('warning')) $('#notice').hidden = true;
}

function fitSheet() {
  if (!state.scaled) return;
  const area = $('#canvas-viewport');
  const ratio = state.scaled.width / state.scaled.height;
  const height = Math.max(100, Math.min(area.clientHeight - 104, (area.clientWidth - 140) / ratio));
  const wrap = $('#sheet-wrap');
  wrap.style.width = `${height * ratio}px`;
  wrap.style.height = `${height}px`;
  wrap.style.transform = `scale(${state.zoom})`;
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
}

function loadSource(source, name, example = '') {
  try {
    const artwork = importSvg(source);
    state.artwork = artwork; state.name = name; state.sourceWarnings = artwork.warnings; state.zoom = 1;
    $('#filename').textContent = name;
    document.querySelectorAll('[data-example]').forEach(b => b.classList.toggle('active', b.dataset.example === example));
    render();
  } catch (error) { notify(error.message, 'error'); }
}

async function readFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') return notify('Please choose an SVG vector file.', 'error');
  if (file.size > 3_000_000) return notify('Please use an SVG smaller than 3 MB.', 'error');
  try { loadSource(await file.text(), file.name); } catch { notify('The file could not be opened. Please try again.', 'error'); }
  $('#file-input').value = '';
}
$('#upload').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', e => readFile(e.target.files[0]));
for (const event of ['dragenter', 'dragover']) $('#upload').addEventListener(event, e => { e.preventDefault(); $('#upload').classList.add('dragging'); });
$('#upload').addEventListener('dragleave', () => $('#upload').classList.remove('dragging'));
$('#upload').addEventListener('drop', e => { e.preventDefault(); $('#upload').classList.remove('dragging'); readFile(e.dataTransfer.files[0]); });
// Prevent dropped files from navigating away from the editor.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => { const example = examples[b.dataset.example]; loadSource(example.svg, example.name, b.dataset.example); }));

let renderFrame;
function scheduleRender() { cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(render); }
function syncControl(key, value) {
  const input = $(`#${key}`);
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  state[key] = Math.max(Number(input.min), Math.min(Number(input.max), number));
  if (key === 'tabCount') state[key] = Math.round(state[key]);
  input.value = state[key];
  if ($(`#${key}-range`)) $(`#${key}-range`).value = state[key];
  updateRangePaint(); scheduleRender();
}
for (const key of ['artworkWidth', 'channelWidth', 'tabWidth', 'tabCount', 'tabOffset']) {
  $(`#${key}`).addEventListener('change', e => syncControl(key, e.target.value));
  const slider = $(`#${key}-range`) || (key === 'tabOffset' ? $(`#${key}`) : null);
  slider?.addEventListener('input', e => syncControl(key, e.target.value));
}
function updateRangePaint() { document.querySelectorAll('input[type="range"]').forEach(el => el.style.setProperty('--range', `${(el.value - el.min) / (el.max - el.min) * 100}%`)); }
$('#tabs-minus').addEventListener('click', () => syncControl('tabCount', state.tabCount - 1));
$('#tabs-plus').addEventListener('click', () => syncControl('tabCount', state.tabCount + 1));
$('#reset').addEventListener('click', () => { for (const key of Object.keys(defaults)) if ($(`#${key}`)) syncControl(key, defaults[key]); notify('Stencil settings reset.'); });
$('#show-tabs').addEventListener('change', e => { state.showTabs = e.target.checked; render(); });
$('#show-original').addEventListener('change', e => { state.showOriginal = e.target.checked; render(); });
for (const mode of ['material', 'cut']) $(`#${mode}-view`).addEventListener('click', () => {
  state.view = mode;
  for (const v of ['material', 'cut']) { $(`#${v}-view`).classList.toggle('active', v === mode); $(`#${v}-view`).setAttribute('aria-pressed', v === mode); }
  render();
});
$('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(3, state.zoom + 0.25); fitSheet(); });
$('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.25, state.zoom - 0.25); fitSheet(); });
$('#zoom-fit').addEventListener('click', () => { state.zoom = 1; fitSheet(); });
$('#download').addEventListener('click', () => {
  if (!state.result?.paths.length) return;
  const data = exportSvg(state.result, state.scaled.width, state.scaled.height, state.name.replace(/\.svg$/i, '') + ' stencil');
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }));
  const link = document.createElement('a'); link.href = url; link.download = state.name.replace(/\.svg$/i, '') + '-stencil.svg'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`Stencil downloaded — ${state.scaled.width.toFixed(1)} × ${state.scaled.height.toFixed(1)} mm.`);
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['close-help', 'got-it']) $(`#${id}`).addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
new ResizeObserver(fitSheet).observe($('#canvas-viewport'));
updateRangePaint();
loadSource(examples.bloom.svg, examples.bloom.name, 'bloom');
