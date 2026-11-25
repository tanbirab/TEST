export type EngineOutput = {
  name: string;
  blob: Blob;
  message?: string;
  quality?: number;
  paletteColors?: number;
  compressionLevel?: number;
};

type RunInput = {
  tool: string;
  files: File[];
  extraFiles: File[];
  form: HTMLFormElement;
  report: (message: string) => void;
};

type WorkerOutput = Omit<EngineOutput, 'blob'> & { mime: string; bytes: Uint8Array };
type WorkerResponse = { id: number; outputs?: WorkerOutput[]; error?: string };

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MULTI_FILE_TOOLS = new Set(['Make PDF from Photos', 'Merge PDF Files', 'Verify PDF Signature']);
let worker: Worker | undefined;
let requestId = 0;
const pending = new Map<number, { resolve: (value: WorkerOutput[]) => void; reject: (reason: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./rust-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.outputs ?? []);
  });
  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'The Rust WebAssembly worker stopped unexpectedly.'));
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

function formOptions(form: HTMLFormElement): Record<string, unknown> {
  const formData = new FormData(form);
  const text = (name: string, fallback = '') => String(formData.get(name) ?? fallback).trim();
  const number = (name: string, fallback: number): number => {
    const value = Number(text(name, String(fallback)));
    return Number.isFinite(value) ? value : fallback;
  };
  const targetKb = number('targetKb', 0);
  const crop = form.dataset.crop ? JSON.parse(form.dataset.crop) as { x: number; y: number; width: number; height: number } : null;
  return {
    outputFormat: text('outputFormat', 'jpg'),
    quality: number('quality', 72),
    paletteColors: number('paletteColors', 256),
    targetKb: targetKb > 0 ? targetKb : null,
    scalePercent: number('scalePercent', 100),
    width: number('width', 800),
    height: number('height', 600),
    widthMm: number('widthMm', 35),
    heightMm: number('heightMm', 45),
    dpi: number('dpi', 300),
    crop,
    photoName: text('photoName'),
    photoDate: text('photoDate'),
    pages: text('pages') || null,
    columns: number('columns', 2),
    rows: number('rows', 2),
    page: number('page', 1),
    signatureWidth: number('signatureWidth', 120),
    signatureHeight: number('signatureHeight', 48),
    x: number('x', 36),
    y: number('y', 36),
  };
}

function processInWorker(tool: string, files: File[], options: Record<string, unknown>): Promise<WorkerOutput[]> {
  const id = ++requestId;
  const currentWorker = getWorker();
  const result = new Promise<WorkerOutput[]>((resolve, reject) => pending.set(id, { resolve, reject }));
  void Promise.all(files.map(async (file) => ({ name: file.name, bytes: await file.arrayBuffer() })))
    .then((inputs) => {
      currentWorker.postMessage({ id, tool, files: inputs, options }, inputs.map((input) => input.bytes));
    })
    .catch((error: unknown) => {
      const request = pending.get(id);
      pending.delete(id);
      const message = error instanceof Error ? error.message : String(error);
      request?.reject(new Error(message));
    });
  return result;
}

export async function runEngine(input: RunInput): Promise<EngineOutput[]> {
  if (!input.files.length) throw new Error('Choose a file to continue.');
  const files = [...input.files, ...input.extraFiles];
  if (!MULTI_FILE_TOOLS.has(input.tool) && input.files.length !== 1) throw new Error('Choose one file for this tool.');
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than the 100 MB per-file limit.`);
  }
  if (MULTI_FILE_TOOLS.has(input.tool) && files.length > 50) throw new Error('Choose no more than 50 files at a time.');

  input.report('Processing locally with the Rust WebAssembly core…');
  const output = await processInWorker(input.tool, files, formOptions(input.form));
  return output.map(({ name, mime, bytes, ...metadata }) => ({
    name,
    blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }),
    ...metadata,
  }));
}

function download(output: EngineOutput): void {
  const url = URL.createObjectURL(output.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = output.name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadOutputs(outputs: EngineOutput[]): void {
  for (const item of outputs) download(item);
}
