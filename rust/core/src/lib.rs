mod image_ops;
mod pdf_ops;

use image_ops::{ImageOptions, ImageOutput};
use js_sys::{Array, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn tool_availability(tool_name: &str) -> String {
    match tool_name {
        "Compress Image"
        | "Reduce Signature File Size"
        | "Change Signature Width & Height"
        | "Change Photo Width & Height"
        | "Convert Photo to JPG"
        | "Crop Photo"
        | "Make Passport Size Photo"
        | "Add Name & Date on Photo"
        | "Reduce PDF File Size"
        | "Make PDF from Photos"
        | "Merge PDF Files"
        | "Split PDF"
        | "Convert PDF to JPG"
        | "Delete PDF Pages"
        | "Sign PDF"
        | "Put Many Pages on One Page"
        | "Verify PDF Signature" => "available",
        _ => "unavailable",
    }
    .to_string()
}

#[wasm_bindgen]
pub fn process_image(
    tool_name: &str,
    filename: &str,
    bytes: &[u8],
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let options: ImageOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&format!("Invalid image options: {error}")))?;
    let output = image_ops::process(tool_name, filename, bytes, &options)?;
    Ok(image_output_value(output))
}

#[wasm_bindgen]
pub fn process_pdf(
    tool_name: &str,
    filenames: Array,
    inputs: Array,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let options = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&format!("Invalid PDF options: {error}")))?;
    let files = (0..inputs.length())
        .map(|index| {
            let name = filenames
                .get(index)
                .as_string()
                .unwrap_or_else(|| format!("file-{}.pdf", index + 1));
            (name, Uint8Array::new(&inputs.get(index)).to_vec())
        })
        .collect::<Vec<_>>();
    let outputs = pdf_ops::process(tool_name, files, options)?;
    let result = Array::new();
    for output in outputs {
        result.push(&image_output_value(output));
    }
    Ok(result.into())
}

fn image_output_value(output: ImageOutput) -> JsValue {
    let value = Object::new();
    let _ = Reflect::set(&value, &"name".into(), &output.name.into());
    let _ = Reflect::set(&value, &"mime".into(), &output.mime.into());
    let _ = Reflect::set(
        &value,
        &"bytes".into(),
        &Uint8Array::from(output.bytes.as_slice()),
    );
    if let Some(quality) = output.quality {
        let _ = Reflect::set(&value, &"quality".into(), &quality.into());
    }
    if let Some(colors) = output.palette_colors {
        let _ = Reflect::set(&value, &"paletteColors".into(), &colors.into());
    }
    if let Some(level) = output.compression_level {
        let _ = Reflect::set(&value, &"compressionLevel".into(), &level.into());
    }
    if let Some(message) = output.message {
        let _ = Reflect::set(&value, &"message".into(), &message.into());
    }
    value.into()
}
