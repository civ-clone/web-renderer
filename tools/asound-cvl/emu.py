import sys, struct
from unicorn import *
from unicorn.x86_const import *
LOAD=0x1000
def load(path):
    d=open(path,'rb').read()
    hdr=struct.unpack('<H',d[8:10])[0]*16
    img=bytearray(d[hdr:])
    n=struct.unpack('<H',d[6:8])[0]; ro=struct.unpack('<H',d[0x18:0x1a])[0]
    for i in range(n):
        off,seg=struct.unpack('<HH',d[ro+4*i:ro+4*i+4])
        a=seg*16+off
        v=struct.unpack('<H',img[a:a+2])[0]; img[a:a+2]=struct.pack('<H',(v+LOAD)&0xffff)
    return img
class Drv:
    def __init__(s,path,log_other=False):
        s.img=load(path)
        s.mu=Uc(UC_ARCH_X86,UC_MODE_16)
        s.mu.mem_map(0,0x100000)
        s.mu.mem_write(LOAD*16,bytes(s.img))
        s.mu.mem_write(0x500,b'\xf4')  # hlt stub
        s.tbl=struct.unpack('<11H',s.img[0x32:0x48])
        s.opl=[]; s.other=[]; s.reg=0; s.t=0; s.timerflag=0; s.pit=[]
        s.mu.hook_add(UC_HOOK_INSN,s.hin,None,1,0,UC_X86_INS_IN)
        s.mu.hook_add(UC_HOOK_INSN,s.hout,None,1,0,UC_X86_INS_OUT)
        s.mu.hook_add(UC_HOOK_INTR,s.hint)
        s.mu.reg_write(UC_X86_REG_SS,0x9000); s.mu.reg_write(UC_X86_REG_SP,0xfff0)
    def hin(s,mu,port,size,ud):
        if port in (0x388,0x389): return 0xc0 if s.timerflag else 0
        if port==0x61: return 0
        return 0
    def hout(s,mu,port,size,val,ud):
        if port==0x388: s.reg=val&0xff
        elif port==0x389:
            if s.reg==4: s.timerflag = 1 if (val&1 and not val&0x80) else 0
            s.opl.append((s.t,s.reg,val&0xff))
        else:
            s.other.append((s.t,port,val))
    def hint(s,mu,intno,ud):
        s.other.append((s.t,'int',intno))
    def call(s,fn,*args):
        mu=s.mu
        sp=0xfff0
        for a in reversed(args):
            sp-=2; mu.mem_write(0x90000+sp,struct.pack('<H',a))
        sp-=4; mu.mem_write(0x90000+sp,struct.pack('<HH',0x500,0))
        mu.reg_write(UC_X86_REG_SP,sp)
        mu.reg_write(UC_X86_REG_CS,LOAD); mu.reg_write(UC_X86_REG_DS,LOAD)
        mu.reg_write(UC_X86_REG_ES,LOAD)
        mu.emu_start(LOAD*16+s.tbl[fn],0x500,count=5_000_000)
        return mu.reg_read(UC_X86_REG_AX)
