const API_BASE = '/api/documents';

export async function createDocument(ciphertext, iv, expiryHours, burnAfterReading,
                                     password = null, wrappedKey = null, passwordSalt = null) {
  const body = { ciphertext, iv, expiry_hours: expiryHours, burn_after_reading: burnAfterReading };
  if (password) {
    body.password = password;
    body.wrapped_key = wrappedKey;
    body.password_salt = passwordSalt;
  }
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Failed to create document');
  return await res.json();
}

export async function getDocument(docId) {
  const res = await fetch(`${API_BASE}/${docId}`);
  if (!res.ok) throw new Error('Document not found');
  return await res.json();
}

export async function updateDocument(docId, ciphertext, iv, version) {
  const res = await fetch(`${API_BASE}/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ciphertext, iv, version })
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error('Conflict – document was modified by another session');
    throw new Error('Update failed');
  }
  return await res.json();
}

export async function verifyPassword(docId, password) {
  const res = await fetch(`${API_BASE}/${docId}/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('Wrong password');
    throw new Error('Verification failed');
  }
  return await res.json();
}