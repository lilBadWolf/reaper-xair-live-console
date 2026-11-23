<script setup>
import { computed } from 'vue';
import Strip from '../components/Strip.vue';
import MainStrip from '../components/MainStrip.vue';
import { reaper } from '../lib/reaper.js';
import { settings } from '../lib/settings.js';

const tracks = computed(() => reaper.tracks.filter((t) => t.idx > 0 && !settings.hiddenTracks.includes(t.name)));
</script>

<template>
  <div class="mixer">
    <div class="scroller">
      <Strip v-for="t in tracks" :key="t.idx" :track="t" />
      <div v-if="!tracks.length" class="empty">{{ reaper.connected ? 'No tracks' : 'Waiting for REAPER…' }}</div>
    </div>
    <div class="masterwrap"><MainStrip /></div>
  </div>
</template>

<style scoped>
.mixer { display: flex; gap: 10px; height: 100%; min-height: 0; }
.scroller { flex: 1; min-width: 0; display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; padding-bottom: 3px; scroll-snap-type: x proximity; }
.scroller > * { scroll-snap-align: start; }
.masterwrap { display: flex; padding-left: 10px; border-left: 1px solid var(--line); }
.empty { margin: auto; color: var(--muted); }
</style>
