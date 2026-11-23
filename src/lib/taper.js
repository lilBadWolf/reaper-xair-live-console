// One fader law for everything (same as the X-Air family), so a REAPER fader
// and an XR18 fader at the same position mean the same gain.
// pos 0..1  <->  dB (-inf .. +10). 0.75 = 0 dB.
export function posToDb(p) {
  if (p <= 0) return -Infinity;
  if (p >= 0.5) return p * 40 - 30;
  if (p >= 0.25) return p * 80 - 50;
  if (p >= 0.0625) return p * 160 - 70;
  return p * 480 - 90;
}
export function dbToPos(db) {
  if (!isFinite(db) || db <= -90) return 0;
  if (db >= -10) return Math.min(1, (db + 30) / 40);
  if (db >= -30) return (db + 50) / 80;
  if (db >= -60) return (db + 70) / 160;
  return (db + 90) / 480;
}
export const linToDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
export const dbToLin = (db) => (isFinite(db) ? 10 ** (db / 20) : 0);
export const linToPos = (v) => dbToPos(linToDb(v));
export const posToLin = (p) => dbToLin(posToDb(p));

export function fmtDb(db, digits = 1) {
  if (!isFinite(db) || db <= -90) return '-∞';
  const s = db.toFixed(Math.abs(db) >= 10 ? 0 : digits);
  return db > 0 ? `+${s}` : s;
}

export const FADER_MARKS = [10, 5, 0, -5, -10, -20, -30, -40, -50, -60];
