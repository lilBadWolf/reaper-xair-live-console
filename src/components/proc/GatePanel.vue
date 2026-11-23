<script setup>
import Knob from '../Knob.vue';
import OnSwitch from './OnSwitch.vue';
import Seg from './Seg.vue';
import { useChannel } from './channel.js';
import { GATE } from '../../lib/xrparams.js';

const props = defineProps({ chs: { type: Array, required: true } });
const { get, set, toggle, knob } = useChannel(props);
</script>

<template>
  <div class="panel" :class="{ off: get(GATE.on) !== 1 }">
    <div class="ph">
      <h4>Gate</h4>
      <OnSwitch :on="get(GATE.on) === 1" :disabled="get(GATE.on) === undefined" @toggle="toggle(GATE.on)" />
    </div>
    <Seg :options="GATE.modes" :model-value="get(GATE.mode)" @update:model-value="(i) => set(GATE.mode, 'i', i)" />
    <div class="knobs">
      <Knob label="Thresh" v-bind="knob(GATE.thr)" />
      <Knob label="Range" v-bind="knob(GATE.range)" />
      <Knob label="Attack" v-bind="knob(GATE.attack)" />
      <Knob label="Hold" v-bind="knob(GATE.hold)" />
      <Knob label="Release" v-bind="knob(GATE.release)" />
    </div>
  </div>
</template>
