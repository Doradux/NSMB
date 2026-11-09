"""At-origin miniature producer for entirely INVENTED PPC instruction words.

NOT the pinned C# Translator.Cli and NOT authentic producer evidence.
Events arise INSIDE queue, decode, commit and skip control-flow operations.
"""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass
from hashlib import sha256
import re
import struct
from scripts.audit_profile import dol_sections
from scripts.strict_translation_metadata import load_translation_json
from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import FORMAT, PINNED_UPSTREAM, TrustedAnchors, digest, verify

BASE = 0x80004000
END = BASE + 0x1000
BLR = 0x4E800020
NOP = 0x60000000
MAX_FUNCS = 64
MAX_INSNS = 16
MODEL = 'invented-ppc-bl-blr-v1'

class DecodeFailure(ValueError):
    pass

def bl(pc: int, dest: int) -> int:
    displacement = dest - pc
    if pc % 4 or dest % 4 or not -(1 << 25) <= displacement < (1 << 25):
        raise ValueError('invented branch offset out of range')
    return 0x48000001 | (displacement & 0x03FFFFFC)

def make_invented_source() -> bytes:
    """Handcrafted DOL-header layout and non-Nintendo PPC instructions."""
    buf = bytearray(0x1100)
    struct.pack_into('>I', buf, 0, 0x100)
    struct.pack_into('>I', buf, 0x48, BASE)
    struct.pack_into('>I', buf, 0x90, 0x1000)
    struct.pack_into('>I', buf, 0xE0, BASE)
    for i in range(0x100, 0x1100, 4):
        struct.pack_into('>I', buf, i, NOP)
    instructions = {
        0x000: bl(BASE, BASE + 0x020),
        0x004: bl(BASE + 4, BASE + 0x0E0),
        0x008: BLR,
        0x020: BLR,
        0x040: bl(BASE + 0x040, BASE + 0x060),
        0x044: BLR,
        0x060: BLR,
        0x080: 0xFFFFFFFF,
        0x0A0: bl(BASE + 0x0A0, BASE + 0x0C0),
        0x0A4: BLR,
        0x0C0: 0xFFFFFFFF,
        0x0E0: BLR,
    }
    for delta, word in instructions.items():
        struct.pack_into('>I', buf, 0x100 + delta, word)
    return bytes(buf)

def replace_word(source: bytes, address: int, word: int) -> bytes:
    if type(source) is not bytes or type(word) is not int or not 0 <= word <= 0xFFFFFFFF:
        raise ValueError('source bytes and uint32 required')
    if not BASE <= address < END or address % 4:
        raise ValueError('instruction address outside section')
    result = bytearray(source)
    struct.pack_into('>I', result, 0x100 + address - BASE, word)
    return bytes(result)

def invented_map() -> bytes:
    seeds = (BASE + 0x040, BASE + 0x080, BASE + 0x0A0, BASE + 0x0E0)
    return ''.join(f'{address:08X} fabricated\n' for address in seeds).encode('ascii')

def invented_config(root: int = BASE) -> bytes:
    return encode({'model': MODEL, 'maxInstructions': MAX_INSNS, 'root': root})

@dataclass(frozen=True)
class Produced:
    source: bytes
    map_bytes: bytes
    config: bytes
    sidecar: bytes
    metadata: bytes
    anchors: TrustedAnchors
    files: dict[str, bytes]

class OriginProducer:
    def __init__(self, source: bytes, map_bytes: bytes, config: bytes):
        if any(type(x) is not bytes for x in (source, map_bytes, config)):
            raise ValueError('read-only raw bytes required')
        if len(source) > 0x20000 or len(map_bytes) > 1024 or len(config) > 1024:
            raise ValueError('bounded invented inputs exceeded')
        try:
            options = load_translation_json(config.decode('utf-8'))
        except (UnicodeError, ValueError) as exc:
            raise ValueError('invalid invented config') from exc
        if (type(options) is not dict
                or set(options) != {'model', 'maxInstructions', 'root'}
                or options['model'] != MODEL
                or type(options['maxInstructions']) is not int
                or options['maxInstructions'] != MAX_INSNS
                or type(options['root']) is not int):
            raise ValueError('unsupported invented translation config')
        header = dol_sections(source)
        self.root = options['root']
        if header['entry'] != self.root:
            raise ValueError('invented root must match DOL header entry')
        sections = sorted((r['start'], r['end'], r['file_start'])
                          for r in header['sections'] if r['executable'])
        if len(sections) != 1 or sections[0][:2] != (BASE, END):
            raise ValueError('toy expects one exact invented executable section')
        self.file_start = sections[0][2]
        self.source = source
        self.map_bytes = map_bytes
        self.config = config
        self.seeds = self._parse_map(map_bytes)
        # Deterministic run ID for replay, NEVER a digital signature.
        self.run_id = sha256(b'toy-origin-run-v1\0'
              + bytes.fromhex(digest(source))
              + bytes.fromhex(digest(map_bytes))
              + bytes.fromhex(digest(config))).hexdigest()[:32]
        self._has_run = False
        self.events: list[dict] = []
        self.outputs: dict[int, bytes] = {}
        self.outcomes: dict[int, str] = {}
        self.tier: dict[int, str] = {}
        self.seen: set[int] = set()

    @staticmethod
    def _parse_map(raw: bytes) -> tuple[int, ...]:
        try:
            lines = raw.decode('ascii').splitlines()
        except UnicodeError as exc:
            raise ValueError('non-ASCII fabricated MAP') from exc
        addresses = []
        for line in lines:
            if not line.strip():
                continue
            parts = line.split(' ', 1)
            if len(parts) != 2 or not re.fullmatch(r'[0-9A-F]{8}',parts[0]):
                raise ValueError('bad toy MAP syntax')
            try:
                address = int(parts[0], 16)
            except ValueError as exc:
                raise ValueError('bad toy MAP address') from exc
            if not BASE <= address < END or address % 4:
                raise ValueError('toy seed outside executable section')
            addresses.append(address)
        if len(addresses) > MAX_FUNCS or addresses != sorted(set(addresses)):
            raise ValueError('MAP must be canonical unique ascending')
        return tuple(addresses)
    def _event(self, kind: str, address: int, **fields) -> None:
        # This is the actual toy producer's event at the moment of action.
        self.events.append({'seq':len(self.events),'kind':kind,
                            'address':address,**fields})

    def _read_word(self, pc: int) -> int:
        if not BASE <= pc < END or pc % 4:
            raise DecodeFailure('outside invented text / misaligned address')
        return struct.unpack_from('>I',self.source,self.file_start+pc-BASE)[0]

    def _decode(self, addr: int):
        words, targets = [], []
        for offset in range(0, MAX_INSNS*4, 4):
            pc = addr + offset
            # One function may not swallow another declared/discovered
            # function's terminator. This is a *simplified* toy boundary
            # guard, NOT the real C# boundary repair/SSA algorithm.
            if offset and pc in (set(self.seeds) | self.seen | set(targets)):
                raise DecodeFailure('invented function crossed known boundary')
            word = self._read_word(pc)
            words.append((pc,word))
            if word == BLR:
                return words,targets
            if word == NOP or word >> 26 == 14:  # ADDI (invented)
                continue
            if word >> 26 == 18 and word & 3 == 1:  # relative BL, LK=1 AA=0
                disp = word & 0x03FFFFFC
                if disp & 0x02000000:
                    disp -= 0x04000000
                target = pc + disp
                if not BASE <= target < END or target % 4:
                    raise DecodeFailure('call target outside invented text')
                if target not in targets:
                    targets.append(target)
                continue
            raise DecodeFailure('unsupported toy PPC instruction')
        raise DecodeFailure('unterminated invented function bound')

    def _translate(self, address: int, tier: str, queue: deque[int]):
        try:
            words, targets = self._decode(address)
        except DecodeFailure as exc:
            if tier == 'walk':
                raise ValueError('required root-walk candidate undecodable') from exc
            self._event('skip',address,reason='decode_error')
            self.outcomes[address] = 'skip'
            return
        # Toy emitter: byte output generated from the words just decoded.
        output = ('// PUBLIC INVENTED PPC toy output; not Wii translated code\n'
                  + f'// invented address offset {address-BASE:04X}\n'
                  + ''.join(f'// {pc-BASE:04X} {word:08X}\n'
                            for pc,word in words)).encode('ascii')
        self.outputs[address] = output
        self.outcomes[address] = 'emit'
        self._event('emit',address,outputSha256=digest(output))
        # Discover only via the decoded successful parent, during commit.
        for target in targets:
            if target in self.seen:
                continue
            self.seen.add(target)
            self.tier[target] = tier
            self._event('discover',target,parent=address)
            queue.append(target)

    def run(self) -> Produced:
        if self._has_run:
            raise ValueError('producer run already completed or attempted')
        self._has_run = True
        self._event('root',self.root)
        for seed in self.seeds:
            self._event('map_seed',seed)
        self.seen.add(self.root)
        self.tier[self.root] = 'walk'
        walked = deque([self.root])
        while walked:
            addr = walked.popleft()
            self._translate(addr,self.tier[addr],walked)
            if len(self.seen)>MAX_FUNCS:
                raise ValueError('invented function discovery limit')
        # MAP candidates are only queued if not already discovered by WALK.
        for seed in self.seeds:
            if seed in self.seen:
                continue
            self.seen.add(seed)
            self.tier[seed] = 'speculative'
            speculative = deque([seed])
            while speculative:
                addr = speculative.popleft()
                self._translate(addr,self.tier[addr],speculative)
                if len(self.seen)>MAX_FUNCS:
                    raise ValueError('invented function discovery limit')
        files = {f'synthetic_{addr:08x}.cpp':self.outputs[addr]
                 for addr in sorted(self.outputs)}
        metadata = encode({
            'functions':[{'entryPoint':addr,
                          'relativePath':f'synthetic_{addr:08x}.cpp',
                          'sha256':digest(self.outputs[addr])}
                         for addr in sorted(self.outputs)],
            'quality':{'unsupportedInstructionCount':0,
                       'invalidSsaFunctionCount':0},
        })
        manifest = encode({
            'format':FORMAT,'version':1,'runId':self.run_id,
            'producerCommit':PINNED_UPSTREAM,
            'sourceSha256':digest(self.source),
            'configSha256':digest(self.config),
            'mapSha256':digest(self.map_bytes),
            'metadataSha256':digest(metadata),
            'root':self.root,
            'executableRanges':[{'start':BASE,'end':END}],
            'mapSeeds':list(self.seeds), 'events':self.events,
        })
        anchors = TrustedAnchors(
            sidecar_sha256=digest(manifest),
            metadata_sha256=digest(metadata),
            source_sha256=digest(self.source),
            config_sha256=digest(self.config),
            map_sha256=digest(self.map_bytes),
            executable_ranges=((BASE,END),),
            upstream_commit=PINNED_UPSTREAM,
            root=self.root,run_id=self.run_id,
        )
        verdict = verify(manifest,metadata,anchors,
                         source_bytes=self.source,
                         map_bytes=self.map_bytes,config_bytes=self.config)
        if verdict.producer_attested or verdict.authentic_release_eligible:
            raise AssertionError('toy run can never authenticate Wii code')
        return Produced(self.source,self.map_bytes,self.config,
                        manifest,metadata,anchors,files)


def produce_demo() -> Produced:
    return OriginProducer(make_invented_source(),invented_map(),
                          invented_config()).run()
