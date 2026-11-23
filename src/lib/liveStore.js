// LIVE tab state, kept in sync by the bridge (shared by every device).
import { reactive } from 'vue';
export const live = reactive({
  loaded: false,
  doc: { songs: [], setlists: [], currentSetlistId: null },
  active: { songId: null, sectionId: null },
  appliedAt: 0,
});
