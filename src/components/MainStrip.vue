<script setup>
// XR18 Main LR strip for the Mixer page: the real output level of the mixer.
import { computed } from 'vue';
import Fader from './Fader.vue';
import Meter from './Meter.vue';
import { xr, send, xrMuted, toggleXrMute, MAIN_METER } from '../lib/xr18.js';

const fader = computed(() => xr.values['/lr/mix/fader']);
</script>

<template>
  <div class="strip" :class="{ muted: xrMuted, offline: !xr.mixer.connected }">
    <div class="head">
      <div class="name">MAIN LR</div>
      <div class="ch">{{ xr.mixer.connected ? 'XR18' : 'XR18 offline' }}</div>
    </div>
    <button class="tb mute" :class="{ on: xrMuted }" :disabled="!xr.mixer.connected" @click="toggleXrMute">MUTE</button>
    <div class="body">
      <Fader :model-value="fader ?? 0" color="#e8eaed" :disabled="fader === undefined" @update:model-value="(p) => send('/lr/mix/fader', 'f', p)" />
      <Meter :keys="MAIN_METER" />
    </div>
  </div>
</template>

<style scoped>
.strip { flex: none; width: 118px; display: flex; flex-direction: column; gap: 8px; padding: 10px 8px 8px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--line); position: relative; overflow: hidden; }
.strip::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: #e8eaed; }
.strip.muted .body, .strip.offline .body { opacity: .45; }
.head { display: flex; flex-direction: column; gap: 1px; }
.name { font-size: 13px; font-weight: 700; text-align: center; padding: 2px 0; letter-spacing: .04em; }
.ch { font-size: 10px; text-align: center; color: var(--muted); letter-spacing: .04em; }
.tb { height: 30px; padding: 0; border-radius: 8px; font-weight: 700; font-size: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); }
.mute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.tb:disabled { opacity: .4; }
.body { flex: 1; display: flex; gap: 6px; min-height: 220px; justify-content: center; }
.body :deep(.fader) { flex: 1; }
</style>
