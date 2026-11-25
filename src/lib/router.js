// Minimal hash router: #live | #yarg | #mixer | #fx | #xr | #settings | #track/<track name>[/artist]
// Performer pages (no tabs): #yarg/stage[/harm1|harm2|harm3] (lyrics), #yarg/click (drummer's click), #yarg/tab[/<track id>] (tablature),
// #yarg/lanes (every part's note highway: an audience screen), #yarg/keys[/<track id>] (a keyboard part falling onto piano keys)
// "/artist" = Artist mode: just that track's presets and monitor sends (for a performer's phone).
import { reactive } from 'vue';

function parse() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('track/')) {
    const rest = h.slice(6), artist = rest.endsWith('/artist');
    return { view: 'track', track: artist ? rest.slice(0, -7) : rest, artist, mode: null, part: null, tabTrack: null };
  }
  const y = h.match(/^yarg\/(stage|click|tab|lanes|keys)(?:\/([\w-]+))?$/);
  if (y) return { view: 'yarg', track: null, artist: true, mode: { stage: 'lyrics', click: 'click', tab: 'tab', lanes: 'lanes', keys: 'keys' }[y[1]], part: y[1] === 'stage' ? y[2] || null : null, tabTrack: y[1] === 'tab' || y[1] === 'keys' ? y[2] || null : null };
  return { view: h || null, track: null, artist: false, mode: null, part: null, tabTrack: null };
}
export const route = reactive(parse());
window.addEventListener('hashchange', () => Object.assign(route, parse()));

export const trackHash = (track, artist = false) => `#track/${encodeURIComponent(track)}${artist ? '/artist' : ''}`;
export function go(view, track) {
  location.hash = view === 'track' ? trackHash(track, route.artist) : view;
}
