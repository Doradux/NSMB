# W08 — Synthetic browser input and audio feasibility

This is an isolated proof of concept, not Wii controller emulation, live music
playback or a playable NSMB Wii build. Contains **no original game resources**.

## Files and scope

- adapters.mjs: pure standard-Gamepad mapping, stable index selection, analog
  deadzone/clamping, D-pad priority, action and pause buttons, safe disconnect
  defaults; no assumptions that every device uses the standard mapping.
  Phase-2 protection: deny oversized/untrusted gamepad snapshots before
  allocation, cancel simultaneous opposite digital directions and tolerate
  Permissions-Policy SecurityError/NotAllowedError as disconnected input.
  These paths have explicit red-first synthetic regression tests.
- adapters.mjs: offline-only synthetic sine generator with bounded duration,
  frequency, amplitude and frame count, RMS/peak verification. No live speaker
  playback, no private music/audio data and no long-running audio threads.
  Phase-2 QA: reject malformed deadzone even with NaN axis input; disconnect
  oscillator/gain nodes in finally after success OR rendering failure. This
  prevents retained graph connections but does not establish a measured leak.
- diagnostic.html: real browser page testing a synthetic standard pad state and
  actual OfflineAudioContext PCM output of 6,000 frames at 48 kHz.
- test/adapters.test.mjs: deterministic Node tests using synthetic mocks.
- test/browser.test.mjs: isolated localhost-only static HTTP server, temporary
  Chromium profile, explicit navigation/DOM state wait, Chrome DevTools Protocol
  checks and cleanup. Does not use port 3000 or the user's primary browser profile.

## Run

    node --test web-runtime/io/test/*.test.mjs

Browser test requires Chrome or Brave installed. Optionally set NSMB_BROWSER
to the exact executable location. No npm packages required.

Tests never rely on a physical controller, which is not emulated by Chrome
headless. Passing the synthetic gamepad check is **not** proof that browser
gamepad permission, reconnect events, controller mapping of Wii Remote or
latency/jitter work on real hardware. OfflineAudioContext only proves a
small silent rendered buffer and graph initialization; production needs
user-gesture activation, underrun/backpressure, scheduling, sample streams,
lifecycle handling and latency controls.

## Follow-up

1. Test real controller enumeration and disconnect behavior with user gesture
   and real device on desktop/mobile platforms.
2. Build a Wii Remote button mapping only after defining game input HLE ABI.
3. Implement explicit user-gesture live audio unlock, proper cleanup, clock
   synchronization, channel mixing and jitter buffers with synthetic PCM.
4. Add W07/W03 guest scheduler integration ONLY after respective interfaces
   and policies are agreed with Mario, and after browser memory budget limits.
