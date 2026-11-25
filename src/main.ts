import type Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { downloadOutputs, runEngine, type EngineOutput } from './engines';
import { releaseMozJpegFile } from './image-codec';
import icon01 from './assets/icons/01-reduce-photo-file-size.svg?raw';
import icon02 from './assets/icons/02-reduce-pdf-file-size.svg?raw';
import icon04 from './assets/icons/04-change-signature-width-height.svg?raw';
import icon05 from './assets/icons/05-change-photo-width-height.svg?raw';
import icon06 from './assets/icons/06-make-pdf-from-photos.svg?raw';
import icon07 from './assets/icons/07-convert-photo-to-jpg.svg?raw';
import icon08 from './assets/icons/08-merge-pdf-files.svg?raw';
import icon09 from './assets/icons/09-crop-photo.svg?raw';
import icon10 from './assets/icons/10-make-passport-size-photo.svg?raw';
import icon11 from './assets/icons/11-add-name-and-date-on-photo.svg?raw';
import icon12 from './assets/icons/12-split-pdf.svg?raw';
import icon13 from './assets/icons/13-convert-pdf-to-jpg.svg?raw';
import icon14 from './assets/icons/14-delete-pdf-pages.svg?raw';
import icon15 from './assets/icons/15-sign-pdf.svg?raw';
import icon16 from './assets/icons/16-put-many-pages-on-one-page.svg?raw';
import icon17 from './assets/icons/17-verify-pdf-signature.svg?raw';

type Category = 'Images' | 'PDFs' | 'Signatures';
type Tool = { name: string; description: string; category: Category | Category[]; icon: string; tone: string; tag: string };

const tools: Tool[] = [
  { name: 'Compress Image', description: 'Reduce the size of photos, signatures, and more.', category: ['Images', 'Signatures'], icon: icon01, tone: 'green', tag: '' },
  { name: 'Reduce PDF File Size', description: 'Make PDFs smaller and easier to share.', category: 'PDFs', icon: icon02, tone: 'peach', tag: 'Popular' },
  { name: 'Change Signature Width & Height', description: 'Resize a signature image to the dimensions you need.', category: 'Signatures', icon: icon04, tone: 'blue', tag: '' },
  { name: 'Change Photo Width & Height', description: 'Set a photo to a specific width and height.', category: 'Images', icon: icon05, tone: 'green', tag: '' },
  { name: 'Make PDF from Photos', description: 'Combine photos into a single PDF file.', category: 'Images', icon: icon06, tone: 'yellow', tag: 'Popular' },
  { name: 'Convert Photo to JPG', description: 'Convert a photo to the widely supported JPG format.', category: 'Images', icon: icon07, tone: 'peach', tag: '' },
  { name: 'Merge PDF Files', description: 'Combine multiple PDFs into one document.', category: 'PDFs', icon: icon08, tone: 'lilac', tag: 'Popular' },
  { name: 'Crop Photo', description: 'Trim a photo to keep the area you want.', category: 'Images', icon: icon09, tone: 'blue', tag: '' },
  { name: 'Make Passport Size Photo', description: 'Prepare a photo in passport size.', category: 'Images', icon: icon10, tone: 'rose', tag: '' },
  { name: 'Add Name & Date on Photo', description: 'Place a name and date on a photo.', category: 'Images', icon: icon11, tone: 'yellow', tag: '' },
  { name: 'Split PDF', description: 'Separate a PDF into pages or page ranges.', category: 'PDFs', icon: icon12, tone: 'green', tag: '' },
  { name: 'Convert PDF to JPG', description: 'Convert PDF pages into JPG images.', category: 'PDFs', icon: icon13, tone: 'peach', tag: '' },
  { name: 'Delete PDF Pages', description: 'Remove the pages you select from a PDF.', category: 'PDFs', icon: icon14, tone: 'rose', tag: '' },
  { name: 'Sign PDF', description: 'Add your signature to a PDF document.', category: 'Signatures', icon: icon15, tone: 'lilac', tag: '' },
  { name: 'Put Many Pages on One Page', description: 'Arrange several PDF pages on one sheet.', category: 'PDFs', icon: icon16, tone: 'blue', tag: '' },
  { name: 'Verify PDF Signature', description: 'Check a PDF signature against a trusted certificate.', category: 'Signatures', icon: icon17, tone: 'green', tag: '' },
];

const grid = document.querySelector<HTMLDivElement>('#toolGrid')!;
const catalog = document.querySelector<HTMLElement>('#tools')!;
const toolPage = document.querySelector<HTMLElement>('#toolPage')!;
const dialogTitle = document.querySelector<HTMLElement>('#dialogTitle')!;
const dialogIcon = document.querySelector<HTMLElement>('#dialogIcon')!;
const dialogDescription = document.querySelector<HTMLElement>('#dialogDescription')!;
const toolForm = document.querySelector<HTMLFormElement>('#toolForm')!;
const fields = document.querySelector<HTMLDivElement>('#workflowFields')!;
const status = document.querySelector<HTMLElement>('#toolStatus')!;
const submit = document.querySelector<HTMLButtonElement>('#dialogSubmit')!;
let activeFilter: Category | 'All' = 'All';
let activeTool: Tool | undefined;
let cropper: Cropper | undefined;
let previewUrl: string | undefined;
let outputPreviewUrl: string | undefined;
let previewFile: File | undefined;
let estimateTimer = 0;
let estimateVersion = 0;
let estimateCache: { key: string; outputs: EngineOutput[] } | undefined;
let estimateInFlight = false;
let estimateQueued = false;
let targetQualityBaseline: { file: File; quality: number; bytes: number } | undefined;
let targetPaletteBaseline: { file: File; paletteColors: number; bytes: number } | undefined;
let pendingPhotoDownload = false;

function isPngCompressionSelected(): boolean {
  return activeTool?.name === 'Compress Image'
    && (toolForm.elements.namedItem('outputFormat') as HTMLSelectElement | null)?.value === 'png';
}

function isCompressImageTool(name = activeTool?.name): boolean {
  return name === 'Compress Image';
}

function pngCompressionLevel(quality: number): number {
  return Math.max(1, Math.min(4, 1 + Math.round((quality - 15) / 27)));
}

function renderTools(): void {
  const visibleTools = activeFilter === 'All' ? tools : tools.filter((tool) => (Array.isArray(tool.category) ? tool.category : [tool.category]).includes(activeFilter as Category));
  grid.innerHTML = visibleTools.map((tool) => {
    const index = tools.indexOf(tool);
    return `<button class="tool-card" type="button" aria-label="Open ${tool.name}" data-index="${index}">
      <span class="card-top"><span class="tool-illustration" aria-hidden="true">${inlineIcon(tool.icon, `card-${index}`)}</span></span>
      <span class="tool-name">${tool.name}</span><span class="tool-description">${tool.description}</span><span class="card-arrow" aria-hidden="true">↗</span>
    </button>`;
  }).join('');
  grid.querySelectorAll<HTMLButtonElement>('.tool-card').forEach((card) => {
    card.addEventListener('click', () => openTool(tools[Number(card.dataset.index)]));
  });
}

document.querySelectorAll<HTMLButtonElement>('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.filter.active')?.classList.remove('active');
    button.classList.add('active');
    activeFilter = (button.dataset.filter ?? 'All') as Category | 'All';
    renderTools();
  });
});

function fileInput(label: string, accept: string, multiple = false, id = 'sourceFiles'): string {
  return `<div class="engine-field"><span class="upload-label">${label}</span><label class="upload-zone" for="${id}"><span class="upload-symbol" aria-hidden="true">↑</span><b>Drop ${multiple ? 'files' : 'a file'} here or browse</b><small>Files stay on this device · Maximum 100 MB per file</small><input id="${id}" name="${id}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''} required></label></div>`;
}

function pageField(label = 'Pages', defaultValue = ''): string {
  return `<div class="engine-field"><label for="pages">${label}</label><input id="pages" name="pages" inputmode="text" placeholder="For example: 1, 3-5" value="${defaultValue}"><small>Use page numbers and ranges separated by commas.</small></div>`;
}

function numericField(id: string, label: string, value: number, min = 1): string {
  return `<div class="engine-field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="number" min="${min}" step="1" value="${value}" required></div>`;
}

function workflowMarkup(tool: Tool): string {
  const name = tool.name;
  if (name === 'Compress Image') {
    const formatSelector = `<select id="outputFormat" name="outputFormat" class="compact-format" aria-label="Format"><option value="jpg" selected>JPG</option><option value="jpeg">JPEG</option><option value="png">PNG</option></select>`;
    return `<div class="photo-compressor"><div class="compress-controls">
      <label class="photo-dropzone" for="sourceFiles"><span class="photo-upload-icon" aria-hidden="true">↑</span><span class="photo-upload-copy"><strong>Drop, paste or browse</strong><small>JPG, PNG, WebP · up to 100 MB</small></span><input id="sourceFiles" name="sourceFiles" type="file" accept="image/*" required></label>
      <div class="photo-file-row" id="photoFileRow" hidden><span class="photo-file-mark" aria-hidden="true"></span><span class="photo-file-meta"><strong id="photoFileName"></strong><small id="photoFileDetails"></small></span><button class="photo-remove" id="photoRemove" type="button">Remove</button></div>
      <div class="target-format-row"><div class="engine-field target-compact-field"><label for="targetKb">Target size <span>KB · optional</span></label><div class="target-size-input"><input id="targetKb" name="targetKb" type="number" min="1" placeholder="e.g. 100" aria-describedby="targetSizeHelp sizeEstimate"><span aria-hidden="true">KB</span></div></div><div class="engine-field format-compact-field"><label for="outputFormat">Format</label>${formatSelector}</div></div>
      <small id="targetSizeHelp" class="target-help">Set the file size you need.</small>
      <output id="sizeEstimate" class="size-estimate" aria-live="polite"></output><p id="targetReduction" class="target-reduction" aria-live="polite">Your target updates quality or palette automatically.</p>
      <div class="compression-presets compact-presets" role="group" aria-label="Compression level"><button type="button" data-quality="45" data-png-colors="64" aria-pressed="false">Small</button><button type="button" data-quality="72" data-png-colors="128" aria-pressed="true">Balanced</button><button type="button" data-quality="90" data-png-colors="256" aria-pressed="false">Best</button></div>
      <div class="engine-field compact-range"><label for="quality"><span id="qualityLabel">Quality</span><output id="qualityValue" for="quality">72%</output></label><input id="quality" name="quality" type="range" min="15" max="95" value="72"></div>
      <div class="engine-field compact-range"><label for="scalePercent"><span>Image size</span><output id="scaleValue" for="scalePercent">100%</output></label><input id="scalePercent" name="scalePercent" type="range" min="10" max="100" value="100"><small>Reduce dimensions for a smaller file.</small></div>
      <details class="photo-fine-tune"><summary>More image settings</summary><div class="photo-fine-tune-body"><div class="engine-field"><label for="paletteColors">Color palette <output id="paletteValue" for="paletteColors">Full color</output></label><input id="paletteColors" name="paletteColors" type="range" min="8" max="256" step="8" value="256"><small>Fewer colors create a smaller image.</small></div><div class="engine-field"><label for="dithering">Dithering <output id="ditheringValue" for="dithering">0.48</output></label><input id="dithering" name="dithering" type="range" min="0" max="1" step="0.01" value="0.48"><small>Adds texture to smooth out color bands.</small></div></div></details>
      <div class="photo-download-row"><div class="engine-field output-name-field"><label for="outputName">File name</label><input id="outputName" name="outputName" type="text" maxlength="100" placeholder="compressed"></div></div>
    </div><div class="compress-preview-column"><div id="filePreview" class="file-preview"><div class="photo-preview-empty"><span aria-hidden="true">↔</span><strong>Your before and after preview appears here.</strong></div></div><div class="compression-stats" aria-live="polite"><div><small>Original</small><strong id="originalSize">—</strong></div><div class="compression-result"><small>Compressed</small><strong id="compressedSize">—</strong></div><div class="compression-saved"><small>Saved</small><strong id="savedPercent">—</strong></div></div></div></div>`;
  }
  if (name === 'Change Photo Width & Height' || name === 'Change Signature Width & Height') return `${fileInput(name.includes('Signature') ? 'Choose a signature image' : 'Choose a photo', 'image/*')}${numericField('width', 'Width (pixels)', 800)}${numericField('height', 'Height (pixels)', 600)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Convert Photo to JPG') return `${fileInput('Choose a photo', 'image/*')}<div class="engine-field"><label for="quality">JPEG quality <output id="qualityValue" for="quality">90%</output></label><input id="quality" name="quality" type="range" min="20" max="100" value="90"></div><output id="sizeEstimate" class="size-estimate" aria-live="polite">Choose a photo to preview the conversion.</output><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Crop Photo') return `${fileInput('Choose a photo', 'image/*')}<p class="engine-hint">Drag the crop handles in the preview, then choose Crop photo.</p><div id="filePreview" class="file-preview crop-preview"></div>`;
  if (name === 'Make Passport Size Photo') return `${fileInput('Choose a photo', 'image/*')}${numericField('widthMm', 'Print width (mm)', 35)}${numericField('heightMm', 'Print height (mm)', 45)}<p class="engine-hint">Exports one photo at 300 DPI using the dimensions above.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Add Name & Date on Photo') return `${fileInput('Choose a photo', 'image/*')}<div class="engine-field"><label for="photoName">Name (optional)</label><input id="photoName" name="photoName" maxlength="120"></div><div class="engine-field"><label for="photoDate">Date (optional)</label><input id="photoDate" name="photoDate" type="date"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Make PDF from Photos') return `${fileInput('Choose photos', 'image/*', true)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Reduce PDF File Size') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}<div class="engine-field"><label for="pdfQuality">Image quality <output id="qualityValue" for="pdfQuality">60%</output></label><input id="pdfQuality" name="pdfQuality" type="range" min="35" max="95" value="60"><small>Lower quality reduces image resolution more. The preview runs the same local compression as the final file.</small></div><output id="sizeEstimate" class="size-estimate" aria-live="polite">Choose a PDF to estimate the output size.</output><p class="engine-hint">Uses Ghostscript locally. Signed PDFs are left untouched because rewriting invalidates digital signatures.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Merge PDF Files') return `${fileInput('Choose PDFs to merge', 'application/pdf,.pdf', true)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Split PDF' || name === 'Delete PDF Pages') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField(name === 'Split PDF' ? 'Pages to extract' : 'Pages to delete')}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Convert PDF to JPG') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField('Pages to convert (optional)')}<div class="engine-field"><label for="quality">JPEG quality</label><input id="quality" name="quality" type="range" min="30" max="100" value="88"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Put Many Pages on One Page') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField('Pages to arrange (optional)')}${numericField('columns', 'Columns', 2)}${numericField('rows', 'Rows', 2)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Sign PDF') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${fileInput('Choose your signature (PNG or JPG)', 'image/png,image/jpeg,.png,.jpg,.jpeg', false, 'signatureFile')}${numericField('page', 'Page number', 1)}${numericField('signatureWidth', 'Signature width (PDF points)', 120)}${numericField('signatureHeight', 'Signature height (PDF points)', 48)}<div class="engine-field"><label for="x">Left position (PDF points)</label><input id="x" name="x" type="number" min="0" value="36" required></div><div class="engine-field"><label for="y">Bottom position (PDF points)</label><input id="y" name="y" type="number" min="0" value="36" required></div><p class="engine-hint">PDF points start at the bottom-left corner. The existing file is not modified in place.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Verify PDF Signature') return `${fileInput('Choose a signed PDF', 'application/pdf,.pdf')}${fileInput('Choose trusted root certificate(s) (PEM or DER)', '.pem,.crt,.cer,.der', true, 'trustRoots')}<p class="engine-hint">Checks CMS integrity and certificate trust against roots you provide. It does not check certificate revocation or timestamp authorities.</p><div id="filePreview" class="file-preview"></div>`;
  return '';
}

function openTool(tool: Tool, navigate = true): void {
  if (submit.parentElement !== toolForm) toolForm.append(submit);
  releasePreview(); activeTool = tool; cropper = undefined; toolForm.reset(); toolForm.dataset.crop = ''; estimateCache = undefined; targetQualityBaseline = undefined; targetPaletteBaseline = undefined; pendingPhotoDownload = false; window.clearTimeout(estimateTimer); estimateVersion += 1;
  dialogTitle.textContent = tool.name;
  dialogIcon.innerHTML = inlineIcon(tool.icon, 'dialog');
  dialogDescription.textContent = tool.description;
  toolPage.dataset.tool = toolSlug(tool);
  const isImageCompressor = isCompressImageTool(tool.name);
  toolForm.classList.toggle('photo-compression-form', isImageCompressor);
  fields.classList.toggle('photo-workflow-fields', isImageCompressor);
  toolPage.classList.remove('has-image');
  fields.innerHTML = workflowMarkup(tool);
  if (isImageCompressor) {
    const downloadRow = fields.querySelector<HTMLElement>('.photo-download-row');
    const filenameField = fields.querySelector<HTMLElement>('.output-name-field');
    if (downloadRow && filenameField) downloadRow.append(filenameField, submit);
  }
  status.textContent = 'Choose your file and settings. Processing runs in your browser.';
  submit.textContent = isImageCompressor ? 'Choose an image first' : 'Run tool'; submit.disabled = isImageCompressor;
  catalog.hidden = true; toolPage.hidden = false;
  if (navigate) history.pushState({ paperplaneTool: true }, '', `#tool/${toolSlug(tool)}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
  dialogTitle.focus({ preventScroll: true });
  const fileInputElement = toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null;
  fileInputElement?.addEventListener('change', () => {
    const selectedFile = fileInputElement.files?.[0];
    const format = fields.querySelector<HTMLSelectElement>('#outputFormat');
    if (isImageCompressor && selectedFile && format) {
      const preferredFormat = selectedFile.type === 'image/png' || selectedFile.name.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      if (format.value !== preferredFormat) {
        format.value = preferredFormat;
        format.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    void showSelectedFiles(fileInputElement.files ? [...fileInputElement.files] : []);
    requestEstimate();
  });
  fields.querySelectorAll<HTMLInputElement>('input[type="range"], input[type="number"]').forEach((input) => {
    input.addEventListener('input', () => {
      const out = fields.querySelector<HTMLOutputElement>('#qualityValue');
      const paletteOut = fields.querySelector<HTMLOutputElement>('#paletteValue');
      if (input.name === 'quality' && out) {
        const pngMode = isPngCompressionSelected();
        const qualityLabel = fields.querySelector<HTMLElement>('#qualityLabel');
        if (qualityLabel) qualityLabel.textContent = pngMode ? 'PNG compression effort' : 'JPEG quality';
        out.value = pngMode ? `Level ${pngCompressionLevel(Number(input.value))}/4` : `${input.value}%`;
        input.setAttribute('aria-valuetext', pngMode ? `Compression level ${pngCompressionLevel(Number(input.value))} of 4` : `${input.value} percent quality`);
      }
      if (input.name === 'scalePercent') {
        const scaleValue = fields.querySelector<HTMLOutputElement>('#scaleValue');
        if (scaleValue) scaleValue.value = `${input.value}%`;
        input.setAttribute('aria-valuetext', `${input.value} percent of original dimensions`);
      }
      if (input.name === 'quality') {
        const paletteValue = (toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null)?.value;
        fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => {
          const selected = isPngCompressionSelected()
            ? button.dataset.quality === input.value && button.dataset.pngColors === paletteValue
            : button.dataset.quality === input.value;
          button.setAttribute('aria-pressed', String(selected));
        });
      }
      if (input.name === 'paletteColors' && paletteOut) { paletteOut.value = input.value === '256' && !isPngCompressionSelected() ? 'Full color' : `${input.value} colors`; input.setAttribute('aria-valuetext', paletteOut.value); }
      if (input.name === 'paletteColors' && isPngCompressionSelected()) {
        const qualityValue = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
        fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.pngColors === input.value && button.dataset.quality === qualityValue?.value));
        });
      }
      const ditheringOut = fields.querySelector<HTMLOutputElement>('#ditheringValue');
      if (input.name === 'dithering' && ditheringOut) { ditheringOut.value = Number(input.value).toFixed(2); input.setAttribute('aria-valuetext', ditheringOut.value); }
      const ditheringInput = toolForm.elements.namedItem('dithering') as HTMLInputElement | null;
      if (input.name === 'paletteColors' && ditheringInput) ditheringInput.disabled = input.value === '256' && !isPngCompressionSelected();
      if (input.name === 'targetKb') {
        updateTargetReduction();
        if (isPngCompressionSelected()) adjustPaletteForTarget();
        else adjustQualityForTarget();
        requestEstimate();
      }
    });
    input.addEventListener('change', requestEstimate);
  });
  const initialPalette = toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null;
  const initialDithering = toolForm.elements.namedItem('dithering') as HTMLInputElement | null;
  if (initialPalette && initialDithering) initialDithering.disabled = initialPalette.value === '256' && !isPngCompressionSelected();
  const outputFormat = fields.querySelector<HTMLSelectElement>('#outputFormat');
  const updateOutputFormat = () => {
    if (!outputFormat) return;
    const isPng = outputFormat.value === 'png';
    const quality = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
    const target = toolForm.elements.namedItem('targetKb') as HTMLInputElement | null;
    const palette = toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null;
    const dithering = toolForm.elements.namedItem('dithering') as HTMLInputElement | null;
    const qualityValue = fields.querySelector<HTMLOutputElement>('#qualityValue');
    const targetReduction = fields.querySelector<HTMLElement>('#targetReduction');
    const qualityLabel = fields.querySelector<HTMLElement>('#qualityLabel');
    if (quality) quality.disabled = false;
    if (target) target.disabled = false;
    if (palette) palette.disabled = false;
    if (dithering) dithering.disabled = !isPng && palette?.value === '256';
    fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => { button.disabled = false; });
    if (qualityLabel) qualityLabel.textContent = isPng ? 'PNG compression effort' : 'JPEG quality';
    if (qualityValue && quality) qualityValue.value = isPng ? `Level ${pngCompressionLevel(Number(quality.value))}/4` : `${quality.value}%`;
    const paletteValue = fields.querySelector<HTMLOutputElement>('#paletteValue');
    if (paletteValue && palette) paletteValue.value = isPng ? `${palette.value} colors` : palette.value === '256' ? 'Full color' : `${palette.value} colors`;
    if (targetReduction) targetReduction.textContent = isPng
      ? 'PNG transparency is preserved; target size adjusts the color palette.'
      : 'Target size adjusts JPEG quality automatically.';
  };
  outputFormat?.addEventListener('change', () => { updateOutputFormat(); requestEstimate(); });
  updateOutputFormat();
  fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => button.addEventListener('click', () => {
    if (isPngCompressionSelected()) {
      const palette = toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null;
      const quality = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
      if (!palette || !quality) return;
      palette.value = button.dataset.pngColors ?? '128';
      palette.dispatchEvent(new Event('input', { bubbles: true }));
      quality.value = button.dataset.quality ?? '72';
      quality.dispatchEvent(new Event('input', { bubbles: true }));
      fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((preset) => preset.setAttribute('aria-pressed', String(preset === button)));
      requestEstimate();
      return;
    }
    const quality = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
    if (!quality) return;
    quality.value = button.dataset.quality ?? '72';
    fields.querySelector<HTMLOutputElement>('#qualityValue')!.value = `${quality.value}%`;
    fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((preset) => preset.setAttribute('aria-pressed', String(preset === button)));
    requestEstimate();
  }));
  fields.querySelector<HTMLButtonElement>('#photoRemove')?.addEventListener('click', clearPhotoSelection);
  fields.querySelectorAll<HTMLLabelElement>('.upload-zone, .photo-dropzone').forEach((zone) => {
    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault(); zone.classList.remove('dragover');
      const input = zone.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input || !event.dataTransfer?.files.length) return;
      input.files = event.dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function clearPhotoSelection(): void {
  const input = toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null;
  if (input) input.value = '';
  releasePreview(); estimateCache = undefined; targetPaletteBaseline = undefined; estimateVersion += 1; window.clearTimeout(estimateTimer);
  fields.querySelector<HTMLElement>('#photoFileRow')?.setAttribute('hidden', '');
  const imageKind = 'image';
  fields.querySelector<HTMLDivElement>('#filePreview')!.innerHTML = `<div class="photo-preview-empty"><span aria-hidden="true">↔</span><strong>Your comparison preview will appear here</strong><small>Choose a ${imageKind} to see the original and compressed versions.</small></div>`;
  toolPage.classList.remove('has-image');
  fields.querySelector<HTMLOutputElement>('#sizeEstimate')!.value = '';
  fields.querySelector<HTMLElement>('#originalSize')!.textContent = '—';
  fields.querySelector<HTMLElement>('#compressedSize')!.textContent = '—';
  fields.querySelector<HTMLElement>('#savedPercent')!.textContent = '—';
  updateTargetReduction();
  const quality = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
  if (quality) quality.disabled = false;
  for (const name of ['targetKb', 'paletteColors', 'dithering']) {
    const control = toolForm.elements.namedItem(name) as HTMLInputElement | null;
    if (control) control.disabled = name === 'dithering' && (toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null)?.value === '256';
  }
  fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => { button.disabled = false; });
  const qualityValue = fields.querySelector<HTMLOutputElement>('#qualityValue');
  const qualityLabel = fields.querySelector<HTMLElement>('#qualityLabel');
  if (qualityLabel) qualityLabel.textContent = 'JPEG quality';
  if (qualityValue && quality) qualityValue.value = `${quality.value}%`;
  submit.disabled = true; submit.textContent = 'Choose an image first';
}

document.addEventListener('paste', (event) => {
  if (!isCompressImageTool()) return;
  const file = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  const input = toolForm.elements.namedItem('sourceFiles') as HTMLInputElement;
  const transfer = new DataTransfer(); transfer.items.add(new File([file], `pasted-image.${file.type.split('/')[1] || 'png'}`, { type: file.type }));
  input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
});

function toolSlug(tool: Tool): string { return tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function renderRoute(): void {
  const match = location.hash.match(/^#tool\/(.+)$/);
  const selected = match
    ? tools.find((tool) => toolSlug(tool) === match[1])
      ?? (['reduce-photo-file-size', 'reduce-signature-file-size'].includes(match[1]) ? tools.find((tool) => tool.name === 'Compress Image') : undefined)
    : undefined;
  if (selected) {
    if (match && match[1] !== toolSlug(selected)) history.replaceState(history.state, '', `#tool/${toolSlug(selected)}`);
    if (activeTool !== selected || toolPage.hidden) openToolFromHistory(selected);
    return;
  }
  activeTool = undefined; toolPage.hidden = true; catalog.hidden = false; releasePreview();
}

function openToolFromHistory(tool: Tool): void {
  openTool(tool, false);
}

document.querySelector<HTMLButtonElement>('#toolBack')!.addEventListener('click', () => {
  if (history.state?.paperplaneTool) history.back();
  else { history.replaceState(null, '', '#tools'); renderRoute(); catalog.scrollIntoView({ behavior: 'smooth' }); }
});
window.addEventListener('popstate', renderRoute);
window.addEventListener('hashchange', renderRoute);

async function showSelectedFiles(files: File[]): Promise<void> {
  const preview = fields.querySelector<HTMLDivElement>('#filePreview');
  if (!preview || files.length === 0) return;
  updateTargetReduction();
  releasePreview();
  const summary = document.createElement('p'); summary.className = 'file-summary';
  summary.textContent = files.map((file) => `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`).join('\n');
  preview.replaceChildren(summary);
  const image = files[0];
  if (!image.type.startsWith('image/') || image.type === 'application/pdf') return;
  const isImageCompressor = isCompressImageTool();
  if (isImageCompressor) toolPage.classList.add('has-image');
  const photoName = fields.querySelector<HTMLElement>('#photoFileName');
  if (photoName) {
    const row = fields.querySelector<HTMLElement>('#photoFileRow')!; row.hidden = false;
    photoName.textContent = image.name;
    fields.querySelector<HTMLElement>('#photoFileDetails')!.textContent = `${formatBytes(image.size)} · loading dimensions…`;
    fields.querySelector<HTMLElement>('#originalSize')!.textContent = formatBytes(image.size);
    fields.querySelector<HTMLElement>('#compressedSize')!.textContent = 'Preparing…';
    fields.querySelector<HTMLElement>('#savedPercent')!.textContent = '—';
    submit.disabled = false; submit.textContent = 'Preparing preview…';
    const outputName = fields.querySelector<HTMLInputElement>('#outputName');
    if (outputName) outputName.value = safeDownloadStem(image.name.replace(/\.[^.]+$/, '')) + '-compressed';
  }
  const quality = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
  if (quality) {
    const pngMode = isPngCompressionSelected();
    quality.disabled = false;
    const qualityValue = fields.querySelector<HTMLOutputElement>('#qualityValue');
    const qualityLabel = fields.querySelector<HTMLElement>('#qualityLabel');
    if (qualityLabel) qualityLabel.textContent = pngMode ? 'PNG compression effort' : 'JPEG quality';
    if (qualityValue) qualityValue.value = pngMode ? `Level ${pngCompressionLevel(Number(quality.value))}/4` : `${quality.value}%`;
    for (const name of ['targetKb', 'paletteColors', 'dithering']) {
      const control = toolForm.elements.namedItem(name) as HTMLInputElement | null;
      if (control) control.disabled = name === 'dithering' && !pngMode
        && (toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null)?.value === '256';
    }
    fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => { button.disabled = false; });
    const selectedPalette = (toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null)?.value;
    if (pngMode && selectedPalette) {
      const paletteValue = fields.querySelector<HTMLOutputElement>('#paletteValue');
      if (paletteValue) paletteValue.value = `${selectedPalette} colors`;
      const dithering = toolForm.elements.namedItem('dithering') as HTMLInputElement | null;
      if (dithering) dithering.disabled = false;
      fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.pngColors === selectedPalette));
      });
    }
    updateTargetReduction();
  }
  previewUrl = URL.createObjectURL(image);
  previewFile = image;
  const imageView = document.createElement('img'); imageView.alt = 'Selected image preview'; imageView.src = previewUrl;
  preview.append(imageView);
  await new Promise<void>((resolve) => { imageView.onload = () => resolve(); imageView.onerror = () => resolve(); });
  const widthField = toolForm.elements.namedItem('width') as HTMLInputElement | null;
  const heightField = toolForm.elements.namedItem('height') as HTMLInputElement | null;
  if (widthField && heightField) { widthField.value = String(imageView.naturalWidth); heightField.value = String(imageView.naturalHeight); }
  if (photoName) fields.querySelector<HTMLElement>('#photoFileDetails')!.textContent = `${formatBytes(image.size)} · ${imageView.naturalWidth} × ${imageView.naturalHeight}`;
  if (['Compress Image', 'Convert Photo to JPG'].includes(activeTool?.name ?? '')) renderComparison(image, undefined);
  if (activeTool?.name === 'Crop Photo') {
    const { default: CropperConstructor } = await import('cropperjs');
    if (toolPage.hidden || activeTool?.name !== 'Crop Photo') return;
    cropper = new CropperConstructor(imageView, { viewMode: 1, autoCropArea: 0.82, responsive: true, ready: () => { toolForm.dataset.crop = JSON.stringify(cropper!.getData(true)); } });
    imageView.addEventListener('cropend', () => { if (cropper) toolForm.dataset.crop = JSON.stringify(cropper.getData(true)); });
  }
}

function estimateKey(file: File, tool: string): string {
  const setting = tool === 'Reduce PDF File Size' ? 'pdfQuality' : 'quality';
  const slider = toolForm.elements.namedItem(setting) as HTMLInputElement | null;
  const palette = toolForm.elements.namedItem('paletteColors') as HTMLInputElement | null;
  const dither = toolForm.elements.namedItem('dithering') as HTMLInputElement | null;
  const target = toolForm.elements.namedItem('targetKb') as HTMLInputElement | null;
  const scale = toolForm.elements.namedItem('scalePercent') as HTMLInputElement | null;
  const format = toolForm.elements.namedItem('outputFormat') as HTMLSelectElement | null;
  return `${tool}|${file.name}|${file.size}|${file.lastModified}|${slider?.value ?? ''}|${palette?.value ?? ''}|${dither?.value ?? ''}|${target?.value ?? ''}|${scale?.value ?? ''}|${format?.value ?? ''}`;
}

function updateTargetReduction(): void {
  const field = fields.querySelector<HTMLInputElement>('#targetKb');
  const note = fields.querySelector<HTMLElement>('#targetReduction');
  if (!field || !note) return;
  const pngMode = isPngCompressionSelected();
  const target = Number(field.value);
  if (!field.value || !Number.isFinite(target) || target <= 0) {
    note.textContent = pngMode
      ? 'PNG transparency is preserved. Set a target size to adjust the palette automatically.'
      : 'Set a target size to adjust JPEG quality automatically.';
    return;
  }
  const file = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null)?.files?.[0];
  if (!file) { note.textContent = `${target} KB target. Choose a file to calculate the reduction needed.`; return; }
  const reduction = Math.max(0, Math.min(100, (1 - target * 1024 / file.size) * 100));
  note.textContent = reduction === 0
    ? `Your ${target} KB target is already larger than this file.`
    : `About ${Math.ceil(reduction)}% reduction needed to reach ${target} KB. ${pngMode ? 'The palette adjusts automatically.' : 'Quality adjusts automatically.'}`;
}

function adjustQualityForTarget(): void {
  if (isPngCompressionSelected()) return;
  const targetField = fields.querySelector<HTMLInputElement>('#targetKb');
  const quality = fields.querySelector<HTMLInputElement>('#quality');
  const file = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null)?.files?.[0];
  if (!targetField?.value) { targetQualityBaseline = undefined; return; }
  if (!quality || !file) return;
  const targetBytes = Number(targetField.value) * 1024;
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) return;
  if (!targetQualityBaseline || targetQualityBaseline.file !== file) {
    const cached = previewFile === file ? estimateCache?.outputs[0] : undefined;
    targetQualityBaseline = { file, quality: cached?.quality ?? Number(quality.value), bytes: cached?.blob.size ?? file.size };
  }
  const guess = Math.round(targetQualityBaseline.quality * Math.sqrt(targetBytes / Math.max(1, targetQualityBaseline.bytes)));
  const adjusted = Math.max(Number(quality.min), Math.min(Number(quality.max), guess));
  quality.value = String(adjusted);
  quality.dispatchEvent(new Event('input', { bubbles: true }));
  const approximateBytes = Math.min(targetBytes, file.size);
  const compressedSize = fields.querySelector<HTMLElement>('#compressedSize');
  const savedPercent = fields.querySelector<HTMLElement>('#savedPercent');
  const estimate = fields.querySelector<HTMLOutputElement>('#sizeEstimate');
  if (compressedSize) compressedSize.textContent = `~${formatBytes(approximateBytes)}`;
  if (savedPercent) savedPercent.textContent = `${Math.max(0, Math.round((1 - approximateBytes / file.size) * 100))}%`;
  if (estimate) estimate.value = `Updating estimate for your ${formatBytes(targetBytes)} target…`;
  submit.textContent = 'Download';
}

function adjustPaletteForTarget(): void {
  const targetField = fields.querySelector<HTMLInputElement>('#targetKb');
  const palette = fields.querySelector<HTMLInputElement>('#paletteColors');
  const file = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null)?.files?.[0];
  if (!targetField?.value) { targetPaletteBaseline = undefined; return; }
  if (!palette || !file) return;
  const targetBytes = Number(targetField.value) * 1024;
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) return;
  if (!targetPaletteBaseline || targetPaletteBaseline.file !== file) {
    const cached = previewFile === file ? estimateCache?.outputs[0] : undefined;
    targetPaletteBaseline = {
      file,
      paletteColors: cached?.paletteColors ?? Number(palette.value),
      bytes: cached?.blob.size ?? file.size,
    };
  }
  const scale = Math.sqrt(targetBytes / Math.max(1, targetPaletteBaseline.bytes));
  const guess = Math.round(targetPaletteBaseline.paletteColors * scale / 8) * 8;
  palette.value = String(Math.max(Number(palette.min), Math.min(Number(palette.max), guess)));
  palette.dispatchEvent(new Event('input', { bubbles: true }));
  const estimate = fields.querySelector<HTMLOutputElement>('#sizeEstimate');
  if (estimate) estimate.value = `Adjusting the PNG palette for your ${formatBytes(targetBytes)} target…`;
  submit.textContent = 'Download';
}

function requestEstimate(): void {
  if (!activeTool || !['Compress Image', 'Convert Photo to JPG', 'Reduce PDF File Size'].includes(activeTool.name)) return;
  const file = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null)?.files?.[0];
  const estimate = fields.querySelector<HTMLOutputElement>('#sizeEstimate');
  if (!file || !estimate) return;
  const key = estimateKey(file, activeTool.name);
  if (estimateCache?.key === key) { showEstimate(estimate, file, estimateCache.outputs); return; }
  window.clearTimeout(estimateTimer);
  const version = ++estimateVersion;
  estimate.value = 'Estimating output size…';
  estimateTimer = window.setTimeout(async () => {
    estimateTimer = 0;
    const tool = activeTool;
    if (!tool) return;
    if (estimateInFlight) { estimateQueued = true; return; }
    estimateInFlight = true;
    const outputFiles = (toolForm.elements.namedItem('signatureFile') as HTMLInputElement | null)?.files;
    try {
      const outputs = await runEngine({ tool: tool.name, files: [file], extraFiles: outputFiles ? [...outputFiles] : [], form: toolForm, report: (message) => { if (version === estimateVersion) estimate.value = message; } });
      if (version !== estimateVersion) return;
      showEstimate(estimate, file, outputs);
      estimateCache = { key: estimateKey(file, tool.name), outputs };
      if (tool.name !== 'Reduce PDF File Size') renderComparison(file, outputs[0]);
    } catch (error) {
      if (version !== estimateVersion) return;
      estimateCache = undefined;
      estimate.value = error instanceof Error ? `Estimate unavailable: ${error.message}` : 'Estimate unavailable. The selected file will be checked when processed.';
    } finally {
      estimateInFlight = false;
      if (estimateQueued) { estimateQueued = false; requestEstimate(); return; }
      if (pendingPhotoDownload) {
        pendingPhotoDownload = false;
        const latestFile = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null)?.files?.[0];
        if (latestFile && isCompressImageTool(tool.name) && estimateCache?.key === estimateKey(latestFile, tool.name)) {
          submit.disabled = false;
          toolForm.requestSubmit(submit);
        } else {
          submit.disabled = false;
          submit.textContent = 'Try again';
          status.textContent = 'The size estimate could not finish. Click Download to try again.';
        }
      }
    }
  }, isCompressImageTool(activeTool.name) ? 500 : 250);
}

function formatBytes(bytes: number): string { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`; }
function safeDownloadStem(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'compressed-photo';
}

function showEstimate(estimate: HTMLOutputElement, file: File, outputs: EngineOutput[]): void {
  const bytes = outputs.reduce((total, output) => total + output.blob.size, 0);
  const ratio = Math.round((1 - bytes / file.size) * 100);
  estimate.value = bytes < file.size
    ? `Estimated output: ${formatBytes(bytes)} · about ${ratio}% smaller`
    : `Estimated output: ${formatBytes(bytes)} · this may be larger than the original`;
  const compressedSize = fields.querySelector<HTMLElement>('#compressedSize');
  const savedPercent = fields.querySelector<HTMLElement>('#savedPercent');
  if (compressedSize) compressedSize.textContent = formatBytes(bytes);
  if (savedPercent) savedPercent.textContent = bytes < file.size ? `${ratio}%` : '0%';
  const target = fields.querySelector<HTMLInputElement>('#targetKb');
  const quality = fields.querySelector<HTMLInputElement>('#quality');
  const qualityValue = fields.querySelector<HTMLOutputElement>('#qualityValue');
  const selectedQuality = outputs[0]?.quality;
  if (selectedQuality !== undefined) targetQualityBaseline = { file, quality: selectedQuality, bytes: outputs[0].blob.size };
  const selectedPalette = outputs[0]?.paletteColors;
  if (selectedPalette !== undefined && isPngCompressionSelected()) {
    targetPaletteBaseline = { file, paletteColors: selectedPalette, bytes: outputs[0].blob.size };
    const palette = fields.querySelector<HTMLInputElement>('#paletteColors');
    const paletteValue = fields.querySelector<HTMLOutputElement>('#paletteValue');
    if (palette) palette.value = String(selectedPalette);
    if (paletteValue) paletteValue.value = `${selectedPalette} colors`;
    const pngEffort = toolForm.elements.namedItem('quality') as HTMLInputElement | null;
    fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.pngColors === String(selectedPalette) && button.dataset.quality === pngEffort?.value));
    });
  }
  if (outputs[0]?.compressionLevel !== undefined && isPngCompressionSelected()) {
    const qualityValue = fields.querySelector<HTMLOutputElement>('#qualityValue');
    if (qualityValue) qualityValue.value = `Level ${outputs[0].compressionLevel}/4`;
  }
  if (target?.value && selectedQuality !== undefined && quality) {
    quality.value = String(selectedQuality);
    quality.setAttribute('aria-valuetext', `${selectedQuality} percent quality`);
    if (qualityValue) qualityValue.value = `${selectedQuality}%`;
    fields.querySelectorAll<HTMLButtonElement>('.compression-presets button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.quality === String(selectedQuality)));
    });
  }
}

function renderComparison(file: File, output?: EngineOutput): void {
  const preview = fields.querySelector<HTMLDivElement>('#filePreview');
  if (!preview || !previewUrl) return;
  if (outputPreviewUrl) URL.revokeObjectURL(outputPreviewUrl);
  outputPreviewUrl = output ? URL.createObjectURL(output.blob) : undefined;
  const comparison = document.createElement('div'); comparison.className = 'image-comparison';
  const original = document.createElement('img'); original.src = previewUrl; original.alt = 'Original image';
  const sourceImage = preview.querySelector<HTMLImageElement>('img');
  if (sourceImage?.naturalWidth && sourceImage.naturalHeight) comparison.style.aspectRatio = `${sourceImage.naturalWidth} / ${sourceImage.naturalHeight}`;
  const afterClip = document.createElement('div'); afterClip.className = 'comparison-after';
  const compressed = document.createElement('img'); compressed.src = outputPreviewUrl ?? previewUrl; compressed.alt = output ? 'Image after applying the current compression settings' : 'Compression preview is loading';
  afterClip.append(compressed);
  const divider = document.createElement('div'); divider.className = 'comparison-divider'; divider.setAttribute('aria-hidden', 'true');
  const range = document.createElement('input'); range.className = 'comparison-range'; range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '50'; range.setAttribute('aria-label', 'Drag across the image to compare original and compressed versions');
  const handle = document.createElement('span'); handle.className = 'comparison-handle'; handle.textContent = '↔'; handle.setAttribute('aria-hidden', 'true');
  const beforeBadge = document.createElement('span'); beforeBadge.className = 'comparison-badge comparison-badge-before'; beforeBadge.textContent = 'Original'; beforeBadge.setAttribute('aria-hidden', 'true');
  const afterBadge = document.createElement('span'); afterBadge.className = 'comparison-badge comparison-badge-after'; afterBadge.textContent = output ? 'Compressed' : 'Preview loading…'; afterBadge.setAttribute('aria-hidden', 'true');
  const update = () => { afterClip.style.clipPath = `inset(0 0 0 ${range.value}%)`; divider.style.left = `${range.value}%`; handle.style.left = `${range.value}%`; };
  range.addEventListener('input', update);
  comparison.append(original, afterClip, divider, beforeBadge, afterBadge, handle, range);
  preview.replaceChildren(comparison);
  const estimate = fields.querySelector<HTMLOutputElement>('#sizeEstimate');
  if (estimate) estimate.value = output ? `${formatBytes(file.size)} → ${formatBytes(output.blob.size)}` : 'Preparing live preview…';
  if (output) submit.textContent = 'Download';
  update();
}

function releasePreview(): void {
  cropper?.destroy(); cropper = undefined;
  if (previewFile) releaseMozJpegFile(previewFile);
  previewFile = undefined;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (outputPreviewUrl) URL.revokeObjectURL(outputPreviewUrl);
  previewUrl = undefined;
  outputPreviewUrl = undefined;
}

toolForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.submitter !== submit) return;
  if (!activeTool) return;
  if (isCompressImageTool() && estimateInFlight) {
    if (estimateTimer) { window.clearTimeout(estimateTimer); estimateTimer = 0; estimateQueued = true; }
    pendingPhotoDownload = true;
    submit.disabled = true; submit.textContent = 'Preparing download…';
    status.textContent = 'Finishing the current compression before download…';
    return;
  }
  if (isCompressImageTool() && estimateTimer) {
    window.clearTimeout(estimateTimer); estimateTimer = 0; estimateVersion += 1;
  }
  const files = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement).files;
  const signature = (toolForm.elements.namedItem('signatureFile') as HTMLInputElement | null)?.files;
  const roots = (toolForm.elements.namedItem('trustRoots') as HTMLInputElement | null)?.files;
  const extra = signature ? [...signature] : roots ? [...roots] : [];
  submit.disabled = true; submit.textContent = 'Working…'; status.textContent = 'Preparing local processing…';
  try {
    const source = files?.[0];
    const cached = source && estimateCache?.key === estimateKey(source, activeTool.name) ? estimateCache.outputs : undefined;
    let outputs: EngineOutput[] = cached ?? await runEngine({
      tool: activeTool.name,
      files: files ? [...files] : [],
      extraFiles: extra,
      form: toolForm,
      report: (message) => { status.textContent = message; },
    });
    if (isCompressImageTool() && outputs.length === 1) {
      const requestedStem = fields.querySelector<HTMLInputElement>('#outputName')?.value ?? '';
      const extension = outputs[0].name.match(/\.[^.]+$/)?.[0] ?? '.jpg';
      outputs = [{ ...outputs[0], name: `${safeDownloadStem(requestedStem)}${extension}` }];
    }
    downloadOutputs(outputs);
    status.textContent = outputs.length === 1
      ? `Done. Downloaded ${outputs[0].name}.${outputs[0].message ? ` ${outputs[0].message}` : ''}`
      : `Done. Prepared ${outputs.length} files.`;
    submit.disabled = false; submit.textContent = isCompressImageTool() && outputs.length === 1 ? 'Download' : 'Run again';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Processing failed. Please check the file and try again.';
    submit.disabled = false; submit.textContent = 'Try again';
  }
});

toolForm.addEventListener('keydown', (event) => {
  if (!isCompressImageTool() || event.key !== 'Enter') return;
  if (event.target instanceof HTMLInputElement && event.target.type !== 'file') event.preventDefault();
});

function inlineIcon(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}-${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_match, ids: string) =>
      `aria-labelledby="${ids.split(/\s+/).map((id) => `${prefix}-${id}`).join(' ')}"`);
}

renderTools();
renderRoute();
