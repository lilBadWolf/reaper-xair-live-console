<script setup>
import { computed } from 'vue';
import PresetNav from '../components/PresetNav.vue';
import { reaper, fxCommand } from '../lib/reaper.js';
import { go } from '../lib/router.js';

const cards = computed(() =>
  reaper.tracks
    .filter((t) => (reaper.fx[t.idx] || []).length)
    .map((t) => ({ track: t, fx: reaper.fx[t.idx] })),
);
</script>

<template>
  <div class="fxview">
    <div v-if="!reaper.scriptAlive" class="warn">
      FX script not running — run <code>live_console.lua</code> in REAPER (Actions → Load ReaScript), or restart REAPER.
    </div>
    <div class="grid">
      <section v-for="c in cards" :key="c.track.idx" class="card" :style="{ '--tc': c.track.color || 'var(--accent)' }">
        <header>
          <button class="h3" @click="c.track.idx > 0 && go('track', c.track.name)">{{ c.track.name }}<svg v-if="c.track.idx > 0" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
        </header>
        <div v-for="f in c.fx" :key="f.i" class="fxrow">
          <PresetNav :track-idx="c.track.idx" :fx="f" size="lg" show-fx-name />
          <button class="byp" :class="{ off: !f.on }" :title="f.on ? 'Bypass' : 'Enable'" @click="fxCommand(c.track.idx, f.i, 'bypass')">
            <svg viewBox="0 0 24 24"><path d="M12 3v8M6.3 7a8 8 0 1 0 11.4 0" /></svg>
          </button>
        </div>
      </section>
    </div>
    <div v-if="reaper.scriptAlive && !cards.length" class="empty">No tracks with effects.</div>
  </div>
</template>

<style scoped>
.fxview { height: 100%; overflow-y: auto; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 14px; position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--tc); }
header { margin: 0 0 6px; }
.h3 { display: inline-flex; align-items: center; gap: 4px; margin-left: -6px; padding: 4px 6px; border: 0; border-radius: 8px; background: none; color: var(--text); font-size: 15px; font-weight: 650; }
.h3:hover, .h3:active { background: var(--btn); }
.h3 svg { width: 14px; height: 14px; fill: none; stroke: var(--muted); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.fxrow { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.fxrow:first-of-type { border-top: 0; }
.byp { flex: none; width: 44px; height: 44px; border-radius: 12px; padding: 0; display: grid; place-items: center; background: var(--btn); border: 1px solid var(--line); color: var(--accent); }
.byp.off { color: var(--muted); background: transparent; }
.byp svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
.warn { background: #3a2a0c; border: 1px solid #6b4d12; color: #f5cf7a; padding: 10px 14px; border-radius: 12px; margin-bottom: 12px; font-size: 14px; }
.empty { color: var(--muted); text-align: center; margin-top: 40px; }
</style>
