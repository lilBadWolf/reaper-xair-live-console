<script setup>
// Per-track page for that channel's artist: presets, REAPER level, XR18 channel
// (source, mute, level) and the channel's sends to the aux (monitor) buses.
import { computed } from 'vue';
import Fader from '../components/Fader.vue';
import HFader from '../components/HFader.vue';
import Meter from '../components/Meter.vue';
import PresetNav from '../components/PresetNav.vue';
import SourceToggle from '../components/SourceToggle.vue';
import ProcButtons from '../components/proc/ProcButtons.vue';
import { reaper, setVolume, endVolumeTouch, toggleMute, toggleSolo, toggleArm, fxCommand } from '../lib/reaper.js';
import { xr, sendAll, busName, fxName, meterKeys } from '../lib/xr18.js';
import { channelAddr, chLabel } from '../lib/settings.js';
import { channelsFor, mappingOptions, mappingValue, setMapping } from '../lib/mapping.js';
import { linToPos, posToLin } from '../lib/taper.js';
import { route, go } from '../lib/router.js';
import { openModal } from '../lib/modal.js';

const list = computed(() => reaper.tracks.filter((t) => t.idx > 0));
const track = computed(() => list.value.find((t) => t.name === route.track));
const pos = computed(() => list.value.indexOf(track.value));
const prev = computed(() => list.value[pos.value - 1]);
const next = computed(() => list.value[pos.value + 1]);
const color = computed(() => track.value?.color || 'var(--accent)');
const fx = computed(() => (track.value ? reaper.fx[track.value.idx] || [] : []));

const chs = computed(() => channelsFor(track.value));
const xrOk = computed(() => xr.mixer.connected && chs.value.length > 0);
const val = (suffix) => xr.values[channelAddr(chs.value[0], suffix)];
const setAll = (suffix, t, v) => sendAll(chs.value.map((c) => channelAddr(c, suffix)), t, v);
const xrMuted = computed(() => val('mix/on') === 0);

const AUX = [1, 2, 3, 4, 5, 6];
const FXS = [7, 8, 9, 10];
const sendKey = (n) => `mix/${String(n).padStart(2, '0')}/level`;
</script>

<template>
  <div class="tv" :class="{ artist: route.artist }" :style="{ '--tc': color }">
    <div class="bar">
      <button v-if="!route.artist" class="icon" aria-label="Back to mixer" @click="go('mixer')"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div class="title">
        <span class="swatch" />
        <h2>{{ track ? track.name : route.track }}</h2>
        <span v-if="chs.length" class="sub">XR18 {{ chs.map(chLabel).join('+') }}</span>
      </div>
      <div v-if="!route.artist" class="pager">
        <button class="icon qrb" title="QR code for this page" @click="openModal('qr', { track: route.track })">
          <svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" /></svg>
        </button>
        <button class="icon" :disabled="!prev" :title="prev?.name" @click="go('track', prev.name)"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
        <button class="icon" :disabled="!next" :title="next?.name" @click="go('track', next.name)"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
      </div>
    </div>

    <div v-if="!track" class="empty">{{ reaper.connected ? `No track named “${route.track}”.` : 'Waiting for REAPER…' }}</div>

    <div v-else class="grid">
      <!-- REAPER -->
      <section v-if="!route.artist" class="card reaper">
        <h3>REAPER</h3>
        <div class="btns">
          <button class="tb mute" :class="{ on: track.muted }" @click="toggleMute(track.idx)">MUTE</button>
          <button class="tb solo" :class="{ on: track.soloed }" @click="toggleSolo(track.idx)">SOLO</button>
          <button class="tb arm" :class="{ on: track.armed }" @click="toggleArm(track.idx)">REC</button>
        </div>
        <div class="vf" :class="{ dim: track.muted }">
          <Fader :model-value="linToPos(track.vol)" :color="color" @update:model-value="(p) => setVolume(track.idx, posToLin(p))" @touchend="endVolumeTouch(track.idx)" />
          <Meter v-if="chs.length" :keys="chs.flatMap(meterKeys)" />
        </div>
      </section>

      <!-- Artist: mute my channel (XR18 = what's actually heard, FOH + monitors) -->
      <section v-if="route.artist" class="card amute-card">
        <button class="amute" :class="{ on: xrMuted }" :disabled="!xrOk || val('mix/on') === undefined" @click="setAll('mix/on', 'i', xrMuted ? 1 : 0)">
          <svg v-if="xrMuted" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          <span class="big">{{ !xrOk ? 'XR18 offline' : xrMuted ? 'MUTED' : 'LIVE' }}</span>
          <span class="small">{{ xrMuted ? 'Tap to unmute' : 'Tap to mute my channel' }}</span>
        </button>
      </section>

      <!-- Effects -->
      <section class="card fx">
        <h3>Effects</h3>
        <div v-if="!fx.length" class="hint">{{ reaper.scriptAlive ? 'No effects on this track.' : 'FX script not running.' }}</div>
        <div v-for="f in fx" :key="f.i" class="fxrow">
          <PresetNav :track-idx="track.idx" :fx="f" size="lg" show-fx-name />
          <button class="byp" :class="{ off: !f.on }" :title="f.on ? 'Bypass' : 'Enable'" @click="fxCommand(track.idx, f.i, 'bypass')">
            <svg viewBox="0 0 24 24"><path d="M12 3v8M6.3 7a8 8 0 1 0 11.4 0" /></svg>
          </button>
        </div>
      </section>

      <!-- XR18 channel -->
      <section v-if="!route.artist" class="card xr">
        <h3>XR18 channel</h3>
        <label class="map">Channel
          <select :value="mappingValue(track.name)" @change="setMapping(track.name, $event.target.value)">
            <option v-for="o in mappingOptions()" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <template v-if="xrOk">
          <div class="row2">
            <SourceToggle :chs="chs" size="lg" />
            <button class="bigmute" :class="{ on: xrMuted }" @click="setAll('mix/on', 'i', xrMuted ? 1 : 0)"><small>XR18</small>{{ xrMuted ? 'MUTED' : 'MUTE' }}</button>
          </div>
          <HFader label="Main LR" :model-value="val('mix/fader') ?? 0" :color="color" @update:model-value="(p) => setAll('mix/fader', 'f', p)" />
          <ProcButtons :chs="chs" :track-name="track.name" />
        </template>
        <div v-else class="hint">{{ !xr.mixer.connected ? 'XR18 not connected.' : 'This track isn’t mapped to an XR18 channel.' }}</div>
      </section>

      <!-- Sends -->
      <section v-if="xrOk" class="card sends">
        <h3>{{ route.artist ? 'In the monitors' : 'Aux sends' }} <span class="hint">{{ route.artist ? `how loud ${track.name} is in each monitor mix` : 'monitor mixes' }}</span></h3>
        <HFader v-for="b in AUX" :key="b" :label="busName(b)" :model-value="val(sendKey(b)) ?? 0" :disabled="val(sendKey(b)) === undefined"
          @update:model-value="(p) => setAll(sendKey(b), 'f', p)" />
        <h3 v-if="!route.artist" class="sub2">FX sends</h3>
        <HFader v-for="n in (route.artist ? [] : FXS)" :key="n" :label="fxName(n - 6)" color="#9b8cff" :model-value="val(sendKey(n)) ?? 0" :disabled="val(sendKey(n)) === undefined"
          @update:model-value="(p) => setAll(sendKey(n), 'f', p)" />
      </section>

    </div>
  </div>
</template>

<style scoped>
.tv { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.bar { display: flex; align-items: center; gap: 10px; }
.title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
.swatch { flex: none; width: 12px; height: 12px; border-radius: 4px; background: var(--tc); align-self: center; }
h2 { margin: 0; font-size: 22px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { color: var(--muted); font-size: 13px; white-space: nowrap; }
.pager { display: flex; gap: 6px; }
.icon { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); }
.icon:disabled { opacity: .3; }
.icon svg, .byp svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

.grid { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding-bottom: 24px; display: grid; gap: 12px; align-content: start;
  grid-template-columns: 180px minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: "reaper fx sends" "reaper xr sends"; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: min-content; position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--tc); opacity: .7; }
.reaper { grid-area: reaper; min-height: 460px; }
.fx { grid-area: fx; }
.xr { grid-area: xr; }
.sends { grid-area: sends; }
h3 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); font-weight: 700; display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
h3 .hint { text-transform: none; letter-spacing: 0; }
.sub2 { margin-top: 8px; }
.hint { color: var(--muted); font-size: 13px; font-weight: 400; }
.empty { margin: auto; color: var(--muted); }

.btns { display: flex; gap: 4px; }
.tb { flex: 1; height: 36px; padding: 0; border-radius: 9px; font-weight: 700; font-size: 11px; letter-spacing: .04em; background: var(--btn); border: 1px solid var(--line); color: var(--muted); }
.mute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.solo.on { background: var(--solo); border-color: var(--solo); color: #1a1400; }
.arm.on { background: #3a0d0d; border-color: var(--rec); color: var(--rec); }
.vf { flex: 1; display: flex; gap: 8px; justify-content: center; }
.vf :deep(.fader) { flex: 1; }
.vf.dim { opacity: .45; }

.fxrow { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.fxrow:nth-of-type(1) { border-top: 0; }
.byp { flex: none; width: 44px; height: 44px; border-radius: 12px; padding: 0; display: grid; place-items: center; background: var(--btn); border: 1px solid var(--line); color: var(--accent); }
.byp.off { color: var(--muted); background: transparent; }

.map { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--muted); }
select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; font: inherit; max-width: 60%; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bigmute { height: 52px; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 800; font-size: 16px; letter-spacing: .05em; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
.bigmute small { font-size: 9px; letter-spacing: .12em; color: var(--muted); }
.bigmute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.bigmute.on small { color: #4a120c; }

.artist .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "mute mute" "fx sends"; }
.amute-card { grid-area: mute; padding: 0; }
.amute-card::before { display: none; }
.amute { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; align-items: center; column-gap: 14px; width: 100%; min-height: 84px; padding: 14px 20px;
  border: 0; border-radius: 16px; background: #10241a; color: var(--ok); text-align: left; transition: background .15s, color .15s; }
.amute svg { grid-row: 1 / 3; width: 40px; height: 40px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.amute .big { font-size: 26px; font-weight: 800; letter-spacing: .08em; line-height: 1.1; }
.amute .small { font-size: 13px; font-weight: 600; opacity: .75; }
.amute.on { background: var(--mute); color: #1a0705; box-shadow: 0 0 30px #ff5a4a55; animation: mutepulse 1.6s ease-in-out infinite; }
.amute:disabled { background: var(--btn); color: var(--muted); }
@keyframes mutepulse { 50% { box-shadow: 0 0 8px #ff5a4a33; } }
.qrb svg { fill: currentColor; stroke: none; }
@media (max-width: 1000px) {
  .artist .grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "mute" "fx" "sends"; }
  .grid { grid-template-columns: 150px minmax(0, 1fr); grid-template-rows: auto 1fr auto; grid-template-areas: "reaper fx" "reaper xr" "sends sends"; }
}
@media (max-width: 620px) {
  .grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "fx" "xr" "reaper" "sends"; }
  .reaper { min-height: 360px; }
  .vf { width: 160px; align-self: center; }
  h2 { font-size: 18px; }
}
</style>
