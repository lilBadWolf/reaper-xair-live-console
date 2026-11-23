<script setup>
import Fader from '../components/Fader.vue';
import SourceToggle from '../components/SourceToggle.vue';
import Meter from '../components/Meter.vue';
import { xr, xrChannels, send, xrMuted, toggleXrMute, meterKeys, MAIN_METER } from '../lib/xr18.js';
import { settings, channelAddr } from '../lib/settings.js';

const lrFader = () => xr.values['/lr/mix/fader'] ?? 0;
</script>

<template>
  <div class="xrview">
    <div v-if="!xr.bridge" class="warn">Can't reach the XR18 bridge. It's started by <code>live_console.lua</code>, or run <code>npm run bridge</code>.</div>
    <div v-else-if="!xr.mixer.connected" class="warn">Bridge running — looking for the XR18{{ xr.mixer.host ? ` at ${xr.mixer.host}` : ' on the network' }}…</div>

    <div class="row">
      <div class="scroller">
        <div v-for="c in xrChannels" :key="c.ch" class="strip" :class="{ muted: c.on === 0 }">
          <div class="num">{{ c.label }}</div>
          <div class="name" :title="c.name">{{ c.name || '—' }}</div>
          <SourceToggle :chs="[c.ch]" />
          <button class="mute" :class="{ on: c.on === 0 }" @click="send(channelAddr(c.ch, 'mix/on'), 'i', c.on === 0 ? 1 : 0)">MUTE</button>
          <div v-if="settings.showXrFaders" class="body">
            <Fader :model-value="c.fader ?? 0" :disabled="c.fader === undefined" :marks="false"
              @update:model-value="(p) => send(channelAddr(c.ch, 'mix/fader'), 'f', p)" />
            <Meter :keys="meterKeys(c.ch)" />
          </div>
        </div>
      </div>
      <div class="strip lr" :class="{ muted: xrMuted }">
        <div class="num">LR</div>
        <div class="name">{{ xr.mixer.name || 'Main' }}</div>
        <button class="mute" :class="{ on: xrMuted }" @click="toggleXrMute">MUTE</button>
        <div class="body">
          <Fader :model-value="lrFader()" :disabled="xr.values['/lr/mix/fader'] === undefined"
            @update:model-value="(p) => send('/lr/mix/fader', 'f', p)" />
          <Meter :keys="MAIN_METER" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.xrview { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.row { flex: 1; display: flex; gap: 10px; min-height: 0; }
.scroller { flex: 1; min-width: 0; display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.strip { flex: none; width: 84px; display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.strip.lr { width: 104px; background: var(--panel-2); }
.num { font-size: 11px; color: var(--muted); text-align: center; font-variant-numeric: tabular-nums; }
.name { font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.strip.muted .body { opacity: .45; }
button { height: 30px; padding: 0; border-radius: 8px; font-size: 11px; font-weight: 700; letter-spacing: .04em; background: var(--btn); border: 1px solid var(--line); color: var(--muted); }
.mute.on { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.body { flex: 1; display: flex; gap: 4px; min-height: 180px; }
.body :deep(.fader) { flex: 1; }
.strip :deep(.src small) { display: none; }
.warn { background: #3a2a0c; border: 1px solid #6b4d12; color: #f5cf7a; padding: 10px 14px; border-radius: 12px; font-size: 14px; }
</style>
