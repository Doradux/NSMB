"""Author-owned invented PPC-Lite leaf and value-only W03 adapter contract.

No original Wii bytes. The LEAF is computation only; it never authorizes
a service, allocates W03 tickets or writes CpuContext/clock/quota.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import IntEnum
from hashlib import sha256
import json

from scripts.phase17.luigi.producer import BASE,replace_word
from scripts.phase19.luigi.model import source_inputs as phase19_source_inputs
from scripts.phase19.luigi.model import words_from_source

SYNTHETIC_W03_PC=0x80010000
MAX_STEPS=128
MAX_DEPTH=16
UINT32_MASK=0xFFFFFFFF
BLR=0x4E800020


class Status(IntEnum):
    ok=0
    wrongPc=1
    unknownEntry=2
    unsupportedOpcode=3
    recursion=4
    stepLimit=5
    badBranch=6


@dataclass(frozen=True)
class LeafInput:
    entry_offset:int=0
    expected_pc:int=SYNTHETIC_W03_PC
    gpr3:int=0
    lr:int=0
    stack_sentinel:int=0
    max_steps:int=MAX_STEPS


@dataclass(frozen=True)
class LeafResult:
    status:Status=Status.unknownEntry
    gpr3:int=0
    lr:int=0
    return_pc:int=0
    steps:int=0

    @property
    def computed(self)->bool:
        return self.status==Status.ok


def source_inputs()->tuple[bytes,bytes,bytes]:
    source,map_bytes,config=phase19_source_inputs()
    # ONLY invented PPC words. Force negative immediate in the nested callee
    # to test actual signed 16-bit ADDI translation, not a copied P19 output.
    source=replace_word(source,BASE+0x60,0x3863FFFD)
    return source,map_bytes,config


def functions()->dict[int,tuple[int,...]]:
    source,map_bytes,config=source_inputs()
    return words_from_source(source,map_bytes,config)


def graph()->dict[int,tuple[int,...]]:
    corpus=functions()
    targets={}
    for offset,words in corpus.items():
        discoveries=[]
        for i,word in enumerate(words):
            if word>>26==18 and word&3==1:
                disp=word&0x03FFFFFC
                if disp&0x02000000:disp-=0x04000000
                discoveries.append((offset+4*i+disp)&UINT32_MASK)
        targets[offset]=tuple(discoveries)
    return targets


def evaluate(arg:LeafInput)->LeafResult:
    """Independent bytecode oracle; no memory, FPR/GQR, W03 clock, or tickets.

    This is a *PPC-Lite structured call* exercise, not a full PPC emulator:
    BL pushes its local continuation on a shadow stack, BLR pops it.
    The external incoming LR is preserved as ABI caller state. A real PPC
    function requires explicit mflr/mtlr prologues; NONE are synthesized.
    """
    def denied(status:Status,steps:int=0)->LeafResult:
        return LeafResult(status=status,steps=steps)
    if not isinstance(arg,LeafInput):
        return denied(Status.unknownEntry)
    if arg.expected_pc!=SYNTHETIC_W03_PC:
        return denied(Status.wrongPc)
    code=functions()
    if arg.entry_offset not in code:
        return denied(Status.unknownEntry)
    if not (0<=arg.gpr3<=UINT32_MASK and 0<=arg.lr<=UINT32_MASK
            and 0<=arg.stack_sentinel<=UINT32_MASK and
            isinstance(arg.max_steps,int) and 0<arg.max_steps<=MAX_STEPS):
        return denied(Status.stepLimit)
    start=arg.entry_offset
    frame=start
    index=0
    value=arg.gpr3
    calls:list[tuple[int,int]]=[]
    count=0
    while True:
        if count>=arg.max_steps:return denied(Status.stepLimit,count)
        ops=code.get(frame)
        if ops is None or index>=len(ops):
            return denied(Status.badBranch,count)
        word=ops[index]
        pc=frame+index*4
        count+=1
        if word==0x60000000:
            index+=1
        elif word==BLR:
            if calls:
                frame,index=calls.pop()
            else:
                return LeafResult(Status.ok,value,arg.lr,
                                  (arg.expected_pc+4)&UINT32_MASK,count)
        elif word>>26==14:
            if ((word>>21)&31)!=3 or ((word>>16)&31)!=3:
                return denied(Status.unsupportedOpcode,count)
            imm=word&0xFFFF
            if imm&0x8000:imm-=0x10000
            value=(value+imm)&UINT32_MASK
            index+=1
        elif word>>26==18 and word&3==1:
            disp=word&0x03FFFFFC
            if disp&0x02000000:disp-=0x04000000
            target=(pc+disp)&UINT32_MASK
            if target not in code:
                return denied(Status.badBranch,count)
            if len(calls)>=MAX_DEPTH or target==frame or any(f==target for f,_ in calls):
                return denied(Status.recursion,count)
            calls.append((frame,index+1))
            frame,index=target,0
        else:
            return denied(Status.unsupportedOpcode,count)


def provenance()->dict:
    source,map_bytes,config=source_inputs()
    funcs=functions()
    return {
        "format":"nsmb-phase20-invented-ppc-leaf-v2",
        "version":2,
        "sourceSha256":sha256(source).hexdigest(),
        "mapSha256":sha256(map_bytes).hexdigest(),
        "configSha256":sha256(config).hexdigest(),
        "functionOffsets":sorted(funcs),
        "functionGraph":{f"{k:04x}":list(v) for k,v in sorted(graph().items())},
        "w03EntryPc":SYNTHETIC_W03_PC,
        "allowlistedOpcodes":["NOP","ADDI r3,r3,simm16","BL","BLR"],
        "structuredCallSemantics":"shadow-continuation; external LR preserved; NOT full PPC",
        "producerAttested":False,
        "authenticReleaseEligible":False
    }
