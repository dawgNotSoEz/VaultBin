import { useState } from 'react';
import { verifyPassword } from '../api/documents';
import { deriveWrappingKey, unwrapDocumentKey } from '../crypto/utils';

export default function PasswordPrompt({ docId, passwordSalt, onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Early guard: if salt is missing or not a string
  if (!passwordSalt || typeof passwordSalt !== 'string') {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        <h2>Error: Document is corrupted</h2>
        <p>The password salt is missing or invalid. This document may have been created before the latest security update. Please create a new document.</p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const trimmed = password.trim();
    if (!trimmed) {
      setError('Password cannot be empty.');
      return;
    }
    try {
      // Step 1: verify password (server side)
      const result = await verifyPassword(docId, trimmed);
      console.log('Wrapped key received:', result.wrapped_key);

      // Ensure wrapped_key is a string
      if (typeof result.wrapped_key !== 'string') {
        throw new Error('Server returned an invalid wrapped key.');
      }

      // Step 2: derive wrapping key
      console.log('Deriving wrapping key with salt:', passwordSalt);
      const wrappingKeyBytes = await deriveWrappingKey(trimmed, passwordSalt);

      // Step 3: unwrap document key
      const docKey = await unwrapDocumentKey(result.wrapped_key, wrappingKeyBytes);

      // Step 4: return the key to parent
      onSuccess(docKey);
    } catch (err) {
      console.error('PasswordPrompt error:', err);
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>This document is password protected</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
        />
        <button type="submit">Unlock</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}