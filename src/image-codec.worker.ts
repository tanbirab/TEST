import { encode } from '@jsquash/jpeg';
import { optimise } from '@jsquash/oxipng';

type ImageJob =
  | { id: number; kind: 'jpeg'; width: number; height: number; pixels: Uint8ClampedArray; quality: number }
  | { id: number; kind: 'jpeg-file'; key: string; file: Blob; quality: number; whiteBackground: boolean }
  | { id: number; kind: 'release-source'; key: string }
  | { id: number; kind: 'png'; bytes: ArrayBuffer };

const bitmapCache = new Map<string, ImageBitmap>();
let jobQueue: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<ImageJob>) => {
  const job = event.data;
  if (job.kind === 'release-source') {
    bitmapCache.get(job.key)?.close(); bitmapCache.delete(job.key);
    return;
  }
  jobQueue = jobQueue.then(async () => {
    try {
      let imageData: ImageData | undefined;
      if (job.kind === 'jpeg-file') {
        let bitmap = bitmapCache.get(job.key);
        if (!bitmap) {
          bitmap = await createImageBitmap(job.file);
          bitmapCache.set(job.key, bitmap);
          while (bitmapCache.size > 2) {
            const oldestKey = bitmapCache.keys().next().value as string;
            bitmapCache.get(oldestKey)?.close(); bitmapCache.delete(oldestKey);
          }
        }
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not prepare the image preview.');
        if (job.whiteBackground) { context.fillStyle = '#fff'; context.fillRect(0, 0, bitmap.width, bitmap.height); }
        context.drawImage(bitmap, 0, 0);
        imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
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

export {};
