declare module '@wasm-zoo/ghostscript' {
  export type GhostscriptFile = { name: string; data: Uint8Array };
  export type GhostscriptResult = { files: GhostscriptFile[]; stdout: string; stderr: string; exitCode: number };
  export function load(): Promise<{
    exec(args: string[], options: { files?: GhostscriptFile[]; dirs?: string[]; outputs?: string[] }): Promise<GhostscriptResult>;
    dispose(): void;
  }>;
}
