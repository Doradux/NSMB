# NSMB Wii — Port nativo web

Objetivo: ejecutar la logica recompilada del juego en WebAssembly en localhost, sin Dolphin ni interpretacion de ISO/WBFS durante la partida. Los recursos privados se extraeran localmente.

## Estado (14-10-2026)
- Ordenador autorizado: marcos (Windows). No desarrollar en marcos-hpr.
- Clon local: upstream-nsmbw (WitherBlitz/NSMB-Wii-Multiplayer-Recompilation).
- Se ha creado y probado inspect_source.py para identificar region/revision.
- No se ha encontrado aun la imagen de NSMB Wii en las carpetas comunes.
- NO existe un build WebAssembly jugable a fecha de hoy. El repo base compila para Windows/Linux/macOS/Android, no navegador.

## Limitaciones verificadas
1. runtime/CMakeLists.txt comprueba Clang host de 64 bits y solo permite Windows, Linux, macOS y Android.
2. runtime/src/guest_flat_memory.cpp reserva 4 GiB de memoria virtual y requiere mmap/mprotect/handlers de fallos; en WASM hay que redisenar el backend de memoria.
3. runtime/src/host_context.cpp usa fibras Win32/libco/pilas nativas. El navegador necesita otro backend de scheduling.
4. Aurora emplea SDL3 y Dawn/WebGPU nativos; requiere adaptar presentacion/eventos a Canvas + WebGPU navegador.
5. Audio, filesystem, sockets, threads e I/O HLE requieren adaptaciones web.
6. El traductor genera fuentes a partir de recursos locales del juego; el codigo recompilado completo no esta en Git.
7. El recompilador requiere SMNE01 (USA) revision 1 y un main.dol limpio, SHA256 6d755ec24c395fee600a856a85785e0e99c0b7ecb680d573a6cdd1aa6f7beee7. Europa/PAL exige un port del perfil.

## Plan de implementacion
1. Localizar la imagen e identificar ID/revision con inspect_source.py.
2. Extraerla localmente con Dolphin y validar main.dol y los cuatro modulos REL.
3. Reproducir compilacion nativa para tener linea base de pruebas.
4. Implementar backend de memoria/scheduling que soporte WASM y aislar codigo de plataforma.
5. Construir primer arranque WASM, adaptar renderizado, controles, audio y guardado.
6. Probar un nivel completo, rendimiento y servir solo en localhost.

## Ejecucion del verificador
cd C:\Users\kakyg\Documents\NSMBW-Web
python .\inspect_source.py "D:\ruta\juego.iso"
python .\inspect_source.py "D:\ruta\carpeta_extraida"

No publicar la ISO, los binarios ni los recursos de Nintendo en GitHub.
## Verified development progress (2026-10-14)
- Workstation: marcos (Windows). Build tools installed privately in `Documents/NSMBW-Private/toolchain` (dotnet 8.0.426, Emscripten 6.0.12).
- Translation solution compiles with zero errors; 642/642 tests pass (`translator/Translator.sln`).
- Wii disc ID and revision: SMNE01 USA Rev 1. Disc verification reports SHA-1 `aa7b134a7606435ddcd735f2964ebdecde38c2ef`.
- `main.dol` actual SHA-256 is `166eb6b7cca21418e316a6cfbf1bfbf0a213eb8f6396d42126a1482bb764a955`, but pinned upstream expects `6d755ec24c395fee600a856a85785e0e99c0b7ecb680d573a6cdd1aa6f7beee7`. Do not silently disable this check: addresses, hooks and profile integrity must be verified first.
- Four RELs successfully decompressed and pre-linked **in the private workspace** (13 sections; ADDR32=91863, ADDR16_LO=30772, ADDR16_HA=27246, REL24=48575; chained base addresses all match).
- Standalone browser-oriented C++ sparse RAM backend compiles into ~14 KiB of WebAssembly. It passed its automated Node tests plus **11 checks in headless Brave**, without JavaScript errors.
- The actual game does not boot yet. Native fibers, flat guest memory, GX renderer and platform services are not WebAssembly-compatible as-is.

## Next engineering steps
1. Reconcile original-executable hashes versus WiiCompiled's current game profile before translating guest functions for real gameplay.
2. Generate C++ functions into **private/ignored output**, compare their memory semantics and reference paths to the existing runtime.
3. Adapt the upstream checked `MemoryInline` path to WASM. Preserve MMIO/GX FIFO, executable-write detection and the Wii's sparse mappings.
4. Bring up a scheduler backend for Emscripten and a WebGPU rendering path. Only then attempt boot and level loading.
## Private translation experiment (2026-10-14)

- A **non-production**, privately stored profile matching the extracted DOL hash allowed the compiled PowerPC translator to finish a recursive pass in **20.82 seconds**.
- The translator emitted metadata for **39,779 functions**, a private C++ source bundle (~207 MB), and private metadata (~26 MB). Original assets and generated copyrighted code remain **outside Git**.
- These outputs demonstrate only that translation executed; they do **not** prove that the pinned upstream DOL hooks, address map, ABI, scheduling, rendering or gameplay are valid.
- Do not treat the experimental profile as a release configuration or upload the generated source. Compatibility verification and an authentic guest-function WebAssembly test are still outstanding.
- Multiple contributors coordinate asynchronously in the owner's local C:\NSMBcowork workspace with isolated branches, atomic task claims and independent code reviews. Mario performs final integration.
