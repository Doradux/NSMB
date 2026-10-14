# NSMB/Wii — Experimental browser port

An independent, **unfinished** effort to bring New Super Mario Bros. Wii to modern web browsers through static recompilation, not by embedding Dolphin or running a Wii disc image in the browser.

## Current status

- An English-language concept site is available on localhost.
- The World 1 screenshot is the original 1920 × 1080 PNG supplied by the project owner. It is a visual reference, not live gameplay.
- The original Wii game is **not yet playable in the browser**.
- The experimental C++ Wii RAM adapter builds to WebAssembly and passes 11 checks in Brave at [the localhost diagnostic](http://localhost:3000/web-runtime/lab.html); details in [web-runtime/README.md](web-runtime/README.md).
- The PowerPC-to-C++ translator builds and all 642 upstream unit tests pass on Windows. This does not validate an actual game boot.
- The USA Rev 1 disc extraction and REL pre-link succeeded privately, but its clean `main.dol` SHA-256 differs from the pinned upstream build profile; translated gameplay is not validated.
- A source validation script is included; original game files are private and must never be committed.
- Upstream native recompilation work: [WitherBlitz/NSMB-Wii-Multiplayer-Recompilation](https://github.com/WitherBlitz/NSMB-Wii-Multiplayer-Recompilation) (GPL-3.0, separate Git submodule).

## Run the site

Requires Node.js. Run `node server.js` from this directory and open http://localhost:3000.

The server binds to `127.0.0.1` and serves only an explicit list of safe public assets.

## Research and implementation

- `PORTING.md` covers translation and WebAssembly host-adaptation requirements.
- `inspect_source.py` inspects a privately held extracted Wii disc, validates the revision and SHA-256 without uploading anything.
- The `upstream-nsmbw` submodule is a pinned external project, **not** a functioning browser build.

To check a private disc extraction:

```powershell
python inspect_source.py "C:\path\to\private\extracted"
```

## Legal and development notes

No Nintendo game executable, disc image, decompressed REL modules or game data is included in this repository. They remain in the user's private workspace. The visual reference PNG comes from the project owner. This project is not affiliated with or endorsed by Nintendo.