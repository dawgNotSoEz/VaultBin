import { useState, useEffect, useRef } from 'react';   // <-- add useRef
import { generateKey, encrypt, decrypt, importKey } from './crypto/utils';
import { createDocument, getDocument, updateDocument } from './api/documents';

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

  const hasLoaded = useRef(false);   // <-- new

  // On load, check if we have a doc_id and key in the URL
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/doc\/([^/]+)/);
    if (match) {
      const id = match[1];
      const keyFromHash = window.location.hash.slice(1);
      if (keyFromHash) {
        if (!hasLoaded.current) {                     // <-- block repeat
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
      const text = await decrypt(doc.ciphertext, doc.iv, keyStr);
      setPlaintext(text);
      setVersion(doc.version);
      setBurnNotice(doc.burn_after_reading);   // existing burn status
      setMode('view');
    } catch (err) {
      setMode('error');
      setMessage(err.message);
    }
  }

  async function handleCreate() {
    if (!plaintext.trim()) return;
    try {
      const { key, keyString: newKeyStr } = await generateKey();
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const { doc_id } = await createDocument(
        ciphertext,
        iv,
        expiryHours,
        burnAfterReading          // use user's choice
      );
      const url = `${window.location.origin}/doc/${doc_id}#${newKeyStr}`;
      setShareUrl(url);
      setMode('created');
    } catch (err) {
      setMessage('Creation failed: ' + err.message);
    }
  }

  async function handleSave() {
    if (!plaintext.trim()) return;
    try {
      const key = await importKey(keyString);
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const result = await updateDocument(docId, ciphertext, iv, version);
      setVersion(result.new_version);
      setMessage('Saved!');
    } catch (err) {
      setMessage('Save failed: ' + err.message);
    }
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
            min={1}
            max={168}
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
        <br /><br />
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