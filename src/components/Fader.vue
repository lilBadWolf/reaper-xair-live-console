<script setup>
// Vertical fader, value = position 0..1 (see lib/taper.js).
// Drag is relative (grabbing never jumps the level — safe live); double-tap = 0 dB.
import { ref, computed } from 'vue';
import { posToDb, fmtDb, dbToPos, FADER_MARKS } from '../lib/taper.js';

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  color: { type: String, default: 'var(--accent)' },
  disabled: Boolean,
  marks: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue', 'touchstart', 'touchend']);

const track = ref(null);
const dragging = ref(false);
let startY = 0, startPos = 0, height = 1, lastTap = 0;

const pct = computed(() => `${(Math.max(0, Math.min(1, props.modelValue)) * 100).toFixed(2)}%`);
const scale = FADER_MARKS.map((db) => ({ db, pos: dbToPos(db) }));

function down(e) {
  if (props.disabled) return;
  const now = Date.now();
  if (now - lastTap < 300) { emit('update:modelValue', 0.75); lastTap = 0; return; }
  lastTap = now;
  e.currentTarget.setPointerCapture(e.pointerId);
  height = track.value.getBoundingClientRect().height;
  startY = e.clientY;
  startPos = props.modelValue;
  dragging.value = true;
  emit('touchstart');
}
function move(e) {
  if (!dragging.value) return;
  const fine = e.shiftKey ? 0.25 : 1;
  const p = Math.max(0, Math.min(1, startPos + ((startY - e.clientY) / height) * fine));
  emit('update:modelValue', p);
}
function up() {
  if (!dragging.value) return;
  dragging.value = false;
  emit('touchend');
}
</script>

<template>
  <div class="fader" :class="{ dragging, disabled }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div ref="track" class="track">
      <div v-if="marks" class="marks">
        <div v-for="m in scale" :key="m.db" class="mark" :class="{ zero: m.db === 0 }" :style="{ bottom: `${m.pos * 100}%` }">
          <span>{{ m.db > 0 ? '+' + m.db : m.db }}</span>
        </div>
      </div>
      <div class="groove"><div class="fill" :style="{ height: pct, background: color }" /></div>
      <div class="cap" :style="{ bottom: pct }"><i :style="{ background: color }" /></div>
    </div>
    <div class="readout">{{ fmtDb(posToDb(modelValue)) }}</div>
  </div>
</template>

<style scoped>
.fader { display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; touch-action: none; user-select: none; cursor: ns-resize; min-width: 44px; }
.fader.disabled { opacity: .4; cursor: default; }
.track { position: relative; flex: 1; width: 100%; margin: 14px 0; }
.groove { position: absolute; left: 50%; top: 0; bottom: 0; width: 6px; transform: translateX(-50%); border-radius: 3px; background: var(--groove); overflow: hidden; }
.fill { position: absolute; bottom: 0; left: 0; right: 0; opacity: .55; transition: height .05s linear; }
.marks { position: absolute; inset: 0; pointer-events: none; }
.mark { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--line); }
.mark span { position: absolute; left: 0; transform: translateY(-50%); font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums; }
.mark.zero { border-top-color: var(--muted); }
.mark.zero span { color: var(--text); }
.cap { position: absolute; left: 50%; width: 40px; height: 26px; transform: translate(-50%, 50%); border-radius: 6px;
  background: linear-gradient(180deg, #3a414c, #22272f); box-shadow: 0 4px 12px #0009, inset 0 1px 0 #ffffff1f; display: grid; place-items: center; transition: bottom .05s linear; }
.cap i { width: 70%; height: 2px; border-radius: 1px; }
.dragging .cap { box-shadow: 0 0 0 2px var(--accent), 0 6px 16px #000a; transition: none; }
.dragging .fill { transition: none; }
.readout { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text); min-height: 1em; }
</style>
