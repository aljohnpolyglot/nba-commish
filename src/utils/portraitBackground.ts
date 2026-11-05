import { useEffect, useState } from 'react';
import { isBlackBackedNbaHistoricalPortrait } from '../services/nbaEraPortraitCatalog';

export function clearConnectedBlackPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 20,
): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    const offset = index * 4;
    if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > threshold) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    const brightness = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    pixels[offset + 3] = Math.round(255 * Math.max(0, brightness - 6) / Math.max(1, threshold - 6));
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < width * height) enqueue(index + width);
  }
}

export async function removeConnectedBlackPortraitBackground(src: string): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  clearConnectedBlackPixels(imageData.data, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Portrait conversion failed')),
    'image/png',
  ));
}

export function useConnectedBlackPortrait(src?: string): { src?: string; preparing: boolean } {
  const needsCleanup = !!src && isBlackBackedNbaHistoricalPortrait(src);
  const [processed, setProcessed] = useState<{ original?: string; src?: string }>({});
  const settled = processed.original === src;

  useEffect(() => {
    setProcessed({ original: undefined, src });
    if (!src || !isBlackBackedNbaHistoricalPortrait(src)) {
      setProcessed({ original: src, src });
      return;
    }
    let active = true;
    let objectUrl = '';
    removeConnectedBlackPortraitBackground(src).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setProcessed({ original: src, src: objectUrl });
    }).catch(() => setProcessed({ original: src, src }));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return {
    src: needsCleanup ? (settled ? processed.src : undefined) : src,
    preparing: needsCleanup && !settled,
  };
}
