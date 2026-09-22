import { CatmullRomCurve3, Vector3 } from 'three';
import { CIRCUIT } from '../config/circuit';
import { TRACK, type SurfaceKind, type TrackProfilePoint } from '../config/track';
import { clamp, degToRad } from '../core/mathUtils';

/**
 * Um ponto amostrado do eixo da pista, com o referencial local já pronto.
 * Toda a pista — malha, física, cenário, checkpoints, barreiras — é construída
 * a partir daqui. Existe uma única fonte de verdade para a geometria.
 */
export interface PathSample {
  /** Posição no eixo central, já com a elevação aplicada em y. */
  readonly position: Vector3;
  /** Direção de corrida, unitária, INCLUINDO a inclinação da subida. */
  readonly tangent: Vector3;
  /** Perpendicular HORIZONTAL apontando para a esquerda do sentido de corrida. */
  readonly left: Vector3;
  /** Normal da superfície, já com a inclinação da curva. */
  readonly normal: Vector3;
  /** Curvatura com sinal, em 1/metro. Positiva = curva à esquerda. */
  readonly curvature: number;
  /** Distância acumulada desde a largada, em metros. */
  readonly distance: number;
  /** Meia-largura do asfalto neste ponto, em metros. */
  readonly halfWidth: number;
  /** Inclinação transversal, em radianos. Positiva = lado direito mais alto. */
  readonly bank: number;
}

const _scratch = new Vector3();
const _lateralDir = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Tamanho da célula do índice espacial, em metros. */
const GRID_CELL = 12;

/**
 * Eixo da pista amostrado uniformemente, fechado, com largura variável,
 * elevação e inclinação nas curvas.
 *
 * Também é o índice espacial: a física pergunta "qual a altura e o material
 * embaixo deste ponto?" 240 vezes por segundo (quatro rodas a 60 Hz), e
 * varrer 480 amostras a cada pergunta seria desperdício. Uma grade uniforme
 * reduz isso a um punhado de candidatos.
 */
export class CircuitPath {
  readonly samples: readonly PathSample[];
  readonly totalLength: number;

  /** Índice espacial: chave da célula -> índices de amostra contidos nela. */
  private readonly grid = new Map<number, number[]>();

  constructor(
    points: readonly (readonly [number, number])[],
    sampleCount: number,
    curvatureWindow = 1,
  ) {
    const curve = new CatmullRomCurve3(
      points.map(([x, z]) => new Vector3(x, 0, z)),
      true,
      'centripetal',
      0.5,
    );

    // `getSpacedPoints` reparametriza por comprimento de arco: os pontos saem
    // igualmente espaçados, o que é essencial para espaçar barreiras e postes
    // por metro e não por parâmetro da curva.
    const positions = curve.getSpacedPoints(sampleCount);
    positions.length = sampleCount;
    const count = positions.length;

    // --- Distâncias no plano, para parametrizar os perfis ---
    const distances: number[] = [];
    let planarLength = 0;
    for (let i = 0; i < count; i++) {
      distances.push(planarLength);
      planarLength += positions[i].distanceTo(positions[(i + 1) % count]);
    }
    this.totalLength = planarLength;

    // --- Elevação: aplicada antes de qualquer tangente ser calculada ---
    //
    // O perfil é NORMALIZADO para o ponto mais baixo da pista ficar em y = 0.
    //
    // Sem isso, os trechos em que o perfil desce abaixo de zero ficavam
    // enterrados sob o plano de horizonte, que é uma placa de 2,5 km em
    // y = -0.01: a pista simplesmente desaparecia sob o verde em parte do
    // circuito, e o kart saía dirigindo no meio do nada. Manter todo o
    // traçado em cima de zero garante que nada do mundo passe por cima dele.
    let lowest = Infinity;
    for (let i = 0; i < count; i++) {
      const elevation = sampleProfile(TRACK.elevationProfile, distances[i] / planarLength);
      positions[i].y = elevation;
      lowest = Math.min(lowest, elevation);
    }
    for (let i = 0; i < count; i++) positions[i].y -= lowest;

    // --- Referencial local ---
    const curvatures = new Float64Array(count);
    const halfWidths = new Float64Array(count);
    const tangents: Vector3[] = [];
    const lefts: Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const next = positions[(i + 1) % count];
      const previous = positions[(i - 1 + count) % count];

      const tangent = new Vector3().copy(next).sub(previous).normalize();
      // A esquerda é sempre horizontal: usá-la inclinada torceria a pista.
      const left = new Vector3(0, 1, 0)
        .cross(_scratch.copy(tangent).setY(0).normalize())
        .normalize();

      tangents.push(tangent);
      lefts.push(left);
      halfWidths[i] = 5.4;
    }

    // --- Curvatura, medida no plano e com janela ---
    const window = Math.max(1, Math.round(curvatureWindow));
    for (let i = 0; i < count; i++) {
      const before = tangents[(i - window + count * 2) % count];
      const after = tangents[(i + window) % count];
      const beforePos = positions[(i - window + count * 2) % count];
      const afterPos = positions[(i + window) % count];
      const arc = beforePos.distanceTo(afterPos);

      const flatBefore = _scratch.copy(before).setY(0).normalize().clone();
      const flatAfter = _lateralDir.copy(after).setY(0).normalize().clone();
      const dot = clamp(flatBefore.dot(flatAfter), -1, 1);
      const angle = Math.acos(dot);
      // y positivo do produto vetorial = giro anti-horário = curva à esquerda.
      const sign = Math.sign(flatBefore.cross(flatAfter).y) || 0;
      curvatures[i] = arc > 1e-6 ? (angle * sign) / arc : 0;
    }

    // --- Inclinação: derivada da curvatura e depois alisada ---
    const rawBank = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const degrees = clamp(
        curvatures[i] * TRACK.banking.degreesPerCurvature,
        -TRACK.banking.maxDegrees,
        TRACK.banking.maxDegrees,
      );
      rawBank[i] = degToRad(degrees);
    }
    const bank = smoothCyclic(rawBank, TRACK.banking.smoothingSamples);

    // --- Montagem final ---
    const samples: PathSample[] = [];
    for (let i = 0; i < count; i++) {
      // Direção lateral SOBRE a superfície: a altura cai `tan(bank)` por metro
      // andado para a esquerda, então a inclinação levanta o lado de fora.
      _lateralDir.copy(lefts[i]).addScaledVector(_up, -Math.tan(bank[i])).normalize();
      const normal = new Vector3().crossVectors(tangents[i], _lateralDir).normalize();

      samples.push({
        position: positions[i],
        tangent: tangents[i],
        left: lefts[i],
        normal,
        curvature: curvatures[i],
        distance: distances[i],
        halfWidth: halfWidths[i],
        bank: bank[i],
      });
    }

    this.samples = samples;
    this.buildGrid();
  }

  get count(): number {
    return this.samples.length;
  }

  private buildGrid(): void {
    for (let i = 0; i < this.samples.length; i++) {
      const position = this.samples[i].position;
      const key = cellKey(position.x, position.z);
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(i);
      else this.grid.set(key, [i]);
    }
  }

  /**
   * Índice da amostra mais próxima de um ponto do mundo.
   * Consulta as nove células vizinhas; só cai na varredura completa quando o
   * ponto está longe de tudo, o que na prática é quem saiu voando do mapa.
   */
  nearestSampleIndex(x: number, z: number): number {
    const cx = Math.floor(x / GRID_CELL);
    const cz = Math.floor(z / GRID_CELL);

    let best = -1;
    let bestDistance = Infinity;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const bucket = this.grid.get(hashCell(cx + ox, cz + oz));
        if (!bucket) continue;
        for (const index of bucket) {
          const position = this.samples[index].position;
          const dx = position.x - x;
          const dz = position.z - z;
          const squared = dx * dx + dz * dz;
          if (squared < bestDistance) {
            bestDistance = squared;
            best = index;
          }
        }
      }
    }

    if (best >= 0) return best;

    for (let i = 0; i < this.samples.length; i++) {
      const position = this.samples[i].position;
      const dx = position.x - x;
      const dz = position.z - z;
      const squared = dx * dx + dz * dz;
      if (squared < bestDistance) {
        bestDistance = squared;
        best = i;
      }
    }
    return best < 0 ? 0 : best;
  }

  /** Deslocamento lateral de um ponto: positivo para a esquerda da pista. */
  lateralOffset(index: number, x: number, z: number): number {
    const sample = this.samples[index];
    return (x - sample.position.x) * sample.left.x + (z - sample.position.z) * sample.left.z;
  }

  /**
   * Altura da superfície a um dado deslocamento lateral.
   *
   * Duas coisas acontecem aqui, e as duas importam. A inclinação da curva para
   * de crescer na borda do asfalto — senão a pista inclinada viraria uma rampa
   * infinita quando o kart sai para a grama. E a elevação vai sumindo com a
   * distância, de modo que longe da pista o terreno é plano em y = 0.
   *
   * Esta é a ÚNICA função de altura do jogo: a física, a malha do terreno e o
   * posicionamento do cenário chamam todas ela.
   */
  surfaceHeight(index: number, lateral: number): number {
    const sample = this.samples[index];
    const paved = clamp(lateral, -sample.halfWidth, sample.halfWidth);
    const height = sample.position.y - paved * Math.tan(sample.bank);

    const fade = TRACK.terrain;
    const absolute = Math.abs(lateral);
    if (absolute <= fade.fadeStart) return height;
    if (absolute >= fade.fadeEnd) return 0;

    const k = (absolute - fade.fadeStart) / (fade.fadeEnd - fade.fadeStart);
    return height * (1 - k * k * (3 - 2 * k));
  }

  /** Altura do terreno sob um ponto qualquer do mundo. */
  terrainHeight(x: number, z: number): number {
    const index = this.nearestSampleIndex(x, z);
    return this.surfaceHeight(index, this.lateralOffset(index, x, z));
  }

  /** Material da superfície em um deslocamento lateral. */
  surfaceAt(index: number, lateral: number): SurfaceKind {
    const sample = this.samples[index];
    const absolute = Math.abs(lateral);

    if (absolute <= sample.halfWidth) return 'asfalto';

    // A zebra é desenhada nas DUAS bordas, pela volta inteira, então a
    // superfície tem que valer nas duas também. Enquanto ela só existia no
    // lado interno das curvas, metade dos pneus pisava numa zebra pintada e
    // sentia grip de escape — o que se vê e o que se dirige têm que bater.
    const kerb = CIRCUIT.kerb;
    if (absolute <= sample.halfWidth + kerb.width) return 'zebra';

    if (absolute <= sample.halfWidth + TRACK.runoffWidth) return 'areia';
    return 'grama';
  }

  /**
   * Ponto da superfície deslocado lateralmente, com a inclinação aplicada.
   * `heightOffset` sobe em relação à superfície (para pintar zebra por cima
   * do asfalto sem briga de z-buffer).
   */
  pointAt(index: number, lateral: number, heightOffset: number, out: Vector3): Vector3 {
    const sample = this.samples[index % this.samples.length];
    out.copy(sample.position).addScaledVector(sample.left, lateral);
    out.y = this.surfaceHeight(index % this.samples.length, lateral) + heightOffset;
    return out;
  }

  /** Índice da amostra mais próxima de uma fração da volta (0..1). */
  indexAtFraction(fraction: number): number {
    const count = this.samples.length;
    const index = Math.round(fraction * count) % count;
    return index < 0 ? index + count : index;
  }

  /** Distância horizontal de um ponto qualquer ao eixo da pista. */
  distanceToCenterline(x: number, z: number): number {
    const index = this.nearestSampleIndex(x, z);
    const sample = this.samples[index];
    return Math.hypot(sample.position.x - x, sample.position.z - z);
  }
}

/**
 * Interpola um perfil definido por fração da volta, de forma CÍCLICA: o último
 * ponto emenda no primeiro, então nunca há degrau na linha de largada.
 * A interpolação é suavizada (smoothstep) para não gerar quinas na malha.
 */
function sampleProfile(profile: readonly TrackProfilePoint[], t: number): number {
  const count = profile.length;
  if (count === 0) return 0;
  if (count === 1) return profile[0].value;

  const wrapped = ((t % 1) + 1) % 1;

  let previous = count - 1;
  for (let i = 0; i < count; i++) {
    if (profile[i].at <= wrapped) previous = i;
    else break;
  }
  const next = (previous + 1) % count;

  const from = profile[previous].at;
  let span = profile[next].at - from;
  if (span <= 0) span += 1;

  let local = wrapped - from;
  if (local < 0) local += 1;

  const k = clamp(local / span, 0, 1);
  const smooth = k * k * (3 - 2 * k);
  return profile[previous].value + (profile[next].value - profile[previous].value) * smooth;
}

/** Média móvel cíclica. Usada para alisar a inclinação das curvas. */
function smoothCyclic(values: Float64Array, window: number): Float64Array {
  const count = values.length;
  const half = Math.max(0, Math.floor(window / 2));
  if (half === 0) return values;

  const result = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let o = -half; o <= half; o++) sum += values[(i + o + count * 2) % count];
    result[i] = sum / (half * 2 + 1);
  }
  return result;
}

function cellKey(x: number, z: number): number {
  return hashCell(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL));
}

/** Empacota duas coordenadas de célula em um número, para chave de Map. */
function hashCell(cx: number, cz: number): number {
  return (cx + 4096) * 8192 + (cz + 4096);
}
