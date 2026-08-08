# Astrowani background-removal service.
#
# Self-hosted, not a third-party API — runs on the same VPS as the Node backend,
# reachable only on localhost. Used ONCE per astrologer profile-photo save (see
# astrowani-backend/src/uploadRoutes.js), never per-frame or on any video path.
#
# Segments the person out of an uploaded photo with MediaPipe's Image Segmenter
# (selfie_segmenter.tflite) and composites them onto a plain white background.
# Fails closed from the caller's point of view: uploadRoutes.js falls back to
# the original photo if this service is down or errors, so a broken
# segmentation never blocks a profile save.
#
# NOTE: mediapipe's legacy `mp.solutions.selfie_segmentation` API is not present
# in every mediapipe build (confirmed absent on the 0.10.35 Windows/Python 3.14
# wheel used during development) — this uses the modern Tasks API
# (ImageSegmenter) instead, which needs the .tflite model file below.
import base64
import logging
import os

import cv2
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bg-removal")

app = FastAPI()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "selfie_segmenter.tflite")
MASK_THRESHOLD = 0.5

_options = vision.ImageSegmenterOptions(
    base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
    output_category_mask=True,
)
_segmenter = vision.ImageSegmenter.create_from_options(_options)


class ImageRequest(BaseModel):
    image_base64: str  # raw base64, no "data:image/...;base64," prefix


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/remove-background")
def remove_background(req: ImageRequest):
    try:
        img_bytes = base64.b64decode(req.image_base64)
    except Exception:
        return {"success": False, "message": "invalid base64"}

    img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img_bgr = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        return {"success": False, "message": "could not decode image"}

    # Segment on a capped-size copy — a full-res phone photo (3000px+) costs real CPU time
    # on a VPS with no GPU, and the model has no benefit from resolution beyond ~1024px on
    # its long edge. The mask is upscaled back to the original size before compositing, so
    # the SAVED photo stays full resolution — only the segmentation step is downscaled.
    h, w = img_bgr.shape[:2]
    scale = min(1.0, 1024 / max(h, w))
    small = cv2.resize(img_bgr, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1.0 else img_bgr

    try:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
        result = _segmenter.segment(mp_image)
        mask = np.squeeze(result.category_mask.numpy_view())  # 0 = background, 1 = person, for this model
    except Exception as e:
        log.exception("segmentation failed")
        return {"success": False, "message": f"segmentation error: {e}"}

    if mask.shape[:2] != (h, w):
        mask = cv2.resize(mask.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)

    # Empirically verified against this model's actual output (not the docs' stated
    # convention): high mask values mark BACKGROUND here, not the person — so "keep
    # original" pixels are where the mask is LOW, the opposite of the naive reading.
    is_background = np.stack((mask,) * 3, axis=-1) > MASK_THRESHOLD
    white_bg = np.full(img_bgr.shape, 255, dtype=np.uint8)
    output = np.where(is_background, white_bg, img_bgr)

    # JPEG, not PNG — the composited output has no transparency to preserve (solid white
    # background), and PNG's lossless encoding produced files large enough to exceed
    # Supabase Storage's upload size limit for a plain profile photo (confirmed: a 1.2MB
    # source JPEG became a 6.6MB PNG here). Quality 90 keeps visible quality close to
    # lossless at a fraction of the size.
    ok, buf = cv2.imencode(".jpg", output, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return {"success": False, "message": "could not encode output"}

    return {"success": True, "image_base64": base64.b64encode(buf).decode("utf-8")}
