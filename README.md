# Vaulbin – Zero-Knowledge Encrypted Pastebin

Vaulbin is a privacy-first, end-to-end encrypted pastebin where all encryption/decryption happens directly in the browser. The server only sees random ciphertext and can never read your data.

---

## Table of Contents
1. [Features](#features)
2. [Technology Stack](#technology-stack)
3. [Quick Start](#quick-start)
4. [API Endpoints (REST)](#api-endpoints-rest)
5. [Security Design](#security-design)
6. [Project Structure](#project-structure)
7. [Problems Faced & Solutions](#problems-faced--solutions)
8. [License](#license)

---

## Features

- **Zero-Knowledge Architecture**: AES-256-GCM encryption/decryption occurs entirely client-side. The encryption key is placed in the URL fragment (`#key=...`) and is never sent to the server.
- **Burn-After-Reading**: Optionally configure pastes to self-destruct after their first successful retrieval.
- **Password Protection (Optional)**: A second layer of security using Argon2id for key derivation and AES-KW for key wrapping. Even if the URL is compromised, the paste remains encrypted without the password. The server only stores a bcrypt hash of the password.
- **Auto-Expiry**: Configure paste lifetimes from 1 hour up to 7 days, automatically cleaned up by MongoDB TTL indexes.
- **Editable Documents**: Authorized users can edit and save updates back to the same URL, featuring optimistic concurrency control to prevent version conflicts.
- **Rate Limiting & Security**: Built-in protection against brute-force attacks, XSS, and security headers applied to every response.
- **Dockerized**: Spin up the entire multi-service stack with a single command.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) + Uvicorn |
| **Database** | MongoDB (Async driver via Motor) |
| **Cache & Expiry** | Redis |
| **Frontend** | React 18 + Vite |
| **Encryption** | Native Web Crypto API |
| **Password KDF** | Argon2id ([hash-wasm](https://github.com/DanPotash/hash-wasm)) + AES-KW |
| **Containers** | Docker + Docker Compose |

---

## Quick Start

1. Clone the repository.
2. Navigate to the project root directory.
3. Run the containerized services:
   ```bash
   docker compose up --build
   ```
4. Open the web app at `http://localhost:5173`.
5. The API is hosted at `http://localhost:8000`, with interactive Swagger docs at `http://localhost:8000/docs`.

---

## API Endpoints (REST)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/documents` | Create a new encrypted document |
| **GET** | `/api/documents/{doc_id}` | Retrieve a document (ciphertext only) |
| **PUT** | `/api/documents/{doc_id}` | Update an existing document (version checked) |
| **DELETE** | `/api/documents/{doc_id}` | Manually delete a document |
| **POST** | `/api/documents/{doc_id}/verify-password` | Verify password and return wrapped key |

---

## Security Design

1. **Client-Side Key Generation**: AES-GCM 256-bit key is generated natively using `crypto.subtle.generateKey` in the browser.
2. **URL Fragment Storage**: The key is stored in the fragment portion of the URL (after the `#` symbol). Browsers do not send this fragment to the server in HTTP requests.
3. **Password Protection Flow**:
   - Argon2id derives a wrapping key from the user-entered password and a randomly generated salt.
   - The document AES key is wrapped via AES-KW using the derived wrapping key.
   - The server only stores the wrapped key, the password salt, and a bcrypt hash of the password.
4. **Atomic Self-Destruct**: Burn-after-reading works atomically via Redis. The first GET/verification request deletes the MongoDB record, ensuring that future reads result in a 404.

---

## Project Structure

```text
vaulbin/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/document.py
│   │   ├── db/mongodb.py, redis.py
│   │   ├── services/document_service.py
│   │   ├── routers/documents.py
│   │   ├── middleware/rate_limit.py, security_headers.py
│   │   └── utils/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── crypto/utils.js
│   │   ├── api/documents.js
│   │   ├── components/PasswordPrompt.jsx
│   │   └── App.jsx
│   ├── Dockerfile
│   └── vite.config.js
├── docker-compose.yml
└── .github/workflows/ci.yml
```

### Key File Directories:
- **Backend Entrypoint**: [main.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/main.py)
- **Document Service Logic**: [document_service.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/services/document_service.py)
- **Document API Router**: [documents.py](file:///c:/Users/pkaur/Documents/Python/VaultBin/backend/app/routers/documents.py)
- **Frontend App**: [App.jsx](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/App.jsx)
- **Web Cryptography Helpers**: [utils.js](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/crypto/utils.js)
- **Password Input Component**: [PasswordPrompt.jsx](file:///c:/Users/pkaur/Documents/Python/VaultBin/frontend/src/components/PasswordPrompt.jsx)
- **Deployment Config**: [docker-compose.yml](file:///c:/Users/pkaur/Documents/Python/VaultBin/docker-compose.yml)

---

## Problems Faced & Solutions

During development, several technical problems related to WebAssembly integrations, strict mode hydration, race conditions, and cryptography implementation were resolved.

See the detailed logs and solution documentation in [PROBLEMS_FACED.md](file:///c:/Users/pkaur/Documents/Python/VaultBin/PROBLEMS_FACED.md).

---

## License

MIT – Feel free to use, modify, and secure.