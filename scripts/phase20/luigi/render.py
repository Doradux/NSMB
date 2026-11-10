"""Emit self-contained portable C++ invented PPC-Lite leaf, no host authority.

The output C++ takes a VALUE-ONLY synthetic CPU *snapshot*, emits a
typed RESULT. W03 alone must validate its private Ticket and perform
any actual mutation. A public JS call to probe is NOT permission.
"""
from __future__ import annotations
from hashlib import sha256

from .abi import functions,graph,provenance,MAX_STEPS,MAX_DEPTH,SYNTHETIC_W03_PC


def render_header()->bytes:
    return b'''#pragma once
// INVENTED PPC-Lite only. Public by-value data is NEVER a W03 capability.
// No native CPU pointers, W03 Tickets or grants cross this boundary.
#include <cstdint>
#include <type_traits>
namespace nsmbw::p20::toy {
constexpr uint32_t kExpectedPc=0x80010000u;
constexpr uint32_t kMaxSteps=128u;
enum class Status : uint32_t {
  ok=0, wrongPc=1, unknownEntry=2, unsupportedOpcode=3,
  recursion=4, stepLimit=5, badBranch=6
};
struct Input final {
  uint32_t entryOffset=0, expectedPc=kExpectedPc, gpr3=0;
  uint32_t lr=0, stackSentinel=0, maxSteps=kMaxSteps;
};
struct Result final {
  Status status=Status::unknownEntry;
  uint32_t gpr3=0, lr=0, returnPc=0, steps=0;
  constexpr bool computed() const noexcept {return status==Status::ok;}
};
static_assert(std::is_standard_layout_v<Input>);
static_assert(std::is_trivially_copyable_v<Input>);
static_assert(std::is_standard_layout_v<Result>);
static_assert(sizeof(Input)==24 && sizeof(Result)==20);
static_assert(!Result{}.computed());
// Pure evaluator; expectedPc here is only a synthetic ABI consistency
// check, NOT a lease / quota / origin / clock permission.
Result evaluate(const Input& input) noexcept;
} // namespace nsmbw::p20::toy
// Public TEST-ONLY scalar probe for native + Wasm source/oracle comparison,
// not a production W03 authorization/guest dispatch API.
extern "C" uint32_t nsmb_p20_leaf_probe(uint32_t entry,uint32_t pc,
  uint32_t gpr3,uint32_t lr,uint32_t sentinel,uint32_t maxSteps,
  uint32_t field);
extern "C" uint32_t nsmb_p20_leaf_source_tag();
'''


def render_cpp()->bytes:
    funcs=functions()
    metadata=provenance()
    out=[
        "// Phase20 Luigi: invented PPC-Lite translated C++ (NO Nintendo).\n",
        f'// SOURCE_SHA256 {metadata["sourceSha256"]}\n',
        '// Local BL shadow return stack is NOT full PowerPC LR semantics.\n',
        '#include "toy_leaf_abi.hpp"\n',
        '#include <cstddef>\n',
        '#ifdef NSMB_P20_TOY_MAIN\n#include <cstdio>\n#include <cstdlib>\n#endif\n',
        'namespace nsmbw::p20::toy {\n',
        'namespace {\n',
        'struct WordFunction {uint32_t offset; const uint32_t* words; uint32_t count;};\n',
        'struct ReturnFrame {uint32_t offset,index;};\n',
        'constexpr uint32_t INVALID32=0xffffffffu;\n'
    ]
    for entry,words in sorted(funcs.items()):
        parts=", ".join(f'0x{w:08x}u' for w in words)
        out.append(f'constexpr uint32_t code_{entry:04x}[] = {{{parts}}};\n')
    out.append('constexpr WordFunction functions[] = {\n')
    for entry,words in sorted(funcs.items()):
        out.append(f'  {{0x{entry:04x}u,code_{entry:04x},{len(words)}u}},\n')
    out.extend([
        '};\n',
        'constexpr const WordFunction* lookup(uint32_t off) noexcept {\n',
        '  for(const auto& f:functions) if(f.offset==off)return &f;\n',
        '  return nullptr;\n',
        '}\n',
        'constexpr Result deny(Status code,uint32_t steps) noexcept {\n',
        '  return {code,0u,0u,0u,steps};\n',
        '}\n',
        '} // anonymous namespace\n',
        'Result evaluate(const Input& in) noexcept {\n',
        '  if(in.expectedPc!=kExpectedPc)return deny(Status::wrongPc,0u);\n',
        '  if(!lookup(in.entryOffset))return deny(Status::unknownEntry,0u);\n',
        '  if(in.maxSteps==0u || in.maxSteps>kMaxSteps)\n',
        '    return deny(Status::stepLimit,0u);\n',
        '  ReturnFrame calls[16]{};\n',
        '  uint32_t depth=0u,frame=in.entryOffset,index=0u;\n',
        '  uint32_t value=in.gpr3,steps=0u;\n',
        '  for(;;) {\n',
        '    if(steps>=in.maxSteps)return deny(Status::stepLimit,steps);\n',
        '    const WordFunction* f=lookup(frame);\n',
        '    if(!f || index>=f->count)return deny(Status::badBranch,steps);\n',
        '    const uint32_t word=f->words[index];\n',
        '    const uint32_t pc=frame+4u*index;\n',
        '    ++steps;\n',
        '    if(word==0x60000000u){++index;continue;}\n',
        '    if(word==0x4e800020u){\n',
        '      if(depth>0u){\n',
        '        const ReturnFrame ret=calls[--depth];\n',
        '        frame=ret.offset;index=ret.index;continue;\n',
        '      }\n',
        '      return {Status::ok,value,in.lr,in.expectedPc+4u,steps};\n',
        '    }\n',
        '    if((word>>26u)==14u){\n',
        '      if(((word>>21u)&31u)!=3u || ((word>>16u)&31u)!=3u)\n',
        '        return deny(Status::unsupportedOpcode,steps);\n',
        '      const int32_t imm=static_cast<int16_t>(word&65535u);\n',
        '      value+=static_cast<uint32_t>(imm);++index;continue;\n',
        '    }\n',
        '    if((word>>26u)==18u && (word&3u)==1u){\n',
        '      int32_t disp=static_cast<int32_t>(word&0x03fffffcu);\n',
        '      if((disp&0x02000000)!=0)disp-=0x04000000;\n',
        '      const uint32_t target=pc+static_cast<uint32_t>(disp);\n',
        '      if(!lookup(target))return deny(Status::badBranch,steps);\n',
        '      if(depth>=16u || target==frame)return deny(Status::recursion,steps);\n',
        '      for(uint32_t i=0;i<depth;i++)\n',
        '        if(calls[i].offset==target)return deny(Status::recursion,steps);\n',
        '      calls[depth++]={frame,index+1u};\n',
        '      frame=target;index=0u;continue;\n',
        '    }\n',
        '    return deny(Status::unsupportedOpcode,steps);\n',
        '  }\n',
        '}\n',
        '} // namespace nsmbw::p20::toy\n',
        'extern "C" uint32_t nsmb_p20_leaf_probe(uint32_t entry,uint32_t pc,\n',
        '  uint32_t gpr3,uint32_t lr,uint32_t sentinel,uint32_t maxSteps,\n',
        '  uint32_t field) {\n',
        '  const auto result=nsmbw::p20::toy::evaluate(\n',
        '    {entry,pc,gpr3,lr,sentinel,maxSteps});\n',
        '  switch(field){\n',
        '    case 0u:return static_cast<uint32_t>(result.status);\n',
        '    case 1u:return result.gpr3;\n',
        '    case 2u:return result.lr;\n',
        '    case 3u:return result.returnPc;\n',
        '    case 4u:return result.steps;\n',
        '    default:return 0xffffffffu;\n',
        '  }\n',
        '}\n',
        f'extern "C" uint32_t nsmb_p20_leaf_source_tag()'
        f'{{return 0x{metadata["sourceSha256"][:8]}u;}}\n',
        '#ifdef NSMB_P20_TOY_MAIN\n',
        'int main(int argc,char **argv){\n',
        '  if(argc!=7)return 64;\n',
        '  const uint32_t entry=static_cast<uint32_t>(std::strtoul(argv[1],nullptr,0));\n',
        '  const uint32_t pc=static_cast<uint32_t>(std::strtoul(argv[2],nullptr,0));\n',
        '  const uint32_t val=static_cast<uint32_t>(std::strtoul(argv[3],nullptr,0));\n',
        '  const uint32_t lr=static_cast<uint32_t>(std::strtoul(argv[4],nullptr,0));\n',
        '  const uint32_t sentinel=static_cast<uint32_t>(std::strtoul(argv[5],nullptr,0));\n',
        '  const uint32_t limit=static_cast<uint32_t>(std::strtoul(argv[6],nullptr,0));\n',
        '  using nsmbw::p20::toy::evaluate;\n',
        '  const auto r=evaluate({entry,pc,val,lr,sentinel,limit});\n',
        '  std::printf("%u %u %u %u %u\\n",static_cast<uint32_t>(r.status),\n',
        '     r.gpr3,r.lr,r.returnPc,r.steps);\n',
        '  return 0;\n',
        '}\n',
        '#endif\n'
    ])
    return ''.join(out).encode('ascii')
