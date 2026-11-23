// Client for the XR18 bridge (bridge/xr18-bridge.mjs): SSE in, HTTP POST out.
import { reactive, computed } from 'vue';
import { settings, bridgeBase, channelAddr, returnAddr, ALL_CHANNELS, chLabel } from './settings.js';
import { feedMany } from './meters.js';
import { live } from './liveStore.js';
import { normalizeDoc } from './live.js';

// /meters/1 layout: ch 1-16 -> 0-15, aux L/R 16-17, fx rtn 18-25, bus 26-31, fx send 32-35, main L/R 36-37, mon 38-39
export const meterKeys = (ch) => (ch === 'aux' ? ['x:16', 'x:17'] : [`x:${+ch - 1}`]);
export const MAIN_METER = ['x:36', 'x:37'];
export const busMeterKey = (b) => `x:${25 + b}`;          // bus 1-6 -> 26-31
export const fxRtnMeterKeys = (r) => [`x:${16 + r * 2}`, `x:${17 + r * 2}`]; // fx rtn 1-4 L/R -> 18-25

export const xr = reactive({
  bridge: false,              // connected to the bridge?
  mixer: { connected: false, host: '', name: '', model: '' },
  values: {},                 // OSC address -> value
  learned: [],
  lan: [],                    // this Mac's LAN addresses, from the bridge (for QR codes)
});

const throttles = new Map();
let es = null;
export function startXr() {
  es?.close();
  es = new EventSource(`${bridgeBase()}/events`);
  es.onopen = () => { xr.bridge = true; };
  es.onerror = () => { xr.bridge = false; live.loaded = false; };
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'meters') {
      feedMany('x:', msg.m); // not reactive: drawn by the meter engine
    } else if (msg.type === 'snapshot') {
      xr.mixer = msg.mixer;
      xr.values = Object.fromEntries(Object.entries(msg.values).map(([a, o]) => [a, o.v]));
      xr.learned = msg.learned || [];
      xr.lan = msg.lan || [];
      if (msg.live) { live.doc = normalizeDoc(msg.live.doc); live.active = msg.live.active; live.loaded = true; }
    } else if (msg.type === 'live') {
      live.doc = normalizeDoc(msg.doc);
    } else if (msg.type === 'liveActive') {
      live.active = msg.active;
    } else if (msg.type === 'delta') {
      for (const [a, o] of Object.entries(msg.values)) {
        if (!throttles.has(a)) xr.values[a] = o.v; // don't fight an active drag
      }
    } else if (msg.type === 'status') {
      xr.mixer = msg.mixer;
    } else if (msg.type === 'learn') {
      xr.learned = [msg.entry, ...xr.learned.filter((e) => e.a !== msg.entry.a)].slice(0, 40);
    }
  };
}

export function post(path, body) {
  // text/plain avoids a CORS preflight; the bridge parses JSON regardless
  return fetch(`${bridgeBase()}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' } })
    .catch(() => {});
}

export function sendBatch(msgs) {
  for (const m of msgs) xr.values[m.a] = m.v;
  return post('/send', msgs);
}

export function send(a, t, v) {
  xr.values[a] = v;
  if (throttles.has(a)) { throttles.get(a).v = v; return; }
  const entry = { v };
  throttles.set(a, entry);
  post('/send', { a, t, v });
  setTimeout(() => {
    throttles.delete(a);
    if (entry.v !== v) send(a, t, entry.v);
  }, 35);
}
// Same value to several addresses (e.g. both sides of a stereo pair).
export function sendAll(addrs, t, v) { for (const a of addrs) send(a, t, v); }

export const query = (addrs) => post('/query', { a: addrs });
export const setMixerHost = (host) => post('/config', { host });

export const xrMuted = computed(() => xr.values[settings.xrMuteAddress] === 0);
export function toggleXrMute() {
  send(settings.xrMuteAddress, 'i', xrMuted.value ? 1 : 0);
}

// ---- per-channel USB return (line in vs. USB return from REAPER) ----
export const isUsb = (ch) => xr.values[returnAddr(ch)] === 1;
export function setUsb(chs, on) {
  sendBatch(chs.map((ch) => ({ a: returnAddr(ch), t: 'i', v: on ? 1 : 0 })));
}

export const busName = (b) => xr.values[`/bus/${b}/config/name`] || `Aux ${b}`;
export const fxName = (f) => xr.values[`/fxsend/${f}/config/name`] || `FX ${f}`;
export const chName = (ch) => xr.values[channelAddr(ch, 'config/name')] || '';

export const xrChannels = computed(() =>
  ALL_CHANNELS.map((ch) => ({
    ch,
    label: chLabel(ch),
    name: chName(ch),
    on: xr.values[channelAddr(ch, 'mix/on')],
    fader: xr.values[channelAddr(ch, 'mix/fader')],
    rtn: xr.values[returnAddr(ch)],
  })),
);
