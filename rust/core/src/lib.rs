use wasm_bindgen::prelude::*;

/// Reports whether a named UI tool has a Rust implementation.
/// No tools currently process files; this API intentionally does not accept file bytes.
#[wasm_bindgen]
pub fn tool_availability(_tool_name: &str) -> String {
    "planned".to_string()
}
