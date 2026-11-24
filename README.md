# ProjectPDF

ProjectPDF is a browser-based toolkit for working with PDF documents and images. Its defining requirement is that user files are processed locally in the user's browser. File contents must not be uploaded to a server for processing.

The visible product brand is **Paperplane**. ProjectPDF is the repository/project name.

## Architecture

| Area | Technology | Responsibility |
| --- | --- | --- |
| Browser interface | TypeScript, Vite | Tool catalog, search, filters, accessible UI state, and orchestration |
| Processing core | Rust compiled to WebAssembly | Input validation and file transformations as they are implemented |
| Hosting | Static hosting | Serves the built application and Wasm assets; no processing server |

TypeScript must not implement file transformations. It should pass selected bytes and options through a small Wasm adapter, receive result bytes or structured errors, and initiate downloads. Do not add upload APIs, remote conversion services, or telemetry containing file data.

## Current implementation status

- The Paperplane landing page advertises the 17 tools listed below.
- The UI is now TypeScript and configured for Vite.
- A minimal Rust/Wasm crate is scaffolded. It currently reports every tool as `planned` and does not accept or process file bytes.
- Tool selection reports that processing is unavailable. The current UI does not read, transform, upload, or download user files.
- No image/PDF transformation dependency has been selected. Do not infer support, formats, options, limits, or signature guarantees from a tool's name.

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

These names describe the visible catalog. They do not establish that the tools work or that particular formats or guarantees are supported. Update this status and document verified capabilities as actual Rust implementations are added.

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

### Processing engine direction (proposed, not implemented)

These were the engines discussed for the 17 tools. They are a planning map, not confirmed dependencies or working capabilities. Check browser/Wasm compatibility, maintenance, output quality, and each license before adopting them.

| Tool(s) | Engine direction discussed |
| --- | --- |
| Reduce Photo File Size; Convert Photo to JPG | MozJPEG; target-size search for compression. Optional HEIC support would need a compatible decoder. |
| Reduce PDF File Size | A separate Ghostscript/Wasm compression component for stronger quality/size control. Keep its source and license obligations isolated from the rest of the website. A qpdf-wasm lossless cleanup pass was also discussed as an optional distinct pass; it is not a substitute for image recompression. |
| Reduce Signature File Size | OxiPNG for lossless PNG output, or MozJPEG when using a white background. |
| Change Signature Width & Height; Change Photo Width & Height | Pica for image resizing. |
| Make PDF from Photos; Merge PDF Files; Split PDF; Delete PDF Pages; Sign PDF placement; Put Many Pages on One Page | pdf-lib was discussed for PDF creation and page operations. |
| Crop Photo | Cropper.js for crop interaction, with output rendered at the source pixel resolution. |
| Make Passport Size Photo; Add Name & Date on Photo | Canvas for sheet layout and text rendering; Pica for image resizing. Use appropriately licensed fonts. |
| Convert PDF to JPG | PDF.js for page rendering, then MozJPEG or OxiPNG for image output. |
| Verify PDF Signature | Parse signature fields and byte ranges, then use PKI.js/asn1js for cryptographic validation. Merely reading a signature field is not verification. |

**PDF compression is intentionally a separate component.** If the Ghostscript/Wasm portion is open-sourced, publish and comply with the license for that component. Keeping the rest of the website in a separate repository/component does not by itself remove obligations triggered by how the Ghostscript component is distributed or linked. Confirm the applicable Ghostscript license and distribution model before release; do not copy or modify its code to evade licensing.

Do not present the planned engine choices as settled technical facts in the product UI. The user should see the result and controls (for example, target size, quality, dimensions, or page selection), while implementation details remain documented here for maintainers.

### Deployment and capacity questions

- The user has explored local processing versus server-side processing and whether individual tools could move to a server later. Any future server-side processing would need a deliberate privacy, retention, and operational-cost decision; the current product requirement remains local-only processing.
- Earlier Cloud Run capacity and free-tier estimates were discussion topics, not established capacity guarantees. Do not promise a user count without workload benchmarks and current provider limits.

## Development setup

Requirements:

- Node.js 20.19+ or 22.12+ and npm, as required by the selected Vite 8 line.
- Rust via rustup, the `wasm32-unknown-unknown` target, and `wasm-pack`.

Install the browser toolchain dependencies and start the app:

```sh
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm run dev
```

The `predev` script builds the Rust crate for the browser before starting Vite. The generated bindings and Wasm binary are written to `rust/core/pkg/` and are ignored by Git.

The `build:wasm` script checks for `wasm-pack`, installs the Rust toolchain and Wasm target on Linux if they are missing, and then builds the Rust crate in the same process. A fresh Linux build requires `curl` and network access to Rust's official installer and crates.io. On other platforms, install Rust, the Wasm target, and `wasm-pack` using the commands above first. `npm run build` runs this step before type-checking and building the static site.

Create a static production build with:

```sh
npm run build
```

This builds Wasm, runs the TypeScript type checker, then writes the static site to `dist/`. `npm run preview` serves that built site locally. No test command is configured yet.

Cloudflare Workers deploys the built static files from `dist/` using `wrangler.jsonc`; the Wrangler CLI is installed as a project development dependency. The Pages/Workers build must run `npm run build` before `npx wrangler deploy`.

## Dependencies selected

- [Vite](https://vite.dev/guide/) provides the TypeScript-aware static-site development and build pipeline. Vite transpiles TypeScript; the configured `tsc --noEmit` command performs type checking.
- [TypeScript](https://www.typescriptlang.org/docs/) provides static types for the browser interface.
- [wasm-bindgen](https://rustwasm.github.io/docs/wasm-bindgen/) exposes the narrow Rust API to browser JavaScript; [wasm-pack](https://rustwasm.github.io/docs/wasm-pack/) packages the browser-target bindings.

No PDF or image transformation library is currently selected. Verify target compatibility, format support, maintenance, and operation coverage before adding one.

## Implementation principles

1. Process files on-device in browser memory. Never send file bytes to a server or third party.
2. Keep transformations in Rust; keep presentation and orchestration in TypeScript.
3. Wait for an explicit user action before reading and processing selected files.
4. Report unsupported, invalid, malformed, encrypted, or oversized inputs clearly where detectable.
5. Document capabilities only when supported by the implementation and verified dependencies.
6. Release object URLs and temporary buffers when no longer needed, avoid unnecessary copies, and report progress for operations that take noticeable time when practical.
7. Preserve keyboard operation, visible focus, semantic controls, understandable labels, and responsive layouts.

Before claiming that a tool is implemented, local, secure, private, or validated, verify that the code and available checks support that claim. Planned behavior is not evidence of working behavior.
