import { useEffect, useRef, useState } from 'react';
import client from '../api/client';

// Image input that accepts a pasted URL OR a file upload. Files are uploaded to
// Supabase Storage via the backend and the field stores the resulting public
// URL — never a base64 data-URI (those were bloating API payloads and slowing
// the backend down).
export default function ImageField({ value, onChange, label = 'Image (URL or upload)', recommendedWidth, recommendedHeight }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pickedSize, setPickedSize] = useState(null); // {width, height} of the file just picked

  // Also show the size of whatever image is currently set (e.g. an existing
  // banner's image when opening Edit), not just a freshly-picked file.
  useEffect(() => {
    if (!value) { setPickedSize(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setPickedSize({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { if (!cancelled) setPickedSize(null); };
    img.src = value;
    return () => { cancelled = true; };
  }, [value]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickedSize(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);

      // Read the actual pixel dimensions of the picked file before uploading, so
      // whoever's uploading can immediately see if it matches the recommended size.
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
      setPickedSize(dims);

      setUploading(true);
      try {
        const folder = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'misc';
        const res = await client.post('/api/upload-image', {
          base64: dataUrl,
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

  // Same aspect ratio as recommended, even if the file is a different absolute
  // size — that's fine (upload can be bigger, same ratio) and shouldn't warn.
  const sizeMatches = !recommendedWidth || !pickedSize
    ? null
    : Math.abs((pickedSize.width / pickedSize.height) - (recommendedWidth / recommendedHeight)) < 0.05;

  return (
    <div className="field">
      <label>{label}</label>
      {recommendedWidth && recommendedHeight && (
        <div style={{
          background: '#FFF3CD', color: '#7A5B00', borderRadius: 8, padding: '8px 12px',
          fontSize: 13.5, fontWeight: 600, marginBottom: 8,
        }}>
          📐 Required size: {recommendedWidth} × {recommendedHeight}px (or larger, same ratio)
        </div>
      )}
      <input
        type="text"
        placeholder="https://… or upload below"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn secondary sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        {value ? <img src={value} alt="" className="thumb" /> : <span className="muted">No image</span>}
        {pickedSize && (
          <span style={{ fontSize: 13, color: sizeMatches === false ? 'var(--red)' : sizeMatches === true ? 'var(--green, #1a8f4c)' : undefined }} className={sizeMatches === null ? 'muted' : undefined}>
            This image is <strong>{pickedSize.width} × {pickedSize.height}px</strong>
            {sizeMatches === false && ' — different ratio than required, will look cropped/stretched'}
          </span>
        )}
      </div>
    </div>
  );
}
