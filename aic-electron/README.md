# CortexLog (Electron)

## Development (hot reload)

1. Start the FastAPI backend (e.g. `aic-backend/run_dev.bat` or `uvicorn app.main:app --host 127.0.0.1 --port 8000`).
2. From this folder:

```bash
npm install
npm run dev
```

This runs Vite on `http://127.0.0.1:5173` and launches Electron with `VITE_DEV=1`.

## Production-like run (built renderer)

```bash
npm run renderer:build
npm start
```

Electron loads `renderer-dist/index.html` in non-dev mode. If it is missing, the app shows an error and exits.

## Packaged app

1. Build the backend executable (from repo root or `aic-backend`):

```bash
cd ../aic-backend
build_backend.bat
```

2. Build the Electron app:

```bash
cd ../aic-electron
npm run build
```

Requires `../aic-backend/dist/aic-backend.exe` for `extraResources`.

### If you hit permission or access issues (Windows)

**Symptom:** Electron build fails with `Cannot create symbolic link` / `A required privilege is not held by the client` while extracting **winCodeSign**, or similar 7-Zip errors.

**Option A — Developer Mode (recommended):** allows symlink creation without elevation.

1. Open **Settings → System → For developers** (or **Privacy & security → For developers** on some builds).
2. Turn **Developer Mode** on.
3. Close and reopen your terminal, then run the build commands below again.

**Option B — Disable code-signing discovery for this session** (often enough even without Developer Mode; the project already sets `signDlls` / `signAndEditExecutable` to false in `package.json`):

PowerShell (from the `aic-electron` folder, after the backend exe exists):

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
```

**Symptom:** `Access is denied` writing to `dist`, `node_modules`, or PyInstaller `build`/`dist`.

- Move the repo out of **protected** folders if needed (e.g. avoid sync-only or highly locked directories).
- Run the terminal **as your normal user** with write access to the project drive.
- Temporarily exclude the project folder from aggressive antivirus real-time scanning if it blocks `.exe` creation.

**Symptom:** Stale or broken **electron-builder** cache.

PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
```

Then run `npm run build` again (with Option A or B if the symlink error returns).

### Full build (copy-paste)

PowerShell: open the repo root in Explorer, **Shift+right-click → Open in Terminal**, then:

```powershell
Set-Location .\aic-backend
python -m pip install -r requirements.txt
python -m pip install pyinstaller
.\build_backend.bat

Set-Location ..\aic-electron
npm install
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
```

Outputs:

- Backend: `aic-backend\dist\aic-backend.exe`
- App: `aic-electron\dist\CortexLog 0.1.0.exe` (portable) and `aic-electron\dist\CortexLog Setup 0.1.0.exe` (installer)
