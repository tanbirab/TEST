import { getToolAvailability, initializeCore } from './wasm-adapter';
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
type Tool = { name: string; category: Category; icon: string; tone: string; tag: string };

const tools: Tool[] = [
  { name: 'Reduce Photo File Size', category: 'Images', icon: icon01, tone: 'green', tag: 'Popular' },
  { name: 'Reduce PDF File Size', category: 'PDFs', icon: icon02, tone: 'peach', tag: 'Popular' },
  { name: 'Reduce Signature File Size', category: 'Signatures', icon: icon03, tone: 'lilac', tag: '' },
  { name: 'Change Signature Width & Height', category: 'Signatures', icon: icon04, tone: 'blue', tag: '' },
  { name: 'Change Photo Width & Height', category: 'Images', icon: icon05, tone: 'green', tag: '' },
  { name: 'Make PDF from Photos', category: 'Images', icon: icon06, tone: 'yellow', tag: 'Popular' },
  { name: 'Convert Photo to JPG', category: 'Images', icon: icon07, tone: 'peach', tag: '' },
  { name: 'Merge PDF Files', category: 'PDFs', icon: icon08, tone: 'lilac', tag: 'Popular' },
  { name: 'Crop Photo', category: 'Images', icon: icon09, tone: 'blue', tag: '' },
  { name: 'Make Passport Size Photo', category: 'Images', icon: icon10, tone: 'rose', tag: '' },
  { name: 'Add Name & Date on Photo', category: 'Images', icon: icon11, tone: 'yellow', tag: '' },
  { name: 'Split PDF', category: 'PDFs', icon: icon12, tone: 'green', tag: '' },
  { name: 'Convert PDF to JPG', category: 'PDFs', icon: icon13, tone: 'peach', tag: '' },
  { name: 'Delete PDF Pages', category: 'PDFs', icon: icon14, tone: 'rose', tag: '' },
  { name: 'Sign PDF', category: 'Signatures', icon: icon15, tone: 'lilac', tag: '' },
  { name: 'Put Many Pages on One Page', category: 'PDFs', icon: icon16, tone: 'blue', tag: '' },
  { name: 'Verify PDF Signature', category: 'Signatures', icon: icon17, tone: 'green', tag: '' },
];

const grid = document.querySelector<HTMLDivElement>('#toolGrid')!;
const count = document.querySelector<HTMLElement>('#toolCount')!;
const search = document.querySelector<HTMLInputElement>('#toolSearch')!;
const empty = document.querySelector<HTMLDivElement>('#emptyState')!;
const dialog = document.querySelector<HTMLDialogElement>('#toolDialog')!;
const dialogTitle = document.querySelector<HTMLElement>('#dialogTitle')!;
const dialogIcon = document.querySelector<HTMLElement>('#dialogIcon')!;
const dialogDescription = document.querySelector<HTMLElement>('#dialogDescription')!;
let activeFilter = 'All';

function renderTools(): void {
  const query = search.value.trim().toLowerCase();
  const visible = tools.filter((tool) =>
    (activeFilter === 'All' || tool.category === activeFilter) && tool.name.toLowerCase().includes(query),
  );
  count.textContent = String(visible.length);
  grid.innerHTML = visible.map((tool) => {
    const index = tools.indexOf(tool);
    return `<button class="tool-card" type="button" aria-label="View status for ${tool.name}" data-index="${index}">
      <span class="card-top"><span class="tool-illustration" aria-hidden="true">${inlineIcon(tool.icon, `card-${index}`)}</span><span class="tool-tag">${tool.tag}</span></span>
      <span class="tool-name">${tool.name}</span><span class="card-arrow" aria-hidden="true">↗</span>
    </button>`;
  }).join('');
  empty.hidden = visible.length !== 0;
  grid.hidden = visible.length === 0;
  grid.querySelectorAll<HTMLButtonElement>('.tool-card').forEach((card) => {
    card.addEventListener('click', () => void openTool(tools[Number(card.dataset.index)]));
  });
}

async function openTool(tool: Tool): Promise<void> {
  dialogTitle.textContent = tool.name;
  dialogIcon.innerHTML = inlineIcon(tool.icon, 'dialog');
  dialogDescription.textContent = 'Checking whether this tool is available…';
  dialog.showModal();
  try {
    const availability = await getToolAvailability(tool.name);
    dialogDescription.textContent = availability === 'available'
      ? 'This tool is ready. File processing can begin after you choose a file and an action.'
      : 'This tool is planned but file processing is not available yet.';
  } catch {
    dialogDescription.textContent = 'The local processing module could not be loaded. No file has been read or uploaded.';
  }
}

function inlineIcon(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}-${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_match, ids: string) =>
      `aria-labelledby="${ids.split(/\s+/).map((id) => `${prefix}-${id}`).join(' ')}"`);
}

document.querySelectorAll<HTMLButtonElement>('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.filter.active')?.classList.remove('active');
    button.classList.add('active');
    activeFilter = button.dataset.filter ?? 'All';
    renderTools();
  });
});
search.addEventListener('input', renderTools);
document.querySelector<HTMLButtonElement>('#clearSearch')!.addEventListener('click', () => {
  search.value = '';
  activeFilter = 'All';
  document.querySelector('.filter.active')?.classList.remove('active');
  document.querySelector<HTMLButtonElement>('[data-filter="All"]')!.classList.add('active');
  renderTools();
});
document.querySelector<HTMLButtonElement>('#dialogClose')!.addEventListener('click', () => dialog.close());
if (!('closedBy' in HTMLDialogElement.prototype)) {
  let pressedOutside = false;
  const isOutsideDialog = (event: PointerEvent): boolean => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => { pressedOutside = isOutsideDialog(event); });
  dialog.addEventListener('pointerup', (event) => {
    if (pressedOutside && isOutsideDialog(event) && dialog.open) dialog.close();
    pressedOutside = false;
  });
  dialog.addEventListener('pointercancel', () => { pressedOutside = false; });
}
document.querySelector<HTMLButtonElement>('#dialogSubmit')!.addEventListener('click', () => dialog.close());
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '') && !dialog.open) {
    event.preventDefault();
    search.focus();
  }
});
document.querySelector<HTMLButtonElement>('#menuButton')!.addEventListener('click', () => {
  document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' });
});

renderTools();
void initializeCore().catch(() => {
  // Tool selection will explain that the local module is unavailable.
});
