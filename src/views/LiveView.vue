<script setup>
// LIVE: tap a song to load every channel's FX presets for it; tap a section for its changes.
// Songs live in a library; setlists are ordered lists of them (switch/manage via the setlist button).
import { ref, reactive, computed, onBeforeUnmount } from 'vue';
import { live, applySong, checkActive, songSummary, currentSetlist, setlistSongs, moveInSetlist, removeFromSetlist } from '../lib/live.js';
import { reaper } from '../lib/reaper.js';
import { xr } from '../lib/xr18.js';
import { openModal } from '../lib/modal.js';
import { yarg } from '../lib/yarg.js';

const editing = ref(false);
const problems = ref([]);
const busy = ref(null);
const setlist = computed(() => currentSetlist());
const songs = computed(() => setlistSongs(setlist.value));
const activeIdx = computed(() => songs.value.findIndex((s) => s.id === live.active.songId));
const activeSong = computed(() => live.doc.songs.find((s) => s.id === live.active.songId) || null);
const activeSection = computed(() => activeSong.value?.sections.find((s) => s.id === live.active.sectionId) || null);
// re-check whenever REAPER's FX state changes (someone tweaked a preset by hand → "modified")
const mismatch = computed(() => { void reaper.fx; return Date.now() - live.appliedAt < 1500 ? [] : checkActive() || []; });

async function load(song, sectionId = null) {
  busy.value = song.id + (sectionId || '');
  problems.value = await applySong(song, sectionId);
  setTimeout(() => { busy.value = null; }, 250);
}
function step(d) {
  const i = activeIdx.value < 0 ? (d > 0 ? -1 : songs.value.length) : activeIdx.value;
  const next = songs.value[i + d];
  if (next) load(next);
}

// ---------- drag to reorder (pointer events: works with mouse and touch) ----------
const scroller = ref(null);
const listEl = ref(null);
const drag = reactive({ from: -1, to: -1, dy: 0, h: 0 });
let rects = [], startY = 0, lastY = 0, scroll0 = 0, raf = 0;
const GAP = 6;

function dragStart(e, i) {
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  rects = [...listEl.value.querySelectorAll('.row')].map((el) => el.getBoundingClientRect());
  Object.assign(drag, { from: i, to: i, dy: 0, h: rects[i].height + GAP });
  startY = lastY = e.clientY;
  scroll0 = scroller.value.scrollTop;
  raf = requestAnimationFrame(autoScroll);
}
function dragMove(e) { if (drag.from >= 0) { lastY = e.clientY; update(); } }
function update() {
  drag.dy = lastY - startY + (scroller.value.scrollTop - scroll0);
  const center = rects[drag.from].top + rects[drag.from].height / 2 + drag.dy;
  let to = 0;
  rects.forEach((r, j) => { if (j !== drag.from && center > r.top + r.height / 2) to++; });
  drag.to = to;
}
function autoScroll() {
  if (drag.from < 0) return;
  const box = scroller.value.getBoundingClientRect(), edge = 70;
  const speed = lastY < box.top + edge ? -(box.top + edge - lastY) / 4 : lastY > box.bottom - edge ? (lastY - (box.bottom - edge)) / 4 : 0;
  if (speed) { scroller.value.scrollTop += speed; update(); }
  raf = requestAnimationFrame(autoScroll);
}
function dragEnd() {
  if (drag.from < 0) return;
  cancelAnimationFrame(raf);
  const { from, to } = drag;
  Object.assign(drag, { from: -1, to: -1, dy: 0 });
  moveInSetlist(from, to);
}
function rowStyle(j) {
  const { from, to, dy, h } = drag;
  if (from < 0) return {};
  if (j === from) return { transform: `translateY(${dy}px)`, zIndex: 5, transition: 'none' };
  if (from < to && j > from && j <= to) return { transform: `translateY(${-h}px)` };
  if (from > to && j >= to && j < from) return { transform: `translateY(${h}px)` };
  return { transform: 'none' };
}
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div ref="scroller" class="live">
    <div v-if="!xr.bridge" class="warn">Songs are stored by the bridge, which isn't reachable. It's started by <code>live_console.lua</code>.</div>
    <div v-else-if="!reaper.scriptAlive" class="warn">The FX script isn't running in REAPER, so songs can't load presets.</div>

    <!-- now playing -->
    <div class="now">
      <button class="nav" :disabled="activeIdx === 0 || !songs.length" aria-label="Previous song" @click="step(-1)"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div class="np">
        <div class="lbl">{{ activeSong ? (activeIdx >= 0 ? `Song ${activeIdx + 1} of ${songs.length}` : 'Not in this setlist') : 'Nothing loaded' }}</div>
        <div class="title">{{ activeSong?.name || 'Tap a song to load its sounds' }}<span v-if="activeSection" class="sec"> · {{ activeSection.name }}</span></div>
        <div v-if="activeSong" class="status" :class="{ bad: mismatch.length || problems.length }">
          <template v-if="problems.length">⚠ {{ problems.join(' · ') }}</template>
          <template v-else-if="mismatch.length">Modified: {{ mismatch.join(' · ') }}</template>
          <template v-else>✓ All sounds loaded</template>
        </div>
      </div>
      <button class="nav" :disabled="activeIdx >= songs.length - 1" aria-label="Next song" @click="step(1)"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>

    <div class="bar">
      <button class="slbtn" title="Load, create, export or import setlists" @click="openModal('setlists')">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        <span class="sln">{{ setlist?.name || 'Setlist' }}</span>
        <span class="slc">{{ songs.length }}</span>
        <svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <button v-if="yarg.detected" class="lyr" title="YARG lyrics" @click="openModal('lyrics')">
        <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>Lyrics
      </button>
      <button class="ghost" :class="{ on: editing }" @click="editing = !editing">{{ editing ? 'Done' : 'Edit' }}</button>
      <button v-if="!editing" class="add" @click="openModal('song', { songId: null })">+ New song</button>
    </div>

    <!-- performance view -->
    <div v-if="!editing" class="grid">
      <section v-for="(s, i) in songs" :key="s.id" class="card" :class="{ active: s.id === live.active.songId, flash: busy && busy.startsWith(s.id) }">
        <button class="head" @click="load(s)">
          <span class="num">{{ i + 1 }}</span>
          <span class="txt">
            <span class="name">{{ s.name }}</span>
            <span class="sum">{{ songSummary(s) || 'No presets set' }}</span>
          </span>
        </button>
        <div v-if="s.sections.length" class="secs">
          <button v-for="sec in s.sections" :key="sec.id" class="secb"
            :class="{ on: s.id === live.active.songId && sec.id === live.active.sectionId }" @click="load(s, sec.id)">{{ sec.name }}</button>
        </div>
      </section>
      <div v-if="live.loaded && !songs.length" class="empty">
        <p>This setlist is empty.</p>
        <p class="hint">Dial in a song's sounds on the mixer and tap <b>+ New song</b>, or tap <b>Edit → Add songs</b> to pick from your library.</p>
      </div>
    </div>

    <!-- edit view: drag to reorder -->
    <div v-else class="editlist">
      <p class="hint">Drag <b>⠿</b> to reorder. Tap a song to edit it. <b>✕</b> removes it from this setlist (it stays in your library).</p>
      <div ref="listEl" class="rows">
        <div v-for="(s, i) in songs" :key="s.id" class="row" :class="{ dragging: drag.from === i }" :style="rowStyle(i)">
          <button class="handle" aria-label="Drag to reorder" @pointerdown="dragStart($event, i)" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd">
            <svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
          </button>
          <span class="num">{{ i + 1 }}</span>
          <button class="rtxt" @click="openModal('song', { songId: s.id })">
            <span class="name">{{ s.name }}</span>
            <span class="sum">{{ s.sections.length ? `${s.sections.map((x) => x.name).join(' · ')} — ` : '' }}{{ songSummary(s) || 'No presets set' }}</span>
          </button>
          <button class="rm" :aria-label="`Remove ${s.name} from setlist`" @click="removeFromSetlist(s.id)">✕</button>
        </div>
      </div>
      <div class="editfoot">
        <button class="add" @click="openModal('addSongs')">+ Add songs</button>
        <button @click="openModal('song', { songId: null })">+ New song</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px; overscroll-behavior: contain; }
.warn { background: #3a2a0c; border: 1px solid #6b4d12; color: #f5cf7a; padding: 10px 14px; border-radius: 12px; font-size: 14px; }

.now { display: flex; align-items: stretch; gap: 10px; flex: none; }
.nav { flex: none; width: 72px; border-radius: 16px; background: var(--btn); border: 1px solid var(--line); color: var(--text); display: grid; place-items: center; padding: 0; }
.nav:disabled { opacity: .3; }
.nav svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.np { flex: 1; min-width: 0; padding: 14px 18px; border-radius: 16px; background: linear-gradient(135deg, #10302c, #14171c 70%); border: 1px solid #1f4b45; }
.lbl { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.title { font-size: 26px; font-weight: 800; margin: 2px 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title .sec { color: var(--accent); }
.status { font-size: 13px; color: var(--ok); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status.bad { color: var(--solo); }

.bar { display: flex; align-items: center; gap: 8px; flex: none; }
.bar button { height: 40px; padding: 0 14px; border-radius: 10px; font-weight: 700; font-size: 13px; border: 1px solid var(--line); background: var(--btn); color: var(--text); }
.slbtn { margin-right: auto; display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 60%; }
.slbtn svg { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.sln { font-size: 15px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slc { flex: none; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #ffffff10; color: var(--muted); font-size: 12px; display: grid; place-items: center; }
.bar .lyr { display: flex; align-items: center; gap: 6px; }
.bar .lyr svg { width: 16px; height: 16px; fill: none; stroke: #b48cff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.bar .ghost.on { border-color: var(--accent); color: var(--accent); }
.bar .add, .editfoot .add { background: var(--accent); border-color: var(--accent); color: #041311; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 10px; align-content: start; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 8px 30px #3dd6c622; }
.card.flash .head { background: #3dd6c61f; }
.head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; text-align: left; border: 0; background: none; color: var(--text); min-height: 72px; }
.head:active { background: #ffffff08; }
.num { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--btn); color: var(--muted); font-weight: 800; font-variant-numeric: tabular-nums; }
.active .num { background: var(--accent); color: #041311; }
.txt, .rtxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.name { font-size: 18px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sum { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.secs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 12px; }
.secb { flex: 1 1 auto; min-width: 72px; height: 44px; padding: 0 12px; border-radius: 10px; background: var(--btn); border: 1px solid var(--line); color: var(--text); font-weight: 700; font-size: 14px; }
.secb.on { background: var(--accent); border-color: var(--accent); color: #041311; }
.empty { grid-column: 1 / -1; text-align: center; color: var(--text); padding: 30px 10px; }
.hint { color: var(--muted); font-size: 14px; margin: 0; }

.editlist { display: flex; flex-direction: column; gap: 10px; }
.rows { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 4px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); position: relative;
  transition: transform .18s cubic-bezier(.2, .8, .3, 1); user-select: none; }
.row.dragging { background: var(--panel-2); border-color: var(--accent); box-shadow: 0 14px 40px #000c; }
.handle { flex: none; width: 44px; height: 52px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 10px; background: none; color: var(--muted); cursor: grab; touch-action: none; }
.dragging .handle { cursor: grabbing; color: var(--accent); }
.handle svg { width: 22px; height: 22px; fill: currentColor; }
.rtxt { padding: 6px 0; border: 0; background: none; color: var(--text); text-align: left; }
.rtxt .name { font-size: 16px; }
.rm { flex: none; width: 40px; height: 40px; padding: 0; border-radius: 10px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); font-size: 14px; }
.rm:hover { color: var(--mute); }
.editfoot { display: flex; gap: 8px; }
.editfoot button { flex: 1; height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--btn); color: var(--text); font-weight: 700; }

@media (max-width: 620px) {
  .nav { width: 52px; }
  .title { font-size: 20px; }
  .np { padding: 10px 12px; }
  .slbtn { max-width: none; flex: 1; }
}
</style>
