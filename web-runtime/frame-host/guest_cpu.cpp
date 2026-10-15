// Fixed copyright-free PPC-style ABI and checked instruction trace, not PPC
// code translation, opcode decoding, original game logic or a real Wii fiber.
#include "guest_cpu.hpp"
#include <cstdint>
extern "C" {
uint32_t nsmbw_interop_read32(uint32_t guest);
uint32_t nsmbw_interop_write32(uint32_t guest,uint32_t value);
uint32_t nsmbw_interop_status();
uint32_t nsmbw_interop_retry_safe();
uint32_t nsmbw_interop_device_invoked();
}
namespace SyntheticCpu {
namespace {
constexpr uint32_t InitialSda=0;
// These constants define ONLY our declared synthetic function addresses.
constexpr uint32_t Callsite=Entry+16u, StackBytes=16u;
bool ordinaryStack(uint32_t top) {
  if((top&15u)!=0u || top<StackBytes) return false;
  const uint32_t base=top-StackBytes;
  // Keep writable stack frame in one mapped checked MEM1/MEM2 page; the actual
  // write still goes through W07 and can be rejected due to sparse quota.
  const auto mapped=[](uint32_t a){
    if((a&0xC0000000u)==0x40000000u)return false;
    const uint32_t p=a&0x3FFFFFFFu;
    return p<0x01800000u || (p>=0x10000000u && p<0x18000000u);
  };
  return mapped(base)&&mapped(top-1)&&((base>>12)==((top-1)>>12));
}
Outcome fault() {
  uint32_t code=nsmbw_interop_status();
  if(code==0)code=1;
  // W07 source+device status belong to the immediately preceding checked
  // access. No intervening checked operation is allowed before this capture.
  const uint32_t safe=nsmbw_interop_retry_safe();
  const uint32_t invoked=nsmbw_interop_device_invoked();
  return {false,false,code, safe==1u && invoked==0u ? 1u : 0u};
}
Outcome writeWord(uint32_t guest,uint32_t value) {
  if(!nsmbw_interop_write32(guest,value))return fault();
  return {true,false,0,1};
}
Outcome readWord(uint32_t guest,uint32_t& result) {
  const uint32_t value=nsmbw_interop_read32(guest);
  if(nsmbw_interop_status()!=0)return fault();
  result=value;
  return {true,false,0,1};
}
Outcome invalid() {return {false,false,7,0};} // synthetic invalid PC
}
bool initialize(State& s,uint32_t pc,uint32_t top,uint32_t input,
                uint32_t result,uint32_t salt) {
  if(pc!=Entry || !ordinaryStack(top) || (input&3u) || (result&3u))return false;
  s=State{};
  s.pc=Entry;s.lr=Exit;s.ctr=0;s.cr=0;s.xer=0;s.stackTop=top;
  s.gpr[1]=top;s.gpr[2]=InitialSda;s.gpr[3]=0;
  s.gpr[4]=input;s.gpr[5]=salt;s.gpr[6]=result;s.gpr[13]=InitialSda;
  return true;
}
Outcome step(State& s) {
  if(s.steps>=32)return invalid();
  Outcome o{};
  switch(s.pc) {
    case Entry: { // stwu r1,-16(r1) with old SP written to checked RAM.
      const uint32_t old=s.gpr[1];
      if(old<StackBytes)return invalid();
      const uint32_t next=old-StackBytes;
      o=writeWord(next,old);if(!o.ok)return o;
      s.gpr[1]=next;s.pc=Entry+4u;break;
    }
    case Entry+4u: { // stw saved caller LR, 4(r1)
      o=writeWord(s.gpr[1]+4u,s.lr);if(!o.ok)return o;
      s.pc=Entry+8u;break;
    }
    case Entry+8u: { // lwz r3,0(r4): packet [seq,Y,X,buttons]
      uint32_t packet=0;
      o=readWord(s.gpr[4],packet);if(!o.ok)return o;
      s.gpr[3]=packet;s.pc=Entry+12u;break;
    }
    case Entry+12u: { // bl synthetic_callee, LR points at following callsite
      s.lr=Callsite;s.pc=Callee;break;
    }
    case Callee: { // synthetic C++ callee follows r3 input, r5 salt ABI.
      const uint32_t packet=s.gpr[3];
      s.gpr[3]=(packet&255u)+((packet>>24u)&255u)+s.gpr[5];
      s.pc=Callee+4u;break;
    }
    case Callee+4u: { // blr returns through LR.
      if(s.lr!=Callsite)return invalid();
      s.pc=s.lr;break;
    }
    case Entry+16u: { // stw r3,0(r6) checked output address.
      o=writeWord(s.gpr[6],s.gpr[3]);if(!o.ok)return o;
      s.pc=Entry+20u;break;
    }
    case Entry+20u: { // lwz r0,4(r1) restore caller LR from checked stack
      uint32_t saved=0;
      o=readWord(s.gpr[1]+4u,saved);if(!o.ok)return o;
      s.gpr[0]=saved;s.pc=Entry+24u;break;
    }
    case Entry+24u: { // lwz r1,0(r1) restore caller stack pointer
      uint32_t saved=0;
      o=readWord(s.gpr[1],saved);if(!o.ok)return o;
      if(saved!=s.gpr[1]+StackBytes)return invalid();
      s.gpr[1]=saved;s.pc=Entry+28u;break;
    }
    case Entry+28u: { // mtlr r0
      if(s.gpr[0]!=Exit)return invalid();
      s.lr=s.gpr[0];s.pc=Entry+32u;break;
    }
    case Entry+32u: { // blr back to host return sentinel
      if(s.lr!=Exit)return invalid();
      s.pc=s.lr;o.done=true;break;
    }
    default:return invalid();
  }
  ++s.steps;
  o.ok=true;
  return o;
}
}
