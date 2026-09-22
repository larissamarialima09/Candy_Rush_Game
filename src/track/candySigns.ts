import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CANDY_SIGNS, type SignpostSpec } from '../config/candySigns';
import { CIRCUIT } from '../config/circuit';
import { createRandom } from '../core/mathUtils';
import {
  createCheckerTexture,
  createStripeTexture,
  createSwirlTexture,
} from '../fx/proceduralTextures';
import type { CircuitPath } from './circuitPath';

const _point = new Vector3();

/**
 * Sinalização do circuito: placas de direção, bandeiras de largada e nuvens
 * voadoras com arco-íris.
 *
 * Três regras guiam este arquivo, todas aprendidas na marra em outras peças
 * deste cenário:
 *
 * 1. O que deve ficar no chão é plantado por `path.terrainHeight`, a MESMA
 *    função que gera a malha da grama. Qualquer outra fonte de altura
 *    discorda dela em algum ponto do mapa, e aí a peça flutua.
 * 2. O que é plano (bandeira) nasce virado para +Z e precisa girar, porque
 *    quem olha está em -Z. Foi o que deixou as estrelas do portal invisíveis.
 * 3. Cenário sem colisão fica ALÉM da barreira de bala, senão o kart passa
 *    por dentro dele.
 */
export class CandySigns {
  readonly root = new Group();
  private readonly random = createRandom(CIRCUIT.randomSeed + 5150);

  private readonly stripe = createStripeTexture('#ff5c96', '#ffffff');
  private readonly swirl = createSwirlTexture(['#ff3f92', '#ffffff']);
  private readonly checker = createCheckerTexture(CANDY_SIGNS.startFlags.squares);

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'candy-signs';

    for (const spec of CANDY_SIGNS.signposts) this.addSignpost(path, spec);
    this.addStartFlags(path);
    this.addFlyingClouds(path);

    scene.add(this.root);
  }

  /** Mastro listrado com setas coloridas e pirulito no topo. */
  private addSignpost(path: CircuitPath, spec: SignpostSpec): void {
    const config = CANDY_SIGNS.signpost;
    const index = path.indexAtFraction(spec.at);
    const sample = path.samples[index];
    const lateral = spec.side * (sample.halfWidth + spec.offsetFromEdge);

    const group = new Group();
    group.name = 'signpost';

    const post = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0,
      ...(this.stripe ? { map: this.stripe } : { color: 0xff7fb5 }),
    });
    const lollipop = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0,
      side: DoubleSide,
      emissive: 0xffd6e8,
      emissiveIntensity: 0.12,
      ...(this.swirl ? { map: this.swirl } : { color: 0xff4f9a }),
    });

    const mast = new Mesh(
      new CylinderGeometry(config.postRadius, config.postRadius * 1.15, config.postHeight, 14),
      post,
    );
    mast.position.y = config.postHeight / 2;
    mast.castShadow = true;
    group.add(mast);

    // Pirulito no topo: disco de espiral de pé, virado para quem chega (-Z).
    const disc = new Mesh(
      new CylinderGeometry(config.topRadius, config.topRadius, 0.2, 20),
      lollipop,
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.y = config.postHeight + config.topRadius * 0.7;
    disc.castShadow = true;
    group.add(disc);

    for (const board of config.boards) {
      const material = new MeshStandardMaterial({
        color: board.color,
        roughness: 0.16,
        metalness: 0,
        emissive: board.color,
        emissiveIntensity: 0.1,
      });

      // A seta é uma prancha com uma ponta cônica na direção para onde aponta.
      const plank = new Mesh(
        new RoundedBoxGeometry(config.boardWidth, config.boardHeight, config.boardDepth, 1, 0.08),
        material,
      );
      plank.position.set(board.dir * config.boardWidth * 0.45, board.y, 0);
      plank.castShadow = true;
      group.add(plank);

      const tip = new Mesh(new ConeGeometry(config.boardHeight * 0.75, 0.62, 3), material);
      tip.rotation.z = board.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      tip.position.set(board.dir * (config.boardWidth * 0.95), board.y, 0);
      tip.castShadow = true;
      group.add(tip);

      // Um confeito no meio da prancha, no lugar do ícone da referência.
      const icon = new Mesh(
        new SphereGeometry(config.boardHeight * 0.26, 10, 8),
        new MeshStandardMaterial({
          color: board.icon,
          roughness: 0.15,
          metalness: 0,
          emissive: board.icon,
          emissiveIntensity: 0.25,
        }),
      );
      icon.scale.z = 0.5;
      icon.position.set(board.dir * config.boardWidth * 0.45, board.y, -config.boardDepth);
      group.add(icon);
    }

    this.addGumdropBase(group, 1.1);

    path.pointAt(index, lateral, 0, _point);
    group.position.copy(_point);
    // Um palmo enterrado: o chão sob a base é irregular e a barra do mastro não
    // pode aparecer boiando de nenhum ângulo.
    group.position.y -= 0.12;
    group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.root.add(group);
  }

  /** Bandeiras quadriculadas ladeando a largada, com estrela no topo. */
  private addStartFlags(path: CircuitPath): void {
    const config = CANDY_SIGNS.startFlags;

    const pole = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0,
      ...(this.stripe ? { map: this.stripe } : { color: 0xff7fb5 }),
    });
    const flag = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0,
      side: DoubleSide,
      ...(this.checker ? { map: this.checker } : {}),
    });
    const star = new MeshStandardMaterial({
      color: config.starColor,
      roughness: 0.18,
      metalness: 0,
      emissive: config.starColor,
      emissiveIntensity: 0.3,
    });

    for (const at of config.at) {
      const index = path.indexAtFraction(at);
      const sample = path.samples[index];

      for (const side of [1, -1]) {
        const group = new Group();
        group.name = 'start-flag';

        const mast = new Mesh(
          new CylinderGeometry(config.poleRadius, config.poleRadius, config.poleHeight, 12),
          pole,
        );
        mast.position.y = config.poleHeight / 2;
        mast.castShadow = true;
        group.add(mast);

        // A bandeira sai para FORA da pista, e vira para -Z porque o plano
        // nasce olhando para +Z e quem larga está do outro lado.
        const cloth = new Mesh(new PlaneGeometry(config.flagWidth, config.flagHeight), flag);
        cloth.rotation.y = Math.PI;
        cloth.position.set(
          side * config.flagWidth * 0.5,
          config.poleHeight - config.flagHeight * 0.65,
          0,
        );
        cloth.castShadow = true;
        group.add(cloth);

        const tip = new Mesh(new SphereGeometry(config.starRadius, 12, 9), star);
        tip.position.y = config.poleHeight + config.starRadius * 0.6;
        tip.castShadow = true;
        group.add(tip);

        this.addGumdropBase(group, 0.9);

        const lateral = side * (sample.halfWidth + config.offsetFromEdge);
        path.pointAt(index, lateral, 0, _point);
        group.position.copy(_point);
        group.position.y -= 0.1;
        group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
        this.root.add(group);
      }
    }
  }

  /** Gumdrops em volta do pé, como na referência. */
  private addGumdropBase(group: Group, radius: number): void {
    const pastels = CIRCUIT.colors.pastels;

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + this.random();
      const size = 0.26 + this.random() * 0.2;
      const drop = new Mesh(
        new SphereGeometry(size, 10, 8),
        new MeshStandardMaterial({
          color: pastels[i % pastels.length],
          roughness: 0.15,
          metalness: 0,
          emissive: pastels[i % pastels.length],
          emissiveIntensity: 0.1,
        }),
      );
      drop.scale.y = 0.8;
      // Meio enterrados: gumdrop apoiado exatamente no chão parece adesivo.
      drop.position.set(Math.cos(angle) * radius, size * 0.55, Math.sin(angle) * radius);
      drop.castShadow = true;
      group.add(drop);
    }
  }

  /**
   * Nuvens de rosto feliz com arco-íris, flutuando pelo mapa.
   *
   * São céu por projeto — a auditoria de contato com o chão tem uma dispensa
   * nomeada para elas. Ficam abaixo das nuvens de marshmallow do horizonte,
   * que vivem entre 90 e 190 m, para não se confundirem com o fundo.
   */
  private addFlyingClouds(path: CircuitPath): void {
    const config = CANDY_SIGNS.flyingClouds;

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

    const body = new MeshStandardMaterial({
      color: config.body,
      roughness: 0.55,
      metalness: 0,
      emissive: config.body,
      emissiveIntensity: 0.14,
    });
    const ink = new MeshStandardMaterial({ color: config.ink, roughness: 0.4, metalness: 0 });
    const cheek = new MeshStandardMaterial({
      color: config.cheek,
      roughness: 0.3,
      metalness: 0,
      emissive: config.cheek,
      emissiveIntensity: 0.22,
    });

    for (let i = 0; i < config.count; i++) {
      const group = new Group();
      group.name = 'flying-cloud';

      const scale = config.minScale + this.random() * (config.maxScale - config.minScale);

      // Corpo: quatro bolhas amontoadas. Uma esfera sozinha parece um balão.
      for (const puff of [
        { x: 0, y: 0, r: 1.0 },
        { x: -1.15, y: -0.22, r: 0.72 },
        { x: 1.2, y: -0.18, r: 0.68 },
        { x: -0.2, y: 0.62, r: 0.62 },
      ]) {
        const blob = new Mesh(new SphereGeometry(puff.r, 14, 11), body);
        blob.position.set(puff.x, puff.y, 0);
        group.add(blob);
      }

      // Rosto virado para -Z, o lado de onde se olha.
      const faceZ = -0.95;
      for (const side of [1, -1]) {
        const eye = new Mesh(new SphereGeometry(0.15, 10, 8), ink);
        eye.scale.z = 0.4;
        eye.position.set(side * 0.34, 0.12, faceZ);
        group.add(eye);

        const blush = new Mesh(new SphereGeometry(0.12, 10, 8), cheek);
        blush.scale.z = 0.35;
        blush.position.set(side * 0.62, -0.12, faceZ * 0.95);
        group.add(blush);
      }

      // Sorriso: meio toro com a abertura para cima. Toro vive no plano XY, já
      // encarando -Z, então não precisa girar fora do próprio eixo.
      const mouth = new Mesh(new TorusGeometry(0.17, 0.05, 6, 14, Math.PI), ink);
      mouth.rotation.z = Math.PI;
      mouth.position.set(0, -0.18, faceZ);
      group.add(mouth);

      // Arco-íris saindo por trás, de fora para dentro.
      for (let band = 0; band < config.rainbow.length; band++) {
        const arc = new Mesh(
          new TorusGeometry(
            2.6 - band * (config.rainbowTube * 1.05),
            config.rainbowTube,
            6,
            26,
            Math.PI * 0.9,
          ),
          new MeshStandardMaterial({
            color: config.rainbow[band],
            roughness: 0.25,
            metalness: 0,
            emissive: config.rainbow[band],
            emissiveIntensity: 0.22,
          }),
        );
        arc.position.set(1.1, -0.5, 0.35);
        arc.rotation.z = -0.55;
        group.add(arc);
      }

      group.scale.setScalar(scale);
      group.position.set(
        minX - config.spread + this.random() * (maxX - minX + config.spread * 2),
        config.minHeight + this.random() * (config.maxHeight - config.minHeight),
        minZ - config.spread + this.random() * (maxZ - minZ + config.spread * 2),
      );
      group.rotation.y = (this.random() - 0.5) * 0.8;
      this.root.add(group);
    }
  }
}
