/**
 * Declaração para o codificador de PNG em `png.mjs`.
 *
 * O nome do arquivo importa: para um import de `./png.mjs`, o TypeScript
 * procura a declaração irmã em `png.d.mts`. Nomes como `png.d.ts` (que pareia
 * com `png.js`) ou `png.mjs.d.ts` (que não pareia com nada) são ignorados na
 * resolução e o import cai em `any` implícito.
 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array;
