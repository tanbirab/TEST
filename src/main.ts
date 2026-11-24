import { getToolAvailability, initializeCore } from './wasm-adapter';

type Category = 'Images' | 'PDFs' | 'Signatures';
type Tool = { name: string; category: Category; icon: string; tone: string; tag: string };

const tools: Tool[] = [
  { name: 'Reduce Photo File Size', category: 'Images', icon: '/icons/01-reduce-photo-file-size.svg', tone: 'green', tag: 'Popular' },
  { name: 'Reduce PDF File Size', category: 'PDFs', icon: '/icons/02-reduce-pdf-file-size.svg', tone: 'peach', tag: 'Popular' },
  { name: 'Reduce Signature File Size', category: 'Signatures', icon: '/icons/03-reduce-signature-file-size.svg', tone: 'lilac', tag: '' },
  { name: 'Change Signature Width & Height', category: 'Signatures', icon: '/icons/04-change-signature-width-height.svg', tone: 'blue', tag: '' },
  { name: 'Change Photo Width & Height', category: 'Images', icon: '/icons/05-change-photo-width-height.svg', tone: 'green', tag: '' },
  { name: 'Make PDF from Photos', category: 'Images', icon: '/icons/06-make-pdf-from-photos.svg', tone: 'yellow', tag: 'Popular' },
  { name: 'Convert Photo to JPG', category: 'Images', icon: '/icons/07-convert-photo-to-jpg.svg', tone: 'peach', tag: '' },
  { name: 'Merge PDF Files', category: 'PDFs', icon: '/icons/08-merge-pdf-files.svg', tone: 'lilac', tag: 'Popular' },
  { name: 'Crop Photo', category: 'Images', icon: '/icons/09-crop-photo.svg', tone: 'blue', tag: '' },
  { name: 'Make Passport Size Photo', category: 'Images', icon: '/icons/10-make-passport-size-photo.svg', tone: 'rose', tag: '' },
  { name: 'Add Name & Date on Photo', category: 'Images', icon: '/icons/11-add-name-and-date-on-photo.svg', tone: 'yellow', tag: '' },
  { name: 'Split PDF', category: 'PDFs', icon: '/icons/12-split-pdf.svg', tone: 'green', tag: '' },
  { name: 'Convert PDF to JPG', category: 'PDFs', icon: '/icons/13-convert-pdf-to-jpg.svg', tone: 'peach', tag: '' },
  { name: 'Delete PDF Pages', category: 'PDFs', icon: '/icons/14-delete-pdf-pages.svg', tone: 'rose', tag: '' },
  { name: 'Sign PDF', category: 'Signatures', icon: '/icons/15-sign-pdf.svg', tone: 'lilac', tag: '' },
  { name: 'Put Many Pages on One Page', category: 'PDFs', icon: '/icons/16-put-many-pages-on-one-page.svg', tone: 'blue', tag: '' },
  { name: 'Verify PDF Signature', category: 'Signatures', icon: '/icons/17-verify-pdf-signature.svg', tone: 'green', tag: '' },
];

const grid = document.querySelector<HTMLDivElement>('#toolGrid')!;
const count = document.querySelector<HTMLElement>('#toolCount')!;
const search = document.querySelector<HTMLInputElement>('#toolSearch')!;
const empty = document.querySelector<HTMLDivElement>('#emptyState')!;
const dialog = document.querySelector<HTMLDialogElement>('#toolDialog')!;
const dialogTitle = document.querySelector<HTMLElement>('#dialogTitle')!;
const dialogIcon = document.querySelector<HTMLImageElement>('#dialogIcon')!;
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
      <span class="card-top"><img class="tool-illustration" src="${tool.icon}" alt="" width="56" height="56" loading="lazy" /><span class="tool-tag">${tool.tag}</span></span>
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
  dialogIcon.src = tool.icon;
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
