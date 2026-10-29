from pathlib import Path
import os,zipfile
p=Path(__file__).resolve().parent
archive=p.parent/(p.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for root,dirs,files in os.walk(p):
        dirs[:]=[d for d in dirs if d not in ('node_modules','.remotion','.cache','frames','__pycache__')]
        for name in files:
            if '-check.' in name:continue
            f=Path(root)/name;z.write(f,p.name+'/'+str(f.relative_to(p)))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
print(f'Packaged {archive.name}: {archive.stat().st_size/1024/1024:.1f} MB')
