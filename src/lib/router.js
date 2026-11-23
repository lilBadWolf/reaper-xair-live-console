// Minimal hash router: #live | #mixer | #fx | #xr | #settings | #track/<track name>[/artist]
// "/artist" = Artist mode: just that track's presets and monitor sends (for a performer's phone).
import { reactive } from 'vue';

function parse() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('track/')) {
    const rest = h.slice(6), artist = rest.endsWith('/artist');
    return { view: 'track', track: artist ? rest.slice(0, -7) : rest, artist };
  }
  return { view: h || null, track: null, artist: false };
}
export const route = reactive(parse());
window.addEventListener('hashchange', () => Object.assign(route, parse()));

export const trackHash = (track, artist = false) => `#track/${encodeURIComponent(track)}${artist ? '/artist' : ''}`;
export function go(view, track) {
  location.hash = view === 'track' ? trackHash(track, route.artist) : view;
}
