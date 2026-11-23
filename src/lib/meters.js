// Meter engine. Levels arrive at their source rate (REAPER poll ~30 ms, XR18 ~100 ms)
// and are fed in here as plain numbers, outside Vue's reactivity, so a level change
// never re-renders a component. One requestAnimationFrame loop draws every visible
// meter with hardware-style ballistics: instant attack, smooth release, peak hold.
import { dbToPos } from './taper.js';

const RELEASE_DB_PER_S = 36;   // fall rate
const HOLD_MS = 1200;          // peak-hold line
const FLOOR = -100;

const levels = new Map();      // key -> latest dB from the source
export function feed(key, db) { levels.set(key, db); }
export function feedMany(prefix, arr) { for (let i = 0; i < arr.length; i++) levels.set(prefix + i, arr[i]); }

const bars = new Set();        // registered DOM bars
export function register(bar) { bars.add(bar); start(); return () => bars.delete(bar); }

let running = false, last = 0;
function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const b of bars) {
    const target = levels.get(b.key) ?? FLOOR;
    // instant attack, linear-in-dB release
    b.db = target >= b.db ? target : Math.max(target, b.db - RELEASE_DB_PER_S * dt);
    if (b.db >= b.hold || now - b.holdAt > HOLD_MS) { b.hold = b.db; b.holdAt = now; }
    const pos = dbToPos(b.db), hpos = dbToPos(b.hold);
    if (Math.abs(pos - b.drawn) > 0.001) {
      b.mask.style.transform = b.horiz ? `translateX(${pos * 100}%)` : `translateY(${-pos * 100}%)`;
      b.drawn = pos;
    }
    if (Math.abs(hpos - b.hdrawn) > 0.001 || b.clip !== b.hold >= -0.1) {
      b.peak.style.transform = b.horiz ? `translateX(${hpos * b.el.clientWidth}px)` : `translateY(${(1 - hpos) * b.el.clientHeight}px)`;
      b.peak.style.opacity = b.hold > -90 ? 1 : 0;
      b.clip = b.hold >= -0.1;
      b.el.classList.toggle('clip', b.clip);
      b.hdrawn = hpos;
    }
  }
  if (bars.size) requestAnimationFrame(frame); else running = false;
}
