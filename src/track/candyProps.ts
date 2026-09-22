import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { CIRCUIT } from '../config/circuit';
import { QUALITY } from '../config/quality';
import { createRandom } from '../core/mathUtils';
import { createStripeTexture, createSwirlTexture } from '../fx/proceduralTextures';
import { castleFootprint } from './candyCastle';
import { candyFactoryFootprint } from './candyFactory';
import type { CircuitPath } from './circuitPath';

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _axisY = new Vector3(0, 1, 0);

/** Onde um doce foi plantado. Todas as peças dele usam a mesma base. */
interface Spot {
  x: number;
  z: number;
  ground: number;
  heading: number;
  scale: number;
}

/**
 * Os doces espalhados pelo cenário: pirulitos, bengalas, cupcakes, gumdrops e
 * tufos de grama.
 *
 * Cada doce é feito de PEÇAS, e cada peça vira uma InstancedMesh própria —
 * todos os palitos de pirulito numa malha, todos os discos noutra. Fundir o
 * doce inteiro numa geometria só seria mais simples, mas obrigaria uma cor
 * única por doce: o pirulito perderia o palito branco, o cupcake perderia a
 * cobertura. Peça por peça, cada uma guarda a própria cor e o próprio brilho.
 *
 * A distribuição é por amostragem com rejeição em volta da pista, com os
 * doces mais perto da borda do que as árvores — o que passa perto do olho é o
 * que dá sensação de velocidade.
 */
export class CandyProps {
  readonly root = new Group();
  private readonly random = createRandom(CIRCUIT.randomSeed + 404);

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'candy-props';

    const spots = this.scatter(path, QUALITY.candyPropCount);
    const stripes = createStripeTexture('#ff5c96', '#ffffff');
    const swirl = createSwirlTexture();

    // Reparte os pontos entre os tipos de doce, na proporção da referência:
    // muito gumdrop e tufo de grama, poucos cupcakes e bengalas.
    const buckets: Record<string, Spot[]> = {
      lollipop: [],
      cane: [],
      cupcake: [],
      gumdrop: [],
      tuft: [],
    };
    const mix = ['gumdrop', 'gumdrop', 'gumdrop', 'lollipop', 'cupcake', 'cupcake', 'cane', 'gumdrop'];
    for (let i = 0; i < spots.length; i++) {
      buckets[mix[i % mix.length]].push(spots[i]);
    }

    this.addLollipops(buckets.lollipop, swirl);
    this.addCandyCanes(buckets.cane, stripes);
    this.addCupcakes(buckets.cupcake);
    this.addGumdrops(buckets.gumdrop);
    this.addGrassTufts(buckets.tuft);

    scene.add(this.root);
  }

  /**
   * Sorteia pontos em volta da pista. A faixa é estreita de propósito: doce
   * longe demais não é visto de dentro do kart, e doce perto demais invade a
   * área de escape.
   */
  private scatter(path: CircuitPath, count: number): Spot[] {
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
    const margin = 70;
    minX -= margin;
    maxX += margin;
    minZ -= margin;
    maxZ += margin;

    const inCastle = castleFootprint(path);
    const inFactory = candyFactoryFootprint(path);
    const spots: Spot[] = [];
    let attempts = 0;
    while (spots.length < count && attempts < count * 60) {
      attempts++;
      const x = minX + this.random() * (maxX - minX);
      const z = minZ + this.random() * (maxZ - minZ);
      const distance = path.distanceToCenterline(x, z);
      // 13 m deixa passar depois da barreira; 62 m ainda está no campo de visão.
      if (distance < 13 || distance > 62) continue;
      // O castelo tem a própria decoração; doce sorteado ali atravessaria parede.
      if (inCastle(x, z, 1.5)) continue;
      // Idem para a máquina de doces e as montanhas de algodão-doce: um
      // pirulito sorteado ali nasceria de dentro do tufo.
      if (inFactory(x, z, 1.5)) continue;

      spots.push({
        x,
        z,
        ground: path.terrainHeight(x, z),
        heading: this.random() * Math.PI * 2,
        scale: 0.8 + this.random() * 0.6,
      });
    }
    return spots;
  }

  /** Pirulito: palito branco e um disco com espiral, virado para a pista. */
  private addLollipops(spots: Spot[], swirl: ReturnType<typeof createSwirlTexture>): void {
    const sticks: Spot[] = spots;
    this.addPart(
      new CylinderGeometry(0.055, 0.055, 1.7, 8),
      sticks,
      (spot) => ({ y: spot.ground + 0.85 * spot.scale, scale: spot.scale }),
      { color: 0xffffff, roughness: 0.35 },
    );

    // O disco nasce deitado; girar em X o põe de pé, de frente para quem passa.
    const disc = new CylinderGeometry(0.62, 0.62, 0.16, 22);
    disc.rotateX(Math.PI / 2);
    this.addPart(
      disc,
      spots,
      (spot) => ({ y: spot.ground + 1.85 * spot.scale, scale: spot.scale }),
      { color: 0xffffff, roughness: 0.12, map: swirl, emissive: 0.1 },
    );
  }

  /** Bengala doce: haste listrada com o gancho no topo. */
  private addCandyCanes(spots: Spot[], stripes: ReturnType<typeof createStripeTexture>): void {
    this.addPart(
      new CylinderGeometry(0.11, 0.11, 1.5, 10),
      spots,
      (spot) => ({ y: spot.ground + 0.75 * spot.scale, scale: spot.scale }),
      { color: 0xffffff, roughness: 0.15, map: stripes },
    );

    // Meia rosca no topo, no plano vertical, formando o gancho.
    const hook = new TorusGeometry(0.3, 0.11, 8, 14, Math.PI);
    this.addPart(
      hook,
      spots,
      (spot) => ({ y: spot.ground + 1.5 * spot.scale, scale: spot.scale }),
      { color: 0xffffff, roughness: 0.15, map: stripes },
    );
  }

  /** Cupcake: forminha, cobertura e cereja. */
  private addCupcakes(spots: Spot[]): void {
    this.addPart(
      new CylinderGeometry(0.42, 0.3, 0.5, 16),
      spots,
      (spot) => ({ y: spot.ground + 0.25 * spot.scale, scale: spot.scale }),
      { color: 0xffcf8a, roughness: 0.22, emissive: 0.06 },
    );

    const frosting = new SphereGeometry(0.46, 16, 12);
    frosting.scale(1, 0.85, 1);
    this.addPart(
      frosting,
      spots,
      (spot) => ({ y: spot.ground + 0.72 * spot.scale, scale: spot.scale }),
      { color: 0xfff0f6, roughness: 0.16, emissive: 0.08 },
    );

    this.addPart(
      new SphereGeometry(0.13, 10, 8),
      spots,
      (spot) => ({ y: spot.ground + 1.1 * spot.scale, scale: spot.scale }),
      { color: 0xf0518f, roughness: 0.15, emissive: 0.15 },
    );
  }

  /** Gumdrops: bolinhas coloridas em grupinhos, meio enterradas. */
  private addGumdrops(spots: Spot[]): void {
    const pastels = CIRCUIT.colors.pastels;
    const byColor: Spot[][] = pastels.map(() => []);

    for (const spot of spots) {
      // Cada ponto vira um grupinho de duas ou três balas, não uma só: uma
      // esfera sozinha no gramado parece um erro, um grupinho parece doce.
      const cluster = 2 + Math.floor(this.random() * 2);
      for (let i = 0; i < cluster; i++) {
        const angle = this.random() * Math.PI * 2;
        const distance = this.random() * 0.9 * spot.scale;
        byColor[Math.floor(this.random() * pastels.length)].push({
          x: spot.x + Math.cos(angle) * distance,
          z: spot.z + Math.sin(angle) * distance,
          ground: spot.ground,
          heading: this.random() * Math.PI * 2,
          scale: spot.scale * (0.28 + this.random() * 0.3),
        });
      }
    }

    // Poucos segmentos: são centenas de balas, todas pequenas na tela.
    const geometry = new SphereGeometry(1, 9, 7);
    for (let i = 0; i < pastels.length; i++) {
      this.addPart(
        geometry,
        byColor[i],
        (spot) => ({ y: spot.ground + spot.scale * 0.72, scale: spot.scale }),
        { color: pastels[i], roughness: 0.14, emissive: 0.08 },
      );
    }
  }

  /** Tufos de grama: três cones baixinhos, para o chão não ficar liso. */
  private addGrassTufts(spots: Spot[]): void {
    const blades: Spot[] = [];
    for (const spot of spots) {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + spot.heading;
        blades.push({
          x: spot.x + Math.cos(angle) * 0.18 * spot.scale,
          z: spot.z + Math.sin(angle) * 0.18 * spot.scale,
          ground: spot.ground,
          heading: spot.heading,
          scale: spot.scale * (0.7 + this.random() * 0.5),
        });
      }
    }

    this.addPart(
      new ConeGeometry(0.11, 0.5, 5),
      blades,
      (spot) => ({ y: spot.ground + 0.25 * spot.scale, scale: spot.scale }),
      { color: 0x8fdb6a, roughness: 0.28, emissive: 0.06 },
    );
  }

  /** Cria uma InstancedMesh para uma peça de doce. */
  private addPart(
    geometry: BufferGeometry,
    spots: Spot[],
    place: (spot: Spot) => { y: number; scale: number },
    options: {
      color: number;
      roughness: number;
      map?: ReturnType<typeof createStripeTexture>;
      emissive?: number;
    },
  ): void {
    if (spots.length === 0) return;

    const material = new MeshStandardMaterial({
      color: options.color,
      roughness: options.roughness,
      metalness: 0,
      ...(options.map ? { map: options.map } : {}),
      ...(options.emissive
        ? { emissive: options.color, emissiveIntensity: options.emissive }
        : {}),
    });

    const mesh = new InstancedMesh(geometry, material, spots.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const placed = place(spot);
      _position.set(spot.x, placed.y, spot.z);
      _quaternion.setFromAxisAngle(_axisY, spot.heading);
      _scale.setScalar(placed.scale);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
  }
}
