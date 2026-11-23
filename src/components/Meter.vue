<script setup>
// Peak meter (mono or stereo) on the fader scale. Drawn by lib/meters.js at 60 fps;
// `keys` names the level sources, e.g. ['r:3'] (REAPER track 3) or ['x:36','x:37'] (XR18 main L/R).
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { register } from '../lib/meters.js';

const props = defineProps({ keys: { type: Array, required: true }, horizontal: Boolean });
const els = ref([]);
let offs = [];
function bind() {
  offs.forEach((off) => off());
  offs = els.value.map((el, i) => register({
    key: props.keys[i], el, horiz: props.horizontal, mask: el.querySelector('.mask'), peak: el.querySelector('.hold'),
    db: -100, hold: -100, holdAt: 0, drawn: -1, hdrawn: -1, clip: false,
  }));
}
onMounted(bind);
watch(() => props.keys.join(), () => requestAnimationFrame(bind));
onBeforeUnmount(() => offs.forEach((off) => off()));
</script>

<template>
  <div class="meter" :class="{ stereo: keys.length > 1, horizontal }">
    <div v-for="k in keys" :key="k" ref="els" class="bar">
      <div class="mask" />
      <div class="hold" />
    </div>
  </div>
</template>

<style scoped>
.meter { flex: none; display: flex; gap: 2px; align-self: stretch; margin: 14px 0 calc(14px + 1.4em); }
.bar { position: relative; width: 8px; height: 100%; border-radius: 3px; overflow: hidden;
  background: linear-gradient(0deg, #1fc47a 0%, #33d17a 62%, #d8e04a 80%, #f2a33a 90%, #f0473d 100%); }
.stereo .bar { width: 6px; }
/* covers the unlit part; translated up by the level (GPU-composited, no layout) */
.mask { position: absolute; left: 0; right: 0; top: 0; height: 100%; background: var(--groove); will-change: transform; }
.mask::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 100%; } /* keeps size when moved */
.hold { position: absolute; left: 0; right: 0; top: 0; height: 2px; margin-top: -1px; background: #fff; opacity: 0; will-change: transform; }
.bar.clip .hold { background: #f0473d; height: 3px; }
/* horizontal: fills left → right */
.meter.horizontal { flex-direction: column; margin: 0; width: 100%; height: 100%; }
.horizontal .bar { width: 100%; height: auto; flex: 1; background: linear-gradient(90deg, #1fc47a 0%, #33d17a 62%, #d8e04a 80%, #f2a33a 90%, #f0473d 100%); }
.horizontal .mask { width: 100%; height: 100%; }
.horizontal .hold { top: 0; bottom: 0; left: 0; right: auto; width: 2px; height: auto; margin: 0 0 0 -1px; }
.horizontal .bar.clip .hold { width: 3px; height: auto; }
</style>
