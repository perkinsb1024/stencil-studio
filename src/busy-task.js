// Geometry runs in a disposable worker so Cancel can interrupt polygon operations.
export function createBusyTask({ root, overlay, stage, onCancel, onError }) {
  const cancel = overlay.querySelector('button');
  const label = overlay.querySelector('[role="status"]');
  const progress = document.createElement('progress');
  progress.className = 'busy-progress';
  progress.max = 1;
  label.after(progress);
  let job = null, controls = [], focus, focusSelector, showTimer;
  const disabledObserver = new MutationObserver(records => {
    for (const { target } of records) {
      if (job && target !== cancel && 'disabled' in target && !target.disabled) target.disabled = true;
    }
  });
  function restoreFocus() {
    const target = focus?.isConnected ? focus : focusSelector && document.querySelector(focusSelector);
    if (target && !target.disabled && target.getClientRects().length) target.focus({ preventScroll: true });
  }
  function unlock() {
    clearTimeout(showTimer);
    showTimer = null;
    disabledObserver.disconnect();
    overlay.hidden = true;
    stage.setAttribute('aria-busy', 'false');
    root.classList.remove('is-busy');
    for (const [control, disabled] of controls) control.disabled = disabled;
    controls = [];
    restoreFocus();
  }
  function stop() {
    if (!job) return;
    job.worker.terminate(); job = null;
    unlock(); onCancel();
  }
  cancel.addEventListener('click', stop);
  // Also block links, SVG handles, dragging, drops, and application shortcuts.
  for (const type of ['click', 'dblclick', 'auxclick', 'pointerdown', 'pointermove', 'pointerup', 'input', 'change', 'keydown', 'keyup', 'wheel', 'drop', 'dragover', 'dragstart', 'focusin']) {
    document.addEventListener(type, event => {
      if (!job) return;
      if (type === 'focusin') {
        if (!overlay.hidden && !cancel.contains(event.target)) cancel.focus({ preventScroll: true });
        return;
      }
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); stop(); return;
      }
      if (type === 'keydown' && event.key === 'Tab') {
        event.preventDefault();
        if (!overlay.hidden) cancel.focus({ preventScroll: true });
        return;
      }
      if (cancel.contains(event.target) && !['wheel', 'drop', 'dragover'].includes(type)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
  return {
    get active() { return Boolean(job); },
    run(task, payload, message, complete) {
      if (job) return;
      focus = document.activeElement;
      const attributes = ['data-tab', 'data-outline', 'data-material-bridge', 'data-bridge-end', 'data-visibility-outline'];
      focusSelector = focus?.id ? `#${CSS.escape(focus.id)}` : attributes.filter(name => focus?.hasAttribute(name))
        .map(name => `[${name}="${CSS.escape(focus.getAttribute(name))}"]`).join('');
      root.classList.add('is-busy'); stage.setAttribute('aria-busy', 'true');
      progress.removeAttribute('value');
      progress.setAttribute('aria-label', message);
      label.textContent = message;
      try {
        const worker = new Worker(new URL('./geometry-worker.js', import.meta.url), { type: 'module' });
        job = { worker };
        showTimer = setTimeout(() => {
          if (job?.worker !== worker) return;
          controls = [...document.querySelectorAll('button,input,select,textarea,fieldset')]
            .filter(control => control !== cancel).map(control => [control, control.disabled]);
          for (const [control] of controls) control.disabled = true;
          disabledObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
          overlay.hidden = false;
          cancel.focus({ preventScroll: true });
        }, 300);
        const finish = (error, result) => {
          if (job?.worker !== worker) return;
          worker.terminate(); job = null; unlock();
          if (error) onError(error); else complete(result);
          if (!job && document.activeElement === document.body) restoreFocus();
        };
        worker.onmessage = ({ data }) => {
          if (job?.worker !== worker) return;
          if (data.type === 'progress') {
            progress.value = Math.max(progress.value, Math.min(1, Math.max(0, data.value)));
            return;
          }
          finish(data.error, data.result);
        };
        worker.onerror = () => finish('The geometry calculation could not finish. Please try again.');
        worker.onmessageerror = () => finish('The geometry result could not be read. Please try again.');
        worker.postMessage({ task, ...payload });
      } catch (error) {
        job?.worker.terminate(); job = null; unlock(); onError(error.message);
      }
    },
  };
}
