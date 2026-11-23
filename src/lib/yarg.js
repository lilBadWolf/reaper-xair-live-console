// YARG state from the bridge (bridge/yarg.mjs): current song, lyrics, and a song clock.
// The bridge sends clock anchors (song time t, rate, state) whenever they change; we extrapolate locally.
import { reactive } from 'vue';
import { settings, bridgeBase } from './settings.js';
import { post } from './xr18.js';

export const yarg = reactive({
  detected: false,  // YARG running (or its data stream / a song seen): shows the YARG tab
  song: null,       // { name, artist, album, charter, year, length, location }
  lyrics: null,     // { parts: { vocals|harm1|harm2|harm3: { phrases: [{ s, e, syl: [{ t, x, j }] }], notes: [[s, e, midi, talky]] } },
                    //   sections: [{ t, name }], beats: [[t, k]] (k 0 = bar line, 1 = beat) } | { error }
  menuSong: null,   // what YARG is playing in its menus: { name, artist, album, year }
  results: null,    // { last, best } from YARG's scores: { song, artist, score, stars, players: [...] }
  auto: false,      // load the matching Live song (shared by every device, kept by the bridge)
  tabs: null,       // { version, song, file, error, offset, auto, autoOffset, playedBars, tracks: [{ id, name, kind, source, strings, tuning, count }] }
  clock: { state: 'off', t: 0, rate: 1, stream: false, scene: 'unknown', bpm: 0, paused: false, play: 0 },
  beat: { k: -1, n: 0 }, // last beat line from the data stream: k 0 = bar, 1 = strong, 2 = weak; n counts them
});
let anchor = { t: 0, at: 0, rate: 1, run: false };

function setClock(c) {
  yarg.clock = c;
  anchor = { t: c.t, at: performance.now() / 1000, rate: c.rate || 1, run: c.state === 'run' };
}

export function onYargMessage(msg) {
  if (msg.type === 'yarg' || (msg.type === 'snapshot' && msg.yarg)) {
    const y = msg.yarg;
    yarg.detected = !!y.detected;
    yarg.song = y.song;
    yarg.lyrics = y.lyrics;
    yarg.menuSong = y.menuSong || null;
    yarg.results = y.results || null;
    if ('auto' in y) yarg.auto = !!y.auto;
    if ('tabs' in y) yarg.tabs = y.tabs;
    setClock(y.clock);
  } else if (msg.type === 'yargClock') {
    setClock(msg.clock);
  } else if (msg.type === 'yargBeat') {
    yarg.beat = { k: msg.k, n: yarg.beat.n + 1 };
  } else if (msg.type === 'yargAuto') {
    yarg.auto = !!msg.on;
  } else if (msg.type === 'yargTabs') {
    yarg.tabs = msg.tabs;
  }
}

// "the menu song started from the top": follow it with the lyrics (approximate: menu pauses aren't reported)
export const confirmMenu = (on) => post('/yarg/menusync', { on });
// The song whose lyrics are shown: the one being played, else the menu music (when we have its lyrics).
export const shownSong = () => yarg.song || (yarg.menuSong && yarg.lyrics ? yarg.menuSong : null);

export const setAuto = (on) => { yarg.auto = on; return post('/config', { yargAuto: on }); };
// once per play: the first device to claim `what` gets true (so only one device loads presets)
export async function claim(what) {
  try {
    const r = await fetch(`${bridgeBase()}/yarg/claim`, { method: 'POST', body: JSON.stringify({ key: `${yarg.clock.play}:${what}` }), headers: { 'Content-Type': 'text/plain' } });
    return (await r.text()) === 'ok';
  } catch { return false; }
}

// Synced = the bridge is tracking song position (needs YARG's data stream, and normal play, not practice).
export const synced = () => ['run', 'pause', 'wait'].includes(yarg.clock.state);

// Current song time in seconds, or null when not synced. `withOffset`: + this device's lyrics offset.
export function songTime(withOffset = true) {
  if (!synced()) return null;
  if (yarg.clock.state === 'wait') return -Infinity;
  const t = anchor.run ? anchor.t + (performance.now() / 1000 - anchor.at) * anchor.rate : anchor.t;
  return withOffset ? t + (settings.lyricsOffsetMs || 0) / 1000 : t;
}
export const playRate = () => anchor.rate;

export const fmtTime = (s) => (s == null || !isFinite(s) ? '–:––' : `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`);

// Phrase text with syllables joined the way the chart says (word-final syllables get a space).
export const phraseText = (p) => p.syl.map((y, i) => y.x + (y.j || i === p.syl.length - 1 ? '' : ' ')).join('');

// ---------- vocal parts ----------
export const PART_LABELS = { vocals: 'Lead', harm1: 'Harmony 1', harm2: 'Harmony 2', harm3: 'Harmony 3' };
export const partKeys = () => Object.keys(yarg.lyrics?.parts || {});
// The part this device shows: the URL's (#yarg/stage/harm2), else this device's choice, else lead.
export function partKey(routePart) {
  const keys = partKeys();
  for (const k of [routePart, settings.vocalPart, 'vocals', 'harm1']) if (k && keys.includes(k)) return k;
  return keys[0] || null;
}

const NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (midi) => `${NOTE[midi % 12]}${Math.floor(midi / 12) - 1}`;

// ---------- sections ----------
export function sectionIndexAt(t) {
  const secs = yarg.lyrics?.sections || [];
  if (t == null || !isFinite(t)) return -1;
  let i = -1;
  for (let j = 0; j < secs.length && secs[j].t <= t; j++) i = j;
  return i;
}

// ---------- matching YARG songs/sections to Live songs ----------
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, '').replace(/^\s*(the|a|an)\s+/, '').replace(/\b(feat|ft)\b\.?.*$/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// The Live song with the same name as the YARG song (current setlist first, then the whole library).
export function matchLiveSong(ySong, songs, setlistSongs) {
  if (!ySong) return null;
  const n = norm(ySong.name), na = norm(ySong.artist) + n, an = n + norm(ySong.artist);
  const hit = (s) => { const x = norm(s.name); return x && (x === n || x === na || x === an); };
  return setlistSongs.find(hit) || songs.find(hit) || null;
}

// The Live section for a YARG section name: "Verse 2a" → "Verse", "Pre-Chorus 1" → "Pre", "Gtr solo" → "Solo".
// No match → null (the song's base sound: sections are changes on top of it).
export function matchLiveSection(yName, sections) {
  const y = norm(String(yName || '').replace(/\d+[a-z]?\b/gi, ''));
  if (!y) return null;
  let best = null, score = 0;
  for (const s of sections) {
    const x = norm(s.name);
    if (!x) continue;
    const sc = x === y ? 1000 : y.startsWith(x) ? 100 + x.length : y.includes(x) ? x.length : 0;
    if (sc > score) { score = sc; best = s; }
  }
  return best;
}

// ---------- tabs ----------
const trackCache = new Map(); // `${id}@${version}` -> track
export async function fetchTabTrack(id) {
  const key = `${id}@${yarg.tabs?.version}`;
  if (trackCache.has(key)) return trackCache.get(key);
  const r = await fetch(`${bridgeBase()}/yarg/tab/track?id=${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const t = await r.json();
  if (trackCache.size > 12) trackCache.clear();
  trackCache.set(key, t);
  return t;
}
export async function uploadTab(file) {
  const r = await fetch(`${bridgeBase()}/yarg/tab/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
  const j = await r.json().catch(() => ({ error: `upload failed (${r.status})` }));
  if (!r.ok) throw new Error(j.error || 'upload failed');
  return j;
}
export const setTabOffset = (offset) => post('/yarg/tab/offset', { offset });
export const setTabTuning = (track, tuning) => post('/yarg/tab/tuning', { track, tuning });

// Common tunings by string count (MIDI notes, low string first)
export const TUNINGS = {
  6: [['Standard', [40, 45, 50, 55, 59, 64]], ['Drop D', [38, 45, 50, 55, 59, 64]], ['E♭ standard', [39, 44, 49, 54, 58, 63]], ['Drop C♯', [37, 44, 49, 54, 58, 63]],
    ['D standard', [38, 43, 48, 53, 57, 62]], ['Drop C', [36, 43, 48, 53, 57, 62]], ['C♯ standard', [37, 42, 47, 52, 56, 61]], ['Drop B', [35, 42, 47, 52, 56, 61]],
    ['C standard', [36, 41, 46, 51, 55, 60]], ['B standard', [35, 40, 45, 50, 54, 59]], ['Drop A', [33, 40, 45, 50, 54, 59]],
    ['DADGAD', [38, 45, 50, 55, 57, 62]], ['Open G', [38, 43, 50, 55, 59, 62]], ['Open D', [38, 45, 50, 54, 57, 62]], ['Open E', [40, 47, 52, 56, 59, 64]]],
  7: [['Standard', [35, 40, 45, 50, 55, 59, 64]], ['Drop A', [33, 40, 45, 50, 55, 59, 64]], ['A standard', [33, 38, 43, 48, 53, 57, 62]]],
  4: [['Standard', [28, 33, 38, 43]], ['Drop D', [26, 33, 38, 43]], ['E♭ standard', [27, 32, 37, 42]], ['Drop C♯', [25, 32, 37, 42]],
    ['D standard', [26, 31, 36, 41]], ['Drop C', [24, 31, 36, 41]], ['C standard', [24, 29, 34, 39]], ['Drop B', [23, 30, 35, 40]], ['B standard', [23, 28, 33, 38]]],
  5: [['Standard', [23, 28, 33, 38, 43]], ['Drop A', [21, 28, 33, 38, 43]], ['E♭ standard', [22, 27, 32, 37, 42]]],
};
const PITCH = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const tuningNotes = (t) => (t || []).map((m) => PITCH[m % 12]).join(' ');
export const tuningName = (t) => {
  const hit = (TUNINGS[t?.length] || []).find(([, v]) => v.every((m, i) => m === t[i]));
  return hit ? hit[0] : tuningNotes(t);
};
export const removeTab = () => post('/yarg/tab/remove', {});
// The track this device shows: the URL's (#yarg/tab/pro-bass), else this device's choice (by id, then by kind), else the first.
export function tabTrackId(routeTrack) {
  const ts = yarg.tabs?.tracks || [];
  for (const id of [routeTrack, settings.tabTrack]) if (id && ts.some((t) => t.id === id)) return id;
  const kind = settings.tabKind || 'guitar';
  return (ts.find((t) => t.kind === kind) || ts[0])?.id || null;
}

export const STAR_LABEL = { 6: 'Gold stars', 7: 'Silver stars', 8: 'Brutal' };
