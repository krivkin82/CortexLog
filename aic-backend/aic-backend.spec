# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\krivk\\.cursor\\Cursor Projects\\CortexLog\\aic-backend\\app\\cli.py'],
    pathex=['C:\\Users\\krivk\\.cursor\\Cursor Projects\\CortexLog\\aic-backend'],
    binaries=[],
    datas=[],
    hiddenimports=['app.main', 'openai'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='aic-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
