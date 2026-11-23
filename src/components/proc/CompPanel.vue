<script setup>
import { computed } from 'vue';
import Knob from '../Knob.vue';
import OnSwitch from './OnSwitch.vue';
import Seg from './Seg.vue';
import { useChannel } from './channel.js';
import { DYN, RATIOS } from '../../lib/xrparams.js';

const props = defineProps({ chs: { type: Array, required: true } });
const { get, set, toggle, knob } = useChannel(props);

const ratioIdx = computed(() => get('dyn/ratio'));
const ratioKnob = computed(() => ({
  modelValue: (ratioIdx.value ?? 0) / (RATIOS.length - 1),
  display: ratioIdx.value === undefined ? '—' : `${RATIOS[ratioIdx.value]}:1`,
  steps: RATIOS.length,
  def: 5 / (RATIOS.length - 1),
  disabled: ratioIdx.value === undefined,
  'onUpdate:modelValue': (v) => set('dyn/ratio', 'i', Math.round(v * (RATIOS.length - 1))),
}));

// Static transfer curve: input -60..0 dB -> output, with knee and makeup gain.
const curve = computed(() => {
  const thr = DYN.thr.to(get(DYN.thr.suffix) ?? 1);
  const ratio = RATIOS[ratioIdx.value ?? 0];
  const knee = DYN.knee.to(get(DYN.knee.suffix) ?? 0) * 2; // approx. knee width in dB
  const gain = DYN.mgain.to(get(DYN.mgain.suffix) ?? 0);
  const expand = get(DYN.mode) === 1;
  const out = (x) => {
    const d = x - thr;
    let y;
    if (expand) y = d < 0 ? thr + d * ratio : x;
    else if (knee > 0 && Math.abs(d) <= knee / 2) y = x + ((1 / ratio - 1) * (d + knee / 2) ** 2) / (2 * knee);
    else y = d > 0 ? thr + d / ratio : x;
    return y + gain;
  };
  const pts = [];
  for (let x = -60; x <= 0; x += 1) pts.push(`${((x + 60) / 60) * 100},${100 - Math.max(0, Math.min(100, ((out(x) + 60) / 60) * 100))}`);
  return { d: `M${pts.join(' L')}`, tx: ((thr + 60) / 60) * 100 };
});
</script>

<template>
  <div class="panel" :class="{ off: get(DYN.on) !== 1 }">
    <div class="ph">
      <h4>Compressor</h4>
      <OnSwitch :on="get(DYN.on) === 1" :disabled="get(DYN.on) === undefined" @toggle="toggle(DYN.on)" />
    </div>
    <div class="row">
      <svg class="tf" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0,100 L100,0" class="ref" />
        <line :x1="curve.tx" y1="0" :x2="curve.tx" y2="100" class="thr" />
        <path :d="curve.d" class="curve" />
      </svg>
      <div class="opts">
        <Seg :options="DYN.modes" :model-value="get(DYN.mode)" @update:model-value="(i) => set(DYN.mode, 'i', i)" />
        <Seg :options="DYN.dets" :model-value="get(DYN.det)" @update:model-value="(i) => set(DYN.det, 'i', i)" />
        <OnSwitch label="AUTO" :on="get(DYN.auto) === 1" :disabled="get(DYN.auto) === undefined" @toggle="toggle(DYN.auto)" />
      </div>
    </div>
    <div class="knobs">
      <Knob label="Thresh" v-bind="knob(DYN.thr)" />
      <Knob label="Ratio" v-bind="ratioKnob" />
      <Knob label="Knee" v-bind="knob(DYN.knee)" />
      <Knob label="Gain" v-bind="knob(DYN.mgain)" />
      <Knob label="Attack" v-bind="knob(DYN.attack)" />
      <Knob label="Hold" v-bind="knob(DYN.hold)" />
      <Knob label="Release" v-bind="knob(DYN.release)" />
      <Knob label="Mix" v-bind="knob(DYN.mix)" />
    </div>
  </div>
</template>

<style scoped>
.row { display: flex; gap: 12px; align-items: center; }
.tf { width: 96px; height: 96px; flex: none; background: var(--groove); border-radius: 10px; }
.ref { stroke: #ffffff18; stroke-width: 1; fill: none; vector-effect: non-scaling-stroke; }
.thr { stroke: #ffffff30; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.curve { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.opts { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
</style>
