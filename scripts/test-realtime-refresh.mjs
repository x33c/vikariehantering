import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/hooks/useRealtimeRefresh.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const timers = new Map();
const intervals = new Map();
const events = new Map();
const callbacks = [];
const cleanups = [];
let id = 0;
let removed = false;
const window = {
  setTimeout(fn) { timers.set(++id, fn); return id; },
  clearTimeout(id) { timers.delete(id); },
  setInterval(fn, ms) { intervals.set(++id, { fn, ms }); return id; },
  clearInterval(id) { intervals.delete(id); },
  addEventListener(name, fn) { events.set(name, fn); },
  removeEventListener(name) { events.delete(name); },
};
const document = { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
const channel = { on(_event, _filter, fn) { callbacks.push(fn); return channel; }, subscribe() {} };
const context = { exports: {}, window, document, require(name) {
  if (name === 'react') return {
    useRef: value => ({ current: value }),
    useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
  };
  return { supabase: { channel: () => channel, removeChannel() { removed = true; } } };
} };
vm.runInNewContext(source, context);
let calls = 0;
let finish;
context.exports.useRealtimeRefresh(true, () => { calls++; return new Promise(resolve => { finish = resolve; }); }, ['vikariepass'], 6000);
const poll = [...intervals.values()][0];
assert.equal(poll.ms, 60000);
document.visibilityState = 'hidden';
poll.fn();
callbacks[0]();
assert.equal(calls, 0);
assert.equal(timers.size, 0);
document.visibilityState = 'visible';
events.get('visibilitychange')();
callbacks[0]();
callbacks[0]();
assert.equal(timers.size, 1);
async function flush() {
  const scheduled = [...timers.values()]; timers.clear();
  scheduled.forEach(fn => fn());
  await Promise.resolve(); await Promise.resolve();
}
await flush();
assert.equal(calls, 1);
poll.fn(); poll.fn();
assert.equal(calls, 1);
finish();
await Promise.resolve(); await Promise.resolve();
assert.equal(timers.size, 1);
await flush();
assert.equal(calls, 2);
cleanups.forEach(fn => fn());
finish();
await Promise.resolve();
assert.equal(timers.size, 0);
assert.equal(intervals.size, 0);
assert.equal(events.size, 0);
assert.equal(removed, true);
console.log('12 refresh checks passed: hidden tabs, debounce, single flight, fallback and cleanup');
