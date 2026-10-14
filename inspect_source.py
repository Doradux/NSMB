"""Inspecciona localmente una copia de New Super Mario Bros. Wii, sin subir nada.

Uso: python inspect_source.py <ruta-ISO-o-carpeta-extraida>
La recompilacion base exige SMNE01 (USA), revision 1 y main.dol limpio.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

EXPECTED_ID = b"SMNE01"
EXPECTED_REVISION = 1
EXPECTED_MAIN_DOL_SHA256 = "6d755ec24c395fee600a856a85785e0e99c0b7ecb680d573a6cdd1aa6f7beee7"
RELS = ("d_profileNP", "d_basesNP", "d_enemiesNP", "d_en_bossNP")


def identify(header: bytes) -> bool:
    if len(header) < 8:
        print("ERROR: cabecera demasiado corta.")
        return False
    game_id = header[:6].decode("ascii", "replace")
    revision = header[7]
    region = {"E": "USA", "P": "Europa/PAL", "J": "Japon", "K": "Corea"}.get(game_id[3:4], "otra")
    print(f"Game ID: {game_id} | Region: {region} | Revision: {revision}")
    supported = header[:6] == EXPECTED_ID and revision == EXPECTED_REVISION
    print("Compatible con el recompilador actual: " + ("SI" if supported else "NO"))
    if not supported:
        print("Se necesitaria adaptar el perfil del traductor para esta revision/region.")
    return supported


def inspect_extracted(path: Path) -> int:
    root = next((p for p in (path, path / "DATA") if (p / "sys" / "boot.bin").is_file()), None)
    if root is None:
        print("ERROR: falta sys/boot.bin. Extrae el disco con Dolphin: Extract Entire Disc.")
        return 2
    supported = identify((root / "sys" / "boot.bin").read_bytes()[:8])
    dol = root / "sys" / "main.dol"
    if not dol.is_file():
        print("ERROR: falta sys/main.dol")
        return 2
    h = hashlib.file_digest(dol.open("rb"), "sha256").hexdigest()
    clean = h == EXPECTED_MAIN_DOL_SHA256
    print(f"SHA256 main.dol: {h}")
    print("Ejecutable original esperado: " + ("SI" if clean else "NO"))
    missing = [name for name in RELS if not (root / "files" / "rels" / f"{name}.rel.LZ").is_file()]
    print("Modulos REL presentes: " + ("SI" if not missing else f"NO ({', '.join(missing)})"))
    print("Los archivos permanecen en su ubicacion original; no se han copiado.")
    return 0 if supported and clean and not missing else 1


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1]).expanduser()
    if not path.exists():
        print(f"ERROR: no existe: {path}")
        return 2
    if path.is_dir():
        return inspect_extracted(path)
    ext = path.suffix.lower()
    if ext == ".iso":
        with path.open("rb") as f:
            header = f.read(0x20)
        if header[0x18:0x1c] != bytes.fromhex("5d1c9ea3"):
            print("AVISO: firma de disco Wii ausente; verificar imagen con Dolphin.")
        return 0 if identify(header) else 1
    if ext in (".rvz", ".wbfs", ".gcz", ".wia", ".nkit", ".ciso"):
        print(f"Formato comprimido ({ext}): abrelo en Dolphin y usa Extract Entire Disc.")
        print("Luego ejecuta este inspector sobre la carpeta extraida.")
        return 1
    print("Formato no reconocido. Usa ISO Wii o carpeta extraida con sys/ y files/.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
