<script setup>
// Gate / EQ / Comp editor for a track's XR18 channel(s), with tabs to hop between them.
import { ref } from 'vue';
import Modal from '../Modal.vue';
import GatePanel from './GatePanel.vue';
import EqPanel from './EqPanel.vue';
import CompPanel from './CompPanel.vue';
import { closeModal } from '../../lib/modal.js';
import { chLabel } from '../../lib/settings.js';

const props = defineProps({ chs: { type: Array, required: true }, trackName: { type: String, default: '' }, tab: { type: String, default: 'eq' } });
const TABS = [{ id: 'gate', label: 'Gate', comp: GatePanel }, { id: 'eq', label: 'EQ', comp: EqPanel }, { id: 'comp', label: 'Comp', comp: CompPanel }];
const cur = ref(props.tab);
</script>

<template>
  <Modal :title="trackName" :subtitle="`XR18 ${chs.map(chLabel).join('+')}`" width="720px" @close="closeModal">
    <template #actions>
      <nav class="tabs">
        <button v-for="t in TABS" :key="t.id" :class="{ on: cur === t.id }" @click="cur = t.id">{{ t.label }}</button>
      </nav>
    </template>
    <div class="proc">
      <component :is="TABS.find((t) => t.id === cur).comp" :chs="chs" />
    </div>
    <p class="hint">Drag knobs up/down · shift-drag for fine · double-tap to reset</p>
  </Modal>
</template>

<style scoped>
.tabs { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--groove); }
.tabs button { height: 34px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-weight: 700; font-size: 13px; }
.tabs button.on { background: var(--btn); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
.proc :deep(.panel) { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.proc :deep(.panel.off .knobs), .proc :deep(.panel.off .tf) { opacity: .5; }
.proc :deep(.ph) { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.proc :deep(h4) { margin: 0; font-size: 15px; font-weight: 700; }
.proc :deep(.knobs) { display: flex; flex-wrap: wrap; gap: 10px 8px; }
.proc :deep(.knob) { width: 72px; }
.proc :deep(.graph) { height: 220px; }
.proc :deep(.tf) { width: 120px; height: 120px; }
.hint { margin: 16px 0 0; color: var(--muted); font-size: 12px; text-align: center; }
@media (max-width: 620px) {
  .tabs button { padding: 0 10px; }
  .proc :deep(.graph) { height: 180px; }
}
</style>
