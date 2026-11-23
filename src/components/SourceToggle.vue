<script setup>
// Per-channel XR18 input source: LINE (analog in) vs USB (return from REAPER).
import { computed } from 'vue';
import { xr, isUsb, setUsb } from '../lib/xr18.js';
import { returnAddr } from '../lib/settings.js';

const props = defineProps({ chs: { type: Array, required: true }, size: { type: String, default: 'sm' } });
const known = computed(() => xr.mixer.connected && props.chs.length && props.chs.every((c) => xr.values[returnAddr(c)] !== undefined));
const state = computed(() => {
  if (!known.value) return 'unknown';
  const u = props.chs.map(isUsb);
  return u.every(Boolean) ? 'usb' : u.some(Boolean) ? 'mixed' : 'line';
});
const label = computed(() => ({ usb: 'USB', line: 'LINE', mixed: 'MIXED', unknown: '—' })[state.value]);
const toggle = () => setUsb(props.chs, state.value !== 'usb');
</script>

<template>
  <button class="src" :class="[state, size]" :disabled="!known" :title="state === 'usb' ? 'Input is the USB return from REAPER — tap for direct line' : 'Input is the direct line — tap for USB return'" @click="toggle">
    <small>SOURCE</small><span>{{ label }}</span>
  </button>
</template>

<style scoped>
.src { display: flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 6px; border-radius: 8px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); font-weight: 700; font-size: 12px; letter-spacing: .05em; width: 100%; }
.src small { font-size: 8px; letter-spacing: .12em; opacity: .7; }
.src.usb { background: var(--usb-bg); border-color: var(--usb); color: var(--usb); }
.src.line { background: #10241a; border-color: #2c7a4f; color: var(--ok); }
.src.mixed { background: #33280c; border-color: #6b4d12; color: var(--solo); }
.src:disabled { opacity: .4; }
.src.lg { height: 52px; font-size: 16px; border-radius: 12px; flex-direction: column; gap: 0; }
.src.lg small { font-size: 9px; }
</style>
