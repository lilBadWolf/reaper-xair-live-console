<script setup>
// Buses (monitor mixes): pick a bus, then every source's send into it ("sends on faders"),
// plus that bus's master fader, mute and meter. All values are the XR18's own.
import { computed } from 'vue';
import Fader from '../components/Fader.vue';
import Meter from '../components/Meter.vue';
import { xr, send, busName, meterKeys, busMeterKey, fxRtnMeterKeys } from '../lib/xr18.js';
import { settings, chPrefix, ALL_CHANNELS, chLabel } from '../lib/settings.js';
import { reaper } from '../lib/reaper.js';
import { channelsFor } from '../lib/mapping.js';
import { posToDb, fmtDb } from '../lib/taper.js';

const BUSES = [1, 2, 3, 4, 5, 6];
const bus = computed(() => (BUSES.includes(settings.bus) ? settings.bus : 1));
const bb = computed(() => String(bus.value).padStart(2, '0'));
const v = (a) => xr.values[a];

// stereo-linked pair (odd+even) acts as one bus on the XR18
const linkOf = (b) => { const o = b % 2 ? b : b - 1; return v(`/config/buslink/${o}-${o + 1}`) === 1 ? [o, o + 1] : [b]; };
const busMeter = (b) => linkOf(b).map(busMeterKey);
const busFader = (b) => v(`/bus/${b}/mix/fader`);
const busOn = (b) => v(`/bus/${b}/mix/on`);

// REAPER track feeding an XR18 channel (for its color/name)
const trackFor = (ch) => reaper.tracks.find((t) => t.idx > 0 && channelsFor(t).includes(ch));

const sources = computed(() => {
  const list = ALL_CHANNELS.map((ch) => {
    const t = trackFor(ch);
    const name = v(`${chPrefix(ch)}/config/name`) || '';
    return {
      id: ch, label: chLabel(ch), name: name || t?.name || '', color: t?.color || null,
      prefix: chPrefix(ch), meter: meterKeys(ch), named: !!name || !!t,
    };
  });
  for (let r = 1; r <= 4; r++) {
    list.push({ id: `fx${r}`, label: `FX ${r}`, name: v(`/rtn/${r}/config/name`) || `FX ${r} return`, color: '#9b8cff',
      prefix: `/rtn/${r}`, meter: fxRtnMeterKeys(r), named: true, fx: true });
  }
  return list.map((s) => ({ ...s, on: v(`${s.prefix}/mix/on`), level: v(`${s.prefix}/mix/${bb.value}/level`) }))
    .filter((s) => settings.busShowAll || s.named || (s.level ?? 0) > 0);
});

function rename(b) {
  const name = prompt(`Name for bus ${b} (shown on the XR18 too):`, v(`/bus/${b}/config/name`) || '');
  if (name !== null) send(`/bus/${b}/config/name`, 's', name.slice(0, 12));
}
</script>

<template>
  <div class="buses">
    <div v-if="!xr.mixer.connected" class="warn">XR18 not connected.</div>

    <!-- bus picker -->
    <div class="picker">
      <button v-for="b in BUSES" :key="b" class="bus" :class="{ sel: b === bus, muted: busOn(b) === 0 }" @click="settings.bus = b">
        <span class="bn">{{ b }}</span>
        <span class="bt">
          <span class="bname">{{ busName(b) }}<i v-if="linkOf(b).length > 1" class="link">ST</i></span>
          <span class="blvl">{{ busOn(b) === 0 ? 'MUTED' : busFader(b) === undefined ? '—' : fmtDb(posToDb(busFader(b))) + ' dB' }}</span>
        </span>
        <span class="bmeter"><Meter :keys="busMeter(b)" horizontal /></span>
      </button>
    </div>

    <div class="mixrow">
      <!-- every source's send into the selected bus -->
      <div class="scroller">
        <div v-for="s in sources" :key="s.id" class="strip" :class="{ chmuted: s.on === 0, fx: s.fx }" :style="{ '--tc': s.color || 'var(--line)' }">
          <div class="num">{{ s.label }}</div>
          <div class="name" :title="s.name">{{ s.name || '—' }}</div>
          <div class="state">{{ s.on === 0 ? 'CH MUTED' : '' }}</div>
          <div class="body">
            <Fader :model-value="s.level ?? 0" :color="s.color || 'var(--accent)'" :disabled="s.level === undefined" :marks="false"
              @update:model-value="(p) => send(`${s.prefix}/mix/${bb}/level`, 'f', p)" />
            <Meter :keys="s.meter" />
          </div>
        </div>
        <button class="showall" @click="settings.busShowAll = !settings.busShowAll">{{ settings.busShowAll ? 'Hide unused' : 'Show all channels' }}</button>
      </div>

      <!-- bus master -->
      <div class="master" :class="{ muted: busOn(bus) === 0 }">
        <div class="num">BUS {{ bus }}</div>
        <button class="mname" title="Rename bus" @click="rename(bus)">{{ busName(bus) }} <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg></button>
        <button class="mute" :class="{ on: busOn(bus) === 0 }" :disabled="busOn(bus) === undefined" @click="send(`/bus/${bus}/mix/on`, 'i', busOn(bus) === 0 ? 1 : 0)">
          {{ busOn(bus) === 0 ? 'MUTED' : 'MUTE' }}
        </button>
        <div class="body">
          <Fader :model-value="busFader(bus) ?? 0" color="#e8eaed" :disabled="busFader(bus) === undefined" @update:model-value="(p) => send(`/bus/${bus}/mix/fader`, 'f', p)" />
          <Meter :keys="busMeter(bus)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.buses { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.warn { background: #3a2a0c; border: 1px solid #6b4d12; color: #f5cf7a; padding: 10px 14px; border-radius: 12px; font-size: 14px; }

.picker { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.bus { position: relative; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto 6px; gap: 6px 10px; align-items: center; padding: 10px 12px 8px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); color: var(--text); text-align: left; min-width: 0; }
.bus.sel { border-color: var(--accent); background: #0e2b28; box-shadow: 0 0 0 1px var(--accent) inset; }
.bn { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--btn); font-weight: 800; color: var(--muted); }
.sel .bn { background: var(--accent); color: #041311; }
.bt { min-width: 0; display: flex; flex-direction: column; }
.bname { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link { font-style: normal; font-size: 9px; font-weight: 800; margin-left: 6px; padding: 1px 4px; border-radius: 4px; background: var(--usb-bg); color: var(--usb); }
.blvl { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.bus.muted .blvl { color: var(--mute); font-weight: 700; }
.bmeter { grid-column: 1 / -1; height: 6px; display: flex; }

.mixrow { flex: 1; display: flex; gap: 10px; min-height: 0; }
.scroller { flex: 1; min-width: 0; display: flex; gap: 6px; overflow-x: auto; padding-bottom: 3px; }
.strip { flex: none; width: 84px; display: flex; flex-direction: column; gap: 4px; padding: 8px 6px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; position: relative; overflow: hidden; }
.strip::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--tc); }
.strip.fx { background: #171522; }
.num { font-size: 11px; color: var(--muted); text-align: center; font-variant-numeric: tabular-nums; }
.name { font-size: 12px; font-weight: 650; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { height: 14px; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-align: center; color: var(--mute); }
.strip.chmuted .body { opacity: .45; }
.body { flex: 1; display: flex; gap: 4px; min-height: 200px; }
.body :deep(.fader) { flex: 1; }
.showall { flex: none; align-self: center; writing-mode: vertical-rl; padding: 12px 8px; border-radius: 10px; background: none; border: 1px dashed var(--line); color: var(--muted); font-size: 12px; font-weight: 600; }

.master { flex: none; width: 124px; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--accent); }
.master .num { color: var(--accent); font-weight: 800; letter-spacing: .08em; }
.mname { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 2px; border: 0; border-radius: 6px; background: none; color: var(--text); font-size: 14px; font-weight: 750; white-space: nowrap; overflow: hidden; }
.mname svg { flex: none; width: 12px; height: 12px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linejoin: round; }
.mute { height: 34px; border-radius: 9px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); font-weight: 800; font-size: 12px; letter-spacing: .06em; }
.mute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.master.muted .body { opacity: .45; }

@media (max-width: 900px) { .picker { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 620px) {
  .picker { gap: 4px; }
  .bus { padding: 8px; gap: 4px 6px; }
  .bn { width: 24px; height: 24px; font-size: 12px; }
  .bname { font-size: 12px; }
  .master { width: 96px; }
}
</style>
