# ProjectPDF

ProjectPDF is a browser-based toolkit for working with PDF documents and images. Its defining requirement is that user files are processed locally in the user's browser. File contents must not be uploaded to a server for processing.

The visible product brand is **Paperplane**. ProjectPDF is the repository/project name.

## Architecture

| Area | Technology | Responsibility |
| --- | --- | --- |
| Browser interface | TypeScript, Vite | Tool catalog, accessible file workflows, local orchestration, and downloads |
| Image processing | MozJPEG, OxiPNG, Pica, Cropper.js, Canvas | Local image encoding, lossless PNG optimization, resizing, cropping, and compositing |
| PDF processing | pdf-lib, PDF.js, qpdf WebAssembly | Local page operations, PDF rendering, and structural compression |
| Signature checks | PKI.js, ASN.1.js, Web Crypto | Verify PDF CMS signature integrity and certificate chains against user-supplied roots |
| Hosting | Static hosting | Serves the app and engine assets; no processing server |

Selected files are processed in the browser and are not sent to a processing server. TypeScript coordinates the browser engines and downloads results; the JPEG, PNG, qpdf, and PDF.js codecs run in WebAssembly workers where available. Do not add upload APIs, remote conversion services, or telemetry containing file data.

## Current implementation status

- All 17 catalog tools have local processing workflows. Engine capability and format limitations are listed below.
- The interface is TypeScript and Vite. Heavy image codecs, PDF rendering, and qpdf load only when needed.
- File inputs are limited to 100 MB per file. Encrypted PDFs are not supported by pdf-lib operations.
- PDF edits and compression refuse files containing signature byte ranges, because rewriting can invalidate existing digital signatures.

### Advertised tools

1. Reduce Photo File Size
2. Reduce PDF File Size
3. Reduce Signature File Size
4. Change Signature Width & Height
5. Change Photo Width & Height
6. Make PDF from Photos
7. Convert Photo to JPG
8. Merge PDF Files
9. Crop Photo
10. Make Passport Size Photo
11. Add Name & Date on Photo
12. Split PDF
13. Convert PDF to JPG
14. Delete PDF Pages
15. Sign PDF
16. Put Many Pages on One Page
17. Verify PDF Signature

The labels describe implemented outputs; visual PDF signing places an image and is not a cryptographic digital signature. Signature verification checks CMS integrity and a certificate chain against roots supplied by the user; it does not check revocation or timestamp authorities. Passport output uses the user-selected millimetre dimensions (35 × 45 mm by default) at 300 DPI, not a country-specific standard preset.

## Product decisions and working context

### Product and visual direction

- The user-facing brand is **Paperplane**; the project/repository is **ProjectPDF**.
- Keep the 17 tools visible immediately on the landing page. Do not add a large hero section above the tool catalog.
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
| Reduce Photo File Size; Convert Photo to JPG | MozJPEG WebAssembly encoder. Compression searches quality levels to approach an optional target; only JPEG output is produced. Browser-decodable formats only; HEIC/HEIF is not included. |
| Reduce PDF File Size | qpdf WebAssembly recompresses Flate streams, generates object streams, and optimizes embedded images using a user-selected JPEG quality. The image pass is lossy and can reduce image detail; qpdf does not resample images. Files may not shrink when their content is already optimized. Ghostscript is not bundled. |
| Reduce Signature File Size | OxiPNG losslessly optimizes PNG and preserves transparency; other supported images are encoded as JPEG on white. |
| Change Signature Width & Height; Change Photo Width & Height | Pica resize to the requested pixel dimensions; output is PNG. |
| Make PDF from Photos; Merge PDF Files; Split PDF; Delete PDF Pages; Sign PDF placement; Put Many Pages on One Page | pdf-lib creates/edits pages and embeds signature images. Split exports selected pages in a ZIP. “Sign PDF” places an image and does not create a cryptographic PDF signature. |
| Crop Photo | Cropper.js selects the area; Canvas exports it at the selected source-pixel dimensions. |
| Make Passport Size Photo; Add Name & Date on Photo | Canvas and Pica render user-selected millimetre dimensions (default 35 × 45 at 300 DPI) and user-entered text. Country-specific presets are not bundled. |
| Convert PDF to JPG | PDF.js renders chosen pages; MozJPEG encodes them and a ZIP contains the results. |
| Verify PDF Signature | PKI.js/ASN.1.js verify CMS signatures and certificate chains against trust roots provided by the user. Revocation and timestamp authority checks are not performed. |

PDFs protected with passwords are not supported. Editing/compression is refused when a `/ByteRange` signature is detected to avoid silently invalidating a digital signature. A file-size target is best-effort and can be impossible for some images. Per-file input limit: 100 MB.

Ghostscript/Wasm remains excluded pending a separate distribution and license decision. qpdf provides local structural compression and image optimization, but does not resample images like a dedicated Ghostscript compression workflow could.

Keep engine details documented for maintainers; the product UI presents user-facing controls such as target size, quality, dimensions, or page selection.

### Deployment and capacity questions

- The user has explored local processing versus server-side processing and whether individual tools could move to a server later. Any future server-side processing would need a deliberate privacy, retention, and operational-cost decision; the current product requirement remains local-only processing.
- Earlier Cloud Run capacity and free-tier estimates were discussion topics, not established capacity guarantees. Do not promise a user count without workload benchmarks and current provider limits.

## Development setup

Requirements:

- Node.js 20.19+ or 22.12+ and a package manager, as required by the selected Vite 8 line.

Install the browser toolchain dependencies and start the app:

```sh
pnpm install
pnpm dev
```

The dev and build hooks generate the third-party notices page and bundle all processing engines locally with Vite. Rust/Wasm runtime setup is not required; the legacy crate under `rust/core` is not used by these workflows.

Create a static production build with:

```sh
pnpm build
```

This runs the TypeScript type checker and writes the static site, Wasm codecs, workers, and license notices to `dist/`. `pnpm preview` serves that build locally. No test command is configured yet.

Cloudflare Workers deploys the built static files from `dist/` using `wrangler.jsonc`; the Wrangler CLI is installed as a project development dependency. The build must run `pnpm build` before `pnpm exec wrangler deploy`.

## Dependencies selected

- [Vite](https://vite.dev/guide/) provides the TypeScript-aware static-site development and build pipeline. Vite transpiles TypeScript; the configured `tsc --noEmit` command performs type checking.
- [TypeScript](https://www.typescriptlang.org/docs/) provides static types for the browser interface.
- [MozJPEG and OxiPNG through jSquash](https://github.com/jamsinclair/jSquash) provide browser WebAssembly codecs.
- [Pica](https://github.com/nodeca/pica) resizes image canvases; [Cropper.js](https://github.com/fengyuanchen/cropperjs) provides crop selection.
- [pdf-lib](https://github.com/Hopding/pdf-lib) edits pages and embeds image content; [PDF.js](https://github.com/mozilla/pdf.js) renders pages to canvas.
- [qpdf WebAssembly](https://www.npmjs.com/package/@wasm-zoo/qpdf) performs structural and image optimization; its bundled license notices are shipped with the site.
- [PKI.js](https://pkijs.org/docs/examples/other/how-to-verify-a-signature-in-a-PDF-file/) and ASN.1.js parse and verify PDF CMS signatures against user-selected trust roots.

## Implementation principles

1. Process files on-device in browser memory. Never send file bytes to a server or third party.
2. Keep transformations local in the selected browser engines; use TypeScript for presentation, validation, and orchestration.
3. Wait for an explicit user action before reading and processing selected files.
4. Report unsupported, invalid, malformed, encrypted, or oversized inputs clearly where detectable.
5. Document capabilities only when supported by the implementation and verified dependencies.
6. Release object URLs and temporary buffers when no longer needed, avoid unnecessary copies, and report progress for operations that take noticeable time when practical.
7. Preserve keyboard operation, visible focus, semantic controls, understandable labels, and responsive layouts.

Before claiming that a tool is implemented, local, secure, private, or validated, verify that the code and available checks support that claim. Planned behavior is not evidence of working behavior.
