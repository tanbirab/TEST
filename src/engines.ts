import { zipSync } from 'fflate';
import { encodeMozJpeg, encodeMozJpegFile, optimizePng } from './image-codec';

export type EngineOutput = { name: string; blob: Blob; message?: string };

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_TOOLS = new Set([
  'Reduce Photo File Size', 'Reduce Signature File Size', 'Change Signature Width & Height',
  'Change Photo Width & Height', 'Convert Photo to JPG', 'Crop Photo',
  'Make Passport Size Photo', 'Add Name & Date on Photo',
]);
const PDF_TOOLS = new Set([
  'Reduce PDF File Size', 'Make PDF from Photos', 'Merge PDF Files', 'Split PDF',
  'Convert PDF to JPG', 'Delete PDF Pages', 'Sign PDF', 'Put Many Pages on One Page',
  'Verify PDF Signature',
]);

type RunInput = {
  tool: string;
  files: File[];
  extraFiles: File[];
  form: HTMLFormElement;
  report: (message: string) => void;
};

function value(form: HTMLFormElement, name: string, fallback = ''): string {
  return String(new FormData(form).get(name) ?? fallback).trim();
}

function numberValue(form: HTMLFormElement, name: string, fallback: number): number {
  const parsed = Number(value(form, name, String(fallback)));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Enter a valid positive ${name}.`);
  return parsed;
}

function safeStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 90) || 'file';
}

function ensureFiles(files: File[], kind: 'image' | 'pdf', multiple = false): void {
  if (!files.length) throw new Error('Choose a file to continue.');
  if (!multiple && files.length !== 1) throw new Error('Choose one file for this tool.');
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than the 100 MB per-file limit.`);
    const accepted = kind === 'pdf'
      ? file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      : file.type.startsWith('image/') && !file.type.includes('svg');
    if (!accepted) throw new Error(`Choose a ${kind === 'pdf' ? 'PDF' : 'supported image'} file.`);
  }
  if (multiple && files.length > 50) throw new Error('Choose no more than 50 files at a time.');
}

function output(name: string, bytes: ArrayBuffer | Uint8Array, type: string): EngineOutput {
  const stable = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return { name, blob: new Blob([stable.buffer as ArrayBuffer], { type }) };
}

function download(outputFile: EngineOutput): void {
  const url = URL.createObjectURL(outputFile.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputFile.name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadOutputs(outputs: EngineOutput[]): void {
  if (outputs.length === 1) {
    download(outputs[0]);
    return;
  }
  const entries: Record<string, Uint8Array> = {};
  void Promise.all(outputs.map(async (item) => { entries[item.name] = new Uint8Array(await item.blob.arrayBuffer()); }))
    .then(() => download({ name: 'paperplane-results.zip', blob: new Blob([zipSync(entries).buffer as ArrayBuffer], { type: 'application/zip' }) }));
}

function canvasFor(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('This image is larger than the 40-megapixel processing limit. Resize or crop it first.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser could not create a canvas for this image.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try { return canvasFor(bitmap, bitmap.width, bitmap.height); }
  finally { bitmap.close(); }
}

async function mozJpeg(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not read image pixels for JPEG encoding.');
  return encodeMozJpeg(context.getImageData(0, 0, canvas.width, canvas.height), quality);
}

function mozJpegFile(file: File, quality: number, whiteBackground = false): Promise<ArrayBuffer> {
  return encodeMozJpegFile(file, quality, whiteBackground);
}

async function compressImage(file: File, form: HTMLFormElement, report: RunInput['report'], signature: boolean): Promise<EngineOutput> {
  const stem = safeStem(file.name);
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  if (signature && isPng) {
    report('Optimizing the PNG without removing transparency…');
    const optimized = await optimizePng(await file.arrayBuffer());
    return output(`${stem}-optimized.png`, optimized, 'image/png');
  }

  const whiteBackground = signature;
  const targetKb = Number(value(form, 'targetKb', '0'));
  const startQuality = Number(value(form, 'quality', '82')) / 100;
  report(targetKb > 0 ? 'Searching for the highest JPEG quality that meets your target…' : 'Encoding a compact JPEG in your browser…');
  let best = await mozJpegFile(file, startQuality, whiteBackground);
  if (targetKb > 0 && best.byteLength > targetKb * 1024) {
    let low = 0.12;
    let high = startQuality;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const quality = (low + high) / 2;
      const candidate = await mozJpegFile(file, quality, whiteBackground);
      if (candidate.byteLength <= targetKb * 1024) { best = candidate; low = quality; }
      else high = quality;
    }
  }
  if (best.byteLength > file.size && !signature) throw new Error('This image is already smaller than the encoded result. Try a lower quality or a different output format.');
  const message = targetKb > 0 && best.byteLength > targetKb * 1024
    ? `Target was too small; best result is ${(best.byteLength / 1024).toFixed(0)} KB.`
    : undefined;
  if (message) report(message);
  return { ...output(`${stem}-compressed.jpg`, best, 'image/jpeg'), message };
}

async function resizedCanvas(file: File, width: number, height: number): Promise<HTMLCanvasElement> {
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('The output is larger than the 40-megapixel processing limit. Choose smaller dimensions.');
  const source = await imageCanvas(file);
  const pica = (await import('pica')).default();
  const destination = document.createElement('canvas');
  destination.width = Math.round(width);
  destination.height = Math.round(height);
  await pica.resize(source, destination, { filter: 'mks2013' });
  return destination;
}

async function imageTask(input: RunInput): Promise<EngineOutput[]> {
  const { tool, files, extraFiles, form, report } = input;
  if (tool === 'Sign PDF') return pdfTask(input);
  ensureFiles(files, 'image', ['Make PDF from Photos'].includes(tool));
  const first = files[0];
  if (tool === 'Reduce Photo File Size') return [await compressImage(first, form, report, false)];
  if (tool === 'Reduce Signature File Size') return [await compressImage(first, form, report, true)];
  if (tool === 'Convert Photo to JPG') {
    report('Converting the image with the MozJPEG encoder…');
    return [output(`${safeStem(first.name)}.jpg`, await mozJpegFile(first, Number(value(form, 'quality', '90')) / 100), 'image/jpeg')];
  }
  if (tool === 'Change Photo Width & Height' || tool === 'Change Signature Width & Height') {
    const width = numberValue(form, 'width', 800);
    const height = numberValue(form, 'height', 600);
    report('Resizing locally with Pica…');
    const canvas = await resizedCanvas(first, width, height);
    return [{ name: `${safeStem(first.name)}-${width}x${height}.png`, blob: await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png')) }];
  }
  if (tool === 'Crop Photo') {
    const bounds = input.form.dataset.crop ? JSON.parse(input.form.dataset.crop) as { x: number; y: number; width: number; height: number } : null;
    if (!bounds) throw new Error('Choose the crop area in the preview first.');
    const canvas = await imageCanvas(first);
    const { x, y, width, height } = bounds;
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(width)); crop.height = Math.max(1, Math.round(height));
    crop.getContext('2d')!.drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
    return [{ name: `${safeStem(first.name)}-cropped.png`, blob: await new Promise<Blob>((resolve, reject) => crop.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Crop export failed.')), 'image/png')) }];
  }
  if (tool === 'Make Passport Size Photo') {
    const widthMm = numberValue(form, 'widthMm', 35); const heightMm = numberValue(form, 'heightMm', 45);
    const width = Math.round(widthMm / 25.4 * 300); const height = Math.round(heightMm / 25.4 * 300);
    report('Resizing to the selected print dimensions…');
    const canvas = await resizedCanvas(first, width, height);
    return [output(`${safeStem(first.name)}-passport-${widthMm}x${heightMm}mm.jpg`, await mozJpeg(canvas, .92), 'image/jpeg')];
  }
  if (tool === 'Add Name & Date on Photo') {
    const canvas = await imageCanvas(first); const context = canvas.getContext('2d')!;
    const name = value(form, 'photoName'); const date = value(form, 'photoDate');
    if (!name && !date) throw new Error('Enter a name, a date, or both.');
    const text = [name, date].filter(Boolean).join('  •  ');
    const fontSize = Math.max(14, Math.round(canvas.width * .035));
    context.font = `600 ${fontSize}px system-ui, sans-serif`; context.textBaseline = 'bottom';
    const margin = Math.round(fontSize * .7); const boxHeight = fontSize * 1.7;
    context.fillStyle = 'rgba(0,0,0,.58)'; context.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);
    context.fillStyle = '#fff'; context.fillText(text.slice(0, 180), margin, canvas.height - margin, canvas.width - margin * 2);
    return [output(`${safeStem(first.name)}-labeled.jpg`, await mozJpeg(canvas, .92), 'image/jpeg')];
  }
  if (tool === 'Make PDF from Photos') {
    report(`Building a PDF from ${files.length} image${files.length === 1 ? '' : 's'}…`);
    const { PDFDocument } = await import('pdf-lib'); const pdf = await PDFDocument.create();
    for (const file of files) {
      let bytes = new Uint8Array(await file.arrayBuffer());
      const jpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
      const png = file.type === 'image/png' || /\.png$/i.test(file.name);
      if (!jpeg && !png) { bytes = new Uint8Array(await mozJpeg(await imageCanvas(file), .92)); }
      const image = jpeg || !png ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    return [output(`${safeStem(first.name)}-photos.pdf`, await pdf.save(), 'application/pdf')];
  }
  if (tool === 'Sign PDF') return pdfTask(input);
  if (extraFiles.length) return [];
  throw new Error('This image operation is not available for this file yet.');
}

function parsePageSelection(raw: string, count: number): number[] {
  const pages = new Set<number>();
  for (const piece of raw.split(',')) {
    const part = piece.trim(); if (!part) continue;
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error('Use page numbers and ranges such as 1, 3-5.');
    const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Page selection must be between 1 and ${count}.`);
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  }
  if (!pages.size) throw new Error('Enter at least one page number.');
  return [...pages].sort((a, b) => a - b);
}

async function pdfTask(input: RunInput): Promise<EngineOutput[]> {
  const { tool, files, extraFiles, form, report } = input;
  if (tool === 'Make PDF from Photos') return imageTask(input);
  ensureFiles(files, 'pdf', tool === 'Merge PDF Files');
  const file = files[0]; const stem = safeStem(file.name);
  if (tool === 'Reduce PDF File Size') {
    const pdfQuality = Math.round(numberValue(form, 'pdfQuality', 82));
    if (pdfQuality < 35 || pdfQuality > 95) throw new Error('Image quality must be from 35 to 95.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(bytes))) throw new Error('This PDF contains a digital signature. Ghostscript rewrites the PDF and would invalidate it, so the signed file was left untouched.');
    report('Loading the isolated Ghostscript PDF compressor…');
    const { compressPdfWithGhostscript } = await import('./ghostscript-compressor');
    return [await compressPdfWithGhostscript(file, pdfQuality, report)];
  }
  if (tool === 'Convert PDF to JPG') {
    report('Rendering PDF pages with PDF.js…');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await loadingTask.promise;
    const entries: Record<string, Uint8Array> = {};
    const selected = parsePageSelection(value(form, 'pages') || `1-${doc.numPages}`, doc.numPages);
    for (const [index, pageNo] of selected.entries()) {
      report(`Rendering page ${index + 1} of ${selected.length}…`);
      const page = await doc.getPage(pageNo + 1); const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      entries[`${stem}-page-${String(pageNo + 1).padStart(3, '0')}.jpg`] = new Uint8Array(await mozJpeg(canvas, Number(value(form, 'quality', '88')) / 100));
      page.cleanup(); canvas.width = 0; canvas.height = 0;
    }
    await loadingTask.destroy();
    const zip = zipSync(entries);
    return [output(`${stem}-pages.zip`, zip, 'application/zip')];
  }
  if (tool === 'Verify PDF Signature') return verifyPdf(file, extraFiles, report);

  report('Reading PDF pages locally…');
  const sourceBytes = await file.arrayBuffer();
  if (/\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(sourceBytes))) throw new Error('This PDF contains a digital signature. Editing it would invalidate that signature, so the original was left untouched.');
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(sourceBytes);
  const pageCount = source.getPageCount();
  const selected = parsePageSelection(value(form, 'pages') || `1-${pageCount}`, pageCount);
  if (tool === 'Merge PDF Files') {
    const merged = await PDFDocument.create();
    for (const item of files) {
      const doc = await PDFDocument.load(await item.arrayBuffer());
      const pages = await merged.copyPages(doc, doc.getPageIndices()); pages.forEach((page) => merged.addPage(page));
    }
    return [output('merged.pdf', await merged.save(), 'application/pdf')];
  }
  if (tool === 'Split PDF') {
    const pages = await Promise.all(selected.map(async (index) => {
      const part = await PDFDocument.create(); const [page] = await part.copyPages(source, [index]); part.addPage(page);
      return [`${stem}-page-${String(index + 1).padStart(3, '0')}.pdf`, new Uint8Array(await part.save())] as const;
    }));
    return [output(`${stem}-split-pages.zip`, zipSync(Object.fromEntries(pages)), 'application/zip')];
  }
  if (tool === 'Delete PDF Pages') {
    if (selected.length === pageCount) throw new Error('At least one page must remain in the PDF.');
    selected.slice().sort((a, b) => b - a).forEach((index) => source.removePage(index));
    return [output(`${stem}-pages-removed.pdf`, await source.save(), 'application/pdf')];
  }
  if (tool === 'Put Many Pages on One Page') {
    const cols = Math.round(numberValue(form, 'columns', 2)); const rows = Math.round(numberValue(form, 'rows', 2));
    if (cols > 6 || rows > 6) throw new Error('Rows and columns must be between 1 and 6.');
    const outputPdf = await PDFDocument.create(); const embedded = await outputPdf.embedPdf(sourceBytes, selected);
    const maxWidth = Math.max(...embedded.map((page) => page.width)); const maxHeight = Math.max(...embedded.map((page) => page.height));
    const pageWidth = maxWidth * cols; const pageHeight = maxHeight * rows;
    for (let offset = 0; offset < embedded.length; offset += cols * rows) {
      const page = outputPdf.addPage([pageWidth, pageHeight]);
      embedded.slice(offset, offset + cols * rows).forEach((original, slot) => {
        const col = slot % cols; const row = Math.floor(slot / cols);
        const scale = Math.min(maxWidth / original.width, maxHeight / original.height);
        const width = original.width * scale; const height = original.height * scale;
        page.drawPage(original, { x: col * maxWidth + (maxWidth - width) / 2, y: pageHeight - (row + 1) * maxHeight + (maxHeight - height) / 2, width, height });
      });
    }
    return [output(`${stem}-multiple-pages-per-sheet.pdf`, await outputPdf.save(), 'application/pdf')];
  }
  if (tool === 'Sign PDF') {
    if (extraFiles.length !== 1) throw new Error('Choose one signature image.');
    ensureFiles(extraFiles, 'image');
    const pageNumber = Math.round(numberValue(form, 'page', 1));
    if (pageNumber > pageCount) throw new Error(`Choose a page from 1 to ${pageCount}.`);
    const page = source.getPage(pageNumber - 1); const width = numberValue(form, 'signatureWidth', 120); const height = numberValue(form, 'signatureHeight', 48);
    const x = Number(value(form, 'x', '36')); const y = Number(value(form, 'y', '36'));
    if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x + width > page.getWidth() || y + height > page.getHeight()) throw new Error('The signature position and size must fit on the selected page. Coordinates are PDF points from the bottom-left corner.');
    const signature = extraFiles[0]; const bytes = await signature.arrayBuffer();
    const image = signature.type === 'image/png' ? await source.embedPng(bytes) : await source.embedJpg(bytes);
    page.drawImage(image, { x, y, width, height });
    return [output(`${stem}-signed.pdf`, await source.save(), 'application/pdf')];
  }
  throw new Error('This PDF operation is not available for this file yet.');
}

async function pemCertificates(file: File): Promise<ArrayBuffer[]> {
  const text = await file.text();
  const blocks = [...text.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)];
  if (blocks.length) return blocks.map((match) => Uint8Array.from(atob(match[1].replace(/\s/g, '')), (char) => char.charCodeAt(0)).buffer);
  if (/\.(?:der|cer|crt)$/i.test(file.name)) return [await file.arrayBuffer()];
  throw new Error(`No PEM certificate block was found in ${file.name}.`);
}

async function verifyPdf(file: File, rootFiles: File[], report: RunInput['report']): Promise<EngineOutput[]> {
  if (!rootFiles.length) throw new Error('Choose at least one trusted root certificate (PEM or DER) to verify the signer.');
  if (rootFiles.length > 10 || rootFiles.some((certificate) => certificate.size > 5 * 1024 * 1024)) throw new Error('Choose up to 10 certificate files, each no larger than 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if (!ranges.length) throw new Error('No PDF signature byte ranges were found.');
  const [pkijs, asn1js] = await Promise.all([import('pkijs'), import('asn1js')]);
  const trustedCerts: InstanceType<typeof pkijs.Certificate>[] = [];
  for (const rootFile of rootFiles) for (const buffer of await pemCertificates(rootFile)) {
    const parsed = asn1js.fromBER(buffer);
    if (parsed.offset === -1) throw new Error(`Could not parse the certificate file ${rootFile.name}.`);
    trustedCerts.push(new pkijs.Certificate({ schema: parsed.result }));
  }
  const findings: string[] = [];
  for (const [index, match] of ranges.entries()) {
    report(`Verifying signature ${index + 1} of ${ranges.length}…`);
    const [start1, length1, start2, length2] = match.slice(1).map(Number);
    if (start1 !== 0 || start1 + length1 > bytes.length || start2 + length2 > bytes.length || start2 <= start1 + length1) throw new Error(`Signature ${index + 1} has an invalid byte range.`);
    const signedBytes = new Uint8Array(length1 + length2);
    signedBytes.set(bytes.subarray(start1, start1 + length1)); signedBytes.set(bytes.subarray(start2, start2 + length2), length1);
    const hex = text.slice(start1 + length1 + 1, start2 - 1).replace(/\s/g, '');
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error(`Signature ${index + 1} has malformed CMS data.`);
    const cmsBytes = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16));
    const parsedCms = asn1js.fromBER(cmsBytes.buffer);
    if (parsedCms.offset === -1) throw new Error(`Signature ${index + 1} contains unreadable CMS data.`);
    const cmsBuffer = cmsBytes.slice().buffer as ArrayBuffer;
    const cms = pkijs.ContentInfo.fromBER(cmsBuffer);
    const signedData = new pkijs.SignedData({ schema: cms.content });
    let result: Awaited<ReturnType<typeof signedData.verify>>;
    try {
      result = await signedData.verify({ signer: 0, data: signedBytes.buffer as ArrayBuffer, extendedMode: true });
    } catch (error) {
      findings.push(`Signature ${index + 1}: cryptographic integrity INVALID (${error instanceof Error ? error.message : 'signature check failed'}).`);
      continue;
    }
    const signer = result.signerCertificate;
    const coversWholeFile = start2 + length2 === bytes.length;
    let trustDetail = 'No usable signer certificate was found.';
    if (signer) {
      try {
        const chain = await new pkijs.CertificateChainValidationEngine({
          trustedCerts,
          certs: [signer, ...(signedData.certificates ?? []).filter((certificate) => certificate instanceof pkijs.Certificate)],
        }).verify();
        trustDetail = chain.result ? 'chains to a trusted root' : `not trusted (${chain.resultMessage || 'chain validation failed'})`;
      } catch (error) {
        trustDetail = `could not be trusted (${error instanceof Error ? error.message : 'chain validation failed'})`;
      }
    }
    findings.push(`Signature ${index + 1}: cryptographic integrity ${result.signatureVerified ? 'valid' : 'INVALID'}; signer ${trustDetail}; ${coversWholeFile ? 'covers the full file' : 'later PDF revisions exist after this signature'}.`);
  }
  const note = 'Certificate revocation status and timestamp authorities are not checked by this local verification.';
  const reportText = `${findings.join('\n')}\n\n${note}\n`;
  report(findings.join(' '));
  return [{ name: `${safeStem(file.name)}-signature-report.txt`, blob: new Blob([reportText], { type: 'text/plain;charset=utf-8' }) }];
}

export async function runEngine(input: RunInput): Promise<EngineOutput[]> {
  if (IMAGE_TOOLS.has(input.tool)) return imageTask(input);
  if (PDF_TOOLS.has(input.tool)) return pdfTask(input);
  throw new Error('No processing engine is registered for this tool.');
}
