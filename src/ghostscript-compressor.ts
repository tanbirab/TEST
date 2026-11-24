import { load } from '@wasm-zoo/ghostscript';
import type { EngineOutput } from './engines';

const MAX_PDF_BYTES = 100 * 1024 * 1024;

/** Separate Ghostscript/Wasm component; loaded only for the PDF compressor. */
export async function compressPdfWithGhostscript(file: File, quality: number, report: (message: string) => void): Promise<EngineOutput> {
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than the 100 MB compression limit.');
  const input = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder('latin1').decode(input.subarray(0, 1024)).includes('%PDF-')) {
    throw new Error('The selected file does not start with a valid PDF header.');
  }
  const gs = await load();
  try {
    const selectedResolution = Math.round(72 + ((quality - 35) / 60) * 228);
    const attempts = [...new Set([selectedResolution, 150, 96, 72])].filter((resolution) => resolution <= selectedResolution);
    let smallest: Uint8Array | undefined;
    let usedResolution = selectedResolution;
    for (const [index, resolution] of attempts.entries()) {
      report(`Compression pass ${index + 1} of ${attempts.length} at ${resolution} DPI…`);
      const preset = resolution <= 96 ? 'screen' : resolution <= 150 ? 'ebook' : 'printer';
      const result = await gs.exec([
        '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
        '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=/${preset}`,
        '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true', '-dDownsampleMonoImages=true',
        '-dColorImageDownsampleThreshold=1.0', '-dGrayImageDownsampleThreshold=1.0', '-dMonoImageDownsampleThreshold=1.0',
        '-dColorImageDownsampleType=/Bicubic', '-dGrayImageDownsampleType=/Bicubic', '-dMonoImageDownsampleType=/Subsample',
        `-dColorImageResolution=${resolution}`, `-dGrayImageResolution=${resolution}`, `-dMonoImageResolution=${Math.max(150, resolution)}`,
        '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true',
        '-sOutputFile=/output.pdf', '/input.pdf',
      ], {
        files: [{ name: '/input.pdf', data: input }],
        outputs: ['/output.pdf'],
      });
      const candidate = result.files.find((entry) => entry.name === '/output.pdf')?.data;
      if (!candidate || candidate.byteLength < 8 || !new TextDecoder('latin1').decode(candidate.subarray(0, 1024)).includes('%PDF-')) {
        throw new Error('Ghostscript did not return a valid PDF. This file may use an unsupported feature or encryption.');
      }
      if (!smallest || candidate.byteLength < smallest.byteLength) {
        smallest = candidate;
        usedResolution = resolution;
      }
      if (candidate.byteLength < input.byteLength) {
        smallest = candidate;
        usedResolution = resolution;
        break;
      }
      if (index === attempts.length - 1 && candidate.byteLength >= input.byteLength) {
        throw new Error('This PDF is already compact, or its content cannot be reduced by Ghostscript. Try a lower image quality or remove content before compressing.');
      }
    }
    if (!smallest || smallest.byteLength >= input.byteLength) throw new Error('This PDF is already compact, or its content cannot be reduced by Ghostscript. The original was left unchanged.');
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 90) || 'file';
    const note = usedResolution < selectedResolution ? `A stronger setting (${usedResolution} DPI) was used to make the file smaller.` : undefined;
    return { name: `${stem}-compressed.pdf`, blob: new Blob([smallest.buffer.slice(smallest.byteOffset, smallest.byteOffset + smallest.byteLength) as ArrayBuffer], { type: 'application/pdf' }), message: note };
  } finally {
    gs.dispose();
  }
}
