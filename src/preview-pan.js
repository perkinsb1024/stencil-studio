// Share pointer ownership between view navigation and the SVG editing tools.
export function createPreviewPan({ viewport, enabled, active = () => true, defaultDrag = () => true, getPosition, setPosition, button, changed = () => {} }) {
  let gesture = null, space = false, spaceUsed = false, mode = false, suppressClickUntil = 0;
  const available = () => active() && enabled();
  const ready = () => available() && (space || mode || defaultDrag());
  function refresh() {
    viewport.classList.toggle('pan-ready', ready());
    viewport.classList.toggle('is-panning', !!gesture);
    if (button) {
      button.disabled = !enabled();
      button.setAttribute('aria-pressed', mode && enabled() ? 'true' : 'false');
    }
  }
  function stop(event, cancel = false) {
    if (!gesture || event && event.pointerId !== gesture.id) return;
    const previous = gesture; gesture = null;
    if (cancel) setPosition(previous.position);
    if (viewport.hasPointerCapture(previous.id)) viewport.releasePointerCapture(previous.id);
    suppressClickUntil = performance.now() + 500;
    refresh(); changed();
    event?.preventDefault(); event?.stopImmediatePropagation();
  }
  viewport.addEventListener('pointerdown', event => {
    if (gesture || event.isPrimary === false || !available() || !(event.button === 1 || event.button === 0 && ready())) return;
    suppressClickUntil = 0;
    if (space) spaceUsed = true;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, position: getPosition() };
    if (event.isTrusted) viewport.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation(); refresh();
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    setPosition({ x: gesture.position.x + event.clientX - gesture.x, y: gesture.position.y + event.clientY - gesture.y });
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  viewport.addEventListener('pointerup', event => stop(event), true);
  viewport.addEventListener('pointercancel', event => stop(event, true), true);
  viewport.addEventListener('lostpointercapture', event => stop(event), true);
  for (const type of ['click', 'auxclick']) viewport.addEventListener(type, event => {
    if (event.detail && (ready() || performance.now() < suppressClickUntil)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const typing = target => target.closest('input, textarea, select, [contenteditable="true"]');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) {
      stop(null, true); event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.code !== 'Space' || !available() || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!space) spaceUsed = false;
    space = true;
    // A focused button still supports a normal Space press. If a drag starts,
    // suppress its keyup activation instead, so Space-drag cannot click it.
    if (!event.target.closest('button, [role="button"]')) event.preventDefault();
    refresh();
  }, true);
  document.addEventListener('keyup', event => {
    if (event.code !== 'Space' || !space) return;
    space = false;
    if (spaceUsed || !event.target.closest('button, [role="button"]')) event.preventDefault();
    spaceUsed = false; refresh();
  }, true);
  function reset() { stop(null); space = spaceUsed = false; mode = false; suppressClickUntil = 0; refresh(); }
  window.addEventListener('blur', () => { stop(null); space = spaceUsed = false; refresh(); });
  button?.addEventListener('click', () => { mode = !mode; refresh(); });
  return { refresh, reset };
}
