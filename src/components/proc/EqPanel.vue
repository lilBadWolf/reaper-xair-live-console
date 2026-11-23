<script setup>
// 4-band EQ + low cut with a live response graph. Drag a band's dot to set
// frequency (x) and gain (y); tap a dot or chip to edit it with the knobs.
import { ref, computed } from 'vue';
import Knob from '../Knob.vue';
import OnSwitch from './OnSwitch.vue';
import { useChannel } from './channel.js';
import { EQ, EQ_BANDS, EQ_TYPES, LOWCUT, eqResponse, fmtHz } from '../../lib/xrparams.js';

const props = defineProps({ chs: { type: Array, required: true } });
const { get, set, toggle, knob } = useChannel(props);

const COLORS = ['#ff7a6e', '#f5c542', '#3ddc84', '#5aa9ff'];
const sel = ref(1); // band 1-4, or 'lc'
const RANGE = 18;   // graph shows ±18 dB

const eqOn = computed(() => get(EQ.on) === 1);
const lcOn = computed(() => get(LOWCUT.on) === 1);
const bands = computed(() => EQ_BANDS.map((b) => {
  const type = get(EQ.type(b)), fn = get(EQ.f.suffix(b)), gn = get(EQ.g.suffix(b)), qn = get(EQ.q.suffix(b));
  if ([type, fn, gn, qn].includes(undefined)) return null;
  return { b, type, fn, gn, f: EQ.f.to(fn), g: EQ.g.to(gn), q: EQ.q.to(qn), color: COLORS[b - 1] };
}));
const ready = computed(() => bands.value.every(Boolean));
const hasGain = (type) => type >= 1 && type <= 4;

const yOf = (db) => 50 - (Math.max(-RANGE, Math.min(RANGE, db)) / RANGE) * 50; // percent
const curve = computed(() => {
  if (!ready.value) return { line: '', area: '' };
  const pts = eqResponse(eqOn.value ? bands.value : [], lcOn.value ? LOWCUT.f.to(get(LOWCUT.f.suffix) ?? 0) : null);
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * 1000},${yOf(p.db) * 2}`);
  return { line: `M${xy.join(' L')}`, area: `M0,100 L${xy.join(' L')} L1000,100 Z` };
});
const handles = computed(() => {
  if (!ready.value) return [];
  const hs = bands.value.map((b) => ({ id: b.b, x: b.fn * 100, y: yOf(hasGain(b.type) ? b.g : 0), color: b.color, label: String(b.b) }));
  const lcn = get(LOWCUT.f.suffix);
  if (lcn !== undefined) hs.push({ id: 'lc', x: EQ.f.from(LOWCUT.f.to(lcn)) * 100, y: 50, color: '#c9ced6', label: 'LC' });
  return hs;
});
const gridF = [100, 1000, 10000].map((f) => ({ f, x: EQ.f.from(f) * 100, label: fmtHz(f) }));

// dragging handles
const box = ref(null);
let drag = null;
function down(h, e) {
  sel.value = h.id;
  e.currentTarget.setPointerCapture(e.pointerId);
  const r = box.value.getBoundingClientRect();
  drag = { h, r };
}
function move(e) {
  if (!drag) return;
  const { h, r } = drag;
  const xn = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (h.id === 'lc') {
    const hz = Math.max(20, Math.min(400, EQ.f.to(xn)));
    set(LOWCUT.f.suffix, 'f', LOWCUT.f.from(hz));
    return;
  }
  set(EQ.f.suffix(h.id), 'f', xn);
  const band = bands.value[h.id - 1];
  if (band && hasGain(band.type)) {
    const db = Math.max(-15, Math.min(15, ((0.5 - (e.clientY - r.top) / r.height) * 2) * RANGE));
    set(EQ.g.suffix(h.id), 'f', EQ.g.from(db));
  }
}
const up = () => { drag = null; };

const selBand = computed(() => (sel.value === 'lc' ? null : bands.value[sel.value - 1]));
const bandKnob = (param) => knob({ ...param, suffix: param.suffix(sel.value) });
</script>

<template>
  <div class="panel eq" :class="{ off: !eqOn && !lcOn }">
    <div class="ph">
      <h4>EQ</h4>
      <OnSwitch :on="eqOn" :disabled="get(EQ.on) === undefined" @toggle="toggle(EQ.on)" />
    </div>

    <div ref="box" class="graph" @pointermove="move" @pointerup="up" @pointercancel="up">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
        <line v-for="g in gridF" :key="g.f" :x1="g.x * 10" y1="0" :x2="g.x * 10" y2="100" class="grid" />
        <line v-for="d in [-12, -6, 6, 12]" :key="d" x1="0" :y1="yOf(d)" x2="1000" :y2="yOf(d)" class="grid" />
        <line x1="0" y1="50" x2="1000" y2="50" class="zero" />
        <path :d="curve.area" class="area" :class="{ dim: !eqOn }" />
        <path :d="curve.line" class="line" :class="{ dim: !eqOn }" />
      </svg>
      <span v-for="g in gridF" :key="g.f" class="fl" :style="{ left: `${g.x}%` }">{{ g.label }}</span>
      <span class="dl" style="top: 16.7%">+12</span><span class="dl" style="top: 83.3%">-12</span>
      <button v-for="h in handles" :key="h.id" class="h" :class="{ sel: sel === h.id, lc: h.id === 'lc', dimh: h.id === 'lc' ? !lcOn : !eqOn }"
        :style="{ left: `${Math.max(2.5, Math.min(97.5, h.x))}%`, top: `${h.y}%`, '--hc': h.color }" @pointerdown.stop="down(h, $event)">{{ h.label }}</button>
      <div v-if="!ready" class="wait">Loading EQ…</div>
    </div>

    <div class="chips">
      <button v-for="b in EQ_BANDS" :key="b" class="chip" :class="{ sel: sel === b }" :style="{ '--hc': COLORS[b - 1] }" @click="sel = b">
        {{ b }} <small v-if="bands[b - 1]">{{ EQ_TYPES[bands[b - 1].type] }}</small>
      </button>
      <button class="chip" :class="{ sel: sel === 'lc' }" style="--hc: #c9ced6" @click="sel = 'lc'">Low cut</button>
    </div>

    <div v-if="sel === 'lc'" class="edit">
      <OnSwitch :on="lcOn" :disabled="get(LOWCUT.on) === undefined" @toggle="toggle(LOWCUT.on)" />
      <div class="knobs"><Knob label="Freq" v-bind="knob(LOWCUT.f)" /></div>
    </div>
    <div v-else-if="selBand" class="edit">
      <select :value="selBand.type" @change="set(EQ.type(sel), 'i', +$event.target.value)">
        <option v-for="(t, i) in EQ_TYPES" :key="t" :value="i">{{ t }}</option>
      </select>
      <div class="knobs">
        <Knob label="Freq" v-bind="bandKnob(EQ.f)" :color="selBand.color" />
        <Knob label="Gain" v-bind="bandKnob(EQ.g)" bipolar :disabled="!hasGain(selBand.type)" :color="selBand.color" />
        <Knob label="Q" v-bind="bandKnob(EQ.q)" :color="selBand.color" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph { position: relative; height: 170px; border-radius: 10px; background: var(--groove); touch-action: pan-y; overflow: hidden; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.grid { stroke: #ffffff0d; vector-effect: non-scaling-stroke; }
.zero { stroke: #ffffff26; vector-effect: non-scaling-stroke; }
.line { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.area { fill: var(--accent); opacity: .12; }
.dim { opacity: .3; }
.area.dim { opacity: .04; }
.fl, .dl { position: absolute; font-size: 9px; color: var(--muted); pointer-events: none; }
.fl { bottom: 3px; transform: translateX(4px); }
.dl { left: 4px; transform: translateY(-50%); }
.h { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; padding: 0; border-radius: 50%; border: 2px solid var(--hc); background: #0b0d10cc; color: var(--hc); font-size: 10px; font-weight: 800; display: grid; place-items: center; cursor: grab; touch-action: none; }
.h.sel { background: var(--hc); color: #0b0d10; box-shadow: 0 0 0 4px #ffffff18; }
.h.lc { border-radius: 6px; width: 26px; font-size: 8px; }
.h.dimh { opacity: .45; }
.h::after { content: ''; position: absolute; inset: -10px; } /* bigger touch target */
.wait { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: 13px; }
.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip { height: 28px; padding: 0 10px; border-radius: 14px; background: var(--btn); border: 1px solid var(--line); color: var(--hc); font-weight: 700; font-size: 12px; }
.chip small { color: var(--muted); font-weight: 600; font-size: 10px; }
.chip.sel { border-color: var(--hc); background: #ffffff0a; }
.edit { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 13px; }
</style>
