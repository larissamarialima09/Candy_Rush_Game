// Converte o HDR do céu (.exr) em assets leves, em tempo de build:
// `npm run sky`.
//
// Por que não carregar o .exr direto no jogo: um equiretangular 4K em meia
// precisão são ~67 MB de textura viva, mais o custo de gerar o mapa de
// ambiente. Nesta máquina isso é a diferença entre o jogo abrir e não abrir.
//
// O que sai daqui:
//   public/sky.png          — o céu já reduzido e tonemapeado, poucos KB
//   src/generated/skyLighting.ts — as luzes EXTRAÍDAS do próprio HDR
//
// O segundo arquivo é o que faz o HDR realmente iluminar a cena: a cor média
// do hemisfério de cima vira a luz do céu, a de baixo vira a rebatida do chão,
// e o ponto mais brilhante do panorama vira a direção e a cor da luz
// principal. É iluminação baseada em imagem calculada uma vez, de graça.
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../assets/rooftop_night_4k.exr');
const SKY_PNG = resolve(HERE, '../public/sky.png');
const LIGHTING_TS = resolve(HERE, '../src/generated/skyLighting.ts');

/** Largura do céu reduzido. 1024x512 já não mostra pixel no horizonte. */
const OUT_WIDTH = 1024;
const OUT_HEIGHT = 512;

/**
 * Exposição aplicada antes do tonemap. O panorama é noturno e escuro; sem
 * levantar a exposição o céu vira um retângulo preto.
 */
const EXPOSURE = 6.5;

console.log('lendo', SOURCE);
const file = readFileSync(SOURCE);
const parsed = new EXRLoader().parse(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
);

const { width, height } = parsed;
console.log(`EXR ${width}x${height}, ${parsed.data.length} amostras`);

/** Lê um texel como RGB linear, lidando com meia precisão ou float. */
const source = parsed.data;
const stride = 4;
function texel(x, y, out) {
  const index = (y * width + x) * stride;
  out[0] = halfOrFloat(source[index]);
  out[1] = halfOrFloat(source[index + 1]);
  out[2] = halfOrFloat(source[index + 2]);
  return out;
}

const isHalf = source instanceof Uint16Array;
function halfOrFloat(value) {
  return isHalf ? halfToFloat(value) : value;
}

/** IEEE 754 meia precisão -> float. */
function halfToFloat(half) {
  const sign = (half & 0x8000) >> 15;
  const exponent = (half & 0x7c00) >> 10;
  const fraction = half & 0x03ff;
  let value;
  if (exponent === 0) value = fraction * 2 ** -24;
  else if (exponent === 0x1f) value = fraction ? NaN : Infinity;
  else value = (fraction / 1024 + 1) * 2 ** (exponent - 15);
  return sign ? -value : value;
}

// --- Redução por média de blocos + tonemap ---
const blockX = Math.floor(width / OUT_WIDTH);
const blockY = Math.floor(height / OUT_HEIGHT);
const rgb = new Float64Array(3);
const pixels = Buffer.alloc(OUT_WIDTH * OUT_HEIGHT * 3);

// Estatísticas de iluminação, acumuladas no mesmo passe.
let skySum = [0, 0, 0];
let skyCount = 0;
let groundSum = [0, 0, 0];
let groundCount = 0;
let brightest = { luminance: -1, u: 0, v: 0, color: [0, 0, 0] };

for (let oy = 0; oy < OUT_HEIGHT; oy++) {
  for (let ox = 0; ox < OUT_WIDTH; ox++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let samples = 0;

    for (let by = 0; by < blockY; by++) {
      for (let bx = 0; bx < blockX; bx++) {
        texel(ox * blockX + bx, oy * blockY + by, rgb);
        r += rgb[0];
        g += rgb[1];
        b += rgb[2];
        samples++;
      }
    }
    r /= samples;
    g /= samples;
    b /= samples;

    // O peso por seno compensa a distorção do equiretangular: perto dos polos
    // cada texel cobre muito menos ângulo sólido do que perto do horizonte.
    const theta = ((oy + 0.5) / OUT_HEIGHT) * Math.PI;
    const weight = Math.sin(theta);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (oy < OUT_HEIGHT / 2) {
      skySum[0] += r * weight;
      skySum[1] += g * weight;
      skySum[2] += b * weight;
      skyCount += weight;
    } else {
      groundSum[0] += r * weight;
      groundSum[1] += g * weight;
      groundSum[2] += b * weight;
      groundCount += weight;
    }

    if (luminance > brightest.luminance) {
      brightest = {
        luminance,
        u: (ox + 0.5) / OUT_WIDTH,
        v: (oy + 0.5) / OUT_HEIGHT,
        color: [r, g, b],
      };
    }

    const offset = (oy * OUT_WIDTH + ox) * 3;
    pixels[offset] = encode(r);
    pixels[offset + 1] = encode(g);
    pixels[offset + 2] = encode(b);
  }
}

/** Tonemap (Reinhard) + gama sRGB, para caber em 8 bits sem estourar. */
function encode(value) {
  const exposed = Math.max(0, value) * EXPOSURE;
  const mapped = exposed / (1 + exposed);
  const gamma = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(gamma * 255)));
}

// --- PNG mínimo (RGB de 8 bits, sem filtro) ---
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT_WIDTH, 0);
ihdr.writeUInt32BE(OUT_HEIGHT, 4);
ihdr[8] = 8; // bits por canal
ihdr[9] = 2; // RGB
// Cada linha do PNG é precedida por um byte de tipo de filtro; 0 = sem filtro.
const raw = Buffer.alloc(OUT_HEIGHT * (1 + OUT_WIDTH * 3));
for (let y = 0; y < OUT_HEIGHT; y++) {
  const from = y * OUT_WIDTH * 3;
  pixels.copy(raw, y * (1 + OUT_WIDTH * 3) + 1, from, from + OUT_WIDTH * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(SKY_PNG), { recursive: true });
writeFileSync(SKY_PNG, png);
console.log(`céu -> ${SKY_PNG} (${Math.round(png.length / 1024)} KB)`);

// --- Luzes extraídas do panorama ---
const skyColor = skySum.map((v) => v / skyCount);
const groundColor = groundSum.map((v) => v / groundCount);

/**
 * Converte a coordenada do panorama na direção do mundo.
 * Equiretangular: u dá a volta em Y, v vai do zênite ao nadir.
 */
const phi = (brightest.u - 0.5) * Math.PI * 2;
const theta = brightest.v * Math.PI;
const direction = [
  Math.sin(theta) * Math.sin(phi),
  Math.cos(theta),
  Math.sin(theta) * Math.cos(phi),
];

/** Normaliza uma cor para o canal mais forte virar 1, preservando o matiz. */
function normalizeHue(color) {
  const peak = Math.max(color[0], color[1], color[2], 1e-6);
  return color.map((c) => c / peak);
}

function hex(color) {
  const [r, g, b] = normalizeHue(color).map((c) =>
    Math.max(0, Math.min(255, Math.round(Math.sqrt(c) * 255))),
  );
  return `0x${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const generated = `// GERADO POR \`npm run sky\` — não edite à mão.
//
// Estes valores foram extraídos de assets/rooftop_night_4k.exr: a cor média do
// hemisfério superior, a do inferior e o ponto mais brilhante do panorama.
// São eles que fazem o HDR iluminar a cena de verdade, sem custar um mapa de
// ambiente em tempo de execução.

export const SKY_LIGHTING = {
  /** Textura equiretangular já reduzida e tonemapeada. */
  texture: '/sky.png',
  /** Cor média do céu (hemisfério superior). */
  skyColor: ${hex(skyColor)},
  /** Cor média rebatida do chão (hemisfério inferior). */
  groundColor: ${hex(groundColor)},
  /** Direção do ponto mais brilhante do panorama, no espaço do mundo. */
  keyDirection: { x: ${direction[0].toFixed(4)}, y: ${direction[1].toFixed(4)}, z: ${direction[2].toFixed(4)} },
  /** Cor desse ponto. */
  keyColor: ${hex(brightest.color)},
  /** Luminância relativa do panorama, para calibrar a exposição. */
  averageLuminance: ${((0.2126 * skyColor[0] + 0.7152 * skyColor[1] + 0.0722 * skyColor[2]) || 0).toFixed(5)},
} as const;
`;

mkdirSync(dirname(LIGHTING_TS), { recursive: true });
writeFileSync(LIGHTING_TS, generated, 'utf8');
console.log(`luzes -> ${LIGHTING_TS}`);
console.log(`  céu ${hex(skyColor)}  chão ${hex(groundColor)}  principal ${hex(brightest.color)}`);
console.log(
  `  direção principal (${direction.map((d) => d.toFixed(2)).join(', ')})  luminância ${brightest.luminance.toFixed(2)}`,
);
