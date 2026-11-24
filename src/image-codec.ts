type ImageReply = { id: number; result?: ArrayBuffer; error?: string };
type ImageJobPayload =
  | { kind: 'jpeg'; width: number; height: number; pixels: Uint8ClampedArray; quality: number }
  | { kind: 'jpeg-file'; key: string; file: Blob; quality: number; whiteBackground: boolean; paletteColors: number }
  | { kind: 'release-source'; key: string }
  | { kind: 'png'; bytes: ArrayBuffer };

let worker: Worker | undefined;
let nextId = 0;
let nextSourceId = 0;
const sourceIds = new WeakMap<Blob, string>();
const pending = new Map<number, { resolve: (bytes: ArrayBuffer) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./image-codec.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<ImageReply>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.result) request.resolve(event.data.result);
    else request.reject(new Error(event.data.error || 'The image codec failed.'));
  });
  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'The image codec worker failed.');
    pending.forEach((request) => request.reject(error));
    pending.clear(); worker?.terminate(); worker = undefined;
  });
  return worker;
}

function send(job: ImageJobPayload, transfer: Transferable[]): Promise<ArrayBuffer> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...job, id }, transfer);
  });
}

export function encodeMozJpeg(image: ImageData, quality: number): Promise<ArrayBuffer> {
  const pixels = image.data.slice();
  return send({ kind: 'jpeg', width: image.width, height: image.height, pixels, quality: Math.round(quality * 100) }, [pixels.buffer]);
}

export function encodeMozJpegFile(file: Blob, quality: number, whiteBackground = false, paletteColors = 256): Promise<ArrayBuffer> {
  const key = getSourceId(file);
  return send({ kind: 'jpeg-file', key: `${key}:${whiteBackground ? 'white' : 'alpha'}`, file, quality: Math.round(quality * 100), whiteBackground, paletteColors }, []);
}

function getSourceId(file: Blob): string {
  let key = sourceIds.get(file);
  if (!key) { key = `image-${++nextSourceId}`; sourceIds.set(file, key); }
  return key;
}

export function releaseMozJpegFile(file: Blob): void {
  if (!worker) return;
  const key = getSourceId(file);
  worker.postMessage({ id: ++nextId, kind: 'release-source', key: `${key}:white` });
  worker.postMessage({ id: ++nextId, kind: 'release-source', key: `${key}:alpha` });
}

export function optimizePng(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return send({ kind: 'png', bytes }, [bytes]);
}
