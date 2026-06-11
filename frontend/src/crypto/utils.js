import { argon2id } from 'hash-wasm';

// ---------- Base64url helpers ----------
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------- Document key generation / encryption / decryption ----------
export async function generateKey() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,   // extractable (needed for wrapping)
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyToBase64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64url(raw);
}

export async function importKeyFromBase64(keyString) {
  const rawKey = base64urlToBuffer(keyString);
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"]
  );
}

export async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    ciphertext: bufferToBase64url(new Uint8Array(ciphertextBuffer)),
    iv: bufferToBase64url(iv)
  };
}

export async function decrypt(ciphertextB64, ivB64, key) {
  const iv = base64urlToBuffer(ivB64);
  const ciphertext = base64urlToBuffer(ciphertextB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// ---------- Password protection with Argon2id + AES-KW ----------
export async function deriveWrappingKey(password, saltBase64) {
  const salt = base64urlToBuffer(saltBase64);
  return await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,  // KB
    hashLength: 32,      // 256 bits
    outputType: 'binary' // Uint8Array
  });
}

export async function wrapDocumentKey(documentKey, wrappingKeyBytes) {
  const wrappingKey = await crypto.subtle.importKey(
    "raw",
    wrappingKeyBytes,
    { name: "AES-KW" },
    false,
    ["wrapKey"]
  );
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    documentKey,
    wrappingKey,
    { name: "AES-KW" }
  );
  return bufferToBase64url(wrapped);
}

export async function unwrapDocumentKey(wrappedKeyBase64, wrappingKeyBytes) {
  const wrappingKey = await crypto.subtle.importKey(
    "raw",
    wrappingKeyBytes,
    { name: "AES-KW" },
    false,
    ["unwrapKey"]
  );
  const wrappedKey = base64urlToBuffer(wrappedKeyBase64);
  return await crypto.subtle.unwrapKey(
    "raw",
    wrappedKey,
    wrappingKey,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}