<script setup>
import { computed, watch } from 'vue';
import MixerView from './views/MixerView.vue';
import FxView from './views/FxView.vue';
import XrView from './views/XrView.vue';
import SettingsView from './views/SettingsView.vue';
import TrackView from './views/TrackView.vue';
import LiveView from './views/LiveView.vue';
import BusesView from './views/BusesView.vue';
import YargView from './views/YargView.vue';
import LyricsModal from './components/LyricsModal.vue';
import SongEditor from './components/SongEditor.vue';
import QrModal from './components/QrModal.vue';
import SetlistsModal from './components/SetlistsModal.vue';
import AddSongsModal from './components/AddSongsModal.vue';
import PresetModal from './components/PresetModal.vue';
import ProcModal from './components/proc/ProcModal.vue';
import { modal, closeModal } from './lib/modal.js';
import { reaper, toggleMute } from './lib/reaper.js';
import { xr, xrMuted, toggleXrMute } from './lib/xr18.js';
import { route, go, trackHash } from './lib/router.js';
import { yarg } from './lib/yarg.js';

const TABS = [
  { id: 'live', label: 'Sets', comp: LiveView },
  { id: 'yarg', label: 'YARG', comp: YargView, auto: true }, // only while YARG is detected
  { id: 'mixer', label: 'Mixer', comp: MixerView },
  { id: 'fx', label: 'Effects', comp: FxView },
  { id: 'buses', label: 'Buses', comp: BusesView },
  { id: 'xr', label: 'XR18', comp: XrView },
  { id: 'settings', label: 'Settings', comp: SettingsView },
];
const tabs = computed(() => TABS.filter((t) => !t.auto || yarg.detected || route.view === t.id));
// URL hash wins (bookmarkable per device), else last tab used on this device.
if (!route.view) {
  let last = 'mixer';
  try { last = localStorage.getItem('live-console-tab') || last; } catch {}
  history.replaceState(null, '', `#${TABS.some((t) => t.id === last) ? last : 'mixer'}`);
  route.view = TABS.some((t) => t.id === last) ? last : 'mixer';
}
watch(() => [route.view, route.track], closeModal);
watch(() => route.view, (v) => { if (TABS.some((t) => t.id === v)) try { localStorage.setItem('live-console-tab', v); } catch {} });
const current = computed(() => (route.view === 'track' ? TrackView : (TABS.find((t) => t.id === route.view) || TABS[0]).comp));

// Artist mode has no tabs; hold the logo for 1 s to leave it (for the engineer).
let holdTimer = null;
const holdStart = () => { if (route.artist) holdTimer = setTimeout(() => { location.hash = route.view === 'yarg' ? '#yarg' : trackHash(route.track, false); }, 1000); };
const holdEnd = () => clearTimeout(holdTimer);
const master = computed(() => reaper.tracks.find((t) => t.idx === 0));
const reaperMuted = computed(() => !!master.value?.muted);
const recording = computed(() => reaper.playState === 5);
const playing = computed(() => reaper.playState === 1 || reaper.playState === 5);
</script>

<template>
  <div class="app" :class="{ artist: route.artist }">
    <header>
      <div class="brand" @pointerdown="holdStart" @pointerup="holdEnd" @pointerleave="holdEnd" @pointercancel="holdEnd">
        <span class="logo"><i /><i /><i /></span>
        <span class="title">Live Console</span>
        <span class="dots">
          <span class="dot" :class="{ ok: reaper.connected }" title="REAPER">RPR</span>
          <span class="dot" :class="{ ok: reaper.scriptAlive }" title="FX script">FX</span>
          <span class="dot" :class="{ ok: xr.mixer.connected, warn: xr.bridge && !xr.mixer.connected }" title="XR18">XR</span>
          <span v-if="playing" class="dot" :class="recording ? 'rec' : 'ok'">{{ recording ? 'REC' : 'PLAY' }}</span>
        </span>
      </div>

      <div v-if="!route.artist" class="globals">
        <button class="big" :class="{ muted: reaperMuted }" :disabled="!master" @click="toggleMute(0)">
          <small>REAPER</small>{{ reaperMuted ? 'MUTED' : 'MUTE' }}
        </button>
        <button class="big" :class="{ muted: xrMuted }" :disabled="!xr.mixer.connected" @click="toggleXrMute">
          <small>XR18</small>{{ xrMuted ? 'MUTED' : 'MUTE' }}
        </button>
      </div>

      <nav v-if="!route.artist">
        <button v-for="t in tabs" :key="t.id" :class="{ active: route.view === t.id }" @click="go(t.id)">{{ t.label }}</button>
      </nav>
    </header>

    <main><component :is="current" /></main>

    <PresetModal v-if="modal.kind === 'presets'" v-bind="modal.props" />
    <ProcModal v-else-if="modal.kind === 'proc'" v-bind="modal.props" />
    <QrModal v-else-if="modal.kind === 'qr'" v-bind="modal.props" />
    <SetlistsModal v-else-if="modal.kind === 'setlists'" />
    <AddSongsModal v-else-if="modal.kind === 'addSongs'" />
    <LyricsModal v-else-if="modal.kind === 'lyrics'" />
    <SongEditor v-else-if="modal.kind === 'song'" :key="modal.props.songId || 'new'" v-bind="modal.props" />
  </div>
</template>

<style scoped>
.app { height: 100%; width: 100%; overflow: hidden; display: flex; flex-direction: column; padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(3px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); gap: 10px; }
header { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; margin-right: auto; }
.logo { display: inline-flex; gap: 2px; align-items: flex-end; height: 18px; }
.logo i { width: 4px; border-radius: 2px; background: var(--accent); }
.logo i:nth-child(1) { height: 60%; } .logo i:nth-child(2) { height: 100%; } .logo i:nth-child(3) { height: 40%; }
.title { font-weight: 700; letter-spacing: .02em; font-size: 16px; }
.dots { display: flex; gap: 4px; }
.dot { font-size: 10px; font-weight: 700; letter-spacing: .06em; padding: 3px 6px; border-radius: 6px; background: #2a1414; color: #ff7a6e; }
.dot.ok { background: #10291c; color: var(--ok); }
.dot.warn { background: #33280c; color: var(--solo); }
.dot.rec { background: var(--rec); color: #fff; animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: .55; } }

.globals { display: flex; gap: 8px; align-items: stretch; }
.big { min-width: 92px; height: 48px; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 800; font-size: 14px; letter-spacing: .05em; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
.big small { font-size: 9px; font-weight: 700; letter-spacing: .12em; color: var(--muted); }
.big.muted { background: var(--mute); border-color: var(--mute); color: #1a0705; box-shadow: 0 0 18px #ff5a4a55; }
.big.muted small { color: #4a120c; }
.big:disabled { opacity: .4; }

nav { display: flex; gap: 2px; background: var(--panel); border: 1px solid var(--line); padding: 3px; border-radius: 12px; }
nav button { height: 40px; padding: 0 16px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-weight: 600; }
nav button.active { background: var(--btn); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
main { flex: 1; min-height: 0; min-width: 0; }

@media (max-width: 720px) {
  header { gap: 8px; }
  .globals { order: 3; width: 100%; }
  .globals .big { flex: 1; min-width: 0; }
  nav { order: 4; width: 100%; }
  nav button { flex: 1; padding: 0 6px; }
}
/* performer page on a phone in landscape: a thin brand line (hold it to leave) */
@media (max-height: 500px) {
  .app.artist { gap: 4px; padding-top: max(4px, env(safe-area-inset-top)); }
  .app.artist .title { font-size: 12px; }
  .app.artist .logo { height: 12px; }
  .app.artist .dot { font-size: 9px; padding: 1px 5px; }
}
</style>
