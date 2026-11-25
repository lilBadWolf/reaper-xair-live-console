// yargDash on this computer: when it's running, the bridge uses it for YARG instead of following YARG itself.
//
// yargDash (https://github.com/lilBadWolf/yargDash) grew out of this bridge's YARG code and serves the same YARG data
// (same SSE messages, same /yarg/* endpoints). With both running, two programs would otherwise each watch YARG,
// each pick up downloaded Guitar Pro files, and keep separate tabs; and when yargDash has YARG's stream sent to this
// Mac only (127.0.0.1), only one of them could hear it. So while yargDash answers, the bridge stops its own YARG
// watcher, relays yargDash's YARG messages to its pages, and forwards their tab/lane requests to yargDash.
//
//   createYargDashLink({ log, url, onUp(yargSnapshot), onDown(), onMessage(msg) })
//     -> { up(), snapshot(), forward(req, res, pathAndQuery, body?), close() }
//
// Found by polling <url>/status (default http://127.0.0.1:8900, LIVE_CONSOLE_YARGDASH or the bridge's
// yargDashUrl setting) for {name:'yargDash'}; followed through its /events stream until that ends.
import http from 'node:http';

const RELAYED = new Set(['yarg', 'yargClock', 'yargBeat', 'yargTabs']);

export function createYargDashLink({ log, url: getUrl, onUp, onDown, onMessage }) {
  const base = () => String(getUrl() || 'http://127.0.0.1:8900').replace(/\/+$/, '');
  let state = null;        // yargDash's YARG snapshot, kept current from its messages (null = not connected)
  let stream = null;       // the /events request
  let connecting = false, closed = false;

  async function poll() {
    if (closed || state || connecting) return;
    const st = await fetch(`${base()}/status`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
    if (st?.name === 'yargDash') connect(st);
  }

  function connect(st) {
    connecting = true;
    let buf = '';
    const req = http.get(`${base()}/events`, { headers: { Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return lost(); }
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          let msg; try { msg = JSON.parse(data); } catch { continue; }
          handle(msg, st);
        }
      });
      res.on('end', lost);
      res.on('error', lost);
    });
    req.on('error', lost);
    stream = req;
  }

  function handle(msg, st) {
    if (msg.type === 'snapshot') {
      const first = !state;
      state = msg.yarg || {};
      connecting = false;
      if (first) { log(`YARG: yargDash ${st.version || ''} is running (${base()}): using it for YARG`); onUp(state); }
      return;
    }
    if (!state || !RELAYED.has(msg.type)) return;
    if (msg.type === 'yarg') state = msg.yarg;
    else if (msg.type === 'yargClock') state = { ...state, clock: msg.clock };
    else if (msg.type === 'yargTabs') state = { ...state, tabs: msg.tabs };
    onMessage(msg);
  }

  function lost() {
    const was = !!state;
    state = null; connecting = false;
    try { stream?.destroy(); } catch {}
    stream = null;
    if (was && !closed) { log('YARG: yargDash went away: following YARG directly again'); onDown(); }
  }

  // Pass a page's request on to yargDash and its answer back. The bridge checks "this computer only" itself first.
  function forward(req, res, pathAndQuery, body) {
    return new Promise((resolve) => {
      const out = http.request(`${base()}${pathAndQuery}`, { method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' } }, (r) => {
        res.statusCode = r.statusCode || 502;
        if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type']);
        r.pipe(res);
        r.on('end', resolve);
      });
      out.on('error', (e) => {
        if (!res.headersSent) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); }
        res.end(JSON.stringify({ error: `yargDash didn't answer: ${e.message}` }));
        resolve();
      });
      if (body !== undefined) out.end(body);
      else req.pipe(out);
    });
  }

  const timer = setInterval(poll, 3000);
  poll();
  return {
    up: () => !!state,
    snapshot: () => state,
    forward,
    close() { closed = true; clearInterval(timer); try { stream?.destroy(); } catch {} },
  };
}
