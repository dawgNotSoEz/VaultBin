# Problems Faced & Solutions

This document records every non-trivial bug, architectural design challenge, and environment issue encountered during the development of Vaulbin, along with their solutions.

Refer back to the main documentation in [README.md](file:///c:/Users/pkaur/Documents/Python/VaultBin/README.md).

---

## Table of Problems

1. [Docker Daemon Not Running](#1-docker-daemon-not-running)
2. [Docker Compose Could Not Find Dockerfile for Frontend](#2-docker-compose-could-not-find-dockerfile-for-frontend)
3. [Backend 500 Error on POST (AttributeError: 'DocumentCreate' object has no attribute 'content')](#3-backend-500-error-on-post-attributeerror-documentcreate-object-has-no-attribute-content)
4. [Burn-After-Reading Immediately Returned 404 Even on First Read](#4-burn-after-reading-immediately-returned-404-even-on-first-read)
5. [Burn + Password Combination Broke Password Verification](#5-burn--password-combination-broke-password-verification)
6. [React StrictMode Double-Fetch Caused Burn to Trigger Twice](#6-react-strictmode-double-fetch-caused-burn-to-trigger-twice)
7. [WASM Integration Error with argon2-browser and libsodium-wrappers](#7-wasm-integration-error-with-argon2-browser-and-libsodium-wrappers)
8. [Duplicate Function Definition and Variable Shadowing in utils.js](#8-duplicate-function-definition-and-variable-shadowing-in-utilsjs)
9. ["base64url.replace is not a function" After Password Verification](#9-base64urlreplace-is-not-a-function-after-password-verification)

---

## 1. Docker Daemon Not Running

### Problem
Executing `docker compose up --build` fails with:
`failed to connect to the docker API at npipe:////./pipe/docker_engine - Is the docker daemon running?`

### Cause
The Docker Desktop engine was not running or initialized on the developer's system.

### Solution
Launch **Docker Desktop** and wait until the status indicator turns green (engine active) before running container commands.

---

## 2. Docker Compose Could Not Find Dockerfile for Frontend

### Problem
Docker compose build output throws:
`failed to read dockerfile: open Dockerfile: no such file or directory`

### Cause
The Dockerfile inside the `frontend/` directory was named incorrectly with a lowercase `d` (`dockerfile` instead of `Dockerfile`), which docker compose failed to recognize.

### Solution
Rename `frontend/dockerfile` to [Dockerfile](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/Dockerfile) with proper capitalization.

---

## 3. Backend 500 Error on POST (AttributeError: 'DocumentCreate' object has no attribute 'content')

### Problem
After changing the schema to use encrypted base64 payload objects, the document creation API threw:
`AttributeError: 'DocumentCreate' object has no attribute 'content'`

### Cause
The router [documents.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/routers/documents.py) was still referencing `doc.content` instead of `doc.ciphertext` and `doc.iv` after the transition to client-side encryption.

### Solution
Updated the route handler in [documents.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/routers/documents.py) to access `doc.ciphertext`, `doc.iv`, and passed them properly to [document_service.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/services/document_service.py).

---

## 4. Burn-After-Reading Immediately Returned 404 Even on First Read

### Problem
Pastes created with `burn_after_reading: true` could not be viewed at all. Retrievals yielded `404 Not Found` immediately.

### Cause
The initial implementation stored a Redis key `burn:{id}` with value `"0"` at creation. During retrieval, the code checked existence and set the value to `"1"` using `redis.set("burn:{id}", "1", nx=True)`. Because the key was pre-populated, the `nx=True` write failed, leading the service logic to conclude that the document was already read.

### Solution
Changed retrieval to use `SET ... GET` atomically. By performing `await redis.set(f"burn:{doc_id}", "1", get=True)`, the previous value is read and marked simultaneously. If the previous value was `"0"`, it designates a valid first read.

---

## 5. Burn + Password Combination Broke Password Verification

### Problem
Pastes using both password protection and burn-after-reading failed to unlock. Unlocking threw `403 Wrong Password` or `404 Not Found` upon correct password input.

### Cause
The default `get_document` service logic executed deletion immediately upon the first `GET` (which triggers when frontend loads the metadata page). This occurred *before* the user saw the password prompt. Consequently, when the user submitted a password, the verify endpoint failed to find the document.

### Solution
Modified [document_service.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/services/document_service.py) so that `get_document` skips deletion if `password_hash` is present. Instead, the self-destruction logic runs inside `verify_password` immediately after correct credentials have been validated.

---

## 6. React StrictMode Double-Fetch Caused Burn to Trigger Twice

### Problem
In development, pastes set to burn-after-reading immediately burned and displayed `404 Not Found` when opened.

### Cause
React's `<React.StrictMode>` mounts and mounts components twice in development to uncover side-effects. The first mount successfully read the document (causing the backend to delete it), and the second immediate mount fetched a 404.

### Solution
Introduced a `useRef` guard variable (`hasLoaded`) in [App.jsx](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/App.jsx) that flags when the fetch function runs, preventing duplicate hook execution on initial render:
```javascript
if (!hasLoaded.current) {
  loadDocument(id, keyFromHash);
  hasLoaded.current = true;
}
```

---

## 7. WASM Integration Error with argon2-browser and libsodium-wrappers

### Problem
Building the production web bundle failed:
`"ESM integration proposal for Wasm" is not supported currently. Use assets instead.`

### Cause
Libraries like `argon2-browser` and `libsodium-wrappers` compile WASM in a format incompatible with Vite's default bundler pipeline without heavy plugin configuration.

### Solution
Replaced those libraries with:
1. **[hash-wasm](https://github.com/DanPotash/hash-wasm)**: Fully compatible with ESM out of the box. Used for Argon2id key derivation.
2. **Web Crypto API (Native)**: Switched the wrapping algorithm to native `AES-KW` for wrapping the document key, removing the need for external C-compiled WASM dependencies.

---

## 8. Duplicate Function Definition and Variable Shadowing in utils.js

### Problem
Compilation fails with:
`Identifier 'buffer' has already been declared` and `Identifier 'bufferToBase64url' has already been declared`

### Cause
Two copies of `bufferToBase64url` existed inside [utils.js](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/crypto/utils.js). Additionally, inside the decoding function, a parameter named `buffer` conflicted with a local constant declaration.

### Solution
Removed the duplicate non-exported copy of `bufferToBase64url` in [utils.js](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/crypto/utils.js) and renamed variables inside the decoding scope to ensure uniqueness.

---

## 9. "base64url.replace is not a function" After Password Verification

### Problem
After successfully entering a correct password for a burn paste, the UI crashed with:
`TypeError: base64url.replace is not a function`

### Cause
Upon password verification, the frontend was issuing a duplicate call to `getDocument` to retrieve ciphertext and IV. Since the backend deletes the record immediately during verification (to burn it), this second GET returned a 404, setting the `doc` object to undefined. Passing `undefined` to decryption utility functions threw the type error.

### Solution
Modified [App.jsx](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/App.jsx) to cache the encrypted ciphertext and IV from the *initial* GET request (before presenting the password prompt). Password verification now decrypts using these cached values directly, avoiding the need to make a second backend GET request.