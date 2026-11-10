"""Independent data-only source PPC oracle vectors for C++/Node/Chromium."""
from __future__ import annotations
from .abi import LeafInput,evaluate,SYNTHETIC_W03_PC,MAX_STEPS


def vectors()->list[dict]:
    out=[]
    for entry in (0,0x20,0x40,0x60,0xE0,0xA0,0x300):
        for val in (0,1,100,0xFFFFFFFF):
            arg=LeafInput(entry_offset=entry,gpr3=val,lr=0xCAFE,
                          stack_sentinel=0xDEADBEEF)
            expected=evaluate(arg)
            out.append({
                "args":[entry,SYNTHETIC_W03_PC,val,0xCAFE,0xDEADBEEF,MAX_STEPS],
                "expect":[int(expected.status),expected.gpr3,expected.lr,
                          expected.return_pc,expected.steps]})
    for limit in (0,1,7,8,128,129):
        arg=LeafInput(gpr3=100,lr=0xCAFE,max_steps=limit)
        r=evaluate(arg)
        out.append({"args":[0,SYNTHETIC_W03_PC,100,0xCAFE,0xDEADBEEF,limit],
                    "expect":[int(r.status),r.gpr3,r.lr,r.return_pc,r.steps]})
    for pc in (0,0x80010004):
        r=evaluate(LeafInput(expected_pc=pc,gpr3=100,lr=0xCAFE))
        out.append({"args":[0,pc,100,0xCAFE,0xDEADBEEF,MAX_STEPS],
                    "expect":[int(r.status),r.gpr3,r.lr,r.return_pc,r.steps]})
    return out
