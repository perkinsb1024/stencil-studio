import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusyTask } from '../src/busy-task.js';

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = new Map(), workers = [];
  const control = { disabled: false, id: 'setting', isConnected: true, getClientRects: () => [1], focus() { document.activeElement = this; } };
  const cancel = { disabled: false, contains: target => target === cancel, focus() { document.activeElement = this; }, addEventListener(type, handler) { this[type] = handler; } };
  const progress = { value: 0, removeAttribute() {}, setAttribute() {} };
  const label = { after() {} };
  const overlay = { hidden: true, querySelector: selector => selector === 'button' ? cancel : label };
  const stage = { setAttribute(name, value) { this[name] = value; } };
  const root = { classList: { add() {}, remove() {} } };
  const globals = {
    document: { activeElement: control, body: {}, createElement: () => progress, querySelectorAll: () => [control, cancel], addEventListener(type, handler) { listeners.set(type, handler); } },
    CSS: { escape: value => value },
    MutationObserver: class { observe() {} disconnect() {} },
    Worker: class {
      constructor() { workers.push(this); }
      postMessage() {}
      terminate() { this.terminated = true; }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  let completed = 0, cancelled = 0, errors = 0;
  const busy = createBusyTask({ root, overlay, stage, onCancel() { cancelled++; }, onError() { errors++; } });
  return { busy, overlay, stage, control, cancel, workers,
    run: () => busy.run('stencil', {}, 'Working…', () => completed++),
    click: event => listeners.get('click')({ type: 'click', target: control, ...event }),
    escape: () => listeners.get('keydown')({ type: 'keydown', key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }),
    counts: () => ({ completed, cancelled, errors }),
  };
}

test('quick work blocks input without disabling controls or showing a stale overlay', t => {
  const f = fixture(t);
  f.run();
  assert.equal(f.control.disabled, false);
  assert.equal(f.stage['aria-busy'], 'true');
  let prevented = false, stopped = false;
  f.click({ preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  t.mock.timers.tick(299);
  assert.equal(f.control.disabled, false);
  assert.equal(f.overlay.hidden, true);
  f.workers[0].onmessage({ data: { result: {} } });
  t.mock.timers.tick(1000);
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.control.disabled, false);
  assert.equal(f.stage['aria-busy'], 'false');
  assert.deepEqual(f.counts(), { completed: 1, cancelled: 0, errors: 0 });
});

test('long work shows Cancel at 300ms and hides the overlay on completion', t => {
  const f = fixture(t);
  f.run();
  t.mock.timers.tick(299);
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.control.disabled, false);
  t.mock.timers.tick(1);
  assert.equal(f.control.disabled, true);
  assert.equal(f.overlay.hidden, false);
  assert.equal(document.activeElement, f.cancel);
  f.workers[0].onmessage({ data: { result: {} } });
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.control.disabled, false);
  assert.equal(document.activeElement, f.control);
});

test('Escape during the delay cancels work without showing a modal or affecting a new job', t => {
  const f = fixture(t);
  f.run();
  t.mock.timers.tick(200);
  f.escape();
  assert.equal(f.workers[0].terminated, true);
  assert.equal(f.busy.active, false);
  f.run();
  t.mock.timers.tick(100);
  assert.equal(f.overlay.hidden, true);
  t.mock.timers.tick(200);
  assert.equal(f.overlay.hidden, false);
  f.cancel.click();
  assert.equal(f.overlay.hidden, true);
  assert.deepEqual(f.counts(), { completed: 0, cancelled: 2, errors: 0 });
});

test('worker failure before the delay restores controls and clears the pending modal', t => {
  const f = fixture(t);
  f.run();
  f.workers[0].onerror();
  t.mock.timers.tick(1000);
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.control.disabled, false);
  assert.deepEqual(f.counts(), { completed: 0, cancelled: 0, errors: 1 });
});
