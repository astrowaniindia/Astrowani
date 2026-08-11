import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import ImageCropModal from './ImageCropModal';

// Image input that accepts a pasted URL OR a file upload. Files are uploaded to
// Supabase Storage via the backend and the field stores the resulting public
// URL — never a base64 data-URI (those were bloating API payloads and slowing
// the backend down). When a required size is given, a freshly-picked file goes
// through a crop/zoom step first — the app's own `resizeMode: cover` crops
// unpredictably with no control over which part of the photo survives; this
// lets the admin choose that themselves before it's ever uploaded.
export default function ImageField({ value, onChange, label = 'Image (URL or upload)', recommendedWidth, recommendedHeight }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pickedSize, setPickedSize] = useState(null); // {width, height} of the file just picked
  const [cropSrc, setCropSrc] = useState(null); // data-URL awaiting crop, or null

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

  const upload = async (dataUrl) => {
    setUploading(true);
    try {
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
      setPickedSize(dims);

      const folder = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'misc';
      const res = await client.post('/api/upload-image', { base64: dataUrl, folder });
      onChange(res.data.url);
    } catch (err) {
      alert('Image upload failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // lets picking the same file again re-trigger onChange
    setPickedSize(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (recommendedWidth && recommendedHeight) {
        setCropSrc(dataUrl); // crop first — upload() runs after confirm
      } else {
        upload(dataUrl);
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
        {value && recommendedWidth && recommendedHeight && (
          <button
            type="button" className="btn secondary sm"
            onClick={async () => {
              // Re-crop the image already saved for this field (e.g. re-adjust
              // framing without picking a new file).
              try {
                const res = await fetch(value);
                const blob = await res.blob();
                const reader = new FileReader();
                reader.onload = () => setCropSrc(String(reader.result));
                reader.readAsDataURL(blob);
              } catch (_) {
                alert("Couldn't load this image for re-cropping — try re-uploading instead.");
              }
            }}
          >
            Adjust crop
          </button>
        )}
        {value ? <img src={value} alt="" className="thumb" /> : <span className="muted">No image</span>}
        {pickedSize && (
          <span style={{ fontSize: 13, color: sizeMatches === false ? 'var(--red)' : sizeMatches === true ? 'var(--green, #1a8f4c)' : undefined }} className={sizeMatches === null ? 'muted' : undefined}>
            This image is <strong>{pickedSize.width} × {pickedSize.height}px</strong>
            {sizeMatches === false && ' — different ratio than required, will look cropped/stretched'}
          </span>
        )}
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          targetWidth={recommendedWidth}
          targetHeight={recommendedHeight}
          onCancel={() => setCropSrc(null)}
          onConfirm={(croppedDataUrl) => {
            setCropSrc(null);
            upload(croppedDataUrl);
          }}
        />
      )}
    </div>
  );
}
