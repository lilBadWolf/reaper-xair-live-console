// Auto-load: when YARG starts a song, load the Live song with the same name, then switch its sections as
// YARG reaches them (the most specific match: "Chorus 3" → the song's "Chorus 3" section, else its "Chorus";
// a YARG section with no match → the song's main sound). See matchLiveSection() in yarg.js.
// Runs on every open device; the bridge hands each step to one device only (claim), so presets load once.
import { watch } from 'vue';
import { yarg, claim, songTime, sectionIndexAt, matchLiveSong, matchLiveSection } from './yarg.js';
import { live, applySong, setlistSongs } from './live.js';
import { reaper } from './reaper.js';

const LEAD = 0.08;        // switch sections this much early: preset changes take a moment

const ready = () => yarg.auto && reaper.scriptAlive && reaper.tracks.length > 0;
export const liveMatch = () => matchLiveSong(yarg.song, live.doc.songs, setlistSongs());

// Per device: what this play has reached (same data on every device, so every device decides the same steps).
let cur = { play: -1, songId: null, idx: -2, target: undefined };

function sectionTarget(song) {
  const t = songTime(false);
  if (t == null || !isFinite(t)) return { idx: -1, id: null };
  const idx = sectionIndexAt(t + LEAD);
  const name = yarg.lyrics?.sections?.[idx]?.name;
  return { idx, id: idx >= 0 ? matchLiveSection(name, song.sections)?.id ?? null : null };
}

async function tick() {
  if (!ready() || !yarg.song) return;
  const song = liveMatch();
  if (!song) return;
  const play = yarg.clock.play;
  const { idx, id } = sectionTarget(song);
  const fresh = cur.play !== play || cur.songId !== song.id;
  if (!fresh && idx === cur.idx) return;
  const changed = fresh || id !== cur.target;
  cur = { play, songId: song.id, idx, target: id };
  if (!changed) return; // e.g. "Verse 1" → "Verse 1a": same Live section, nothing to reload
  // the key names the YARG section reached, so a section that comes back later loads again
  if (await claim(`${song.id}:${fresh ? 'start' : `s${idx}`}`)) await applySong(song, id);
}

export function startYargAuto() {
  // song changes (works without the data stream too)
  watch(() => [yarg.song?.location, yarg.clock.play, yarg.auto], () => tick());
  setInterval(tick, 50);
}
