import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import Modal from './Modal';
import { getCroppedImage } from '../utils/cropImage';

// Lets the admin pan/zoom a freshly-picked image to choose exactly which part
// shows, instead of it getting auto-cropped by the app's `resizeMode: cover`
// with no control over which part survives. Locked to the placement's exact
// aspect ratio so the result always fits without further surprise cropping.
export default function ImageCropModal({ imageSrc, targetWidth, targetHeight, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const confirm = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const dataUrl = await getCroppedImage(imageSrc, croppedAreaPixels, targetWidth, targetHeight);
      onConfirm(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Adjust image" onClose={onCancel}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Drag to reposition, scroll or use the slider to zoom. This decides exactly what shows —
        final size will be {targetWidth} × {targetHeight}px.
      </p>
      <div style={{ position: 'relative', width: '100%', height: 320, background: '#333', borderRadius: 8 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={targetWidth / targetHeight}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Zoom</label>
        <input
          type="range" min={1} max={4} step={0.01} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn" onClick={confirm} disabled={busy || !croppedAreaPixels}>
          {busy ? 'Applying…' : 'Use this crop'}
        </button>
      </div>
    </Modal>
  );
}
