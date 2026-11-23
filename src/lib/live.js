// LIVE tab: songs that recall FX presets across tracks, with per-section changes.
//
// Doc     = { songs: [Song] (the library), setlists: [{ id, name, songIds: [] }], currentSetlistId }
//           A song can be in any number of setlists; editing it updates it everywhere.
// Song    = { id, name, sound: [Assign], sections: [{ id, name, changes: [Assign] }] }
// Assign  = { track: 'Guitar 1', fx: 0, fxName: 'ToneLib-GFX', preset: 'Killswitch' | null, on: true | false | null }
//           preset/on null = leave as is
// Tapping a section loads song.sound with that section's changes on top, so the result
// is the same whichever section was loaded before.
import { live } from './liveStore.js';
import { reaper, fxBatch, cleanFxName } from './reaper.js';
import { post } from './xr18.js';

export { live };

export const SECTION_NAMES = ['Intro', 'Verse', 'Pre', 'Chorus', 'Bridge', 'Solo', 'Breakdown', 'Outro'];
export const uid = () => Math.random().toString(36).slice(2, 10);
const key = (a) => `${a.track}\u0001${a.fx}`;

// ---------- doc / setlists ----------
// Older docs had only `songs`: they become one setlist, "Main set", in the same order.
export function normalizeDoc(doc) {
  const d = { songs: doc?.songs || [], setlists: doc?.setlists, currentSetlistId: doc?.currentSetlistId ?? null };
  if (!Array.isArray(d.setlists) || !d.setlists.length) {
    d.setlists = [{ id: 'main', name: 'Main set', songIds: d.songs.map((s) => s.id) }]; // fixed id: same on every device
  }
  const ids = new Set(d.songs.map((s) => s.id));
  for (const sl of d.setlists) sl.songIds = (sl.songIds || []).filter((id) => ids.has(id));
  if (!d.setlists.some((sl) => sl.id === d.currentSetlistId)) d.currentSetlistId = d.setlists[0].id;
  return d;
}
export function saveDoc() {
  const { songs, setlists, currentSetlistId } = live.doc;
  return post('/live/doc', { songs, setlists, currentSetlistId });
}

export const songById = (id) => live.doc.songs.find((s) => s.id === id);
export const currentSetlist = () => live.doc.setlists?.find((sl) => sl.id === live.doc.currentSetlistId) || live.doc.setlists?.[0] || null;
export const setlistSongs = (sl = currentSetlist()) => (sl ? sl.songIds.map(songById).filter(Boolean) : []);

export function selectSetlist(id) { live.doc.currentSetlistId = id; saveDoc(); }
export function createSetlist(name, songIds = []) {
  const sl = { id: uid(), name: uniqueName(name || 'New setlist'), songIds };
  live.doc.setlists.push(sl);
  live.doc.currentSetlistId = sl.id;
  saveDoc();
  return sl;
}
export function renameSetlist(id, name) { const sl = live.doc.setlists.find((x) => x.id === id); if (sl && name) { sl.name = name; saveDoc(); } }
export function duplicateSetlist(id) {
  const sl = live.doc.setlists.find((x) => x.id === id);
  return sl && createSetlist(`${sl.name} copy`, [...sl.songIds]);
}
export function deleteSetlist(id) {
  if (live.doc.setlists.length <= 1) return; // always keep one
  live.doc.setlists = live.doc.setlists.filter((x) => x.id !== id);
  if (live.doc.currentSetlistId === id) live.doc.currentSetlistId = live.doc.setlists[0].id;
  saveDoc();
}
export function addToSetlist(songIds, sl = currentSetlist()) { sl.songIds.push(...songIds.filter((id) => !sl.songIds.includes(id))); saveDoc(); }
export function removeFromSetlist(songId, sl = currentSetlist()) { sl.songIds = sl.songIds.filter((id) => id !== songId); saveDoc(); }
export function moveInSetlist(from, to, sl = currentSetlist()) {
  if (from === to) return;
  const [id] = sl.songIds.splice(from, 1);
  sl.songIds.splice(to, 0, id);
  saveDoc();
}
export function deleteSongEverywhere(songId) {
  live.doc.songs = live.doc.songs.filter((s) => s.id !== songId);
  for (const sl of live.doc.setlists) sl.songIds = sl.songIds.filter((id) => id !== songId);
  saveDoc();
}
function uniqueName(name) {
  const names = new Set(live.doc.setlists.map((x) => x.name));
  if (!names.has(name)) return name;
  let i = 2; while (names.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

// ---------- export / import (a setlist + its songs, as a .json file) ----------
export function exportSetlist(id) {
  const sl = live.doc.setlists.find((x) => x.id === id);
  if (!sl) return;
  const data = { type: 'live-console-setlist', version: 1, exportedAt: new Date().toISOString(), setlist: { name: sl.name, songIds: sl.songIds }, songs: setlistSongs(sl) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `${sl.name.replace(/[^\w\- ]+/g, '').trim() || 'setlist'}.setlist.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Songs already in the library (same id) are reused as they are; new ones are added.
export async function importSetlist(file) {
  const data = JSON.parse(await file.text());
  if (data?.type !== 'live-console-setlist' || !Array.isArray(data.songs)) throw new Error('Not a Live Console setlist file');
  const have = new Set(live.doc.songs.map((s) => s.id));
  let added = 0;
  for (const song of data.songs) if (song?.id && !have.has(song.id)) { live.doc.songs.push(song); have.add(song.id); added++; }
  const sl = createSetlist(data.setlist?.name || file.name.replace(/\.setlist\.json$|\.json$/i, ''), (data.setlist?.songIds || data.songs.map((s) => s.id)).filter((id) => have.has(id)));
  return { setlist: sl, added, total: data.songs.length };
}
export function setActive(songId, sectionId = null) {
  live.active = { songId, sectionId };
  return post('/live/active', live.active);
}

// Every track/FX that could be part of a song, from what REAPER has now.
export function availableFx() {
  const out = [];
  for (const t of reaper.tracks) {
    for (const f of reaper.fx[t.idx] || []) {
      out.push({ track: t.name, trackIdx: t.idx, fx: f.i, fxName: cleanFxName(f.name), list: f.list, preset: f.preset, on: f.on, pc: f.pc });
    }
  }
  return out;
}

// Snapshot current presets (and on/off) of every FX that has presets.
export function captureCurrent() {
  return availableFx()
    .filter((f) => f.pc > 0 || f.preset)
    .map((f) => ({ track: f.track, fx: f.fx, fxName: f.fxName, preset: f.preset || null, on: f.on }));
}

// Find the live FX for an assignment: track by name, FX by slot (checked by name, else searched by name).
export function resolve(a) {
  const t = reaper.tracks.find((x) => x.name === a.track);
  if (!t) return { error: `track “${a.track}” not found` };
  const list = reaper.fx[t.idx] || [];
  let f = list.find((x) => x.i === a.fx);
  if (!f || (a.fxName && cleanFxName(f.name) !== a.fxName)) f = list.find((x) => cleanFxName(x.name) === a.fxName) || null;
  if (!f) return { error: `${a.track}: ${a.fxName} not found` };
  return { trackIdx: t.idx, fx: f };
}

export function targetsFor(song, sectionId = null) {
  const m = new Map(song.sound.map((a) => [key(a), { ...a }]));
  const sec = sectionId && song.sections.find((s) => s.id === sectionId);
  for (const c of sec?.changes || []) {
    const cur = m.get(key(c)) || { track: c.track, fx: c.fx, fxName: c.fxName, preset: null, on: null };
    m.set(key(c), { ...cur, preset: c.preset ?? cur.preset, on: c.on ?? cur.on });
  }
  return [...m.values()];
}

// Load a song (or one of its sections). Returns a list of problems (empty = all good).
export async function applySong(song, sectionId = null) {
  const lines = [], problems = [];
  for (const a of targetsFor(song, sectionId)) {
    const r = resolve(a);
    if (r.error) { problems.push(r.error); continue; }
    const { trackIdx, fx } = r;
    if (a.preset) {
      const idx = fx.list.indexOf(a.preset);
      if (idx < 0) problems.push(`${a.track}: preset “${a.preset}” not found`);
      else if (idx !== fx.pi || fx.preset !== a.preset) lines.push({ trackIdx, fxIdx: fx.i, op: 'set', arg: idx });
    }
    if (a.on !== null && a.on !== undefined && a.on !== fx.on) lines.push({ trackIdx, fxIdx: fx.i, op: 'bypass' }); // toggle only if needed
  }
  live.appliedAt = Date.now();
  await Promise.all([fxBatch(lines), setActive(song.id, sectionId)]);
  return problems;
}

// Does REAPER currently match what the active song/section asks for?
export function checkActive() {
  const song = live.doc.songs.find((s) => s.id === live.active.songId);
  if (!song) return null;
  const off = [];
  for (const a of targetsFor(song, live.active.sectionId)) {
    const r = resolve(a);
    if (r.error) { off.push(r.error); continue; }
    if (a.preset && r.fx.preset !== a.preset) off.push(`${a.track}: ${r.fx.preset || '—'} (song: ${a.preset})`);
    if (a.on !== null && a.on !== undefined && r.fx.on !== a.on) off.push(`${a.track}: ${cleanFxName(r.fx.name)} ${r.fx.on ? 'on' : 'bypassed'}`);
  }
  return off;
}

export function songSummary(song) {
  return song.sound.filter((a) => a.preset).map((a) => `${a.track}: ${a.preset}`).join(' · ');
}
