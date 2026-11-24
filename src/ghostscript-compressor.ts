import { load } from '@wasm-zoo/ghostscript';
import type { EngineOutput } from './engines';

const MAX_PDF_BYTES = 100 * 1024 * 1024;

/** Separate Ghostscript/Wasm component; loaded only for the PDF compressor. */
export async function compressPdfWithGhostscript(file: File, quality: number): Promise<EngineOutput> {
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than the 100 MB compression limit.');
  const input = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder('latin1').decode(input.subarray(0, 1024)).includes('%PDF-')) {
    throw new Error('The selected file does not start with a valid PDF header.');
  }
  const resolution = Math.round(72 + (quality / 100) * 228);
  const gs = await load();
  try {
    const result = await gs.exec([
      '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
      '-dPDFSETTINGS=/ebook',
      '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true', '-dDownsampleMonoImages=true',
      '-dColorImageDownsampleType=/Bicubic', '-dGrayImageDownsampleType=/Bicubic', '-dMonoImageDownsampleType=/Subsample',
      `-dColorImageResolution=${resolution}`, `-dGrayImageResolution=${resolution}`, `-dMonoImageResolution=${Math.max(150, resolution)}`,
      '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true',
      '-sOutputFile=/output.pdf', '/input.pdf',
    ], {
      files: [{ name: '/input.pdf', data: input }],
      outputs: ['/output.pdf'],
    });
    const compressed = result.files.find((entry) => entry.name === '/output.pdf')?.data;
    if (!compressed || compressed.byteLength < 8 || new TextDecoder('latin1').decode(compressed.subarray(0, 1024)).indexOf('%PDF-') < 0) {
      throw new Error('Ghostscript did not return a valid PDF. This file may use an unsupported feature or encryption.');
    }
    if (compressed.byteLength >= input.byteLength) {
      throw new Error('Ghostscript could not make this PDF smaller at the selected quality. The original file was left unchanged.');
    }
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 90) || 'file';
    return { name: `${stem}-compressed.pdf`, blob: new Blob([compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer], { type: 'application/pdf' }) };
  } finally {
    gs.dispose();
  }
}
