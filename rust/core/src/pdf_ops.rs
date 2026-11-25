use crate::image_ops::ImageOutput;
use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::vello_cpu::color::palette::css::WHITE;
use hayro::{render, PixmapSettings, RenderCache, RenderSettings};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder, ImageFormat};
use lopdf::{dictionary, Document, Object, Stream};
use serde::Deserialize;
use std::io::{Cursor, Write};
use wasm_bindgen::JsValue;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOptions {
    pages: Option<String>,
    columns: Option<u32>,
    rows: Option<u32>,
    page: Option<u32>,
    signature_width: Option<f32>,
    signature_height: Option<f32>,
    x: Option<f32>,
    y: Option<f32>,
    quality: Option<u8>,
}

pub fn process(
    tool: &str,
    files: Vec<(String, Vec<u8>)>,
    options: PdfOptions,
) -> Result<Vec<ImageOutput>, JsValue> {
    if files.is_empty() {
        return Err(JsValue::from_str("Choose a file to continue."));
    }
    match tool {
        "Make PDF from Photos" => make_pdf_from_photos(files),
        "Merge PDF Files" => merge_pdfs(files),
        "Convert PDF to JPG" => pdf_to_jpg(files.into_iter().next().unwrap(), options),
        "Verify PDF Signature" => verify_signature(files),
        "Sign PDF" => sign_pdf(files, options),
        "Reduce PDF File Size"
        | "Split PDF"
        | "Delete PDF Pages"
        | "Put Many Pages on One Page" => {
            let (name, bytes) = files.into_iter().next().unwrap();
            edit_pdf(tool, name, bytes, options)
        }
        _ => Err(JsValue::from_str(
            "The selected operation is not a PDF transformation.",
        )),
    }
}

fn edit_pdf(
    tool: &str,
    filename: String,
    bytes: Vec<u8>,
    options: PdfOptions,
) -> Result<Vec<ImageOutput>, JsValue> {
    let mut document = Document::load_mem(&bytes)
        .map_err(|error| JsValue::from_str(&format!("Could not read this PDF: {error}")))?;
    if tool == "Reduce PDF File Size" {
        ensure_unsigned(&bytes)?;
        document.compress();
        document.prune_objects();
        let mut output = Vec::new();
        document.save_modern(&mut output).map_err(pdf_error)?;
        let mut result = ImageOutput::new(
            format!("{}-compressed.pdf", stem(&filename)),
            "application/pdf",
            output,
        );
        if result.bytes.len() >= bytes.len() {
            result.message = Some(
                "This PDF could not be made smaller with lossless structural compression.".into(),
            );
        }
        return Ok(vec![result]);
    }
    ensure_unsigned(&bytes)?;
    let page_numbers = document.get_pages().keys().copied().collect::<Vec<_>>();
    if page_numbers.is_empty() {
        return Err(JsValue::from_str("This PDF has no readable pages."));
    }
    let selected = parse_page_selection(
        options
            .pages
            .as_deref()
            .unwrap_or(&format!("1-{}", page_numbers.len())),
        page_numbers.len(),
    )?;
    if tool == "Delete PDF Pages" {
        if selected.len() == page_numbers.len() {
            return Err(JsValue::from_str(
                "At least one page must remain in the PDF.",
            ));
        }
        let deleted = selected
            .iter()
            .map(|index| page_numbers[*index])
            .collect::<Vec<_>>();
        document.delete_pages(&deleted);
        document.prune_objects();
        return Ok(vec![save_pdf(
            document,
            format!("{}-pages-removed.pdf", stem(&filename)),
        )?]);
    }
    if tool == "Split PDF" {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        for index in selected {
            let keep = page_numbers[index];
            let remove = page_numbers
                .iter()
                .copied()
                .filter(|page| *page != keep)
                .collect::<Vec<_>>();
            let mut part = document.clone();
            part.delete_pages(&remove);
            part.prune_objects();
            let mut part_bytes = Vec::new();
            part.save_to(&mut part_bytes).map_err(pdf_error)?;
            archive
                .start_file(
                    format!("{}-page-{:03}.pdf", stem(&filename), index + 1),
                    SimpleFileOptions::default(),
                )
                .map_err(zip_error)?;
            archive.write_all(&part_bytes).map_err(zip_error)?;
        }
        let bytes = archive.finish().map_err(zip_error)?.into_inner();
        return Ok(vec![ImageOutput::new(
            format!("{}-split-pages.zip", stem(&filename)),
            "application/zip",
            bytes,
        )]);
    }
    if tool == "Put Many Pages on One Page" {
        return render_n_up(
            &bytes,
            &filename,
            &selected,
            options.columns.unwrap_or(2),
            options.rows.unwrap_or(2),
        );
    }
    Err(JsValue::from_str("This PDF operation is not available."))
}

fn make_pdf_from_photos(files: Vec<(String, Vec<u8>)>) -> Result<Vec<ImageOutput>, JsValue> {
    let mut pdf = Document::with_version("1.5");
    let pages_id = pdf.new_object_id();
    let mut page_ids = Vec::new();
    let first_name = files
        .first()
        .map(|item| stem(&item.0))
        .unwrap_or_else(|| "photos".into());
    for (_, bytes) in files {
        let (width, height) = read_image_dimensions(&bytes)?;
        if width == 0 || height == 0 || width as u64 * height as u64 > 40_000_000 {
            return Err(JsValue::from_str(
                "This image exceeds the 40-megapixel processing limit.",
            ));
        }
        let width = width as f32;
        let height = height as f32;
        let page_id = pdf.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => dictionary! {},
        });
        insert_image(&mut pdf, page_id, &bytes, (0.0, 0.0), (width, height))?;
        page_ids.push(page_id);
    }
    pdf.objects.insert(pages_id, Object::Dictionary(dictionary! {
        "Type" => "Pages", "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(), "Count" => page_ids.len() as i64,
    }));
    let catalog = pdf.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    pdf.trailer.set("Root", catalog);
    pdf.compress();
    let mut output = Vec::new();
    pdf.save_to(&mut output).map_err(pdf_error)?;
    Ok(vec![ImageOutput::new(
        format!("{first_name}-photos.pdf"),
        "application/pdf",
        output,
    )])
}

fn insert_image(
    document: &mut Document,
    page_id: (u32, u16),
    bytes: &[u8],
    position: (f32, f32),
    size: (f32, f32),
) -> Result<(), JsValue> {
    let (image_width, image_height) = read_image_dimensions(bytes)?;
    if image_width == 0
        || image_height == 0
        || image_width as u64 * image_height as u64 > 40_000_000
    {
        return Err(JsValue::from_str(
            "This image exceeds the 40-megapixel processing limit.",
        ));
    }
    let format = image::guess_format(bytes).map_err(pdf_error)?;
    let image = if format == ImageFormat::Jpeg {
        lopdf::xobject::image_from(bytes.to_vec()).map_err(pdf_error)?
    } else {
        let decoded = image::load_from_memory(bytes).map_err(pdf_error)?;
        image_with_alpha(document, decoded)?
    };
    document
        .insert_image(page_id, image, position, size)
        .map_err(pdf_error)
}

fn image_with_alpha(document: &mut Document, image: DynamicImage) -> Result<Stream, JsValue> {
    let rgba = image.to_rgba8();
    let (width, height) = (rgba.width(), rgba.height());
    let has_transparency = rgba.pixels().any(|pixel| pixel[3] != 255);
    let rgb = DynamicImage::ImageRgba8(rgba.clone()).to_rgb8();
    let mut rgb_png = Cursor::new(Vec::new());
    PngEncoder::new_with_quality(&mut rgb_png, CompressionType::Best, FilterType::Adaptive)
        .write_image(rgb.as_raw(), width, height, image::ExtendedColorType::Rgb8)
        .map_err(pdf_error)?;
    let mut color_xobject = lopdf::xobject::image_from(rgb_png.into_inner()).map_err(pdf_error)?;
    if has_transparency {
        let alpha = rgba.pixels().map(|pixel| pixel[3]).collect::<Vec<_>>();
        let mut alpha_png = Cursor::new(Vec::new());
        PngEncoder::new_with_quality(&mut alpha_png, CompressionType::Best, FilterType::Adaptive)
            .write_image(&alpha, width, height, image::ExtendedColorType::L8)
            .map_err(pdf_error)?;
        let alpha_xobject =
            lopdf::xobject::image_from(alpha_png.into_inner()).map_err(pdf_error)?;
        let alpha_id = document.add_object(alpha_xobject);
        color_xobject.dict.set("SMask", alpha_id);
    }
    Ok(color_xobject)
}

fn merge_pdfs(files: Vec<(String, Vec<u8>)>) -> Result<Vec<ImageOutput>, JsValue> {
    if files.len() == 1 {
        return Err(JsValue::from_str("Choose at least two PDF files to merge."));
    }
    let mut output = Document::with_version("1.5");
    let root_pages_id = output.new_object_id();
    let mut page_ids = Vec::new();
    let mut next_id = 2_u32;
    for (filename, bytes) in files {
        ensure_unsigned(&bytes)?;
        let mut source = Document::load_mem(&bytes)
            .map_err(|error| JsValue::from_str(&format!("Could not read {filename}: {error}")))?;
        let original_pages = source.get_pages();
        for page_id in original_pages.values().copied() {
            let mut page = source.get_dictionary(page_id).map_err(pdf_error)?.clone();
            for key in [b"MediaBox".as_slice(), b"CropBox", b"Resources", b"Rotate"] {
                if page.get(key).is_err() {
                    if let Some(value) =
                        inherited_page_attribute(&source, page_id, key).map_err(pdf_error)?
                    {
                        page.set(key, value);
                    }
                }
            }
            source.objects.insert(page_id, Object::Dictionary(page));
        }
        source.renumber_objects_with(next_id);
        next_id = source.max_id.saturating_add(1);
        for page_id in source.get_pages().into_values() {
            let mut page = source.get_dictionary(page_id).map_err(pdf_error)?.clone();
            page.set("Parent", root_pages_id);
            output.objects.insert(page_id, Object::Dictionary(page));
            page_ids.push(page_id);
        }
        for (object_id, object) in source.objects {
            match object.type_name().unwrap_or_default() {
                b"Catalog" | b"Pages" | b"Page" => {}
                _ => {
                    output.objects.insert(object_id, object);
                }
            }
        }
    }
    if page_ids.is_empty() {
        return Err(JsValue::from_str("The selected PDFs contain no pages."));
    }
    output.objects.insert(root_pages_id, Object::Dictionary(dictionary! {
        "Type" => "Pages", "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
        "Count" => page_ids.len() as u32,
    }));
    output.max_id = output.objects.keys().map(|id| id.0).max().unwrap_or(1);
    let catalog_id =
        output.add_object(dictionary! { "Type" => "Catalog", "Pages" => root_pages_id });
    output.trailer.set("Root", catalog_id);
    output.max_id = output.objects.keys().map(|id| id.0).max().unwrap_or(0);
    output.renumber_objects();
    output.compress();
    let mut bytes = Vec::new();
    output.save_to(&mut bytes).map_err(pdf_error)?;
    Ok(vec![ImageOutput::new(
        "merged.pdf".into(),
        "application/pdf",
        bytes,
    )])
}

fn inherited_page_attribute(
    document: &Document,
    page_id: (u32, u16),
    key: &[u8],
) -> lopdf::Result<Option<Object>> {
    let mut current = page_id;
    let mut visited = std::collections::HashSet::new();
    loop {
        if !visited.insert(current) {
            return Err(lopdf::Error::ReferenceCycle(current));
        }
        let dictionary = document.get_dictionary(current)?;
        if let Ok(value) = dictionary.get(key) {
            return Ok(Some(value.clone()));
        }
        match dictionary.get(b"Parent") {
            Ok(parent) => current = parent.as_reference()?,
            Err(_) => return Ok(None),
        }
    }
}

fn pdf_to_jpg(
    (filename, bytes): (String, Vec<u8>),
    options: PdfOptions,
) -> Result<Vec<ImageOutput>, JsValue> {
    let pdf = Pdf::new(bytes)
        .map_err(|error| JsValue::from_str(&format!("Could not read this PDF: {error:?}")))?;
    let selected = parse_page_selection(
        options
            .pages
            .as_deref()
            .unwrap_or(&format!("1-{}", pdf.pages().len())),
        pdf.pages().len(),
    )?;
    let cache = RenderCache::new();
    let interpreter = InterpreterSettings::default();
    let render_settings = RenderSettings::default();
    let pixmap = PixmapSettings {
        x_scale: 2.0,
        y_scale: 2.0,
        bg_color: WHITE,
    };
    let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
    for index in selected {
        let (width, height) = pdf.pages()[index].render_dimensions();
        if !width.is_finite()
            || !height.is_finite()
            || width <= 0.0
            || height <= 0.0
            || width * height * 4.0 > 40_000_000.0
            || width * 2.0 > 16_000.0
            || height * 2.0 > 16_000.0
        {
            return Err(JsValue::from_str(
                "A selected PDF page is too large to render safely.",
            ));
        }
        let rendered = render(
            &pdf.pages()[index],
            &cache,
            &interpreter,
            &render_settings,
            &pixmap,
        );
        let png = rendered
            .into_png()
            .map_err(|error| JsValue::from_str(&format!("PDF page rendering failed: {error}")))?;
        let image = image::load_from_memory(&png).map_err(|error| {
            JsValue::from_str(&format!("Could not encode rendered page: {error}"))
        })?;
        let rgb = image.to_rgb8();
        let mut jpg = Cursor::new(Vec::new());
        JpegEncoder::new_with_quality(&mut jpg, options.quality.unwrap_or(88).clamp(1, 100))
            .encode(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|error| JsValue::from_str(&format!("JPEG encoding failed: {error}")))?;
        archive
            .start_file(
                format!("{}-page-{:03}.jpg", stem(&filename), index + 1),
                SimpleFileOptions::default(),
            )
            .map_err(zip_error)?;
        archive.write_all(jpg.get_ref()).map_err(zip_error)?;
    }
    let archive = archive.finish().map_err(zip_error)?.into_inner();
    Ok(vec![ImageOutput::new(
        format!("{}-pages.zip", stem(&filename)),
        "application/zip",
        archive,
    )])
}

fn render_n_up(
    bytes: &[u8],
    filename: &str,
    selected: &[usize],
    columns: u32,
    rows: u32,
) -> Result<Vec<ImageOutput>, JsValue> {
    if columns == 0 || rows == 0 || columns > 6 || rows > 6 {
        return Err(JsValue::from_str(
            "Rows and columns must be between 1 and 6.",
        ));
    }
    let pdf = Pdf::new(bytes.to_vec())
        .map_err(|error| JsValue::from_str(&format!("Could not read this PDF: {error:?}")))?;
    let pages = pdf.pages();
    let dimensions = pages
        .iter()
        .map(|page| page.render_dimensions())
        .collect::<Vec<_>>();
    let cell_width = selected
        .iter()
        .map(|index| dimensions[*index].0)
        .fold(0.0_f32, f32::max);
    let cell_height = selected
        .iter()
        .map(|index| dimensions[*index].1)
        .fold(0.0_f32, f32::max);
    let sheet_width = cell_width * columns as f32;
    let sheet_height = cell_height * rows as f32;
    if !sheet_width.is_finite()
        || !sheet_height.is_finite()
        || sheet_width <= 0.0
        || sheet_height <= 0.0
    {
        return Err(JsValue::from_str(
            "The selected PDF has invalid page dimensions.",
        ));
    }
    if sheet_width * 2.0 > 16_000.0
        || sheet_height * 2.0 > 16_000.0
        || sheet_width * sheet_height * 4.0 > 40_000_000.0
    {
        return Err(JsValue::from_str("The combined sheet is too large to render safely. Choose smaller source pages or fewer rows and columns."));
    }
    let cache = RenderCache::new();
    let interpreter = InterpreterSettings::default();
    let render_settings = RenderSettings::default();
    let pixmap = PixmapSettings {
        x_scale: 2.0,
        y_scale: 2.0,
        bg_color: WHITE,
    };
    let per_sheet = (columns * rows) as usize;
    let sheet_count = selected.len().div_ceil(per_sheet);
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let mut page_ids = Vec::with_capacity(sheet_count);
    for sheet_index in 0..sheet_count {
        let page_id = document.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), sheet_width.into(), sheet_height.into()],
            "Resources" => dictionary! {},
        });
        let first_page = sheet_index * per_sheet;
        for (slot, index) in selected.iter().skip(first_page).take(per_sheet).enumerate() {
            let rendered = render(
                &pages[*index],
                &cache,
                &interpreter,
                &render_settings,
                &pixmap,
            );
            let image_bytes = rendered.into_png().map_err(|error| {
                JsValue::from_str(&format!("PDF page rendering failed: {error}"))
            })?;
            let (source_width, source_height) = dimensions[*index];
            let column = slot as u32 % columns;
            let row = slot as u32 / columns;
            let scale = (cell_width / source_width).min(cell_height / source_height);
            let width = source_width * scale;
            let height = source_height * scale;
            let x = column as f32 * cell_width + (cell_width - width) / 2.0;
            let y = sheet_height - (row + 1) as f32 * cell_height + (cell_height - height) / 2.0;
            let image = lopdf::xobject::image_from(image_bytes).map_err(pdf_error)?;
            document
                .insert_image(page_id, image, (x, y), (width, height))
                .map_err(pdf_error)?;
        }
        page_ids.push(page_id);
    }
    document.objects.insert(pages_id, Object::Dictionary(dictionary! {
        "Type" => "Pages", "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
        "Count" => page_ids.len() as u32,
    }));
    let catalog = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    document.trailer.set("Root", catalog);
    document.compress();
    let mut output = Vec::new();
    document.save_to(&mut output).map_err(pdf_error)?;
    let mut result = ImageOutput::new(
        format!("{}-multiple-pages-per-sheet.pdf", stem(filename)),
        "application/pdf",
        output,
    );
    result.message = Some("Pages are rendered at 144 DPI to arrange them on each sheet.".into());
    Ok(vec![result])
}

fn sign_pdf(
    mut files: Vec<(String, Vec<u8>)>,
    options: PdfOptions,
) -> Result<Vec<ImageOutput>, JsValue> {
    if files.len() != 2 {
        return Err(JsValue::from_str("Choose one PDF and one signature image."));
    }
    let (filename, bytes) = files.remove(0);
    let (_, signature_bytes) = files.remove(0);
    ensure_unsigned(&bytes)?;
    let mut document = Document::load_mem(&bytes)
        .map_err(|error| JsValue::from_str(&format!("Could not read this PDF: {error}")))?;
    let page_count = document.get_pages().len();
    let page_number = options.page.unwrap_or(1);
    if page_number == 0 || page_number as usize > page_count {
        return Err(JsValue::from_str(&format!(
            "Choose a page from 1 to {page_count}."
        )));
    }
    let page_id = *document
        .get_pages()
        .get(&page_number)
        .ok_or_else(|| JsValue::from_str("The selected PDF page could not be found."))?;
    let media_box = inherited_page_attribute(&document, page_id, b"MediaBox")
        .map_err(pdf_error)?
        .ok_or_else(|| JsValue::from_str("The selected PDF page has no MediaBox."))?;
    let box_values = media_box.as_array().map_err(pdf_error)?;
    if box_values.len() != 4 {
        return Err(JsValue::from_str(
            "The selected PDF page has an invalid MediaBox.",
        ));
    }
    let left = box_values[0].as_float().map_err(pdf_error)?;
    let bottom = box_values[1].as_float().map_err(pdf_error)?;
    let right = box_values[2].as_float().map_err(pdf_error)?;
    let top = box_values[3].as_float().map_err(pdf_error)?;
    let x = options.x.unwrap_or(36.0);
    let y = options.y.unwrap_or(36.0);
    let width = options.signature_width.unwrap_or(120.0);
    let height = options.signature_height.unwrap_or(48.0);
    if ![left, bottom, right, top, x, y, width, height]
        .iter()
        .all(|value| value.is_finite())
        || width <= 0.0
        || height <= 0.0
        || x < 0.0
        || y < 0.0
        || x + width > right - left
        || y + height > top - bottom
    {
        return Err(JsValue::from_str("The signature position and size must fit on the selected page. Coordinates are PDF points from the bottom-left corner."));
    }
    insert_image(
        &mut document,
        page_id,
        &signature_bytes,
        (left + x, bottom + y),
        (width, height),
    )?;
    Ok(vec![save_pdf(
        document,
        format!("{}-signed.pdf", stem(&filename)),
    )?])
}

fn verify_signature(mut files: Vec<(String, Vec<u8>)>) -> Result<Vec<ImageOutput>, JsValue> {
    if files.len() < 2 {
        return Err(JsValue::from_str(
            "Choose a PDF and at least one trusted root certificate (PEM or DER).",
        ));
    }
    if files.len() > 11
        || files
            .iter()
            .skip(1)
            .any(|(_, bytes)| bytes.len() > 5 * 1024 * 1024)
    {
        return Err(JsValue::from_str(
            "Choose up to 10 certificate files, each no larger than 5 MB.",
        ));
    }
    let (filename, bytes) = files.remove(0);
    let mut trust_store = underskrift::trust::TrustStore::new();
    for (name, certificate) in files {
        let is_pem = certificate
            .windows(b"-----BEGIN CERTIFICATE-----".len())
            .any(|window| window == b"-----BEGIN CERTIFICATE-----");
        let result = if is_pem {
            trust_store.add_pem_data(&certificate)
        } else {
            trust_store.add_der_certificate(&certificate)
        };
        result.map_err(|error| {
            JsValue::from_str(&format!(
                "Could not parse trusted certificate {name}: {error:?}"
            ))
        })?;
    }
    if trust_store.is_empty() {
        return Err(JsValue::from_str(
            "No usable trust certificates were found.",
        ));
    }
    let stores = underskrift::trust::TrustStoreSet::new().with_sig_store(trust_store);
    let verifier = underskrift::verify::SignatureVerifier::new(&stores).allow_online(false);
    let report = verifier.verify_pdf(&bytes).map_err(|error| {
        JsValue::from_str(&format!("PDF signature verification failed: {error:?}"))
    })?;
    let text = format!("{}\n\n{report:#?}\n\nOnline revocation and timestamp-authority checks are not performed.\n", report.summary);
    Ok(vec![ImageOutput::new(
        format!("{}-signature-report.txt", stem(&filename)),
        "text/plain",
        text.into_bytes(),
    )])
}

fn parse_page_selection(raw: &str, count: usize) -> Result<Vec<usize>, JsValue> {
    let mut selected = std::collections::BTreeSet::new();
    for piece in raw
        .split(',')
        .map(str::trim)
        .filter(|piece| !piece.is_empty())
    {
        let mut range = piece.split('-');
        let start: usize = range
            .next()
            .unwrap_or_default()
            .trim()
            .parse()
            .map_err(|_| JsValue::from_str("Use page numbers and ranges such as 1, 3-5."))?;
        let end: usize = range
            .next()
            .unwrap_or_else(|| piece.trim())
            .trim()
            .parse()
            .map_err(|_| JsValue::from_str("Use page numbers and ranges such as 1, 3-5."))?;
        if range.next().is_some() || start == 0 || end < start || end > count {
            return Err(JsValue::from_str(&format!(
                "Page selection must be between 1 and {count}."
            )));
        }
        for page in start..=end {
            selected.insert(page - 1);
        }
    }
    if selected.is_empty() {
        return Err(JsValue::from_str("Enter at least one page number."));
    }
    Ok(selected.into_iter().collect())
}

fn ensure_unsigned(bytes: &[u8]) -> Result<(), JsValue> {
    if String::from_utf8_lossy(bytes).contains("/ByteRange") {
        Err(JsValue::from_str(
            "This PDF contains a digital signature. Rewriting it could invalidate the signature.",
        ))
    } else {
        Ok(())
    }
}
fn save_pdf(mut document: Document, name: String) -> Result<ImageOutput, JsValue> {
    document.compress();
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).map_err(pdf_error)?;
    Ok(ImageOutput::new(name, "application/pdf", bytes))
}
fn stem(filename: &str) -> String {
    let name = filename
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(filename);
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(90)
        .collect();
    if safe.trim().is_empty() {
        "file".into()
    } else {
        safe
    }
}
fn pdf_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("PDF processing failed: {error}"))
}
fn read_image_dimensions(bytes: &[u8]) -> Result<(u32, u32), JsValue> {
    image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(pdf_error)?
        .into_dimensions()
        .map_err(pdf_error)
}
fn zip_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("Could not create ZIP output: {error}"))
}
