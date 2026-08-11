// Canvas-based crop: takes the original image + the pixel crop rect react-easy-crop
// reports (onCropComplete's second argument) and draws just that rect onto a canvas
// sized to the target output, returning a data-URL ready to upload.
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

export async function getCroppedImage(imageSrc, croppedAreaPixels, outputWidth, outputHeight) {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0, outputWidth, outputHeight,
  );
  return canvas.toDataURL('image/jpeg', 0.92);
}
