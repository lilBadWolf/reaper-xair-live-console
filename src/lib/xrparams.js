// XR18 channel processing parameters. The mixer sends/accepts normalized
// 0..1 floats; these scales convert to real units. Verified against the
// mixer's own /node text output (e.g. gate hold 0.88 -> 502 ms, EQ f 0.265 -> 124.7 Hz).

const lin = (a, b) => ({ to: (v) => a + v * (b - a), from: (x) => (x - a) / (b - a) });
const log = (a, b) => ({ to: (v) => a * (b / a) ** v, from: (x) => Math.log(x / a) / Math.log(b / a) });

const num = (x, d = 1) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(d));
export const fmtHz = (x) => (x >= 1000 ? `${(x / 1000).toFixed(x >= 10000 ? 1 : 2)}k` : x.toFixed(0));
export const fmtMs = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)}s` : x < 10 ? `${x.toFixed(1)}ms` : `${x.toFixed(0)}ms`);
const dB = (x) => `${x > 0 ? '+' : ''}${num(x)}dB`;

// key -> { suffix, scale, fmt, def (normalized default for double-tap) }
const p = (suffix, scale, fmt, defReal) => ({ suffix, ...scale, fmt, def: scale.from(defReal) });

export const LOWCUT = {
  on: 'preamp/hpon',
  f: p('preamp/hpf', log(20, 400), (x) => `${fmtHz(x)}Hz`, 80),
};

export const GATE = {
  on: 'gate/on',
  mode: 'gate/mode',
  modes: ['EXP 2', 'EXP 3', 'EXP 4', 'GATE', 'DUCK'],
  thr: p('gate/thr', lin(-80, 0), dB, -40),
  range: p('gate/range', lin(3, 60), (x) => `${num(x)}dB`, 60),
  attack: p('gate/attack', lin(0, 120), fmtMs, 1),
  hold: p('gate/hold', log(0.02, 2000), fmtMs, 50),
  release: p('gate/release', log(5, 4000), fmtMs, 200),
};

export const RATIOS = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100];
export const DYN = {
  on: 'dyn/on',
  mode: 'dyn/mode', modes: ['COMP', 'EXP'],
  det: 'dyn/det', dets: ['PEAK', 'RMS'],
  auto: 'dyn/auto',
  thr: p('dyn/thr', lin(-60, 0), dB, -20),
  knee: p('dyn/knee', lin(0, 5), (x) => num(x), 1),
  mgain: p('dyn/mgain', lin(0, 24), dB, 0),
  attack: p('dyn/attack', lin(0, 120), fmtMs, 10),
  hold: p('dyn/hold', log(0.02, 2000), fmtMs, 10),
  release: p('dyn/release', log(5, 4000), fmtMs, 150),
  mix: p('dyn/mix', lin(0, 100), (x) => `${x.toFixed(0)}%`, 100),
};

export const EQ_TYPES = ['LCut', 'LShv', 'PEQ', 'VEQ', 'HShv', 'HCut'];
export const EQ_BANDS = [1, 2, 3, 4];
export const EQ = {
  on: 'eq/on',
  type: (b) => `eq/${b}/type`,
  f: { ...log(20, 20000), suffix: (b) => `eq/${b}/f`, fmt: (x) => `${fmtHz(x)}Hz` },
  g: { ...lin(-15, 15), suffix: (b) => `eq/${b}/g`, fmt: dB, def: 0.5 },
  q: { ...log(10, 0.3), suffix: (b) => `eq/${b}/q`, fmt: (x) => x.toFixed(1), def: log(10, 0.3).from(2) },
};

// Every address the processing panels need for one channel prefix, for /query.
export function processingAddrs(prefix) {
  const s = [
    LOWCUT.on, LOWCUT.f.suffix,
    GATE.on, GATE.mode, ...['thr', 'range', 'attack', 'hold', 'release'].map((k) => GATE[k].suffix),
    DYN.on, DYN.mode, DYN.det, DYN.auto, ...['thr', 'knee', 'mgain', 'attack', 'hold', 'release', 'mix'].map((k) => DYN[k].suffix), 'dyn/ratio',
    EQ.on, ...EQ_BANDS.flatMap((b) => [EQ.type(b), EQ.f.suffix(b), EQ.g.suffix(b), EQ.q.suffix(b)]),
  ];
  return s.map((x) => `${prefix}/${x}`);
}

// ---- EQ response (RBJ biquads @ 48 kHz) for the graph ----
const FS = 48000;
function coeffs(type, f, g, q) {
  const A = 10 ** (g / 40), w = (2 * Math.PI * f) / FS, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
  switch (type) {
    case 0: return [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];               // LCut
    case 5: return [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];                  // HCut
    case 1: { const s = 2 * Math.sqrt(A) * al;                                                     // LShv
      return [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s),
        (A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]; }
    case 4: { const s = 2 * Math.sqrt(A) * al;                                                     // HShv
      return [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s),
        (A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]; }
    default: return [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];           // PEQ / VEQ
  }
}
function magDb([b0, b1, b2, a0, a1, a2], f) {
  const w = (2 * Math.PI * f) / FS, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
// bands: [{type, f(Hz), g(dB), q}], lowcut: Hz|null -> [{f, db}] for n log-spaced points
export function eqResponse(bands, lowcut, n = 160) {
  const cs = bands.map((b) => coeffs(b.type, b.f, b.g, b.q));
  if (lowcut) cs.push(coeffs(0, lowcut, 0, 0.7071));
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = 20 * 1000 ** (i / (n - 1));
    out.push({ f, db: cs.reduce((s, c) => s + magDb(c, f), 0) });
  }
  return out;
}
