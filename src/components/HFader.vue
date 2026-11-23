<script setup>
// Horizontal fader row (used for aux/FX sends). Relative drag, double-tap = 0 dB.
import { ref, computed } from 'vue';
import { posToDb, fmtDb } from '../lib/taper.js';

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  label: { type: String, default: '' },
  color: { type: String, default: 'var(--accent)' },
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const track = ref(null);
const dragging = ref(false);
let startX = 0, startPos = 0, width = 1, lastTap = 0;
const pct = computed(() => `${Math.max(0, Math.min(1, props.modelValue)) * 100}%`);

function down(e) {
  if (props.disabled) return;
  const now = Date.now();
  if (now - lastTap < 300) { emit('update:modelValue', 0.75); lastTap = 0; return; }
  lastTap = now;
  e.currentTarget.setPointerCapture(e.pointerId);
  width = track.value.getBoundingClientRect().width;
  startX = e.clientX;
  startPos = props.modelValue;
  dragging.value = true;
}
function move(e) {
  if (!dragging.value) return;
  const fine = e.shiftKey ? 0.25 : 1;
  emit('update:modelValue', Math.max(0, Math.min(1, startPos + ((e.clientX - startX) / width) * fine)));
}
const up = () => { dragging.value = false; };
</script>

<template>
  <div class="hf" :class="{ dragging, disabled }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div class="label">{{ label }}</div>
    <div ref="track" class="track">
      <div class="groove"><div class="fill" :style="{ width: pct, background: color }" /></div>
      <div class="zero" />
      <div class="cap" :style="{ left: pct }" />
    </div>
    <div class="val">{{ disabled ? '' : fmtDb(posToDb(modelValue)) }}</div>
  </div>
</template>

<style scoped>
.hf { flex: none; display: grid; grid-template-columns: 76px 1fr 44px; align-items: center; gap: 10px; height: 44px; touch-action: pan-y; user-select: none; cursor: ew-resize; }
.hf.disabled { opacity: .4; cursor: default; }
.label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { position: relative; height: 100%; margin: 0 12px; }
.groove { position: absolute; top: 50%; left: 0; right: 0; height: 6px; transform: translateY(-50%); border-radius: 3px; background: var(--groove); overflow: hidden; }
.fill { position: absolute; inset: 0 auto 0 0; opacity: .6; }
.zero { position: absolute; left: 75%; top: 25%; bottom: 25%; width: 1px; background: var(--muted); }
.cap { position: absolute; top: 50%; width: 22px; height: 30px; transform: translate(-50%, -50%); border-radius: 6px; background: linear-gradient(90deg, #3a414c, #22272f); box-shadow: 0 3px 10px #0009, inset 0 1px 0 #ffffff1f; }
.dragging .cap { box-shadow: 0 0 0 2px var(--accent), 0 4px 12px #000a; }
.val { font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
</style>
