// Which XR18 channel(s) feed each REAPER track.
// Priority: manual mapping (Settings / track page) > the track's record input
// (XR18 USB in 1-16 = ch 1-16, 17/18 = aux) > a matching XR18 channel name.
import { reaper } from './reaper.js';
import { settings, ALL_CHANNELS, chLabel } from './settings.js';
import { xr, chName } from './xr18.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function fromRecInput(v) {
  if (v === undefined || v < 0 || v & 4096) return null;  // none or MIDI
  const idx = v & 1023;
  if (idx >= 512) return null;                           // ReaRoute etc.
  const n = v & 1024 ? 2 : v & 2048 ? (v >> 11) & 31 : 1;
  const out = [];
  for (let i = idx; i < idx + n; i++) {
    if (i < 16) out.push(String(i + 1).padStart(2, '0'));
    else if (i < 18 && !out.includes('aux')) out.push('aux');
  }
  return out.length ? out : null;
}

function fromName(name) {
  const n = norm(name);
  if (!n) return null;
  const exact = ALL_CHANNELS.find((ch) => norm(chName(ch)) === n);
  if (exact) return [exact];
  // "Lead Vocal" ~ "Lead Vocals"
  const loose = ALL_CHANNELS.find((ch) => { const c = norm(chName(ch)); return c && (c.startsWith(n) || n.startsWith(c)); });
  if (loose) return [loose];
  // Linked stereo pair whose names share a stem: "Keyboard" ~ "Key L" + "Key R"
  for (let c = 1; c <= 15; c += 2) {
    if (xr.values[`/config/chlink/${c}-${c + 1}`] !== 1) continue;
    const a = String(c).padStart(2, '0'), b = String(c + 1).padStart(2, '0');
    const stem = norm(chName(a).replace(/\s*(l|left)$/i, ''));
    if (stem.length >= 3 && stem === norm(chName(b).replace(/\s*(r|right)$/i, '')) && (n.startsWith(stem) || stem.startsWith(n))) return [a, b];
  }
  return null;
}

export function autoChannels(track) {
  return fromRecInput(reaper.recInputs[track.idx]) || fromName(track.name) || [];
}

export function channelsFor(track) {
  if (!track || track.idx === 0) return [];
  void xr.values; // re-evaluate when names arrive
  const manual = settings.trackMap[track.name];
  return Array.isArray(manual) ? manual : autoChannels(track);
}

export const mappingLabel = (chs) => (chs.length ? chs.map(chLabel).join('+') : '—');

// Choices for a <select>: auto, none, each channel, odd/even pairs.
export function mappingOptions() {
  const opts = [{ value: 'auto', label: 'Auto' }, { value: '', label: 'Not on XR18' }];
  for (const ch of ALL_CHANNELS) opts.push({ value: ch, label: `${chLabel(ch)}${chName(ch) ? ` · ${chName(ch)}` : ''}` });
  for (let c = 1; c <= 15; c += 2) {
    const a = String(c).padStart(2, '0'), b = String(c + 1).padStart(2, '0');
    opts.push({ value: `${a},${b}`, label: `${c}+${c + 1} stereo` });
  }
  return opts;
}
export function mappingValue(trackName) {
  const m = settings.trackMap[trackName];
  return Array.isArray(m) ? m.join(',') : 'auto';
}
export function setMapping(trackName, value) {
  if (value === 'auto') delete settings.trackMap[trackName];
  else settings.trackMap[trackName] = value ? value.split(',') : [];
}
