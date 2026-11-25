use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::imageops::FilterType as ResizeFilter;
use image::{DynamicImage, ImageEncoder, Rgba};
use serde::Deserialize;
use std::io::Cursor;
use wasm_bindgen::JsValue;

const MAX_IMAGE_PIXELS: u64 = 40_000_000;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageOptions {
    pub output_format: Option<String>,
    pub quality: Option<u8>,
    pub palette_colors: Option<usize>,
    pub target_kb: Option<u32>,
    pub scale_percent: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub width_mm: Option<f32>,
    pub height_mm: Option<f32>,
    pub dpi: Option<u32>,
    pub crop: Option<CropBounds>,
    pub photo_name: Option<String>,
    pub photo_date: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

pub struct ImageOutput {
    pub name: String,
    pub mime: String,
    pub bytes: Vec<u8>,
    pub quality: Option<u8>,
    pub palette_colors: Option<u16>,
    pub compression_level: Option<u8>,
    pub message: Option<String>,
}

impl ImageOutput {
    pub fn new(name: String, mime: &str, bytes: Vec<u8>) -> Self {
        Self {
            name,
            mime: mime.into(),
            bytes,
            quality: None,
            palette_colors: None,
            compression_level: None,
            message: None,
        }
    }
}

pub fn process(
    tool: &str,
    filename: &str,
    bytes: &[u8],
    options: &ImageOptions,
) -> Result<ImageOutput, JsValue> {
    let (width, height) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| JsValue::from_str(&format!("Could not read image format: {error}")))?
        .into_dimensions()
        .map_err(|error| JsValue::from_str(&format!("Could not read image dimensions: {error}")))?;
    check_size(width, height)?;
    let image = image::load_from_memory(bytes)
        .map_err(|error| JsValue::from_str(&format!("Could not decode this image: {error}")))?;
    let stem = safe_stem(filename);
    match tool {
        "Compress Image" | "Reduce Photo File Size" | "Reduce Signature File Size" => {
            compress(image, &stem, options)
        }
        "Convert Photo to JPG" => {
            let quality = options.quality.unwrap_or(90).clamp(1, 100);
            let mut output = ImageOutput::new(
                format!("{stem}.jpg"),
                "image/jpeg",
                encode_jpeg(image, quality)?,
            );
            output.quality = Some(quality);
            Ok(output)
        }
        "Change Photo Width & Height" | "Change Signature Width & Height" => {
            let width = positive(options.width, "width")?;
            let height = positive(options.height, "height")?;
            let resized = resize(image, width, height)?;
            Ok(ImageOutput::new(
                format!("{stem}-{width}x{height}.png"),
                "image/png",
                encode_png(resized, 4)?,
            ))
        }
        "Crop Photo" => {
            let bounds = options
                .crop
                .as_ref()
                .ok_or_else(|| JsValue::from_str("Choose the crop area in the preview first."))?;
            let x = bounds.x.round().max(0.0) as u32;
            let y = bounds.y.round().max(0.0) as u32;
            if x >= image.width()
                || y >= image.height()
                || !bounds.width.is_finite()
                || !bounds.height.is_finite()
                || bounds.width <= 0.0
                || bounds.height <= 0.0
            {
                return Err(JsValue::from_str("The crop area is invalid."));
            }
            let width = (bounds.width.round() as u32).max(1).min(image.width() - x);
            let height = (bounds.height.round() as u32)
                .max(1)
                .min(image.height() - y);
            let crop = image.crop_imm(x, y, width, height);
            Ok(ImageOutput::new(
                format!("{stem}-cropped.png"),
                "image/png",
                encode_png(crop, 4)?,
            ))
        }
        "Make Passport Size Photo" => {
            let width_mm = options.width_mm.unwrap_or(35.0);
            let height_mm = options.height_mm.unwrap_or(45.0);
            let dpi = options.dpi.unwrap_or(300).clamp(72, 1200);
            if !width_mm.is_finite()
                || !height_mm.is_finite()
                || width_mm <= 0.0
                || height_mm <= 0.0
            {
                return Err(JsValue::from_str(
                    "Print dimensions must be positive numbers.",
                ));
            }
            let width = (width_mm / 25.4 * dpi as f32).round() as u32;
            let height = (height_mm / 25.4 * dpi as f32).round() as u32;
            let resized = resize(image, width, height)?;
            Ok(ImageOutput::new(
                format!("{stem}-passport-{width_mm}x{height_mm}mm.jpg"),
                "image/jpeg",
                encode_jpeg(resized, 92)?,
            ))
        }
        "Add Name & Date on Photo" => {
            let caption = [
                options.photo_name.as_deref().unwrap_or_default(),
                options.photo_date.as_deref().unwrap_or_default(),
            ]
            .into_iter()
            .filter(|part| !part.trim().is_empty())
            .collect::<Vec<_>>()
            .join("  •  ");
            if caption.is_empty() {
                return Err(JsValue::from_str("Enter a name, a date, or both."));
            }
            let labeled = add_caption(image, &caption);
            Ok(ImageOutput::new(
                format!("{stem}-labeled.jpg"),
                "image/jpeg",
                encode_jpeg(labeled, 92)?,
            ))
        }
        _ => Err(JsValue::from_str(
            "The selected operation is not an image transformation.",
        )),
    }
}

fn compress(
    image: DynamicImage,
    stem: &str,
    options: &ImageOptions,
) -> Result<ImageOutput, JsValue> {
    let scale = options.scale_percent.unwrap_or(100).clamp(10, 100);
    let image = if scale < 100 {
        let width = image.width() * scale / 100;
        let height = image.height() * scale / 100;
        resize(image, width, height)?
    } else {
        image
    };
    let format = options
        .output_format
        .as_deref()
        .unwrap_or("jpg")
        .to_ascii_lowercase();
    let quality = options.quality.unwrap_or(72).clamp(15, 95);
    let target = options
        .target_kb
        .filter(|value| *value > 0)
        .map(|value| value as usize * 1024);
    if format == "png" {
        let mut colors = options.palette_colors.unwrap_or(256).clamp(8, 256);
        let level = png_effort(quality);
        let mut encoded = encode_png(quantize(&image, colors), level)?;
        if let Some(target) = target {
            while encoded.len() > target && colors > 8 {
                colors = colors.saturating_sub(16).max(8);
                encoded = encode_png(quantize(&image, colors), level)?;
            }
        }
        let mut output = ImageOutput::new(format!("{stem}-compressed.png"), "image/png", encoded);
        output.palette_colors = Some(colors as u16);
        output.compression_level = Some(level);
        if target.is_some_and(|target| output.bytes.len() > target) {
            output.message = Some(format!(
                "Target was too small; best PNG result is {} KB.",
                output.bytes.len().div_ceil(1024)
            ));
        }
        return Ok(output);
    }
    if format != "jpg" && format != "jpeg" {
        return Err(JsValue::from_str(
            "Choose JPG, JPEG, or PNG as the output format.",
        ));
    }
    let extension = if format == "jpeg" { "jpeg" } else { "jpg" };
    let mut selected_quality = quality;
    let mut encoded = encode_jpeg(image.clone(), selected_quality)?;
    if let Some(target) = target {
        while encoded.len() > target && selected_quality > 15 {
            selected_quality = selected_quality.saturating_sub(5).max(15);
            encoded = encode_jpeg(image.clone(), selected_quality)?;
        }
    }
    let mut output = ImageOutput::new(
        format!("{stem}-compressed.{extension}"),
        "image/jpeg",
        encoded,
    );
    output.quality = Some(selected_quality);
    if target.is_some_and(|target| output.bytes.len() > target) {
        output.message = Some(format!(
            "Target was too small; best JPEG result is {} KB.",
            output.bytes.len().div_ceil(1024)
        ));
    }
    Ok(output)
}

fn encode_jpeg(image: DynamicImage, quality: u8) -> Result<Vec<u8>, JsValue> {
    let rgb = image.to_rgb8();
    let mut bytes = Cursor::new(Vec::new());
    JpegEncoder::new_with_quality(&mut bytes, quality)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| JsValue::from_str(&format!("JPEG encoding failed: {error}")))?;
    Ok(bytes.into_inner())
}

fn encode_png(image: DynamicImage, effort: u8) -> Result<Vec<u8>, JsValue> {
    let rgba = image.to_rgba8();
    let compression = match effort {
        1 => CompressionType::Fast,
        2 => CompressionType::Default,
        _ => CompressionType::Best,
    };
    let mut bytes = Cursor::new(Vec::new());
    PngEncoder::new_with_quality(&mut bytes, compression, FilterType::Adaptive)
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|error| JsValue::from_str(&format!("PNG encoding failed: {error}")))?;
    Ok(bytes.into_inner())
}

fn quantize(image: &DynamicImage, colors: usize) -> DynamicImage {
    if colors >= 256 {
        return image.clone();
    }
    let mut rgba = image.to_rgba8();
    let levels = (colors as f64).cbrt().floor().max(2.0) as u16;
    let divisor = 255.0 / (levels - 1) as f32;
    for pixel in rgba.pixels_mut() {
        for channel in 0..3 {
            pixel[channel] = ((pixel[channel] as f32 / divisor).round() * divisor)
                .round()
                .clamp(0.0, 255.0) as u8;
        }
    }
    DynamicImage::ImageRgba8(rgba)
}

fn resize(image: DynamicImage, width: u32, height: u32) -> Result<DynamicImage, JsValue> {
    check_size(width, height)?;
    Ok(DynamicImage::ImageRgba8(image::imageops::resize(
        &image.to_rgba8(),
        width,
        height,
        ResizeFilter::Lanczos3,
    )))
}

fn add_caption(image: DynamicImage, text: &str) -> DynamicImage {
    use font8x8::UnicodeFonts;
    let mut rgba = image.to_rgba8();
    let scale = (rgba.width() / 300).clamp(2, 12);
    let top = rgba
        .height()
        .saturating_sub((10 * scale).min(rgba.height()));
    for y in top..rgba.height() {
        for x in 0..rgba.width() {
            rgba.put_pixel(x, y, Rgba([0, 0, 0, 150]));
        }
    }
    let mut cursor_x = scale * 2;
    for character in text.chars().take(180) {
        if cursor_x + 8 * scale >= rgba.width() {
            break;
        }
        if let Some(glyph) = font8x8::BASIC_FONTS.get(character) {
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..8 {
                    if bits & (1 << col) != 0 {
                        for dy in 0..scale {
                            for dx in 0..scale {
                                let x = cursor_x + col * scale + dx;
                                let y = top + scale + row as u32 * scale + dy;
                                if x < rgba.width() && y < rgba.height() {
                                    rgba.put_pixel(x, y, Rgba([255, 255, 255, 255]));
                                }
                            }
                        }
                    }
                }
            }
        }
        cursor_x += 8 * scale;
    }
    DynamicImage::ImageRgba8(rgba)
}

fn positive(value: Option<u32>, label: &str) -> Result<u32, JsValue> {
    value
        .filter(|number| *number > 0)
        .ok_or_else(|| JsValue::from_str(&format!("Enter a valid positive {label}.")))
}
fn png_effort(quality: u8) -> u8 {
    (1 + quality.saturating_sub(15) / 27).clamp(1, 4)
}
fn check_size(width: u32, height: u32) -> Result<(), JsValue> {
    if width == 0 || height == 0 || width as u64 * height as u64 > MAX_IMAGE_PIXELS {
        return Err(JsValue::from_str(
            "This image exceeds the 40-megapixel processing limit.",
        ));
    }
    Ok(())
}
fn safe_stem(filename: &str) -> String {
    let name = filename
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(filename);
    let stem: String = name
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
    if stem.trim().is_empty() {
        "image".into()
    } else {
        stem
    }
}
