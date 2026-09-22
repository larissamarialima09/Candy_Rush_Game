import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Group,
  type Scene,
} from 'three';
import { CIRCUIT } from '../config/circuit';
import { QUALITY } from '../config/quality';
import { TRACK } from '../config/track';
import { createMeadowTexture } from './meadowTexture';
import type { CircuitPath } from './circuitPath';

/**
 * Malha do terreno ao redor do circuito.
 *
 * Existe porque a pista sobe, desce e se inclina: um plano chapado em y = 0
 * deixaria o asfalto flutuando nas subidas e enterrado nas descidas.
 *
 * O detalhe que faz ou quebra esta malha é o BURACO embaixo da pista. Uma
 * grade regular de 6 metros é uma aproximação grosseira de uma fita curva e
 * inclinada, e onde a aproximação erra para cima o terreno atravessa o
 * asfalto — na tela isso aparece como recortes de grama comendo a pista, o
 * que era exatamente o sintoma. Então:
 *
 *   1. Células inteiramente cobertas pela pista e pelo escape não são
 *      geradas. Não dá para o terreno furar um lugar onde ele não existe.
 *   2. As células da borda têm os vértices internos afundados, de modo que
 *      mergulham por baixo da fita e voltam a encostar no chão do lado de fora.
 *
 * De quebra, o buraco tira alguns milhares de triângulos da cena.
 */
export class Terrain {
  readonly root = new Group();

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'terrain';
    const margin = TRACK.terrain.fadeEnd;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const sample of path.samples) {
      minX = Math.min(minX, sample.position.x);
      maxX = Math.max(maxX, sample.position.x);
      minZ = Math.min(minZ, sample.position.z);
      maxZ = Math.max(maxZ, sample.position.z);
    }
    minX -= margin;
    maxX += margin;
    minZ -= margin;
    maxZ += margin;

    const cell = Math.min(QUALITY.terrainCellSize, 4);
    const columns = Math.ceil((maxX - minX) / cell) + 1;
    const rows = Math.ceil((maxZ - minZ) / cell) + 1;

    const positions = new Float32Array(columns * rows * 3);
    const uvs = new Float32Array(columns * rows * 2);
    /** Quanto cada vértice está DENTRO da fita da pista, em metros. */
    const covered = new Float32Array(columns * rows);
    const tileMeters = 26;

    /**
     * Profundidade máxima do mergulho sob a fita, em metros.
     *
     * Generosa. A margem precisa cobrir três erros somados: a grade de 6 m
     * aproximando uma fita curva, a amostra do eixo mais próxima de um
     * vértice do terreno podendo não ser a mesma que gerou a fita ali, e a
     * inclinação da curva levantando a borda externa. Meio metro deixava
     * pedaços de grama ainda cortando o asfalto em algumas curvas.
     */
    const maxSink = 0.9;
    /** Em quantos metros o mergulho atinge a profundidade máxima. */
    const sinkRamp = 2.5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const index = r * columns + c;
        const x = minX + c * cell;
        const z = minZ + r * cell;

        const inside = trackCoverage(path, x, z, Math.min(cell * 0.45, 1.4));
        covered[index] = inside;

        const sink = inside <= 0 ? 0 : Math.min(1, inside / sinkRamp) * maxSink;

        positions[index * 3] = x;
        positions[index * 3 + 1] = path.terrainHeight(x, z) - sink;
        positions[index * 3 + 2] = z;
        uvs[index * 2] = x / tileMeters;
        uvs[index * 2 + 1] = z / tileMeters;
      }
    }

    // Índices: dois triângulos por célula, enrolados no sentido anti-horário
    // visto de cima para a normal apontar para o céu. Células totalmente
    // escondidas sob a fita são puladas.
    const indices: number[] = [];
    let skipped = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < columns - 1; c++) {
        const a = r * columns + c;
        const b = a + 1;
        const d = a + columns;
        const e = d + 1;

        // Só some quando os QUATRO cantos estão com folga sob a fita; senão
        // apareceria um vão entre o terreno e a borda do escape.
        const centerX = minX + (c + 0.5) * cell;
        const centerZ = minZ + (r + 0.5) * cell;
        const touchesTrack =
          Math.max(
            covered[a],
            covered[b],
            covered[d],
            covered[e],
            trackCoverage(path, centerX, centerZ, Math.min(cell * 0.45, 1.4)),
          ) > 0;
        if (touchesTrack) {
          skipped++;
          continue;
        }

        indices.push(a, d, b, b, d, e);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const texture = createMeadowTexture();
    if (texture) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }

    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: 0xc5e9a7,
        polygonOffset: true,
        polygonOffsetFactor: 4,
        polygonOffsetUnits: 4,
        roughness: 0.92,
        metalness: 0,
        ...(texture ? { map: texture } : {}),
      }),
    );
    mesh.receiveShadow = true;
    this.root.add(mesh);
    scene.add(this.root);

    void skipped;
  }
}

function trackCoverage(path: CircuitPath, x: number, z: number, margin: number): number {
  const sampleIndex = path.nearestSampleIndex(x, z);
  const lateral = path.lateralOffset(sampleIndex, x, z);
  const edge =
    path.samples[sampleIndex].halfWidth + TRACK.runoffWidth + CIRCUIT.kerb.width + margin;
  return edge - Math.abs(lateral);
}
