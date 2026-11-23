<script setup>
import { computed } from 'vue';
import Fader from './Fader.vue';
import Meter from './Meter.vue';
import PresetNav from './PresetNav.vue';
import { reaper, toggleMute, toggleSolo, toggleArm } from '../lib/reaper.js';
import SourceToggle from './SourceToggle.vue';
import { channelsFor, mappingLabel } from '../lib/mapping.js';
import { xr, sendAll, meterKeys } from '../lib/xr18.js';
import { channelAddr } from '../lib/settings.js';
import { go } from '../lib/router.js';

const props = defineProps({ track: { type: Object, required: true }, master: Boolean });
const chs = computed(() => channelsFor(props.track));
// The fader is the XR18 channel fader (what you actually hear); stereo pairs move together.
const xrFader = computed(() => (chs.value.length ? xr.values[channelAddr(chs.value[0], 'mix/fader')] : undefined));
const setXrFader = (p) => sendAll(chs.value.map((c) => channelAddr(c, 'mix/fader')), 'f', p);
const color = computed(() => props.track.color || (props.master ? '#e8eaed' : 'var(--accent)'));
// Show the first FX that has presets (or the first FX at all).
const fx = computed(() => {
  const list = reaper.fx[props.track.idx] || [];
  return list.find((f) => f.pc > 0) || list[0] || null;
});
</script>

<template>
  <div class="strip" :class="{ master, muted: track.muted }" :style="{ '--tc': color }">
    <div class="head">
      <button v-if="!master" class="name" :title="`Open ${track.name}`" @click="go('track', track.name)">
        <span class="t">{{ track.name }}</span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <div v-else class="name">{{ track.name }}</div>
      <div class="ch">{{ master ? 'REAPER' : `XR ${mappingLabel(chs)}` }}</div>
    </div>
    <div class="fxslot">
      <PresetNav v-if="fx" :track-idx="track.idx" :fx="fx" />
    </div>
    <div class="btns">
      <button class="tb mute" :class="{ on: track.muted }" @click="toggleMute(track.idx)">M</button>
      <button v-if="!master" class="tb solo" :class="{ on: track.soloed }" @click="toggleSolo(track.idx)">S</button>
      <button v-if="!master" class="tb arm" :class="{ on: track.armed }" @click="toggleArm(track.idx)">●</button>
    </div>
    <SourceToggle v-if="!master" :chs="chs" />
    <div class="body">
      <Fader :model-value="xrFader ?? 0" :color="color" :disabled="xrFader === undefined"
        :title="chs.length ? `XR18 ${mappingLabel(chs)} fader` : 'Not mapped to an XR18 channel'"
        @update:model-value="setXrFader" />
      <!-- what you actually hear: the XR18 channel this track feeds -->
      <Meter v-if="chs.length" :keys="chs.flatMap(meterKeys)" />
      <div v-else class="nometer" title="Not mapped to an XR18 channel" />
    </div>
  </div>
</template>

<style scoped>
.strip { flex: none; width: 112px; display: flex; flex-direction: column; gap: 8px; padding: 10px 8px 8px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); position: relative; overflow: hidden; }
.strip::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--tc); }
.strip.master { background: var(--panel-2); }
.strip.muted .body { opacity: .45; }
.head { display: flex; flex-direction: column; align-items: stretch; gap: 1px; }
.name { display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; padding: 2px 0; background: none; border: 0; border-radius: 6px; color: var(--text); font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button.name:hover, button.name:active { background: var(--btn); }
.name .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.name svg { flex: none; width: 12px; height: 12px; fill: none; stroke: var(--muted); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.ch { font-size: 10px; text-align: center; color: var(--muted); letter-spacing: .04em; }
.fxslot { height: 50px; display: flex; }
.btns { display: flex; gap: 4px; }
.tb { flex: 1; height: 30px; padding: 0; border-radius: 8px; font-weight: 700; font-size: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); }
.mute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.solo.on { background: var(--solo); border-color: var(--solo); color: #1a1400; }
.arm.on { background: #3a0d0d; border-color: var(--rec); color: var(--rec); }
.body { flex: 1; display: flex; gap: 6px; min-height: 220px; justify-content: center; }
.body :deep(.fader) { flex: 1; }
.nometer { flex: none; width: 8px; margin: 14px 0 calc(14px + 1.4em); border-radius: 3px; background: repeating-linear-gradient(0deg, var(--groove) 0 4px, transparent 4px 8px); opacity: .6; }
</style>
