// Display order is always top-first. Callers translate to their stored order.
export function moveBefore(ids, moving, before = null) {
  if (!ids.includes(moving) || moving === before || before !== null && !ids.includes(before)) return [...ids];
  const result = ids.filter(id => id !== moving);
  result.splice(before === null ? result.length : result.indexOf(before), 0, moving);
  return result;
}

export function moveByAction(ids, moving, action) {
  const index = ids.indexOf(moving);
  if (index < 0) return [...ids];
  const destination = { up: index - 1, down: index + 1, top: 0, bottom: ids.length - 1 }[action];
  if (!Number.isInteger(destination) || destination < 0 || destination >= ids.length) return [...ids];
  const result = ids.filter(id => id !== moving);
  result.splice(destination, 0, moving);
  return result;
}

export function orderControls(id, label, index, total, disabled = false) {
  // IDs/labels supplied by callers are escaped before reaching this template.
  return `<button class="drag-handle" id="drag-${id}" data-reorder-handle aria-label="Reorder ${label}" title="Drag to reorder" ${disabled ? 'disabled' : ''}><span aria-hidden="true">⠿</span></button><div class="row-menu"><button class="row-menu-trigger" aria-label="Order ${label}" title="Ordering Actions" popovertarget="order-${id}">⋮</button><div class="row-menu-actions" id="order-${id}" popover aria-label="Order ${label}">${[['up', 'Move Up'], ['down', 'Move Down'], ['top', 'Move to Top'], ['bottom', 'Move to Bottom']].map(([action, text]) => `<button data-order-action="${action}" ${disabled || (['up', 'top'].includes(action) ? index === 0 : index === total - 1) ? 'disabled' : ''}>${text}</button>`).join('')}</div></div>`;
}

export function createOrderedList({ element, getIds, commit, announce, disabled = () => false }) {
  let gesture = null, frame = null, ghost = null;
  element.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open' || !event.target.matches('.row-menu-actions')) return;
    const rect = event.target.previousElementSibling.getBoundingClientRect();
    event.target.style.left = `${Math.max(8, Math.min(innerWidth - 160, rect.right - 148))}px`;
    event.target.style.top = `${Math.max(8, Math.min(innerHeight - 190, rect.bottom + 4))}px`;
  }, true);
  function clear() {
    cancelAnimationFrame(frame); frame = null;
    element.querySelectorAll('.drop-before,.drop-after,.is-dragging').forEach(row => row.classList.remove('drop-before', 'drop-after', 'is-dragging'));
    ghost?.remove(); ghost = null;
  }
  function finish(cancelled = false) {
    if (!gesture) return;
    const finished = gesture; gesture = null;
    clear();
    if (finished.handle.hasPointerCapture(finished.pointerId)) finished.handle.releasePointerCapture(finished.pointerId);
    if (!cancelled && finished.moved && finished.valid) apply(moveBefore(getIds(), finished.id, finished.before), finished.id, finished.label);
  }
  function apply(ids, id, label) {
    if (ids.join('|') === getIds().join('|')) return;
    const scroll = element.scrollTop;
    commit(ids);
    element.scrollTop = scroll;
    element.querySelector(`[data-order-id="${id}"] .drag-handle`)?.focus({ preventScroll: true });
    announce(`${label} moved to position ${ids.indexOf(id) + 1} of ${ids.length}.`);
  }
  function paint() {
    if (!gesture?.moved) return;
    element.querySelectorAll('.drop-before,.drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after'));
    const bounds = element.getBoundingClientRect(), { x, y } = gesture;
    const inspector = element.closest('.inspector-body');
    const parentBounds = inspector?.getBoundingClientRect() ?? bounds;
    const top = Math.max(bounds.top, parentBounds.top), bottom = Math.min(bounds.bottom, parentBounds.bottom);
    gesture.valid = x >= bounds.left && x <= bounds.right && y >= top - 8 && y <= bottom + 8;
    if (gesture.valid) {
      const rows = [...element.querySelectorAll(':scope > [data-order-id]')].filter(row => row.dataset.orderId !== gesture.id);
      const next = rows.find(row => y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
      gesture.before = next?.dataset.orderId ?? null;
      (next ?? rows.at(-1))?.classList.add(next ? 'drop-before' : 'drop-after');
      const edge = 36;
      const delta = y < top + edge ? -8 : y > bottom - edge ? 8 : 0;
      if (delta) {
        const previous = element.scrollTop;
        element.scrollTop += delta;
        if (element.scrollTop === previous && inspector) inspector.scrollTop += delta;
      }
    }
    if (ghost) { ghost.style.left = `${Math.min(x + 12, innerWidth - 160)}px`; ghost.style.top = `${y + 12}px`; }
    frame = requestAnimationFrame(paint);
  }
  element.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-reorder-handle]'), row = handle?.closest('[data-order-id]');
    if (!row || event.button !== 0 || disabled() || handle.disabled) return;
    event.preventDefault();
    gesture = { id: row.dataset.orderId, label: row.dataset.orderLabel, handle, row, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, before: null, valid: false, moved: false };
    handle.focus({ preventScroll: true });
    try { handle.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer checks do not have an active device. */ }
  });
  element.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (!gesture.moved && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 5) {
      gesture.moved = true; gesture.row.classList.add('is-dragging');
      ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = gesture.label; ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost);
      paint();
    }
  });
  element.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) { gesture.x = event.clientX; gesture.y = event.clientY; if (gesture.moved) { cancelAnimationFrame(frame); paint(); } finish(); } });
  for (const type of ['pointercancel', 'lostpointercapture']) element.addEventListener(type, event => { if (gesture?.pointerId === event.pointerId) finish(true); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); finish(true); } }, true);
  element.addEventListener('click', event => {
    const button = event.target.closest('[data-order-action]'), row = button?.closest('[data-order-id]');
    if (!row || disabled() || button.disabled) return;
    event.stopPropagation();
    const menu = button.closest('[popover]');
    if (menu?.matches(':popover-open')) menu.hidePopover();
    apply(moveByAction(getIds(), row.dataset.orderId, button.dataset.orderAction), row.dataset.orderId, row.dataset.orderLabel);
  });
  return { cancel: () => finish(true) };
}
