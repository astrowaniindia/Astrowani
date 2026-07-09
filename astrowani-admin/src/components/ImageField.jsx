import { useRef, useState } from 'react';
import client from '../api/client';

// Image input that accepts a pasted URL OR a file upload. Files are uploaded to
// Supabase Storage via the backend and the field stores the resulting public
// URL — never a base64 data-URI (those were bloating API payloads and slowing
// the backend down).
export default function ImageField({ value, onChange, label = 'Image (URL or upload)' }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try {
        const folder = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'misc';
        const res = await client.post('/api/upload-image', {
          base64: String(reader.result),
          folder,
        });
        onChange(res.data.url);
      } catch (err) {
        alert('Image upload failed: ' + (err.response?.data?.message || err.message));
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        placeholder="https://… or upload below"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn secondary sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        {value ? <img src={value} alt="" className="thumb" /> : <span className="muted">No image</span>}
      </div>
    </div>
  );
}
