# Security Architecture and Secret Store

> **Purpose:** This document describes the security hardening and secret store implementation. When changing auth, encryption, API keys, Gmail tokens, or related flows, read this first to understand what exists and where.

---

## Overview

The app uses a layered security model:

1. **Local API token** – Backend authenticates all requests via `X-API-Key` (except `/health`).
2. **Application password** – User-set password used to derive keys for encrypting secrets (e.g. Gmail token). Never sent to the backend; only a hash (for verification) and derived keys (for encrypt/decrypt) are used.
3. **Secret store** – Backend stores encrypted secrets (e.g. `gmail_access_token`); client provides a derived key for read/write.

---

## Data Directory

**Location:** `aic-backend/data/` (relative to backend root)

- `api_token` – Local API token for backend auth
- `auth.json` – Salt and `password_verification_hash`
- `secrets.json` – Encrypted secrets (e.g. Gmail token)
- `aic.db` – SQLite database

Electron reads the API token from the same path when running in dev:  
`<project>/aic-backend/data/api_token`.

---

## Backend Components

### API token

| File | Role |
|------|------|
| `aic-backend/app/security/api_auth.py` | Generates/persists token, exposes `get_api_token()`, `_extract_token()` |
| `aic-backend/app/main.py` | Middleware validates `X-API-Key` or `Authorization: Bearer`; exempts `/health` |

### Salt and password verification

| File | Role |
|------|------|
| `aic-backend/app/security/auth_data.py` | `get_salt()`, `set_password_hash()`, `verify_password_hash()` |
| `aic-backend/app/security/auth_data.py` | Salt stored in `data/auth.json`; created on first use |

### Encryption

| File | Role |
|------|------|
| `aic-backend/app/security/encryption.py` | PBKDF2 (SHA-256, 100k iter) + Fernet; `encrypt_with_derived_key`, `decrypt_with_derived_key` |
| `aic-backend/app/security/secret_store.py` | `store_secret_with_key()`, `get_secret_with_key()` for client-derived keys |

### API routes

| Endpoint | Purpose |
|----------|---------|
| `GET /auth/salt` | Returns salt for client key derivation |
| `POST /auth/set-password` | Stores `password_hash` for verification |
| `POST /auth/verify` | Verifies `password_hash` |
| `POST /secrets/store-with-key` | Store secret using client-provided derived key |
| `POST /secrets/get-with-key` | Retrieve/decrypt secret using derived key |

---

## Electron / Frontend Components

### API token injection

| File | Role |
|------|------|
| `aic-electron/main.js` | `ipcMain.handle("aic:get-api-key")` reads token from `aic-backend/data/api_token` |
| `aic-electron/preload.js` | Exposes `window.aic.getApiKey()` |
| `aic-electron/src/lib/api.ts` | Centralized `apiFetch()` and helpers for authenticated backend calls |
| `aic-electron/src/components/*.tsx` | UI surfaces call backend routes through `src/lib/api.ts` |

### Client-side crypto

| File | Role |
|------|------|
| `aic-electron/src/components/ProviderSettings.tsx` | Provider key configuration and connection test UI; key entry never logs secret values |

### Settings menu and windows

| Item | File | Role |
|------|------|------|
| File > Settings | `aic-electron/main.js`, `aic-electron/src/App.tsx` | Opens the in-app settings surface |
| AI provider settings | `aic-electron/src/components/ProviderSettings.tsx` | Configure/test provider and model selection |
| Mode UI | `aic-electron/src/components/*.tsx` | Journal / Explore / Modify mode panels in the React renderer |

### Gmail token flow

- **Storage:** Secret `gmail_access_token` in secret store; **not** in connector settings.
- **Management:** File > Settings > Connections > Gmail – user enters password, sees/edits token.
- **Ingest:** Main window “Run Gmail Ingest” prompts for password, fetches token via `get-with-key`, POSTs to `/ingest/gmail`.

---

## Key Derivation (Client ↔ Backend)

- **Algorithm:** PBKDF2-HMAC-SHA256
- **Iterations:** 100,000
- **Salt:** From `GET /auth/salt` (stored in `auth.json`)
- **Password verification:** SHA-256(password + salt), hex-encoded
- **Fernet key:** 32-byte PBKDF2 output, base64url-encoded

Client and backend must use the same salt and parameters.

---

## XSS Mitigations

- Filtered insights window: `escapeHtml(insight.content)`, `escapeHtml(reason)`
- Chat citations: `escapeHtml(c.label)` for each citation label

---

## webPreferences (Electron)

All `BrowserWindow`s use:

- `contextIsolation: true`
- `nodeIntegration: false`
- `preload` with `contextBridge` for IPC

---

## Out of Scope (current implementation)

- **Email-based password reset** – Reset shows a message that a link would be sent to `krivkin82@gmail.com`; no actual email sending.
- **Packaged app data path** – Token path for packaged builds may differ; dev uses `aic-backend/data/`.

---

## Quick reference: where to change what

| Need to change… | Edit |
|-----------------|------|
| API token generation/location | `api_auth.py`, `main.js` (getApiTokenPath) |
| Salt or password hash storage | `auth_data.py` |
| Encryption algorithm | `encryption.py` and matching client request flow under `aic-electron/src/` |
| New secret type | Use `gmail_access_token` pattern; add key constant and UI |
| Auth API routes | `aic-backend/app/api/routes.py` |
| Settings UI | `aic-electron/src/App.tsx`, `aic-electron/src/components/ProviderSettings.tsx` |
| Main renderer shell | `aic-electron/src/main.tsx`, `aic-electron/src/App.tsx`, `aic-electron/src/index.css` |
| All backend fetches | Use `aic-electron/src/lib/api.ts`; include `X-API-Key` via preload `getApiKey()` |
