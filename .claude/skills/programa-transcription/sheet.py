import sys
from pathlib import Path
from PIL import Image, ImageDraw
d=Path(sys.argv[1]); out=sys.argv[2]; cols=int(sys.argv[3]) if len(sys.argv)>3 else 6
files=sorted(d.glob('p*.webp'))
if len(sys.argv)>4: a,b=map(int,sys.argv[4].split('-')); files=files[a-1:b]
W,H=320,450
rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*W,rows*H),'white'); dr=ImageDraw.Draw(sheet)
for k,f in enumerate(files):
    im=Image.open(f).convert('RGB'); im.thumbnail((W-8,H-24))
    x,y=(k%cols)*W,(k//cols)*H; sheet.paste(im,(x+4,y+20)); dr.text((x+6,y+4),f.stem,fill='red')
sheet.save(out,quality=80); print(out,len(files))
