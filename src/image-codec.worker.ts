import { encode } from '@jsquash/jpeg';
import { optimise } from '@jsquash/oxipng';

type ImageJob =
  | { id: number; kind: 'jpeg'; width: number; height: number; pixels: Uint8ClampedArray; quality: number }
  | { id: number; kind: 'jpeg-file'; key: string; file: Blob; quality: number; whiteBackground: boolean; paletteColors: number; dithering: number; scale: number }
  | { id: number; kind: 'png-file'; key: string; file: Blob; paletteColors: number; dithering: number; level: number; scale: number }
  | { id: number; kind: 'release-source'; key: string }
  | { id: number; kind: 'png'; bytes: ArrayBuffer; level: number };

const imageCache = new Map<string, ImageData>();
let jobQueue: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<ImageJob>) => {
  const job = event.data;
  if (job.kind === 'release-source') {
    for (const key of imageCache.keys()) if (key.startsWith(`${job.key}:`)) imageCache.delete(key);
    return;
  }
  jobQueue = jobQueue.then(async () => {
    try {
      let imageData: ImageData | undefined;
      if (job.kind === 'jpeg-file' || job.kind === 'png-file') {
        imageData = imageCache.get(job.key);
        if (!imageData) {
          const bitmap = await createImageBitmap(job.file);
          try {
            const scale = job.scale / 100;
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = new OffscreenCanvas(width, height);
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Could not prepare the image preview.');
            if (job.kind === 'jpeg-file' && job.whiteBackground) { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
            context.drawImage(bitmap, 0, 0, width, height);
            imageData = context.getImageData(0, 0, width, height);
            imageCache.set(job.key, imageData);
            while (imageCache.size > 1) imageCache.delete(imageCache.keys().next().value as string);
          } finally { bitmap.close(); }
        }
        if (job.kind === 'png-file' || job.paletteColors < 256) imageData = quantize(imageData, job.paletteColors, job.dithering);
      }
      const result = job.kind === 'png'
        ? await optimise(job.bytes, { level: job.level, optimiseAlpha: true })
        : job.kind === 'png-file'
          ? await encodePng(imageData!, job.level)
        : job.kind === 'jpeg-file'
          ? await encode(imageData!, { quality: job.quality })
          : await encode(new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height), { quality: job.quality });
      self.postMessage({ id: job.id, result }, { transfer: [result] });
    } catch (error) {
      self.postMessage({ id: job.id, error: error instanceof Error ? error.message : 'The image codec failed.' });
    }
  });
});

async function encodePng(imageData: ImageData, level: number): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the transparent PNG.');
  context.putImageData(imageData, 0, 0);
  const encoded = await canvas.convertToBlob({ type: 'image/png' });
  return optimise(await encoded.arrayBuffer(), { level, optimiseAlpha: true });
}

type Color = { r: number; g: number; b: number; count: number; sumR: number; sumG: number; sumB: number };
type ColorBox = { colors: Color[]; ranges: [number, number, number]; weight: number; score: number };

// Build an image-adaptive palette (instead of independently rounding RGB
// channels), then use controllable Floyd–Steinberg error diffusion.
function quantize(source: ImageData, maxColors: number, dithering: number): ImageData {
  const { width, height, data } = source;
  const total = width * height;
  const stride = Math.max(1, Math.ceil(total / 250_000));
  const histogram = new Map<number, Color>();
  for (let pixel = 0; pixel < total; pixel += stride) {
    const i = pixel * 4;
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const count = Math.min(stride, total - pixel);
    const color = histogram.get(key);
    if (color) {
      color.count += count; color.sumR += r * count; color.sumG += g * count; color.sumB += b * count;
    } else {
      histogram.set(key, { r, g, b, count, sumR: r * count, sumG: g * count, sumB: b * count });
    }
  }

  const colors = [...histogram.values()];
  if (colors.length === 0) return source;
  if (colors.length <= maxColors) return source;
  for (const color of colors) {
    color.r = color.sumR / color.count;
    color.g = color.sumG / color.count;
    color.b = color.sumB / color.count;
  }
  const boxes = [makeBox(colors)];
  while (boxes.length < maxColors) {
    let selected = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length > 1 && (selected < 0 || boxes[i].score > boxes[selected].score)) selected = i;
    }
    if (selected < 0) break;
    const box = boxes[selected];
    const channel = box.ranges.indexOf(Math.max(...box.ranges));
    const channelName = (['r', 'g', 'b'] as const)[channel];
    const sorted = box.colors.slice().sort((a, b) => a[channelName] - b[channelName]);
    const halfway = box.weight / 2;
    let accumulated = 0, split = 0;
    while (split < sorted.length - 1 && accumulated < halfway) accumulated += sorted[split++].count;
    boxes.splice(selected, 1, makeBox(sorted.slice(0, split)), makeBox(sorted.slice(split)));
  }

  const palette = boxes.map(({ colors: items, weight }) => ({
    r: Math.round(items.reduce((sum, color) => sum + color.sumR, 0) / weight),
    g: Math.round(items.reduce((sum, color) => sum + color.sumG, 0) / weight),
    b: Math.round(items.reduce((sum, color) => sum + color.sumB, 0) / weight),
  }));
  const lookup = new Uint16Array(32 * 32 * 32);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const rr = r * 8 + 4, gg = g * 8 + 4, bb = b * 8 + 4;
    let best = 0, distance = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = rr - palette[i].r, dg = gg - palette[i].g, db = bb - palette[i].b;
      const score = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
      if (score < distance) { distance = score; best = i; }
    }
    lookup[(r << 10) | (g << 5) | b] = best;
  }

  const output = new Uint8ClampedArray(data.length);
  const strength = Math.max(0, Math.min(1, dithering));
  let current = new Float32Array((width + 2) * 3), next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, e = (x + 1) * 3;
      if (data[i + 3] === 0) {
        output[i] = data[i]; output[i + 1] = data[i + 1]; output[i + 2] = data[i + 2]; output[i + 3] = 0;
        current[e] = current[e + 1] = current[e + 2] = 0;
        continue;
      }
      const r = clampColor(data[i] + current[e]), g = clampColor(data[i + 1] + current[e + 1]), b = clampColor(data[i + 2] + current[e + 2]);
      const color = palette[lookup[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]];
      output[i] = color.r; output[i + 1] = color.g; output[i + 2] = color.b; output[i + 3] = data[i + 3];
      const er = (r - color.r) * strength, eg = (g - color.g) * strength, eb = (b - color.b) * strength;
      current[e + 3] += er * 7 / 16; current[e + 4] += eg * 7 / 16; current[e + 5] += eb * 7 / 16;
      next[e - 3] += er * 3 / 16; next[e - 2] += eg * 3 / 16; next[e - 1] += eb * 3 / 16;
      next[e] += er * 5 / 16; next[e + 1] += eg * 5 / 16; next[e + 2] += eb * 5 / 16;
      next[e + 3] += er / 16; next[e + 4] += eg / 16; next[e + 5] += eb / 16;
    }
    current = next; next = new Float32Array((width + 2) * 3);
  }
  return new ImageData(output, width, height);
}

function makeBox(colors: Color[]): ColorBox {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0, weight = 0;
  for (const color of colors) {
    minR = Math.min(minR, color.r); minG = Math.min(minG, color.g); minB = Math.min(minB, color.b);
    maxR = Math.max(maxR, color.r); maxG = Math.max(maxG, color.g); maxB = Math.max(maxB, color.b);
    weight += color.count;
  }
  const ranges: [number, number, number] = [maxR - minR, maxG - minG, maxB - minB];
  return { colors, ranges, weight, score: Math.max(...ranges) * weight };
}

function clampColor(value: number): number { return Math.max(0, Math.min(255, value)); }

export {};
