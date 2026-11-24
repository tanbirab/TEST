import { encode } from '@jsquash/jpeg';
import { optimise } from '@jsquash/oxipng';

type ImageJob =
  | { id: number; kind: 'jpeg'; width: number; height: number; pixels: Uint8ClampedArray; quality: number }
  | { id: number; kind: 'png'; bytes: ArrayBuffer };

self.addEventListener('message', (event: MessageEvent<ImageJob>) => {
  const job = event.data;
  void (async () => {
    try {
      const result = job.kind === 'jpeg'
        ? await encode(new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height), { quality: job.quality })
        : await optimise(job.bytes, { level: 3, optimiseAlpha: true });
      self.postMessage({ id: job.id, result }, { transfer: [result] });
    } catch (error) {
      self.postMessage({ id: job.id, error: error instanceof Error ? error.message : 'The image codec failed.' });
    }
  })();
});

export {};
