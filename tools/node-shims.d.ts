declare module 'node:fs' {
  export function writeFileSync(path: string, data: string | Uint8Array): void;
}
