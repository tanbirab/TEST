import { encode } from '@jsquash/jpeg';
import { optimise } from '@jsquash/oxipng';

type ImageJob =
  | { id: number; kind: 'jpeg'; width: number; height: number; pixels: Uint8ClampedArray; quality: number }
  | { id: number; kind: 'jpeg-file'; key: string; file: Blob; quality: number; whiteBackground: boolean; paletteColors: number }
  | { id: number; kind: 'release-source'; key: string }
  | { id: number; kind: 'png'; bytes: ArrayBuffer };

const imageCache = new Map<string, ImageData>();
let jobQueue: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<ImageJob>) => {
  const job = event.data;
  if (job.kind === 'release-source') {
    imageCache.delete(job.key);
    return;
  }
  jobQueue = jobQueue.then(async () => {
    try {
      let imageData: ImageData | undefined;
      if (job.kind === 'jpeg-file') {
        imageData = imageCache.get(job.key);
        if (!imageData) {
          const bitmap = await createImageBitmap(job.file);
          try {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Could not prepare the image preview.');
            if (job.whiteBackground) { context.fillStyle = '#fff'; context.fillRect(0, 0, bitmap.width, bitmap.height); }
            context.drawImage(bitmap, 0, 0);
            imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
            imageCache.set(job.key, imageData);
            while (imageCache.size > 1) imageCache.delete(imageCache.keys().next().value as string);
          } finally { bitmap.close(); }
        }
        if (job.paletteColors < 256) imageData = quantize(imageData, job.paletteColors);
      }
      const result = job.kind === 'png'
        ? await optimise(job.bytes, { level: 3, optimiseAlpha: true })
        : job.kind === 'jpeg-file'
          ? await encode(imageData!, { quality: job.quality })
          : await encode(new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height), { quality: job.quality });
      self.postMessage({ id: job.id, result }, { transfer: [result] });
    } catch (error) {
      self.postMessage({ id: job.id, error: error instanceof Error ? error.message : 'The image codec failed.' });
    }
  });
});

function quantize(source: ImageData, maxColors: number): ImageData {
  const levels = Math.max(2, Math.floor(Math.cbrt(maxColors)));
  const step = 255 / (levels - 1);
  const pixels = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < source.data.length; i += 4) {
    pixels[i] = Math.round(Math.round(source.data[i] / step) * step);
    pixels[i + 1] = Math.round(Math.round(source.data[i + 1] / step) * step);
    pixels[i + 2] = Math.round(Math.round(source.data[i + 2] / step) * step);
    pixels[i + 3] = source.data[i + 3];
  }
  return new ImageData(pixels, source.width, source.height);
}

export {};
