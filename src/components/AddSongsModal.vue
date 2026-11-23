<script setup>
// Add songs from the library to the current setlist.
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import { live, currentSetlist, addToSetlist, songSummary } from '../lib/live.js';
import { closeModal, openModal } from '../lib/modal.js';

const picked = ref([]);
const sl = computed(() => currentSetlist());
const available = computed(() => live.doc.songs.filter((s) => !sl.value?.songIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name)));
const toggle = (id) => { const i = picked.value.indexOf(id); i >= 0 ? picked.value.splice(i, 1) : picked.value.push(id); };
function add() { addToSetlist(picked.value); closeModal(); }
</script>

<template>
  <Modal title="Add songs" :subtitle="sl?.name" width="520px" @close="closeModal">
    <template #actions>
      <button class="primary" :disabled="!picked.length" @click="add">Add{{ picked.length ? ` ${picked.length}` : '' }}</button>
    </template>
    <button class="new" @click="openModal('song', { songId: null })">+ Create a new song (from current sounds)</button>
    <p v-if="!available.length" class="hint">Every song in the library is already in this setlist.</p>
    <ul class="list">
      <li v-for="s in available" :key="s.id">
        <button :class="{ on: picked.includes(s.id) }" @click="toggle(s.id)">
          <span class="box">{{ picked.includes(s.id) ? '✓' : '' }}</span>
          <span class="txt"><span class="nm">{{ s.name }}</span><span class="sum">{{ songSummary(s) || 'No presets set' }}</span></span>
        </button>
      </li>
    </ul>
  </Modal>
</template>

<style scoped>
.primary { height: 36px; padding: 0 16px; border-radius: 10px; background: var(--accent); border: 1px solid var(--accent); color: #041311; font-weight: 800; }
.primary:disabled { opacity: .4; }
.new { width: 100%; height: 44px; margin-bottom: 12px; border-radius: 12px; background: none; border: 1px dashed var(--line); color: var(--accent); font-weight: 700; }
.hint { color: var(--muted); font-size: 14px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.list button { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--line); color: var(--text); text-align: left; }
.list button.on { border-color: var(--accent); background: #0e2b28; }
.box { flex: none; width: 24px; height: 24px; border-radius: 7px; border: 2px solid var(--line); display: grid; place-items: center; font-weight: 900; color: #041311; }
.on .box { background: var(--accent); border-color: var(--accent); }
.txt { min-width: 0; display: flex; flex-direction: column; }
.nm { font-size: 15px; font-weight: 700; }
.sum { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
