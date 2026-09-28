"""Run the real driver's PlayTune under unicorn for every ID and print which stream each voice was
given, plus any writes the handler made into the data area (the random patches)."""
import os, sys, struct
from unicorn import *
from unicorn.x86_const import *
from emu import Drv, LOAD
PATH = os.environ['CVL']
DS=LOAD*16+0x1e20
VOICES=[0x741c,0x743a,0x7458,0x7476,0x7494,0x74b2,0x74d0,0x74f0,0x7510]
def rd(d,a,n): return d.mu.mem_read(DS+a,n)
def w16(d,a): return struct.unpack('<H',rd(d,a,2))[0]
writes=[]
def hw(mu,access,addr,size,value,ud):
    off=addr-DS
    if 0<=off<0x7328: writes.append((off,size,value))
for sid in range(45):
    for p in ([0,1,2,3] if 5<=sid<=18 else [3]):
        d=Drv(PATH); d.call(0,0)
        d.mu.hook_add(UC_HOOK_MEM_WRITE,hw)
        writes.clear(); d.opl=[]
        ax=d.call(1,sid,p)
        vs=[]
        for i,b in enumerate(VOICES):
            act=rd(d,b,1)[0]; ptr=w16(d,b+0x10); rs=w16(d,b+0x1a); l1=w16(d,b+0x12)
            if act or ptr: vs.append(f"v{i}:{ptr:04x}" + (f"(L1={l1:04x})" if l1!=ptr else '') + (f"(R={rs:04x})" if rs!=ptr else '') + ('' if act else '[inactive]'))
        extra=f" ax={ax:04x}" if sid==2 else ''
        print(f"id {sid:2d} p{p}: {' '.join(vs)}{extra} writes={[(hex(o),hex(v)) for o,s,v in writes]} oplw={len(d.opl)}", flush=True)
