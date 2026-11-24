declare module '@wasm-zoo/qpdf' {
  export type QpdfFile = { name: string; data: Uint8Array };
  export type QpdfResult = { files: QpdfFile[]; stdout: string; stderr: string; exitCode: number };
  export function load(): Promise<{
    exec(args: string[], options: { files: QpdfFile[]; outputs: string[] }): Promise<QpdfResult>;
    dispose(): void;
  }>;
}
