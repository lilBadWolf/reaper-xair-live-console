<script setup>
// Load / create / rename / duplicate / delete / export / import setlists.
import { ref } from 'vue';
import Modal from './Modal.vue';
import { live, selectSetlist, createSetlist, renameSetlist, duplicateSetlist, deleteSetlist, exportSetlist, importSetlist } from '../lib/live.js';
import { closeModal } from '../lib/modal.js';

const renaming = ref(null), renameText = ref(''), confirmDel = ref(null), msg = ref(''), fileInput = ref(null);
function load(id) { selectSetlist(id); closeModal(); }
function startRename(sl) { renaming.value = sl.id; renameText.value = sl.name; }
function finishRename() { if (renaming.value) renameSetlist(renaming.value, renameText.value.trim()); renaming.value = null; }
function newSetlist() { const sl = createSetlist('New setlist'); startRename(sl); }
async function onFile(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = await importSetlist(f);
    msg.value = `Imported “${r.setlist.name}”: ${r.total} songs (${r.added} new to the library).`;
  } catch (err) { msg.value = `Couldn't import: ${err.message}`; }
}
</script>

<template>
  <Modal title="Setlists" subtitle="Live" width="560px" @close="closeModal">
    <template #actions>
      <button class="primary" @click="newSetlist">+ New</button>
    </template>

    <ul class="list">
      <li v-for="sl in live.doc.setlists" :key="sl.id" :class="{ cur: sl.id === live.doc.currentSetlistId }">
        <form v-if="renaming === sl.id" class="rename" @submit.prevent="finishRename">
          <input v-model="renameText" autofocus @blur="finishRename" />
        </form>
        <button v-else class="load" @click="load(sl.id)">
          <span class="nm">{{ sl.name }}</span>
          <span class="ct">{{ sl.songIds.length }} song{{ sl.songIds.length === 1 ? '' : 's' }}{{ sl.id === live.doc.currentSetlistId ? ' · loaded' : '' }}</span>
        </button>
        <div v-if="confirmDel === sl.id" class="acts">
          <button class="danger solid" @click="deleteSetlist(sl.id); confirmDel = null">Delete</button>
          <button @click="confirmDel = null">Keep</button>
        </div>
        <div v-else class="acts">
          <button title="Rename" @click="startRename(sl)">Rename</button>
          <button title="Duplicate" @click="duplicateSetlist(sl.id)">Copy</button>
          <button title="Save to a file" @click="exportSetlist(sl.id)">Export</button>
          <button class="danger" :disabled="live.doc.setlists.length <= 1" title="Delete setlist (songs stay in the library)" @click="confirmDel = sl.id">✕</button>
        </div>
      </li>
    </ul>

    <div class="foot">
      <button @click="fileInput.click()">Import setlist file…</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
      <span class="hint">Export saves a setlist and its songs to a .json file, for backup or another rig.</span>
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </Modal>
</template>

<style scoped>
button { height: 34px; padding: 0 12px; border-radius: 9px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 600; font-size: 12px; }
.primary { background: var(--accent); border-color: var(--accent); color: #041311; font-weight: 800; height: 36px; }
.danger { color: var(--mute); }
.danger.solid { background: var(--mute); border-color: var(--mute); color: #1a0705; }
button:disabled { opacity: .35; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 4px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel-2); }
li.cur { border-color: var(--accent); background: #0e2b28; }
.load { flex: 1; min-width: 0; height: auto; padding: 8px 10px; display: flex; flex-direction: column; align-items: flex-start; border: 0; background: none; text-align: left; }
.nm { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cur .nm { color: var(--accent); }
.ct { font-size: 12px; color: var(--muted); font-weight: 500; }
.rename { flex: 1; }
.rename input { width: 100%; background: var(--bg); border: 1px solid var(--accent); color: var(--text); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 16px; }
.acts { display: flex; gap: 4px; flex: none; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.hint { color: var(--muted); font-size: 12px; flex: 1; min-width: 200px; }
.msg { margin: 10px 0 0; font-size: 13px; color: var(--ok); }
@media (max-width: 620px) { li { flex-wrap: wrap; } .acts { width: 100%; justify-content: flex-end; } }
</style>
