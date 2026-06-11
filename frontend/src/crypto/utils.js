// All encryption/decryption happens here.
// The key is a CryptoKey object stored in memory only.

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer;
}

/** Generate a new AES-256-GCM key and return both CryptoKey and base64url string */
export async function generateKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,          // extractable so we can export it for the URL
    ["encrypt", "decrypt"]
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const keyString = bufferToBase64url(rawKey);
  return { key, keyString };
}

/** Import a key from its base64url string */
export async function importKey(keyString) {
  const rawKey = base64urlToBuffer(keyString);
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,   // not extractable (we already have the string)
    ["decrypt", "encrypt"]
  );
}

/** Encrypt plaintext with the given CryptoKey. Returns {ciphertext, iv} as base64url strings */
export async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit nonce
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

/** Decrypt ciphertext using key and iv (both base64url). Returns plaintext string */
export async function decrypt(ciphertextB64, ivB64, keyString) {
  const key = await importKey(keyString);
  const iv = base64urlToBuffer(ivB64);
  const ciphertext = base64urlToBuffer(ciphertextB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}