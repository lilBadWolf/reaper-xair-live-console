import { reactive, watch } from 'vue';

const KEY = 'live-console-settings';
const defaults = {
  bridgeUrl: '',                 // '' = same host as this page, port 8899
  pollMs: 100,                   // REAPER poll interval (faders, mutes, presets; meters come from the XR18)
  xrMuteAddress: '/lr/mix/on',   // value 0 = muted on X-Air
  hiddenTracks: [],              // REAPER track names hidden from the mixer
  trackMap: {},                  // REAPER track name -> ['01'] | ['15','16'] | [] (none); unset = auto
  showXrFaders: true,
  qrHost: '',                    // address phones use to reach this Mac ('' = auto)
  bus: 1,                        // Buses tab: selected bus
  busShowAll: false,             // Buses tab: include unnamed channels
  lyricsOffsetMs: 0,             // YARG lyrics: + shows them earlier on this device, - later
  lyricsScale: 1,                // YARG lyrics: text size on this device
  vocalPart: '',                 // YARG lyrics: vocals | harm1 | harm2 | harm3 ('' = lead)
  pitchGuide: false,             // YARG lyrics: show the pitch guide
  clickSound: false,             // YARG click: also play a click on this device
  tabTrack: '',                  // YARG tab: track id last picked on this device
  tabKind: 'guitar',             // YARG tab: guitar | bass (used when that track id isn't in the next song)
  tabScale: 1,                   // YARG tab: size on this device
  lanesSpeed: 1,                 // YARG lanes: note speed on this device (1 = 1.6 s from the far end to the strike line)
  lanesHidden: [],               // YARG lanes: parts not shown on this device (guitar | rhythm | bass | drums | keys)
};

let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
export const settings = reactive({ ...defaults, ...saved });
for (const k of Object.keys(settings)) if (!(k in defaults)) delete settings[k]; // drop retired keys

watch(settings, (s) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}, { deep: true });

export function resetSettings() { Object.assign(settings, defaults, { hiddenTracks: [], trackMap: {} }); }

export function bridgeBase() {
  return (settings.bridgeUrl || `http://${location.hostname || 'localhost'}:8899`).replace(/\/$/, '');
}

// '01'..'16' or 'aux' -> OSC prefix
export const chPrefix = (ch) => (ch === 'aux' ? '/rtn/aux' : `/ch/${ch}`);
export const channelAddr = (ch, suffix) => `${chPrefix(ch)}/${suffix}`;
export const returnAddr = (ch) => channelAddr(ch, 'preamp/rtnsw'); // 0 = line (analog), 1 = USB return
export const ALL_CHANNELS = [...Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0')), 'aux'];
export const chLabel = (ch) => (ch === 'aux' ? 'Aux' : String(+ch));
