"""100% invented PPC-like function corpus and deterministic native/Wasm oracle.

No original Nintendo code. Only a restricted BL, addi r3,r3,imm, blr,
nop subset is allowed. All entry points are OFFSETS inside handcrafted
DOL-shaped bytes; never authorize real Wii execution.
"""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
import json

from scripts.phase17.luigi.producer import (
    BASE, BLR, OriginProducer, invented_config, invented_map,
    make_invented_source, replace_word
)
from scripts.phase17.luigi.origin_v2 import generate_v2


def invented_source()->bytes:
    b=make_invented_source()
    for offset,word in [
        (0x008,0x38630005),(0x00C,BLR),
        (0x020,0x38630002),(0x024,BLR),
        (0x044,0x38630007),(0x048,BLR),
        (0x060,0x38630003),(0x064,BLR),
        (0x0E0,0x3863000B),(0x0E4,BLR),
    ]:
        b=replace_word(b,BASE+offset,word)
    return b


def source_inputs():
    return invented_source(),invented_map(),invented_config()


def words_from_source(source:bytes,map_bytes:bytes,config:bytes):
    v2=generate_v2(source,map_bytes,config)
    addresses=[f['entryPoint'] for f in json.loads(v2.metadata)['functions']]
    toy=OriginProducer(source,map_bytes,config)
    toy.seen=set(addresses)
    result={}
    for address in addresses:
        words,_=toy._decode(address)
        if not words or words[-1][1]!=BLR:
            raise ValueError('toy function not terminated with blr')
        result[address-BASE]=tuple(word for _,word in words)
    return result


INVALID=0xFFFFFFFF


def reference_run(source:bytes,map_bytes:bytes,config:bytes,entry:int,initial:int)->int:
    """Independent source-byte oracle: no access to generated C++ or manifest."""
    words=words_from_source(source,map_bytes,config)
    def run(address:int,value:int,stack:tuple[int,...])->int:
        if address not in words or len(stack)>16 or address in stack:
            return INVALID
        pc=address
        for word in words[address]:
            if word==0x60000000:
                pass
            elif word==BLR:
                return value
            elif word >> 26 == 14:
                if (word>>21)&31 !=3 or (word>>16)&31 !=3:
                    return INVALID
                imm=word&0xffff
                if imm>=0x8000:imm-=0x10000
                value=(value+imm)&0xFFFFFFFF
            elif word >> 26 == 18 and word&3==1:
                disp=word&0x03FFFFFC
                if disp&0x02000000:disp-=0x04000000
                target=pc+disp
                value=run(target,value,stack+(address,))
                if value==INVALID:return INVALID
            else:
                return INVALID
            pc+=4
        return INVALID
    return run(entry,initial&0xffffffff,())


def render_cpp(source:bytes,map_bytes:bytes,config:bytes)->bytes:
    funcs=words_from_source(source,map_bytes,config)
    text=[
        '// Phase19 Luigi - INVENTED PPC toy, no original Wii code.\n',
        '#include <cstdint>\n',
        '#ifdef NSMB_TOY_NATIVE_MAIN\n#include <cstdio>\n#include <cstdlib>\n#endif\n',
        'namespace {\n',
        'constexpr uint32_t INVALID=0xffffffffu;\n',
        'struct ToyFunction { uint32_t offset; const uint32_t *words; uint32_t count; };\n'
    ]
    for offset,words in sorted(funcs.items()):
        values=', '.join(f'0x{word:08x}u' for word in words)
        text.append(f'static constexpr uint32_t code_{offset:04x}[] = {{{values}}};\n')
    text.append('static constexpr ToyFunction functions[] = {\n')
    for offset,words in sorted(funcs.items()):
        text.append(f'{{0x{offset:04x}u, code_{offset:04x}, {len(words)}u}},\n')
    text.append('};\n')
    text.extend([
        'uint32_t execute(uint32_t entry, uint32_t value, uint32_t depth) {\n',
        '  if (depth > 16u) return INVALID;\n',
        '  const ToyFunction* found=nullptr;\n',
        '  for (const auto& f: functions) if (f.offset==entry) {found=&f;break;}\n',
        '  if (!found) return INVALID;\n',
        '  uint32_t pc=entry;\n',
        '  for (uint32_t i=0;i<found->count;i++,pc+=4u) {\n',
        '    const uint32_t op=found->words[i];\n',
        '    if (op==0x60000000u) continue;\n',
        '    if (op==0x4e800020u) return value;\n',
        '    if ((op>>26u)==14u) {\n',
        '      if (((op>>21u)&31u)!=3u || ((op>>16u)&31u)!=3u) return INVALID;\n',
        '      const int32_t imm=static_cast<int16_t>(op&65535u);\n',
        '      value=value+static_cast<uint32_t>(imm);continue;\n',
        '    }\n',
        '    if ((op>>26u)==18u && (op&3u)==1u) {\n',
        '      int32_t disp=static_cast<int32_t>(op&0x03fffffcu);\n',
        '      if ((disp&0x02000000)!=0) disp-=0x04000000;\n',
        '      const uint32_t target=pc+static_cast<uint32_t>(disp);\n',
        '      value=execute(target,value,depth+1u);\n',
        '      if (value==INVALID) return INVALID;\n      continue;\n',
        '    }\n',
        '    return INVALID;\n',
        '  }\n',
        '  return INVALID;\n',
        '}\n',
        '} // anonymous namespace\n',
        'extern "C" uint32_t nsmb_toy_execute(uint32_t entry,uint32_t initial) {\n',
        '  return execute(entry,initial,0u);\n',
        '}\n',
        f'extern "C" uint32_t nsmb_toy_function_count() {{return {len(funcs)}u;}}\n',
        f'extern "C" uint32_t nsmb_toy_source_tag() {{return 0x{sha256(source).hexdigest()[:8]}u;}}\n',
        '#ifdef NSMB_TOY_NATIVE_MAIN\n',
        'int main(int argc,char **argv) {\n',
        '  if (argc!=3) return 64;\n',
        '  const auto entry=static_cast<uint32_t>(std::strtoul(argv[1],nullptr,0));\n',
        '  const auto value=static_cast<uint32_t>(std::strtoul(argv[2],nullptr,0));\n',
        '  std::printf("%u\\n",nsmb_toy_execute(entry,value));\n',
        '  return 0;\n',
        '}\n',
        '#endif\n'
    ])
    return ''.join(text).encode('ascii')
