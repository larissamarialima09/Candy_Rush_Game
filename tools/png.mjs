// Codificador de PNG mínimo (RGB de 8 bits, sem filtro).
//
// Node traz zlib, que é a parte difícil de um PNG. O resto são três blocos
// com CRC32. Vale escrever à mão para não trazer uma dependência de imagem só
// para gravar duas telas de diagnóstico.
import { deflateSync } from 'node:zlib';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgb  width*height*3 bytes
 * @returns {Buffer}
 */
export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB

  // Cada linha é precedida por um byte de tipo de filtro; 0 = sem filtro.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const from = y * width * 3;
    Buffer.from(rgb.buffer, rgb.byteOffset + from, width * 3).copy(
      raw,
      y * (1 + width * 3) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
