import type Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { downloadOutputs, runEngine, type EngineOutput } from './engines';
import icon01 from './assets/icons/01-reduce-photo-file-size.svg?raw';
import icon02 from './assets/icons/02-reduce-pdf-file-size.svg?raw';
import icon03 from './assets/icons/03-reduce-signature-file-size.svg?raw';
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
type Tool = { name: string; description: string; category: Category; icon: string; tone: string; tag: string };

const tools: Tool[] = [
  { name: 'Reduce Photo File Size', description: 'Compress photos for easier storage and sharing.', category: 'Images', icon: icon01, tone: 'green', tag: 'Popular' },
  { name: 'Reduce PDF File Size', description: 'Make PDFs smaller and easier to share.', category: 'PDFs', icon: icon02, tone: 'peach', tag: 'Popular' },
  { name: 'Reduce Signature File Size', description: 'Make a signature image smaller for uploading or sharing.', category: 'Signatures', icon: icon03, tone: 'lilac', tag: '' },
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
const dialog = document.querySelector<HTMLDialogElement>('#toolDialog')!;
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

function renderTools(): void {
  const visibleTools = activeFilter === 'All' ? tools : tools.filter((tool) => tool.category === activeFilter);
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
  return `<div class="engine-field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''} required><small>Files stay on this device. Maximum 100 MB per file.</small></div>`;
}

function pageField(label = 'Pages', defaultValue = ''): string {
  return `<div class="engine-field"><label for="pages">${label}</label><input id="pages" name="pages" inputmode="text" placeholder="For example: 1, 3-5" value="${defaultValue}"><small>Use page numbers and ranges separated by commas.</small></div>`;
}

function numericField(id: string, label: string, value: number, min = 1): string {
  return `<div class="engine-field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="number" min="${min}" step="1" value="${value}" required></div>`;
}

function workflowMarkup(tool: Tool): string {
  const name = tool.name;
  if (name === 'Reduce Photo File Size') return `${fileInput('Choose a photo', 'image/*')}<div class="engine-field"><label for="quality">JPEG quality</label><input id="quality" name="quality" type="range" min="15" max="95" value="82"><small>Higher quality makes a larger file.</small></div><div class="engine-field"><label for="targetKb">Optional target size (KB)</label><input id="targetKb" name="targetKb" type="number" min="1" placeholder="Leave blank to use quality"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Reduce Signature File Size') return `${fileInput('Choose a signature image', 'image/*')}<p class="engine-hint">PNG stays transparent and is optimized losslessly. Other formats are saved as JPEG with a white background.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Change Photo Width & Height' || name === 'Change Signature Width & Height') return `${fileInput(name.includes('Signature') ? 'Choose a signature image' : 'Choose a photo', 'image/*')}${numericField('width', 'Width (pixels)', 800)}${numericField('height', 'Height (pixels)', 600)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Convert Photo to JPG') return `${fileInput('Choose a photo', 'image/*')}<div class="engine-field"><label for="quality">JPEG quality</label><input id="quality" name="quality" type="range" min="20" max="100" value="90"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Crop Photo') return `${fileInput('Choose a photo', 'image/*')}<p class="engine-hint">Drag the crop handles in the preview, then choose Crop photo.</p><div id="filePreview" class="file-preview crop-preview"></div>`;
  if (name === 'Make Passport Size Photo') return `${fileInput('Choose a photo', 'image/*')}${numericField('widthMm', 'Print width (mm)', 35)}${numericField('heightMm', 'Print height (mm)', 45)}<p class="engine-hint">Exports one photo at 300 DPI using the dimensions above.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Add Name & Date on Photo') return `${fileInput('Choose a photo', 'image/*')}<div class="engine-field"><label for="photoName">Name (optional)</label><input id="photoName" name="photoName" maxlength="120"></div><div class="engine-field"><label for="photoDate">Date (optional)</label><input id="photoDate" name="photoDate" type="date"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Make PDF from Photos') return `${fileInput('Choose photos', 'image/*', true)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Reduce PDF File Size') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}<div class="engine-field"><label for="pdfQuality">Image quality</label><input id="pdfQuality" name="pdfQuality" type="range" min="35" max="95" value="82"><small>Lower quality can make image-heavy PDFs smaller, with some image detail loss.</small></div><p class="engine-hint">Runs qpdf in a browser worker. PDFs with digital signatures are not changed.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Merge PDF Files') return `${fileInput('Choose PDFs to merge', 'application/pdf,.pdf', true)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Split PDF' || name === 'Delete PDF Pages') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField(name === 'Split PDF' ? 'Pages to extract' : 'Pages to delete')}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Convert PDF to JPG') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField('Pages to convert (optional)')}<div class="engine-field"><label for="quality">JPEG quality</label><input id="quality" name="quality" type="range" min="30" max="100" value="88"></div><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Put Many Pages on One Page') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${pageField('Pages to arrange (optional)')}${numericField('columns', 'Columns', 2)}${numericField('rows', 'Rows', 2)}<div id="filePreview" class="file-preview"></div>`;
  if (name === 'Sign PDF') return `${fileInput('Choose a PDF', 'application/pdf,.pdf')}${fileInput('Choose your signature (PNG or JPG)', 'image/png,image/jpeg,.png,.jpg,.jpeg', false, 'signatureFile')}${numericField('page', 'Page number', 1)}${numericField('signatureWidth', 'Signature width (PDF points)', 120)}${numericField('signatureHeight', 'Signature height (PDF points)', 48)}<div class="engine-field"><label for="x">Left position (PDF points)</label><input id="x" name="x" type="number" min="0" value="36" required></div><div class="engine-field"><label for="y">Bottom position (PDF points)</label><input id="y" name="y" type="number" min="0" value="36" required></div><p class="engine-hint">PDF points start at the bottom-left corner. The existing file is not modified in place.</p><div id="filePreview" class="file-preview"></div>`;
  if (name === 'Verify PDF Signature') return `${fileInput('Choose a signed PDF', 'application/pdf,.pdf')}${fileInput('Choose trusted root certificate(s) (PEM or DER)', '.pem,.crt,.cer,.der', true, 'trustRoots')}<p class="engine-hint">Checks CMS integrity and certificate trust against roots you provide. It does not check certificate revocation or timestamp authorities.</p><div id="filePreview" class="file-preview"></div>`;
  return '';
}

function openTool(tool: Tool): void {
  releasePreview(); activeTool = tool; cropper = undefined; toolForm.reset(); toolForm.dataset.crop = '';
  dialogTitle.textContent = tool.name;
  dialogIcon.innerHTML = inlineIcon(tool.icon, 'dialog');
  dialogDescription.textContent = tool.description;
  fields.innerHTML = workflowMarkup(tool);
  status.textContent = 'Choose your file and settings. Processing runs in your browser.';
  submit.textContent = 'Run tool'; submit.disabled = false;
  dialog.showModal();
  const fileInputElement = toolForm.elements.namedItem('sourceFiles') as HTMLInputElement | null;
  fileInputElement?.addEventListener('change', () => void showSelectedFiles(fileInputElement.files ? [...fileInputElement.files] : []));
}

async function showSelectedFiles(files: File[]): Promise<void> {
  const preview = fields.querySelector<HTMLDivElement>('#filePreview');
  if (!preview || files.length === 0) return;
  releasePreview();
  const summary = document.createElement('p'); summary.className = 'file-summary';
  summary.textContent = files.map((file) => `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`).join('\n');
  preview.replaceChildren(summary);
  const image = files[0];
  if (!image.type.startsWith('image/') || image.type === 'application/pdf') return;
  previewUrl = URL.createObjectURL(image);
  const imageView = document.createElement('img'); imageView.alt = 'Selected image preview'; imageView.src = previewUrl;
  preview.append(imageView);
  await new Promise<void>((resolve) => { imageView.onload = () => resolve(); imageView.onerror = () => resolve(); });
  const widthField = toolForm.elements.namedItem('width') as HTMLInputElement | null;
  const heightField = toolForm.elements.namedItem('height') as HTMLInputElement | null;
  if (widthField && heightField) { widthField.value = String(imageView.naturalWidth); heightField.value = String(imageView.naturalHeight); }
  if (activeTool?.name === 'Crop Photo') {
    const { default: CropperConstructor } = await import('cropperjs');
    if (!dialog.open || activeTool?.name !== 'Crop Photo') return;
    cropper = new CropperConstructor(imageView, { viewMode: 1, autoCropArea: 0.82, responsive: true, ready: () => { toolForm.dataset.crop = JSON.stringify(cropper!.getData(true)); } });
    imageView.addEventListener('cropend', () => { if (cropper) toolForm.dataset.crop = JSON.stringify(cropper.getData(true)); });
  }
}

function releasePreview(): void {
  cropper?.destroy(); cropper = undefined;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

toolForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeTool) return;
  const files = (toolForm.elements.namedItem('sourceFiles') as HTMLInputElement).files;
  const signature = (toolForm.elements.namedItem('signatureFile') as HTMLInputElement | null)?.files;
  const roots = (toolForm.elements.namedItem('trustRoots') as HTMLInputElement | null)?.files;
  const extra = signature ? [...signature] : roots ? [...roots] : [];
  submit.disabled = true; submit.textContent = 'Working…'; status.textContent = 'Preparing local processing…';
  try {
    const outputs: EngineOutput[] = await runEngine({
      tool: activeTool.name,
      files: files ? [...files] : [],
      extraFiles: extra,
      form: toolForm,
      report: (message) => { status.textContent = message; },
    });
    downloadOutputs(outputs);
    status.textContent = outputs.length === 1
      ? `Done. Downloaded ${outputs[0].name}.${outputs[0].message ? ` ${outputs[0].message}` : ''}`
      : `Done. Prepared ${outputs.length} files.`;
    submit.disabled = false; submit.textContent = 'Run again';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Processing failed. Please check the file and try again.';
    submit.disabled = false; submit.textContent = 'Try again';
  }
});

function inlineIcon(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}-${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_match, ids: string) =>
      `aria-labelledby="${ids.split(/\s+/).map((id) => `${prefix}-${id}`).join(' ')}"`);
}

document.querySelector<HTMLButtonElement>('#dialogClose')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', releasePreview);
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
renderTools();
