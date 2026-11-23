<script setup>
// Every preset for one FX: tap to switch instantly.
import { computed } from 'vue';
import Modal from './Modal.vue';
import { reaper, fxCommand, cleanFxName } from '../lib/reaper.js';
import { closeModal } from '../lib/modal.js';

const props = defineProps({ trackIdx: { type: Number, required: true }, fxIdx: { type: Number, required: true } });
const track = computed(() => reaper.tracks.find((t) => t.idx === props.trackIdx));
const fx = computed(() => (reaper.fx[props.trackIdx] || []).find((f) => f.i === props.fxIdx));

function pick(i) {
  fxCommand(props.trackIdx, props.fxIdx, 'set', i);
  setTimeout(closeModal, 180); // let the highlight register before closing
}
</script>

<template>
  <Modal :title="fx ? cleanFxName(fx.name) : 'Effect'" :subtitle="track?.name" width="620px" @close="closeModal">
    <template v-if="fx" #actions>
      <button class="byp" :class="{ off: !fx.on }" @click="fxCommand(trackIdx, fxIdx, 'bypass')">{{ fx.on ? 'ACTIVE' : 'BYPASSED' }}</button>
    </template>
    <div v-if="!fx" class="hint">This effect is gone.</div>
    <template v-else>
      <div v-if="fx.list.length" class="grid">
        <button v-for="(name, i) in fx.list" :key="i" class="p" :class="{ cur: i === fx.pi }" @click="pick(i)">
          <span class="n">{{ i + 1 }}</span><span class="name">{{ name || '(unnamed)' }}</span>
        </button>
      </div>
      <div v-else class="none">
        <p class="hint">No preset list for this effect (it uses the plugin's built-in presets, or the FX script needs restarting).</p>
        <div class="step">
          <button @click="fxCommand(trackIdx, fxIdx, 'prev')">‹ Previous</button>
          <div class="curname">{{ fx.preset || 'No preset' }}</div>
          <button @click="fxCommand(trackIdx, fxIdx, 'next')">Next ›</button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.p { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 10px 14px; text-align: left; border-radius: 14px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-size: 15px; font-weight: 600; }
.p .n { flex: none; width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; background: #ffffff0d; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.p .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.p.cur { background: #0e2b28; border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
.p.cur .n { background: var(--accent); color: #041311; }
.byp { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 11px; font-weight: 800; letter-spacing: .06em; background: #10241a; border: 1px solid #2c7a4f; color: var(--ok); }
.byp.off { background: var(--btn); border-color: var(--line); color: var(--muted); }
.hint { color: var(--muted); font-size: 14px; margin: 0 0 12px; }
.step { display: flex; align-items: center; gap: 10px; }
.step button { height: 52px; padding: 0 16px; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 700; }
.curname { flex: 1; text-align: center; font-size: 18px; font-weight: 700; color: var(--accent); }
@media (max-width: 620px) { .grid { grid-template-columns: 1fr 1fr; } }
</style>
