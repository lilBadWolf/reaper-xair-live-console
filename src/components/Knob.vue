<script setup>
// Rotary knob over a normalized 0..1 value. Vertical drag (relative), shift = fine,
// double-tap = default. `steps` quantizes (e.g. ratio list).
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  label: { type: String, default: '' },
  display: { type: String, default: '' },
  def: { type: Number, default: null },
  steps: { type: Number, default: 0 },
  bipolar: Boolean,
  disabled: Boolean,
  color: { type: String, default: 'var(--accent)' },
});
const emit = defineEmits(['update:modelValue']);
const dragging = ref(false);
let startY = 0, startV = 0, lastTap = 0;

const v = computed(() => Math.max(0, Math.min(1, props.modelValue ?? 0)));
const R = 20, CX = 26, CY = 26, A0 = -225, SWEEP = 270;
const pt = (deg) => { const r = (deg * Math.PI) / 180; return [CX + R * Math.cos(r), CY + R * Math.sin(r)]; };
const arc = (from, to) => {
  if (Math.abs(to - from) < 0.01) return '';
  const [x0, y0] = pt(from), [x1, y1] = pt(to);
  return `M${x0} ${y0} A${R} ${R} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${x1} ${y1}`;
};
const track = arc(A0, A0 + SWEEP);
const valueArc = computed(() => {
  const at = A0 + SWEEP * v.value;
  return props.bipolar ? arc(Math.min(A0 + SWEEP / 2, at), Math.max(A0 + SWEEP / 2, at)) : arc(A0, at);
});
const needle = computed(() => {
  const r = ((A0 + SWEEP * v.value) * Math.PI) / 180;
  return [CX + 9 * Math.cos(r), CY + 9 * Math.sin(r), CX + 15 * Math.cos(r), CY + 15 * Math.sin(r)];
});

function quant(x) { return props.steps > 1 ? Math.round(x * (props.steps - 1)) / (props.steps - 1) : x; }
function down(e) {
  if (props.disabled) return;
  const now = Date.now();
  if (props.def !== null && now - lastTap < 300) { emit('update:modelValue', props.def); lastTap = 0; return; }
  lastTap = now;
  e.currentTarget.setPointerCapture(e.pointerId);
  startY = e.clientY; startV = v.value; dragging.value = true;
}
function move(e) {
  if (!dragging.value) return;
  const nv = quant(Math.max(0, Math.min(1, startV + ((startY - e.clientY) / 180) * (e.shiftKey ? 0.2 : 1))));
  if (nv !== v.value) emit('update:modelValue', nv);
}
const up = () => { dragging.value = false; };
</script>

<template>
  <div class="knob" :class="{ dragging, disabled }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div class="label">{{ label }}</div>
    <svg viewBox="0 0 52 52">
      <circle :cx="CX" :cy="CY" r="14" class="body" />
      <path :d="track" class="track" />
      <path :d="valueArc" class="val" :style="{ stroke: color }" />
      <line :x1="needle[0]" :y1="needle[1]" :x2="needle[2]" :y2="needle[3]" class="needle" />
    </svg>
    <div class="display">{{ display }}</div>
  </div>
</template>

<style scoped>
.knob { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 64px; touch-action: none; user-select: none; cursor: ns-resize; }
.knob.disabled { opacity: .35; cursor: default; }
svg { width: 52px; height: 52px; overflow: visible; }
.body { fill: #252b34; stroke: #ffffff10; }
.track { fill: none; stroke: var(--groove); stroke-width: 4; stroke-linecap: round; }
.val { fill: none; stroke-width: 4; stroke-linecap: round; }
.needle { stroke: var(--text); stroke-width: 2.2; stroke-linecap: round; }
.dragging .body { stroke: var(--accent); }
.label { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.display { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
</style>
