<script setup>
// Three summary buttons (Gate / EQ / Comp) that open the editor modal.
import { computed, watch } from 'vue';
import { useChannel } from './channel.js';
import { GATE, DYN, EQ, EQ_BANDS, LOWCUT, RATIOS, eqResponse } from '../../lib/xrparams.js';
import { xr, query } from '../../lib/xr18.js';
import { chPrefix } from '../../lib/settings.js';
import { processingAddrs } from '../../lib/xrparams.js';
import { openModal } from '../../lib/modal.js';

const props = defineProps({ chs: { type: Array, required: true }, trackName: { type: String, default: '' } });
const { get } = useChannel(props);

// Ask the mixer for this channel's processing values (bridge keeps them in sync after that).
watch(() => [props.chs.join(','), xr.mixer.connected], () => {
  if (props.chs.length && xr.mixer.connected) query(props.chs.flatMap((c) => processingAddrs(chPrefix(c))));
}, { immediate: true });

const val = (p) => (get(p.suffix) === undefined ? null : p.to(get(p.suffix)));
const gate = computed(() => ({
  on: get(GATE.on) === 1,
  text: val(GATE.thr) === null ? '—' : `${GATE.modes[get(GATE.mode)] ?? ''} · ${val(GATE.thr).toFixed(0)} dB`,
}));
const comp = computed(() => ({
  on: get(DYN.on) === 1,
  text: val(DYN.thr) === null ? '—' : `${RATIOS[get('dyn/ratio')] ?? '?'}:1 · ${val(DYN.thr).toFixed(0)} dB`,
}));
const eq = computed(() => {
  const bands = EQ_BANDS.map((b) => {
    const t = get(EQ.type(b)), f = get(EQ.f.suffix(b)), g = get(EQ.g.suffix(b)), q = get(EQ.q.suffix(b));
    return [t, f, g, q].includes(undefined) ? null : { type: t, f: EQ.f.to(f), g: EQ.g.to(g), q: EQ.q.to(q) };
  });
  const on = get(EQ.on) === 1, lc = get(LOWCUT.on) === 1;
  if (bands.includes(null)) return { on, lc, path: '' };
  const pts = eqResponse(on ? bands : [], lc ? val(LOWCUT.f) : null, 48);
  const path = 'M' + pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${20 - Math.max(-18, Math.min(18, p.db)) / 18 * 18}`).join(' L');
  return { on, lc, path };
});
const open = (tab) => openModal('proc', { chs: props.chs, trackName: props.trackName, tab });
</script>

<template>
  <div class="pb">
    <button class="b" :class="{ on: gate.on }" @click="open('gate')">
      <span class="top"><i />Gate</span><span class="sum">{{ gate.on ? gate.text : 'Off' }}</span>
    </button>
    <button class="b" :class="{ on: eq.on || eq.lc }" @click="open('eq')">
      <span class="top"><i />EQ</span>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none"><line x1="0" y1="20" x2="100" y2="20" class="z" /><path :d="eq.path" /></svg>
    </button>
    <button class="b" :class="{ on: comp.on }" @click="open('comp')">
      <span class="top"><i />Comp</span><span class="sum">{{ comp.on ? comp.text : 'Off' }}</span>
    </button>
  </div>
</template>

<style scoped>
.pb { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.b { display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: 6px; height: 72px; padding: 10px 12px; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); text-align: left; }
.b:hover { border-color: #3a424e; }
.top { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
.top i { width: 7px; height: 7px; border-radius: 50%; background: #3a414c; }
.b.on .top i { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.sum { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.b.on .sum { color: var(--text); }
svg { width: 100%; height: 26px; }
svg path { fill: none; stroke: var(--muted); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
.b.on svg path { stroke: var(--accent); }
svg .z { stroke: #ffffff14; vector-effect: non-scaling-stroke; }
</style>
