// Tiny synthetic W08 Gamepad -> W07 checked guest-RAM adapter.
// No real Wii input HLE, polling loop, device permissions or gameplay.
import { snapshotGamepad } from '../io/adapters.mjs';

export function writeSyntheticGamepadSnapshot(module, gamepads, guestAddress, sequence, options = {}) {
  if (!Number.isSafeInteger(guestAddress) || guestAddress < 0 || guestAddress > 0xFFFFFFFF) {
    throw new RangeError('INVALID_GUEST_ADDRESS');
  }
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 255) {
    throw new RangeError('INVALID_SEQUENCE');
  }
  const snapshot = snapshotGamepad(gamepads, options);
  if (!snapshot.connected) return Object.freeze({ written: false, disconnected: true, status: 0 });
  const buttons = Number(snapshot.primary) | (Number(snapshot.secondary) << 1) |
    (Number(snapshot.pause) << 2);
  // Quantize magnitude symmetrically so mirrored stick inputs map to +/-N.
  const clamp = n => Math.sign(n) * Math.round(Math.abs(Math.max(-1, Math.min(1, n))) * 127);
  const axisX = clamp(snapshot.moveX);
  const axisY = clamp(snapshot.moveY);
  const store = module?._nsmbw_services_input_store;
  const status = module?._nsmbw_services_input_status;
  if (typeof store !== 'function' || typeof status !== 'function') {
    throw new TypeError('MISSING_CHECKED_WASM_INPUT_SERVICE');
  }
  const written = store(guestAddress, buttons, axisX, axisY, sequence) === 1;
  return Object.freeze({ written, disconnected: false, status: status() });
}
