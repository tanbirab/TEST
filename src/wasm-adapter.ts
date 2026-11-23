import init, { tool_availability } from '../rust/core/pkg/projectpdf_core.js';

let initialization: Promise<void> | undefined;

/** Initializes the Rust module once; this adapter contains no file transformations. */
export function initializeCore(): Promise<void> {
  initialization ??= init().then(() => undefined);
  return initialization;
}

export async function getToolAvailability(toolName: string): Promise<'available' | 'planned'> {
  await initializeCore();
  return tool_availability(toolName) === 'available' ? 'available' : 'planned';
}
