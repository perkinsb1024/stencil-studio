// Keep native selects as the source of values and change events for the editors.
export function installCustomSelects(root, preview) {
  const controls = new WeakMap();
  let opened = null;
  const menu = document.createElement('div');
  menu.id = 'custom-select-options';
  menu.className = 'custom-select-options';
  menu.setAttribute('popover', 'manual');
  menu.setAttribute('role', 'listbox');
  document.body.append(menu);
  let active = -1, options = [], cleanup = null, search = '', searchTime = 0;

  function clearPreview() { cleanup?.(); cleanup = null; }
  function close(restoreFocus = false) {
    if (!opened) return;
    const button = controls.get(opened).button;
    opened = null;
    clearPreview();
    menu.hidePopover();
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    if (restoreFocus) button.focus({ preventScroll: true });
  }
  function position() {
    if (!opened) return;
    const rect = controls.get(opened).button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8, above = rect.top - 8;
    const height = Math.min(320, Math.max(below, above));
    menu.style.width = `${Math.min(Math.max(rect.width, 240), window.innerWidth - 16)}px`;
    menu.style.maxHeight = `${Math.max(40, height)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${below >= Math.min(320, menu.scrollHeight) || below >= above ? rect.bottom + 4 : Math.max(8, rect.top - menu.offsetHeight - 4)}px`;
  }
  function activate(index, scroll = false, showPreview = true) {
    if (index < 0 || index >= options.length || options[index].disabled) return;
    active = index;
    [...menu.children].forEach((row, i) => row.classList.toggle('active', i === index));
    controls.get(opened).button.setAttribute('aria-activedescendant', `custom-option-${index}`);
    if (scroll) menu.children[index].scrollIntoView({ block: 'nearest' });
    clearPreview();
    if (showPreview) cleanup = preview(opened, options[index].value);
  }
  function choose(index) {
    if (!opened || !options[index] || options[index].disabled) return;
    const select = opened, value = options[index].value;
    close(true);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync(select);
  }
  function open(select) {
    if (select.disabled) return;
    close();
    opened = select;
    const { button } = controls.get(select);
    options = [...select.options];
    menu.replaceChildren(...options.map((option, index) => {
      const row = document.createElement('div');
      row.id = `custom-option-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', option.selected);
      row.setAttribute('aria-disabled', option.disabled);
      row.textContent = option.textContent;
      row.addEventListener('pointerenter', () => activate(index));
      row.addEventListener('click', () => choose(index));
      return row;
    }));
    menu.setAttribute('aria-label', button.getAttribute('aria-label'));
    menu.showPopover();
    button.setAttribute('aria-expanded', 'true');
    position();
    active = -1;
    activate(select.selectedIndex, true, false);
    search = '';
  }
  function sync(select) {
    let control = controls.get(select);
    if (!control) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-select-trigger';
      button.id = `${select.id}-trigger`;
      button.setAttribute('role', 'combobox');
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-controls', menu.id);
      button.setAttribute('aria-expanded', 'false');
      select.hidden = true;
      select.after(button);
      controls.set(select, control = { button });
      button.addEventListener('click', () => opened === select ? close() : open(select));
      button.addEventListener('keydown', event => {
        event.stopPropagation();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { close(); return; }
          if (!opened) { open(select); return; }
          if (['Enter', ' '].includes(event.key)) { choose(active); return; }
          const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
          let index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : active + direction;
          while (options[index]?.disabled) index += direction;
          activate(index, true);
        } else if (event.key === 'Tab') close();
        else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault(); event.stopPropagation();
          if (!opened) open(select);
          search = (Date.now() - searchTime < 700 ? search : '') + event.key.toLowerCase();
          searchTime = Date.now();
          const index = options.findIndex(option => !option.disabled && option.textContent.trim().toLowerCase().startsWith(search));
          activate(index, true);
        }
      });
      select.addEventListener('change', () => sync(select));
      for (const label of select.labels ?? []) label.addEventListener('click', event => {
        if (event.target === label) { event.preventDefault(); button.focus(); }
      });
    }
    const { button } = control;
    const text = select.selectedOptions[0]?.textContent ?? 'Select…';
    if (button.textContent !== text) button.textContent = text;
    if (button.disabled !== select.disabled) button.disabled = select.disabled;
    const label = select.getAttribute('aria-label') || [...(select.labels ?? [])].map(label => label.childNodes[0]?.textContent.trim()).filter(Boolean).join(' ') || text;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    const description = select.getAttribute('aria-describedby');
    if (description) button.setAttribute('aria-describedby', description);
    if (opened === select && (select.disabled || !button.getClientRects().length || options.length !== select.options.length || options.some((option, i) => option !== select.options[i]))) close();
  }
  function syncAll() {
    if (opened && !opened.isConnected) close();
    root.querySelectorAll('select').forEach(sync);
  }
  new MutationObserver(syncAll).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
  document.addEventListener('pointerdown', event => {
    if (opened && !menu.contains(event.target) && event.target !== controls.get(opened).button) close();
  });
  document.addEventListener('focusin', event => {
    if (opened && event.target !== controls.get(opened).button && !menu.contains(event.target)) close();
  });
  menu.addEventListener('pointerleave', clearPreview);
  menu.addEventListener('pointerdown', event => event.preventDefault());
  window.addEventListener('resize', () => close());
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) close(); }, true);
  syncAll();
}
