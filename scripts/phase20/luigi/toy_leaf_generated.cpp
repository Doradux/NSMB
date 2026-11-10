// Phase20 Luigi: invented PPC-Lite translated C++ (NO Nintendo).
// SOURCE_SHA256 167ae443b59b03c89a898d3e74bf9f39588c355f0c261f845f9725f1b99f03cb
// Local BL shadow return stack is NOT full PowerPC LR semantics.
#include "toy_leaf_abi.hpp"
#include <cstddef>
#ifdef NSMB_P20_TOY_MAIN
#include <cstdio>
#include <cstdlib>
#endif
namespace nsmbw::p20::toy {
namespace {
struct WordFunction {uint32_t offset; const uint32_t* words; uint32_t count;};
struct ReturnFrame {uint32_t offset,index;};
constexpr uint32_t INVALID32=0xffffffffu;
constexpr uint32_t code_0000[] = {0x48000021u, 0x480000ddu, 0x38630005u, 0x4e800020u};
constexpr uint32_t code_0020[] = {0x38630002u, 0x4e800020u};
constexpr uint32_t code_0040[] = {0x48000021u, 0x38630007u, 0x4e800020u};
constexpr uint32_t code_0060[] = {0x3863fffdu, 0x4e800020u};
constexpr uint32_t code_00a0[] = {0x48000021u, 0x4e800020u};
constexpr uint32_t code_00e0[] = {0x3863000bu, 0x4e800020u};
constexpr WordFunction functions[] = {
  {0x0000u,code_0000,4u},
  {0x0020u,code_0020,2u},
  {0x0040u,code_0040,3u},
  {0x0060u,code_0060,2u},
  {0x00a0u,code_00a0,2u},
  {0x00e0u,code_00e0,2u},
};
constexpr const WordFunction* lookup(uint32_t off) noexcept {
  for(const auto& f:functions) if(f.offset==off)return &f;
  return nullptr;
}
constexpr Result deny(Status code,uint32_t steps) noexcept {
  return {code,0u,0u,0u,steps};
}
} // anonymous namespace
Result evaluate(const Input& in) noexcept {
  if(in.expectedPc!=kExpectedPc)return deny(Status::wrongPc,0u);
  if(!lookup(in.entryOffset))return deny(Status::unknownEntry,0u);
  if(in.maxSteps==0u || in.maxSteps>kMaxSteps)
    return deny(Status::stepLimit,0u);
  ReturnFrame calls[16]{};
  uint32_t depth=0u,frame=in.entryOffset,index=0u;
  uint32_t value=in.gpr3,steps=0u;
  for(;;) {
    if(steps>=in.maxSteps)return deny(Status::stepLimit,steps);
    const WordFunction* f=lookup(frame);
    if(!f || index>=f->count)return deny(Status::badBranch,steps);
    const uint32_t word=f->words[index];
    const uint32_t pc=frame+4u*index;
    ++steps;
    if(word==0x60000000u){++index;continue;}
    if(word==0x4e800020u){
      if(depth>0u){
        const ReturnFrame ret=calls[--depth];
        frame=ret.offset;index=ret.index;continue;
      }
      return {Status::ok,value,in.lr,in.expectedPc+4u,steps};
    }
    if((word>>26u)==14u){
      if(((word>>21u)&31u)!=3u || ((word>>16u)&31u)!=3u)
        return deny(Status::unsupportedOpcode,steps);
      const int32_t imm=static_cast<int16_t>(word&65535u);
      value+=static_cast<uint32_t>(imm);++index;continue;
    }
    if((word>>26u)==18u && (word&3u)==1u){
      int32_t disp=static_cast<int32_t>(word&0x03fffffcu);
      if((disp&0x02000000)!=0)disp-=0x04000000;
      const uint32_t target=pc+static_cast<uint32_t>(disp);
      if(!lookup(target))return deny(Status::badBranch,steps);
      if(depth>=16u || target==frame)return deny(Status::recursion,steps);
      for(uint32_t i=0;i<depth;i++)
        if(calls[i].offset==target)return deny(Status::recursion,steps);
      calls[depth++]={frame,index+1u};
      frame=target;index=0u;continue;
    }
    return deny(Status::unsupportedOpcode,steps);
  }
}
} // namespace nsmbw::p20::toy
extern "C" uint32_t nsmb_p20_leaf_probe(uint32_t entry,uint32_t pc,
  uint32_t gpr3,uint32_t lr,uint32_t sentinel,uint32_t maxSteps,
  uint32_t field) {
  const auto result=nsmbw::p20::toy::evaluate(
    {entry,pc,gpr3,lr,sentinel,maxSteps});
  switch(field){
    case 0u:return static_cast<uint32_t>(result.status);
    case 1u:return result.gpr3;
    case 2u:return result.lr;
    case 3u:return result.returnPc;
    case 4u:return result.steps;
    default:return 0xffffffffu;
  }
}
extern "C" uint32_t nsmb_p20_leaf_source_tag(){return 0x167ae443u;}
#ifdef NSMB_P20_TOY_MAIN
int main(int argc,char **argv){
  if(argc!=7)return 64;
  const uint32_t entry=static_cast<uint32_t>(std::strtoul(argv[1],nullptr,0));
  const uint32_t pc=static_cast<uint32_t>(std::strtoul(argv[2],nullptr,0));
  const uint32_t val=static_cast<uint32_t>(std::strtoul(argv[3],nullptr,0));
  const uint32_t lr=static_cast<uint32_t>(std::strtoul(argv[4],nullptr,0));
  const uint32_t sentinel=static_cast<uint32_t>(std::strtoul(argv[5],nullptr,0));
  const uint32_t limit=static_cast<uint32_t>(std::strtoul(argv[6],nullptr,0));
  using nsmbw::p20::toy::evaluate;
  const auto r=evaluate({entry,pc,val,lr,sentinel,limit});
  std::printf("%u %u %u %u %u\n",static_cast<uint32_t>(r.status),
     r.gpr3,r.lr,r.returnPc,r.steps);
  return 0;
}
#endif
