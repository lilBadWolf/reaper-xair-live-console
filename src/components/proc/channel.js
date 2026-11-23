// Read/write helpers for one XR18 channel (or a stereo pair: writes go to both).
import { xr, sendAll } from '../../lib/xr18.js';
import { channelAddr } from '../../lib/settings.js';

export function useChannel(props) {
  const get = (suffix) => (props.chs.length ? xr.values[channelAddr(props.chs[0], suffix)] : undefined);
  const set = (suffix, t, v) => sendAll(props.chs.map((c) => channelAddr(c, suffix)), t, v);
  const toggle = (suffix) => set(suffix, 'i', get(suffix) === 1 ? 0 : 1);
  // bind a scaled float param to a Knob
  const knob = (param) => ({
    modelValue: get(param.suffix) ?? 0,
    display: get(param.suffix) === undefined ? '—' : param.fmt(param.to(get(param.suffix))),
    def: param.def ?? null,
    disabled: get(param.suffix) === undefined,
    'onUpdate:modelValue': (v) => set(param.suffix, 'f', v),
  });
  return { get, set, toggle, knob };
}
