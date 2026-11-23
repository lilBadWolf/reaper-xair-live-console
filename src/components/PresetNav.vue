<script setup>
import { computed } from 'vue';
import { fxCommand, cleanFxName } from '../lib/reaper.js';
import { openModal } from '../lib/modal.js';

const props = defineProps({
  trackIdx: { type: Number, required: true },
  fx: { type: Object, required: true },
  size: { type: String, default: 'sm' }, // 'sm' (mixer strip) | 'lg' (FX tab)
  showFxName: Boolean,
});
const hasPresets = computed(() => props.fx.pc > 0 || props.fx.preset);
const label = computed(() => props.fx.preset || 'No preset');
const counter = computed(() => (props.fx.pc > 0 && props.fx.pi >= 0 ? `${props.fx.pi + 1}/${props.fx.pc}` : ''));
const go = (op) => fxCommand(props.trackIdx, props.fx.i, op);
const pick = () => openModal('presets', { trackIdx: props.trackIdx, fxIdx: props.fx.i });
</script>

<template>
  <div class="pn" :class="[size, { bypassed: !fx.on || fx.off }]">
    <button class="nav" :disabled="!hasPresets" aria-label="Previous preset" @click="go('prev')">
      <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <button class="mid" :title="`${label} — tap for all presets`" @click="pick">
      <div v-if="showFxName" class="fxname">{{ cleanFxName(fx.name) }}</div>
      <div class="preset">{{ label }}<svg v-if="fx.list && fx.list.length" class="more" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
      <div v-if="counter" class="count">{{ counter }}</div>
    </button>
    <button class="nav" :disabled="!hasPresets" aria-label="Next preset" @click="go('next')">
      <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>
</template>

<style scoped>
.pn { display: flex; align-items: stretch; gap: 4px; width: 100%; }
.nav { flex: none; width: 28px; display: grid; place-items: center; padding: 0; border-radius: 8px; background: var(--btn); border: 1px solid var(--line); color: var(--text); }
.nav:active:not(:disabled) { background: var(--accent); color: #041311; }
.nav:disabled { opacity: .3; }
.nav svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.mid { flex: 1; min-width: 0; text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 2px 4px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; }
.mid:hover, .mid:active { background: #ffffff0a; }
.more { width: 12px; height: 12px; margin-left: 3px; vertical-align: -1px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; opacity: .7; }
.lg .more { width: 18px; height: 18px; vertical-align: -2px; }
.preset { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--accent); }
.count, .fxname { font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bypassed .preset { color: var(--muted); text-decoration: line-through; }
.sm { display: grid; grid-template-columns: 1fr auto 1fr; grid-template-rows: auto 28px; gap: 4px; }
.sm .mid { display: contents; }
.sm .preset { cursor: pointer; border-radius: 6px; }
.sm .preset:active { background: #ffffff0a; }
.sm .preset { grid-column: 1 / -1; grid-row: 1; font-size: 12px; line-height: 1.25; }
.sm .count { grid-column: 2; grid-row: 2; align-self: center; min-width: 26px; text-align: center; }
.sm .nav { width: auto; grid-row: 2; }
.sm .nav:first-child { grid-column: 1; }
.sm .nav:last-child { grid-column: 3; }
.lg { gap: 10px; }
.lg .nav { width: 64px; height: 64px; border-radius: 14px; }
.lg .nav svg { width: 28px; height: 28px; }
.lg .preset { font-size: 22px; }
.lg .count { font-size: 13px; }
.lg .fxname { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
</style>
