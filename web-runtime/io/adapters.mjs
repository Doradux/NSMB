// W08: synthetic gamepad and audio browser feasibility; no private game content.
const BUTTONS = Object.freeze({ primary: 0, secondary: 1, pause: 9, up: 12, down: 13, left: 14, right: 15 });
export function normalizeAxis(value, deadzone = 0.2) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) throw Error('INVALID_DEADZONE');
  const limited = Math.max(-1, Math.min(1, value));
  if (Math.abs(limited) <= deadzone) return 0;
  return Math.sign(limited) * (Math.abs(limited) - deadzone) / (1 - deadzone);
}
const emptyInput = () => ({ connected: false, index: -1,
  moveX: 0, moveY: 0, primary: false, secondary: false, pause: false });
function pressed(button) {
  return !!button && (button.pressed === true || (Number.isFinite(button.value) && button.value > 0.5));
}
export function snapshotGamepad(gamepads, { deadzone = 0.2, preferIndex = null } = {}) {
  // Browser Gamepad lists are tiny. Reject hostile array-likes before Array.from
  // can allocate millions of slots or invoke arbitrary getters.
  if (!gamepads || !Number.isSafeInteger(gamepads.length) || gamepads.length < 0 || gamepads.length > 32)
    return emptyInput();
  if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) throw Error('INVALID_DEADZONE');
  const candidates = Array.from(gamepads).filter(p => p && p.connected !== false && p.mapping === 'standard');
  const gamepad = candidates.find(p => p.index === preferIndex) || candidates.sort((a, b) => a.index - b.index)[0];
  if (!gamepad || !gamepad.buttons || !gamepad.axes) return emptyInput();
  const b = i => pressed(gamepad.buttons[i]);
  const left = b(BUTTONS.left), right = b(BUTTONS.right);
  const up = b(BUTTONS.up), down = b(BUTTONS.down);
  // Opposite digital inputs cancel; digital intent overrides analog when active.
  const moveX = left || right ? Number(right) - Number(left) : normalizeAxis(gamepad.axes[0], deadzone);
  const moveY = up || down ? Number(down) - Number(up) : normalizeAxis(gamepad.axes[1], deadzone);
  return { connected: true, index: gamepad.index, moveX, moveY,
    primary: b(BUTTONS.primary), secondary: b(BUTTONS.secondary), pause: b(BUTTONS.pause) };
}
export function pollGamepads(provider, options = {}) {
  if (!provider || typeof provider.getGamepads !== 'function') return emptyInput();
  try {
    return snapshotGamepad(provider.getGamepads(), options);
  } catch (error) {
    // getGamepads may throw SecurityError under Permissions-Policy restrictions.
    // Never let an unavailable controller API crash the host frame loop.
    if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return emptyInput();
    throw error;
  }
}
export async function renderSyntheticTone(OfflineCtor, { sampleRate = 48000, duration = 0.125,
  frequency = 440, volume = 0.15 } = {}) {
  if (typeof OfflineCtor !== 'function') throw Error('OFFLINE_AUDIO_UNAVAILABLE');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isFinite(duration) || duration <= 0 || duration > 3 ||
      !Number.isFinite(frequency) || frequency <= 0 || frequency >= sampleRate / 2 ||
      !Number.isFinite(volume) || volume < 0 || volume > 0.5) throw Error('INVALID_AUDIO_OPTIONS');
  const samples = Math.ceil(sampleRate * duration);
  const context = new OfflineCtor(1, samples, sampleRate);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain); gain.connect(context.destination);
  oscillator.start(0); oscillator.stop(samples / sampleRate);
  const result = await context.startRendering();
  const data = result.getChannelData(0);
  let sumSq = 0, peak = 0;
  for (const v of data) { if (!Number.isFinite(v)) throw Error('NONFINITE_AUDIO'); sumSq += v * v; peak = Math.max(peak, Math.abs(v)); }
  return { sampleRate: result.sampleRate, frames: data.length,
    rms: Math.sqrt(sumSq / data.length), peak };
}
// Live playback is intentionally NOT offered: AudioContext needs explicit user gesture
// and game-synchronized audio queue, which W08 does not claim to implement.
