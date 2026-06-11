const API_BASE = '/api/documents';

export async function createDocument(ciphertext, iv, expiryHours, burnAfterReading) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ciphertext, iv, expiry_hours: expiryHours, burn_after_reading: burnAfterReading })
  });
  if (!res.ok) throw new Error('Failed to create document');
  return await res.json(); // { doc_id }
}

export async function getDocument(docId) {
  const res = await fetch(`${API_BASE}/${docId}`);
  if (!res.ok) throw new Error('Document not found');
  return await res.json(); // { ciphertext, iv, ... }
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