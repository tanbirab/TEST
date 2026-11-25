# ProjectPDF

ProjectPDF is a browser-based toolkit for working with PDF documents and images. Its defining requirement is that user files are processed locally in the user's browser. File contents must not be uploaded to a server for processing.

The visible product brand is **Paperplane**. ProjectPDF is the repository/project name.

## Architecture

| Area | Technology | Responsibility |
| --- | --- | --- |
| Browser interface | TypeScript, Vite | Tool catalog, accessible file workflows, local orchestration, and downloads |
| Image and PDF processing | Rust compiled to WebAssembly | Decoding, encoding, resizing, cropping, PDF edits, rendering, compression, and signature verification |
| Browser transfer | TypeScript Web Worker adapter | Transfers file bytes and form options to the Rust/WASM core and returns result bytes to the UI |
| UI-only image controls | Cropper.js | Selects the crop rectangle; Rust applies it to the image |
| Hosting | Static hosting | Serves the app and engine assets; no processing server |

Selected files are processed in a Web Worker by the Rust core compiled to WebAssembly. TypeScript handles the interface, form and byte transfer, preview display, and downloads; it does not transform file contents. Files are not sent to a processing server. Do not add upload APIs, remote conversion services, or telemetry containing file data.

## Current implementation status

- All 16 catalog tools have local processing workflows. Engine capability and format limitations are listed below.
- The interface and Web Worker adapter use TypeScript and Vite. File transformations run in `rust/core` compiled for `wasm32-unknown-unknown`.
- File inputs are limited to 100 MB per file. Image operations limit decoded images to 40 megapixels; PDF page rendering is also capped to keep memory use bounded. Password-protected PDFs are not supported.
- PDF edits and compression refuse files containing signature byte ranges, because rewriting can invalidate existing digital signatures.

### Advertised tools

1. Compress Image
2. Reduce PDF File Size
3. Change Signature Width & Height
4. Change Photo Width & Height
5. Make PDF from Photos
6. Convert Photo to JPG
7. Merge PDF Files
8. Crop Photo
9. Make Passport Size Photo
10. Add Name & Date on Photo
11. Split PDF
12. Convert PDF to JPG
13. Delete PDF Pages
14. Sign PDF
15. Put Many Pages on One Page
16. Verify PDF Signature

The labels describe implemented outputs; visual PDF signing places an image and is not a cryptographic digital signature. Signature verification checks CMS integrity and a certificate chain against roots supplied by the user; it does not check revocation or timestamp authorities. Passport output uses the user-selected millimetre dimensions (35 × 45 mm by default) at 300 DPI, not a country-specific standard preset.

## Product decisions and working context

### Product and visual direction

- The user-facing brand is **Paperplane**; the project/repository is **ProjectPDF**.
- Keep the 16 tools visible immediately on the landing page. Do not add a large hero section above the tool catalog.
- Use the brand colors red `#D14836`, gold `#ECD06F`, and white, with a light blue tint and soft warm light in the background.
- The grid and warm/cool gradient should be one continuous page background behind the header, tool catalog, and lower sections. Do not give the header or catalog a separate opaque background block. Keep cards and controls readable against it.

### Processing and privacy direction

- The preferred product direction is local, browser-side processing so user files are not uploaded to a processing server. Do not claim this is implemented until each operation actually runs locally.
- The user wants implementation details and exam presets to remain proprietary. Keep rule data out of static frontend bundles; however, anything delivered to a browser (JavaScript, WebAssembly, worker code, or decrypted data) can ultimately be inspected. Obfuscation, domain checks, signed URLs, Turnstile, and rate limits may deter casual copying or scraping, but cannot make downloaded client-side processing code absolutely secret.
- Do not store uploaded file contents or decrypted presets in persistent browser storage or global application state. If remote preset delivery is added, return only the requested record and protect the endpoint with appropriate authentication/rate controls. Treat encryption in the browser as a deterrent to casual inspection, not a way to hide data from the browser user.

### Processing engines and current limits

These engines are installed and used by the corresponding workflows. Their output still depends on browser codecs and input files; none of the tools uploads user files.

| Tool(s) | Engine and behavior |
| --- | --- |
| Compress Image; Convert Photo to JPG | Rust `image` decodes browser-supported JPEG, PNG, GIF, and WebP inputs. The Rust core encodes JPG/JPEG and PNG, resizes, and attempts the requested target size. HEIC/HEIF is not included. |
| Reduce PDF File Size | Rust `lopdf` recompresses PDF streams and prunes unused objects. This is lossless structural compression; it does not resample embedded images, and some files will not shrink. Files with digital signatures are rejected. |
| Change Signature Width & Height; Change Photo Width & Height | Rust `image` resizes to the requested pixel dimensions and outputs PNG. |
| Make PDF from Photos; Merge PDF Files; Split PDF; Delete PDF Pages; Sign PDF placement | Rust `lopdf` creates and edits pages and embeds signature images. Split exports selected pages in a ZIP. “Sign PDF” places an image and does not create a cryptographic PDF signature. |
| Put Many Pages on One Page | Rust Hayro renders selected pages at 144 DPI; Rust `lopdf` arranges those images on the output sheets. The output pages are rasterized. |
| Crop Photo | Cropper.js selects the area; Rust applies the crop and encodes the result. |
| Make Passport Size Photo; Add Name & Date on Photo | Rust renders user-selected millimetre dimensions (default 35 × 45 at 300 DPI) and user-entered text. Country-specific presets are not bundled. |
| Convert PDF to JPG | Rust Hayro renders chosen pages; Rust encodes JPG files in a ZIP. |
| Verify PDF Signature | Rust `underskrift` verifies CMS integrity and certificate chains against trust roots supplied by the user. Online revocation checking is disabled. |

PDFs protected with passwords are not supported. Hayro does not implement every PDF feature; a page that cannot be rendered returns an error. Editing/compression is refused when a `/ByteRange` signature is detected to avoid silently invalidating a digital signature. A file-size target is best-effort and can be impossible for some images. Per-file input limit: 100 MB.

Keep engine details documented for maintainers; the product UI presents user-facing controls such as target size, quality, dimensions, or page selection.

### Deployment and capacity questions

- The user has explored local processing versus server-side processing and whether individual tools could move to a server later. Any future server-side processing would need a deliberate privacy, retention, and operational-cost decision; the current product requirement remains local-only processing.
- Earlier Cloud Run capacity and free-tier estimates were discussion topics, not established capacity guarantees. Do not promise a user count without workload benchmarks and current provider limits.

## Development setup

Requirements:

- Node.js 20.19+ or 22.12+ and pnpm, as required by the selected Vite 8 line.
- Rust stable, the `wasm32-unknown-unknown` target, `wasm-pack`, and the platform's native linker/build tools (Visual C++ Build Tools on Windows).

Install the browser toolchain dependencies and start the app:

```sh
pnpm install
pnpm dev
```

The dev and build hooks compile `rust/core` with `wasm-pack`, generate the third-party notices page, and bundle the local WebAssembly module and worker with Vite. `scripts/build-wasm.mjs` adds the wasm target when rustup is available. The generated Rust bindings in `rust/core/pkg` are build artifacts and are not checked into source control.

Create a static production build with:

```sh
pnpm build
```

This compiles the Rust core to WebAssembly, runs the TypeScript type checker, and writes the static site, worker, WebAssembly module, and license notices to `dist/`. `pnpm preview` serves that build locally. No test command is configured yet.

Cloudflare Workers deploys the built static files from `dist/` using `wrangler.jsonc`; the Wrangler CLI is installed as a project development dependency. The build must run `pnpm build` before `pnpm exec wrangler deploy`.

## Dependencies selected

- [Vite](https://vite.dev/guide/) provides the TypeScript-aware static-site development and build pipeline. Vite transpiles TypeScript; the configured `tsc --noEmit` command performs type checking.
- [TypeScript](https://www.typescriptlang.org/docs/) provides static types for the browser interface.
- [Rust](https://www.rust-lang.org/) and [wasm-pack](https://rustwasm.github.io/wasm-pack/) build the browser processing core.
- [`image`](https://docs.rs/image/) decodes, transforms, and encodes images; [`lopdf`](https://docs.rs/lopdf/) edits PDFs; [Hayro](https://docs.rs/hayro/) renders PDF pages; [`underskrift`](https://docs.rs/underskrift/) verifies PDF signatures.
- [Cropper.js](https://github.com/fengyuanchen/cropperjs) provides the crop-selection UI. Rust packages multi-page outputs into ZIP files before TypeScript starts the download.

## Implementation principles

1. Process files on-device in browser memory. Never send file bytes to a server or third party.
2. Run file transformations in the Rust core compiled to WebAssembly. Keep TypeScript limited to the browser UI, input validation, worker messaging, and downloads.
3. Wait for an explicit user action before reading and processing selected files.
4. Report unsupported, invalid, malformed, encrypted, or oversized inputs clearly where detectable.
5. Document capabilities only when supported by the implementation and verified dependencies.
6. Release object URLs and temporary buffers when no longer needed, avoid unnecessary copies, and report progress for operations that take noticeable time when practical.
7. Preserve keyboard operation, visible focus, semantic controls, understandable labels, and responsive layouts.

Before claiming that a tool is implemented, local, secure, private, or validated, verify that the code and available checks support that claim. Planned behavior is not evidence of working behavior.
