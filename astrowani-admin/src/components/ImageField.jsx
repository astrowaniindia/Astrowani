import { useRef } from 'react';

// Image input that accepts a pasted URL OR a file (converted to a base64 data-URI,
// consistent with the apps' existing base64 image storage). Stored as a plain string.
export default function ImageField({ value, onChange, label = 'Image (URL or upload)' }) {
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
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
        <button type="button" className="btn secondary sm" onClick={() => fileRef.current?.click()}>
          Upload file
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        {value ? <img src={value} alt="" className="thumb" /> : <span className="muted">No image</span>}
      </div>
    </div>
  );
}
