<script setup>
// Sets tab → Lyrics: the YARG lyrics in a modal, without leaving the song list.
import Modal from './Modal.vue';
import LyricsPanel from './LyricsPanel.vue';
import { closeModal } from '../lib/modal.js';
import { go } from '../lib/router.js';
import { computed } from 'vue';
import { yarg, partKey } from '../lib/yarg.js';
const part = computed(() => partKey());
</script>

<template>
  <Modal :title="yarg.song?.name || yarg.menuSong?.name || 'Nothing playing'" :subtitle="yarg.song ? `YARG · ${yarg.song.artist}` : yarg.menuSong ? `YARG menu · ${yarg.menuSong.artist}` : 'YARG'" width="820px" @close="closeModal">
    <template #actions><button class="open" @click="go('yarg')">YARG tab</button></template>
    <div class="box">
      <LyricsPanel v-if="yarg.lyrics" :part="part || 'vocals'" />
      <p v-else class="empty">Start a song in YARG and its lyrics appear here.</p>
    </div>
  </Modal>
</template>

<style scoped>
.box { height: min(62vh, 640px); display: flex; flex-direction: column; }
.empty { margin: auto; color: var(--muted); }
.open { height: 40px; padding: 0 12px; border-radius: 12px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 700; font-size: 13px; }
</style>
