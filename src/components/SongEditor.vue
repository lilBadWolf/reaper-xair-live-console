<script setup>
// Create/edit a song: its sound (preset + on/off per FX) and sections (changes only).
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import { live, availableFx, captureCurrent, saveDoc, uid, SECTION_NAMES, currentSetlist, deleteSongEverywhere } from '../lib/live.js';
import { closeModal } from '../lib/modal.js';

const props = defineProps({ songId: { type: String, default: null } });
const existing = live.doc.songs.find((s) => s.id === props.songId);
const draft = ref(existing ? JSON.parse(JSON.stringify(existing))
  : { id: uid(), name: `Song ${(currentSetlist()?.songIds.length ?? 0) + 1}`, sound: captureCurrent(), sections: [] });
const tab = ref('sound'); // 'sound' | section id
const confirmDelete = ref(false);
const inSetlists = computed(() => live.doc.setlists.filter((sl) => sl.songIds.includes(props.songId)).length);

// Rows: every FX in the project, plus any saved assignment whose FX isn't there now.
const rows = computed(() => {
  const av = availableFx().filter((f) => f.pc > 0 || f.preset);
  const k = (a) => `${a.track}\u0001${a.fx}`;
  const seen = new Set(av.map(k));
  const extra = [...draft.value.sound, ...draft.value.sections.flatMap((s) => s.changes)]
    .filter((a) => !seen.has(k(a)) && seen.add(k(a)))
    .map((a) => ({ track: a.track, fx: a.fx, fxName: a.fxName, list: a.preset ? [a.preset] : [], missing: true }));
  return [...av, ...extra];
});

const target = computed(() => (tab.value === 'sound' ? draft.value.sound : draft.value.sections.find((s) => s.id === tab.value)?.changes || []));
const find = (row) => target.value.find((a) => a.track === row.track && a.fx === row.fx);
function setField(row, field, value) {
  let a = find(row);
  if (!a) { a = { track: row.track, fx: row.fx, fxName: row.fxName, preset: null, on: null }; target.value.push(a); }
  a[field] = value;
  if (a.preset === null && a.on === null) target.value.splice(target.value.indexOf(a), 1); // nothing left to change
}
const presetVal = (row) => find(row)?.preset ?? '';
const onVal = (row) => { const v = find(row)?.on; return v === true ? 'on' : v === false ? 'off' : ''; };
const keep = computed(() => (tab.value === 'sound' ? '— leave as is —' : '— same as song —'));

function useCurrent() {
  const cur = captureCurrent();
  if (tab.value === 'sound') { draft.value.sound = cur; return; }
  // a section stores only what differs from the song's sound
  const sec = draft.value.sections.find((s) => s.id === tab.value);
  sec.changes = cur.map((c) => {
    const base = draft.value.sound.find((a) => a.track === c.track && a.fx === c.fx);
    const preset = base?.preset === c.preset ? null : c.preset;
    const on = (base?.on ?? null) === c.on ? null : c.on;
    return preset === null && on === null ? null : { ...c, preset, on };
  }).filter(Boolean);
}
function addSection(name) {
  const s = { id: uid(), name: name || `Section ${draft.value.sections.length + 1}`, changes: [] };
  draft.value.sections.push(s);
  tab.value = s.id;
}
function moveSection(id, d) {
  const a = draft.value.sections, i = a.findIndex((s) => s.id === id), j = i + d;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
}
function removeSection(id) {
  draft.value.sections = draft.value.sections.filter((s) => s.id !== id);
  tab.value = 'sound';
}
const curSection = computed(() => draft.value.sections.find((s) => s.id === tab.value));

function save() {
  const songs = live.doc.songs;
  const i = songs.findIndex((s) => s.id === draft.value.id);
  if (i >= 0) songs[i] = draft.value;
  else { songs.push(draft.value); currentSetlist()?.songIds.push(draft.value.id); } // new songs join the current setlist
  saveDoc();
  closeModal();
}
function remove() {
  deleteSongEverywhere(draft.value.id);
  closeModal();
}
</script>

<template>
  <Modal :title="existing ? 'Edit song' : 'New song'" subtitle="Live" width="760px" @close="closeModal">
    <template #actions>
      <button class="primary" @click="save">Save</button>
    </template>

    <label class="name">Song name<input v-model="draft.name" placeholder="Song name" /></label>

    <div class="tabs">
      <button :class="{ on: tab === 'sound' }" @click="tab = 'sound'">Song sound</button>
      <button v-for="s in draft.sections" :key="s.id" :class="{ on: tab === s.id }" @click="tab = s.id">{{ s.name }}</button>
      <details class="add">
        <summary>+ Section</summary>
        <div class="addmenu">
          <button v-for="n in SECTION_NAMES" :key="n" @click="addSection(n); $event.target.closest('details').open = false">{{ n }}</button>
          <button @click="addSection(''); $event.target.closest('details').open = false">Custom…</button>
        </div>
      </details>
    </div>

    <div v-if="curSection" class="secbar">
      <input v-model="curSection.name" class="secname" />
      <button title="Move left" @click="moveSection(curSection.id, -1)">‹</button>
      <button title="Move right" @click="moveSection(curSection.id, 1)">›</button>
      <button class="danger" @click="removeSection(curSection.id)">Remove section</button>
    </div>

    <p class="hint">
      <template v-if="tab === 'sound'">What loads when you tap the song. Set a preset (and optionally on/bypass) for each effect the song needs.</template>
      <template v-else>Only what changes for this section. Everything else stays as the song sound.</template>
      <button class="link" @click="useCurrent">Use current sounds</button>
    </p>

    <table>
      <thead><tr><th>Track</th><th>Effect</th><th>Preset</th><th>State</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.track + r.fx" :class="{ set: find(r), missing: r.missing }">
          <td class="tr">{{ r.track }}</td>
          <td class="fxn">{{ r.fxName }}<small v-if="r.missing"> (not in project)</small></td>
          <td>
            <select :value="presetVal(r)" @change="setField(r, 'preset', $event.target.value || null)">
              <option value="">{{ keep }}</option>
              <option v-for="p in r.list" :key="p" :value="p">{{ p }}</option>
              <option v-if="presetVal(r) && !r.list.includes(presetVal(r))" :value="presetVal(r)">{{ presetVal(r) }} (missing)</option>
            </select>
          </td>
          <td>
            <select :value="onVal(r)" @change="setField(r, 'on', $event.target.value === '' ? null : $event.target.value === 'on')">
              <option value="">—</option>
              <option value="on">On</option>
              <option value="off">Bypassed</option>
            </select>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="4" class="hint">No effects found. Is the FX script running?</td></tr>
      </tbody>
    </table>

    <div v-if="existing" class="footer">
      <button v-if="!confirmDelete" class="danger" @click="confirmDelete = true">Delete song</button>
      <template v-else>
        <span class="hint">Delete “{{ draft.name }}” from the library{{ inSetlists > 1 ? ` and ${inSetlists} setlists` : '' }}?</span>
        <button class="danger solid" @click="remove">Delete</button>
        <button @click="confirmDelete = false">Cancel</button>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
button { height: 36px; padding: 0 14px; border-radius: 10px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 600; font-size: 13px; }
.primary { background: var(--accent); border-color: var(--accent); color: #041311; font-weight: 800; }
.danger { color: var(--mute); }
.danger.solid { background: var(--mute); border-color: var(--mute); color: #1a0705; }
.name { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); margin-bottom: 14px; }
input { background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 16px; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 10px; }
.tabs > button { height: 32px; border-radius: 16px; }
.tabs > button.on { background: #0e2b28; border-color: var(--accent); color: var(--accent); }
.add { position: relative; }
.add summary { list-style: none; cursor: pointer; height: 32px; line-height: 30px; padding: 0 12px; border-radius: 16px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; font-weight: 600; }
.add summary::-webkit-details-marker { display: none; }
.addmenu { position: absolute; z-index: 5; top: 36px; left: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; width: 240px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 30px #000a; }
.secbar { display: flex; gap: 6px; margin-bottom: 8px; }
.secname { flex: 1; min-width: 0; padding: 6px 10px; font-size: 14px; }
.hint { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.link { height: auto; padding: 0; border: 0; background: none; color: var(--accent); font-weight: 700; margin-left: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); padding: 0 8px 6px 0; }
td { padding: 6px 8px 6px 0; border-top: 1px solid var(--line); }
tr.set .tr { color: var(--accent); }
tr.missing { opacity: .6; }
.tr { font-weight: 650; white-space: nowrap; }
.fxn { color: var(--muted); font-size: 13px; }
select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; font: inherit; font-size: 14px; }
.footer { display: flex; gap: 8px; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
@media (max-width: 620px) {
  thead { display: none; }
  tr { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; padding: 8px 0; border-top: 1px solid var(--line); }
  td { border: 0; padding: 0; }
}
</style>
