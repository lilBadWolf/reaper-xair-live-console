<script setup>
import { ref, computed } from 'vue';
import { settings, resetSettings, bridgeBase } from '../lib/settings.js';
import { reaper } from '../lib/reaper.js';
import { xr, startXr, setMixerHost, post } from '../lib/xr18.js';
import { yarg, setAuto } from '../lib/yarg.js';
import { shareHost } from '../lib/qr.js';
const port = location.port || '80';
const version = __APP_VERSION__;
import { autoChannels, mappingOptions, mappingValue, setMapping, mappingLabel } from '../lib/mapping.js';

const hostInput = ref(xr.mixer.host || '');
const yargDir = ref('');
const tracks = computed(() => reaper.tracks.filter((t) => t.idx > 0));
function toggleHidden(name) {
  const i = settings.hiddenTracks.indexOf(name);
  if (i >= 0) settings.hiddenTracks.splice(i, 1); else settings.hiddenTracks.push(name);
}
// Restart the bridge (this Mac only): it starts a fresh copy of itself; pages reconnect by themselves
const restartMsg = ref('');
async function restartBridge() {
  restartMsg.value = 'Restarting…';
  try {
    const r = await fetch(`${bridgeBase()}/restart`, { method: 'POST' });
    restartMsg.value = r.ok ? 'Restarted: reconnecting…' : r.status === 404 ? 'This bridge is too old to restart itself: quit it and run live_console.lua again (once)' : `Failed (${r.status})`;
  } catch { restartMsg.value = 'Bridge unreachable'; }
  setTimeout(() => { restartMsg.value = ''; }, 6000);
}
const fmtVal = (e) => (e.t === 'f' ? e.v.toFixed(4) : JSON.stringify(e.v));
const ago = (t) => `${Math.max(0, Math.round((Date.now() - t) / 1000))}s ago`;
</script>

<template>
  <div class="settings">
    <section>
      <h3>Status <span class="ver">Live Console v{{ version }}</span></h3>
      <dl>
        <dt>REAPER web API</dt><dd :class="reaper.connected ? 'ok' : 'bad'">{{ reaper.connected ? 'Connected' : 'Offline' }}</dd>
        <dt>live_console.lua</dt><dd :class="reaper.scriptAlive ? 'ok' : 'bad'">{{ reaper.scriptAlive ? 'Running' : 'Not running' }}</dd>
        <dt>XR18 bridge</dt><dd :class="xr.bridge ? 'ok' : 'bad'">{{ xr.bridge ? bridgeBase() : 'Unreachable' }}</dd>
        <dt>YARG</dt><dd :class="yarg.detected ? 'ok' : 'bad'">{{ !yarg.detected ? 'Not running' : yarg.clock.stream ? 'Running · data stream on' : 'Running · data stream off' }}{{ yarg.via === 'yargDash' ? ' · via yargDash' : '' }}</dd>
        <dt>XR18</dt><dd :class="xr.mixer.connected ? 'ok' : 'bad'">{{ xr.mixer.connected ? `${xr.mixer.name} (${xr.mixer.model} ${xr.mixer.firmware}) @ ${xr.mixer.host}` : 'Not found' }}</dd>
      </dl>
    </section>

    <section>
      <h3>XR18 connection</h3>
      <label>Mixer IP <span class="hint">blank = auto-discover</span>
        <div class="inline"><input v-model="hostInput" placeholder="192.168.1.50" /><button @click="setMixerHost(hostInput)">Apply</button></div>
      </label>
      <label>Bridge URL <span class="hint">blank = this host, port 8899</span>
        <div class="inline"><input v-model.lazy="settings.bridgeUrl" placeholder="http://host:8899" /><button @click="startXr()">Reconnect</button></div>
      </label>
      <label v-if="yarg.local">Restart the bridge <span class="hint">{{ restartMsg || 'after an update, or if the mixer stops answering (the mixer drops out for a moment)' }}</span>
        <div class="inline"><button @click="restartBridge">Restart bridge</button></div>
      </label>
    </section>

    <section>
      <h3>Track → XR18 channel</h3>
      <p class="hint">Auto uses each track's REAPER record input (XR18 USB 1–16 = ch 1–16), then a matching channel name. Drives the SOURCE button and the track page.</p>
      <table>
        <tr v-for="t in tracks" :key="t.idx">
          <td>{{ t.name }}</td>
          <td>
            <select :value="mappingValue(t.name)" @change="setMapping(t.name, $event.target.value)">
              <option v-for="o in mappingOptions()" :key="o.value" :value="o.value">{{ o.value === 'auto' ? `Auto (${mappingLabel(autoChannels(t))})` : o.label }}</option>
            </select>
          </td>
        </tr>
      </table>
      <label>XR18 mute address <span class="hint">0 = muted</span><input v-model.lazy="settings.xrMuteAddress" /></label>
    </section>

    <section>
      <h3>YARG</h3>
      <p class="hint">The YARG tab shows the song YARG is playing, its lyrics (with harmonies and a pitch guide), a click for the drummer, and scores. For everything to follow the song, turn on YARG's <b>Settings → All Settings → Experimental → Enable UDP Data Stream</b>. If a Mac blocks YARG's stream (YARG logs “Error sending UDP packet”), start YARG with <code>npm run yarg</code> (or double-click <code>yarg/Start YARG.command</code>) instead.</p>
      <p v-if="yarg.via === 'yargDash'" class="hint ok-note">yargDash is running on this computer, so Live Console gets YARG through it: the same song, lyrics, lanes and tabs as yargDash (tabs are added and kept in yargDash). When yargDash quits, Live Console follows YARG itself again.</p>
      <p v-else class="hint">Running <a href="https://github.com/lilBadWolf/yargDash" target="_blank" rel="noopener">yargDash</a> too? Live Console finds it on this computer and gets YARG through it.</p>
      <label class="check"><input type="checkbox" :checked="yarg.auto" @change="setAuto($event.target.checked)" /> Auto-load Live songs <span class="hint">when YARG starts a song, load the Live song with the same name and switch its sections with YARG's (all devices)</span></label>
      <label>Lyrics timing on this device <span class="hint">ms · + shows lyrics earlier, − later</span>
        <input v-model.number="settings.lyricsOffsetMs" type="number" step="50" />
      </label>
      <label v-if="yarg.via !== 'yargDash'">YARG data folder <span class="hint">blank = automatic · the folder with currentSong.json</span>
        <div class="inline"><input v-model="yargDir" placeholder="(automatic)" /><button @click="post('/config', { yargDir })">Apply</button></div>
      </label>
    </section>

    <section>
      <h3>QR codes</h3>
      <p class="hint">Address phones use to reach this computer (track page → QR button). Blank = automatic.</p>
      <label>Address<input v-model.trim="settings.qrHost" :placeholder="shareHost()" /></label>
      <div class="chips">
        <button v-for="a in xr.lan" :key="a.ip" class="chip" :class="{ on: settings.qrHost === `${a.ip}:${port}` }" @click="settings.qrHost = `${a.ip}:${port}`">{{ a.ip }} <small>{{ a.name }}</small></button>
      </div>
    </section>

    <section class="wide">
      <h3>OSC learn</h3>
      <p class="hint">Change something in X-Air Edit or on another device and its OSC address shows up here.</p>
      <table>
        <tr v-for="e in xr.learned" :key="e.a + e.at"><td class="mono">{{ e.a }}</td><td class="mono">{{ e.t }} {{ fmtVal(e) }}</td><td class="hint">{{ ago(e.at) }}</td></tr>
        <tr v-if="!xr.learned.length"><td class="hint">Nothing yet.</td></tr>
      </table>
    </section>

    <section>
      <h3>Mixer tab</h3>
      <p class="hint">Tap to hide/show REAPER tracks.</p>
      <div class="chips">
        <button v-for="t in tracks" :key="t.idx" class="chip" :class="{ off: settings.hiddenTracks.includes(t.name) }" @click="toggleHidden(t.name)">{{ t.name }}</button>
      </div>
      <label class="check"><input v-model="settings.showXrFaders" type="checkbox" /> Show faders on XR18 tab</label>
      <label>REAPER refresh (ms) <span class="hint">faders, mutes, presets · meters come from the XR18</span><input v-model.number="settings.pollMs" type="number" min="30" max="1000" /></label>
      <button class="ghost" @click="resetSettings">Reset settings</button>
    </section>
  </div>
</template>

<style scoped>
.settings { height: 100%; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 12px; align-content: start; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
section.wide { grid-column: 1 / -1; }
h3 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 14px; }
dt { color: var(--muted); }
.ver { float: right; text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 12px; } dd { margin: 0; }
.ok { color: var(--ok); } .bad { color: var(--mute); }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
.hint { color: var(--muted); font-size: 12px; margin: 0; }
.hint.ok-note { color: #cdb3ff; }
select { background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 6px 8px; font: inherit; width: 100%; }
input:not([type=checkbox]) { background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 9px 10px; font: inherit; min-width: 0; }
.inline { display: flex; gap: 6px; } .inline input { flex: 1; }
.two { display: flex; gap: 10px; } .two label { flex: 1; }
button { background: var(--btn); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 0 14px; height: 38px; font-weight: 600; }
button.ghost { align-self: start; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { height: 32px; border-radius: 16px; }
.chip.on { border-color: var(--accent); color: var(--accent); }
.chip small { color: var(--muted); font-size: 10px; }
.chip.off { opacity: .4; text-decoration: line-through; }
table { border-collapse: collapse; font-size: 13px; }
td { padding: 4px 12px 4px 0; border-bottom: 1px solid var(--line); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
