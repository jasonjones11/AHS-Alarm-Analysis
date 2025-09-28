import os 
from PyInstaller.utils.hooks import collect_data_files 
from PyInstaller import __main__ as pyi_main 
from PyInstaller.building.api import EXE, PYZ 
from PyInstaller.building.build_main import Analysis 
 
# Collect data files 
datas = [] 
datas += collect_data_files('uvicorn') 
if os.path.exists('database'): 
    datas.append(('database', 'database')) 
for json_file in ['alarm_types.json']: 
    if os.path.exists(json_file): 
        datas.append((json_file, '.')) 
 
a = Analysis(['main.py'], 
             pathex=['.'], 
             binaries=[], 
             datas=datas, 
             hiddenimports=['uvicorn.lifespan.on', 'uvicorn.lifespan.off', 'uvicorn.protocols.websockets.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl', 'uvicorn.protocols.websockets.websockets_impl', 'uvicorn.protocols.websockets.wsproto_impl', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.loops.uvloop'], 
             hookspath=[], 
             hooksconfig={}, 
             runtime_hooks=[], 
             excludes=[], 
             win_no_prefer_redirects=False, 
             win_private_assemblies=False, 
             cipher=None, 
             noarchive=False) 
pyz = PYZ(a.pure, a.zipped_data, cipher=None) 
exe = EXE(pyz, 
          a.scripts, 
          a.binaries, 
          a.zipfiles, 
          a.datas, 
          name='ahs-backend', 
          debug=False, 
          bootloader_ignore_signals=False, 
          strip=False, 
          upx=True, 
          upx_exclude=[], 
          console=True, 
          disable_windowed_traceback=False, 
          target_arch=None, 
          codesign_identity=None, 
          entitlements_file=None) 
