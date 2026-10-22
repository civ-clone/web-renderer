import sys, struct, capstone
f=sys.argv[1]; start=int(sys.argv[2],16); n=int(sys.argv[3]) if len(sys.argv)>3 else 60
d=open(f,'rb').read()
hdr=struct.unpack('<H',d[8:10])[0]*16
img=d[hdr:]
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_16)
for i,ins in enumerate(md.disasm(img[start:],start)):
    if i>=n: break
    print(f"{ins.address:05x}: {ins.bytes.hex():12s} {ins.mnemonic} {ins.op_str}")
