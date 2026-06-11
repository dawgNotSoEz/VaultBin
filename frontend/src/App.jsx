import { useState, useEffect, useRef } from 'react';
import {
  generateKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encrypt,
  decrypt,
  deriveWrappingKey,
  wrapDocumentKey,
  bufferToBase64url,
  unwrapDocumentKey
} from './crypto/utils';
import { createDocument, getDocument, updateDocument } from './api/documents';
import PasswordPrompt from './components/PasswordPrompt';

function App() {
  const [mode, setMode] = useState('create');
  const [plaintext, setPlaintext] = useState('');
  const [docId, setDocId] = useState(null);
  const [keyString, setKeyString] = useState(null);
  const [version, setVersion] = useState(null);
  const [burnNotice, setBurnNotice] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [message, setMessage] = useState('');
  const [expiryHours, setExpiryHours] = useState(24);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [password, setPassword] = useState('');
  const [docKey, setDocKey] = useState(null);
  const [waitingForPassword, setWaitingForPassword] = useState(false);
  const [passwordSaltForDoc, setPasswordSaltForDoc] = useState(null);

  // Store encrypted document data from initial fetch so we don't re‑fetch after burn
  const [cachedCiphertext, setCachedCiphertext] = useState(null);
  const [cachedIv, setCachedIv] = useState(null);

  const hasLoaded = useRef(false);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/doc\/([^/]+)/);
    if (match) {
      const id = match[1];
      const keyFromHash = window.location.hash.slice(1);
      if (keyFromHash) {
        if (!hasLoaded.current) {
          setDocId(id);
          setKeyString(keyFromHash);
          setMode('loading');
          loadDocument(id, keyFromHash);
          hasLoaded.current = true;
        }
      } else {
        setMode('error');
        setMessage('Missing decryption key in URL fragment.');
      }
    } else {
      setMode('create');
    }
  }, []);

  async function loadDocument(id, keyStr) {
    try {
      const doc = await getDocument(id);
      if (doc.has_password) {
        if (!doc.password_salt) {
          setMode('error');
          setMessage('Document is missing password salt. It may be corrupted.');
          return;
        }
        // Cache the encrypted data before showing password prompt
        setCachedCiphertext(doc.ciphertext);
        setCachedIv(doc.iv);
        setVersion(doc.version);
        setBurnNotice(doc.burn_after_reading);
        setPasswordSaltForDoc(doc.password_salt);
        setWaitingForPassword(true);
        return;
      }
      // No password: import key and decrypt directly
      const key = await importKeyFromBase64(keyStr);
      setDocKey(key);
      const text = await decrypt(doc.ciphertext, doc.iv, key);
      setPlaintext(text);
      setVersion(doc.version);
      setBurnNotice(doc.burn_after_reading);
      setMode('view');
    } catch (err) {
      setMode('error');
      setMessage(err.message);
    }
  }

  async function handlePasswordSuccess(unwrappedDocKey) {
    // Use cached ciphertext and iv — do NOT re‑fetch (document may be burned)
    if (!cachedCiphertext || !cachedIv) {
      setMode('error');
      setMessage('Encrypted data missing. Please reload the link.');
      return;
    }
    try {
      const text = await decrypt(cachedCiphertext, cachedIv, unwrappedDocKey);
      setDocKey(unwrappedDocKey);
      setPlaintext(text);
      setWaitingForPassword(false);
      setMode('view');
    } catch (err) {
      setMode('error');
      setMessage('Decryption failed: ' + err.message);
    }
  }

  async function handleCreate() {
    if (!plaintext.trim()) return;
    try {
      const newDocKey = await generateKey();
      const keyString = await exportKeyToBase64(newDocKey);
      const { ciphertext, iv } = await encrypt(plaintext, newDocKey);

      let wrappedKeyStr = null;
      let passwordSaltStr = null;

      if (password) {
        const trimmedPassword = password.trim();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        passwordSaltStr = bufferToBase64url(salt);
        const wrappingKeyBytes = await deriveWrappingKey(trimmedPassword, passwordSaltStr);
        wrappedKeyStr = await wrapDocumentKey(newDocKey, wrappingKeyBytes);
      }

      const { doc_id } = await createDocument(
        ciphertext, iv, expiryHours, burnAfterReading,
        password || null,
        wrappedKeyStr,
        passwordSaltStr
      );
      const url = `${window.location.origin}/doc/${doc_id}#${keyString}`;
      setShareUrl(url);
      setMode('created');
    } catch (err) {
      setMessage('Creation failed: ' + err.message);
    }
  }

  async function handleSave() {
    if (!plaintext.trim() || !docKey) return;
    try {
      const { ciphertext, iv } = await encrypt(plaintext, docKey);
      const result = await updateDocument(docId, ciphertext, iv, version);
      setVersion(result.new_version);
      // Update cache as well
      setCachedCiphertext(ciphertext);
      setCachedIv(iv);
      setMessage('Saved!');
    } catch (err) {
      setMessage('Save failed: ' + err.message);
    }
  }

  if (waitingForPassword) {
    return <PasswordPrompt docId={docId} passwordSalt={passwordSaltForDoc} onSuccess={handlePasswordSuccess} />;
  }

  if (mode === 'loading') return <div>Loading document…</div>;
  if (mode === 'error') return <div style={{color:'red'}}>{message}</div>;

  if (mode === 'create') {
    return (
      <div style={{padding: 20}}>
        <h2>Create a new encrypted paste</h2>
        <textarea
          rows={10}
          cols={60}
          value={plaintext}
          onChange={e => setPlaintext(e.target.value)}
          placeholder="Type your text here…"
        />
        <br />
        <label>
          Expiry (hours):{' '}
          <input
            type="number"
            value={expiryHours}
            onChange={e => setExpiryHours(Number(e.target.value))}
            min={1} max={168}
          />
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={burnAfterReading}
            onChange={e => setBurnAfterReading(e.target.checked)}
          />
          Burn after reading
        </label>
        <br />
        <label>
          Password (optional):{' '}
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Leave empty for no password"
          />
        </label>
        {burnAfterReading && (
          <p style={{color:'red', fontWeight:'bold'}}>
            🔥 This document will be permanently deleted after the first view.
          </p>
        )}
        <br />
        <button onClick={handleCreate}>Encrypt & Create</button>
      </div>
    );
  }

  if (mode === 'created') {
    return (
      <div style={{padding: 20}}>
        <h2>Document created!</h2>
        <p>Share this URL (the key is in the fragment – never sent to the server):</p>
        <input type="text" readOnly value={shareUrl} style={{width:'100%'}} />
        <p><a href={shareUrl} target="_blank" rel="noreferrer">Open in new tab</a></p>
        {password && <p>🔒 This document is also protected by the password you set.</p>}
      </div>
    );
  }

  // mode === 'view'
  return (
    <div style={{padding: 20}}>
      {burnNotice && (
        <p style={{color:'red', fontWeight:'bold'}}>
          🔥 This document will self-destruct after reading.
        </p>
      )}
      <h2>Editing document {docId}</h2>
      <textarea
        rows={10}
        cols={60}
        value={plaintext}
        onChange={e => setPlaintext(e.target.value)}
      />
      <br />
      <button onClick={handleSave}>Save Changes</button>
      {message && <p>{message}</p>}
    </div>
  );
}

export default App;