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