import {
  type BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  BoxGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  type Texture,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CASTLE, type CastleTower } from '../config/castle';
import { CIRCUIT } from '../config/circuit';
import { TRACK } from '../config/track';
import { createRandom } from '../core/mathUtils';
import { addCandyCoat } from '../fx/candyCoat';
import {
  createSignTexture,
  createStripeTexture,
  createSwirlTexture,
} from '../fx/proceduralTextures';
import type { CircuitPath } from './circuitPath';

/** Onde o castelo está no mundo: origem na boca do túnel, eixos horizontais. */
export interface CastleFrame {
  readonly origin: Vector3;
  /** X local: esquerda da pista. */
  readonly left: Vector3;
  /** Z local: sentido de corrida. */
  readonly forward: Vector3;
  readonly heading: number;
  readonly entryIndex: number;
  readonly exitIndex: number;
}

/**
 * O referencial do castelo.
 *
 * O eixo do túnel segue a CORDA entre a amostra da entrada e a da saída, e não
 * a tangente na entrada. Numa reta quase perfeita a diferença é pequena, mas a
 * tangente na boca, projetada por 30 metros, errava a saída por mais de um
 * metro — o bastante para a barreira de bala atravessar a parede do túnel.
 */
export function castleFrame(path: CircuitPath): CastleFrame {
  const entryIndex = path.indexAtFraction(CASTLE.at);
  const metersPerSample = path.totalLength / path.count;
  const exitIndex =
    (entryIndex + Math.round(CASTLE.tunnel.length / metersPerSample)) % path.count;
  const entry = path.samples[entryIndex].position;
  const exit = path.samples[exitIndex].position;

  const forward = new Vector3(exit.x - entry.x, 0, exit.z - entry.z).normalize();
  // Esquerda = cima x frente. Bate com o `left` das amostras da pista.
  const left = new Vector3(forward.z, 0, -forward.x);

  return {
    origin: entry.clone(),
    left,
    forward,
    heading: Math.atan2(forward.x, forward.z),
    entryIndex,
    exitIndex,
  };
}

/**
 * Pergunta "este ponto do mundo cai dentro do castelo?".
 * O cenário espalhado por sorteio usa isto para não nascer atravessando parede.
 */
export function castleFootprint(
  path: CircuitPath,
): (x: number, z: number, margin?: number) => boolean {
  const frame = castleFrame(path);
  return (x, z, margin = 0) => {
    const dx = x - frame.origin.x;
    const dz = z - frame.origin.z;
    const localX = dx * frame.left.x + dz * frame.left.z;
    const localZ = dx * frame.forward.x + dz * frame.forward.z;
    return CASTLE.footprint.some(
      (area) =>
        localX >= area.minX - margin &&
        localX <= area.maxX + margin &&
        localZ >= area.minZ - margin &&
        localZ <= area.maxZ + margin,
    );
  };
}

type MaterialName =
  | 'ginger'
  | 'icing'
  | 'pink'
  | 'hotPink'
  | 'blue'
  | 'orange'
  | 'peach'
  | 'mint'
  | 'yellow'
  | 'lavender'
  | 'window'
  | 'gold'
  | 'hoopPink'
  | 'hoopWhite'
  | 'caneRoof'
  | 'caneBody'
  | 'caneTrim'
  | 'swirl';

/**
 * Como uma peça animada se mexe. O movimento é feito no shader de vértice, em
 * volta de um pivô gravado em cada vértice — assim as peças animadas continuam
 * fundidas numa malha só, sem uma chamada de desenho por pirulito ou sino.
 *
 * - `spin`: gira em torno do eixo Z local (discos de pirulito, de frente).
 * - `swing`: balança em torno do eixo X local, pendurado no pivô (sinos).
 * - `wave`: ondula para os lados, mais quanto mais longe do mastro (bandeiras).
 * - `float`: gira em torno do eixo Y e sobe e desce (corações).
 */
type MotionMode = 'spin' | 'swing' | 'wave' | 'float';

interface Motion {
  readonly mode: MotionMode;
  /** Pivô no referencial local do castelo, já com a peça posicionada. */
  readonly pivot: Vector3;
  readonly phase: number;
}

interface Bucket {
  readonly material: MaterialName;
  readonly castShadow: boolean;
  readonly motion: MotionMode | null;
  readonly geometries: BufferGeometry[];
}

/** Cores de marshmallow e goma, na ordem em que se alternam. */
const CANDY_COLORS: readonly MaterialName[] = [
  'pink',
  'icing',
  'blue',
  'yellow',
  'lavender',
  'mint',
  'peach',
];

const GUMDROP_COLORS: readonly MaterialName[] = [
  'hotPink',
  'blue',
  'yellow',
  'mint',
  'lavender',
  'orange',
];

/**
 * O "Doce Castelo" da referência, com a pista passando por um túnel embaixo.
 *
 * São centenas de peças (torres, glacê escorrido, gomas, janelas, jujubas da
 * escada). Como Mesh separadas, isso seriam centenas de chamadas de desenho —
 * nesta máquina, o suficiente para derrubar o quadro. Então cada peça é
 * posicionada direto na geometria e, no fim, tudo que usa o mesmo material é
 * FUNDIDO numa malha só. O castelo inteiro vira umas duas dúzias de malhas.
 *
 * Os detalhes miúdos (gotas de glacê, gomas, sinos) ficam numa malha à parte
 * que não projeta sombra: a sombra deles não se nota, e o custo sim.
 *
 * Nada aqui tem colisão. A barreira de bala da pista continua valendo dentro
 * do túnel, e o túnel é largo o bastante para ficar atrás dela.
 */
export class CandyCastle {
  readonly root = new Group();
  readonly frame: CastleFrame;

  private readonly buckets = new Map<string, Bucket>();
  private readonly materials: Record<MaterialName, MeshStandardMaterial>;
  private readonly random = createRandom(CIRCUIT.randomSeed + 2024);
  /** Meia-largura interna do túnel, da linha de centro até a parede. */
  private readonly inner: number;
  private readonly path: CircuitPath;
  /** Relógio compartilhado por todos os shaders animados do castelo. */
  private readonly time = { value: 0 };
  /** Variantes animadas dos materiais, uma por par material + movimento. */
  private readonly animated = new Map<string, MeshStandardMaterial>();
  private readonly signs: Mesh[] = [];

  constructor(path: CircuitPath) {
    this.path = path;
    this.root.name = 'candy-castle';
    this.frame = castleFrame(path);
    this.materials = createMaterials();
    const sample = path.samples[this.frame.entryIndex];
    this.inner = sample.halfWidth + TRACK.barriers.offsetFromEdge + CASTLE.tunnel.wallMargin;

    this.buildTunnel();
    this.buildPortal(true);
    this.buildPortal(false);
    this.buildBells();
    this.buildBody();
    for (const tower of CASTLE.towers) this.buildTower(tower);
    this.buildStairs();
    this.buildGarden();
    this.buildHearts();
    this.flush();
    this.buildSigns();

    this.root.position.copy(this.frame.origin);
    this.root.rotation.y = this.frame.heading;
  }

  /**
   * Avança as animações. Só visual: é chamado no laço de render, com o
   * deltaTime do quadro, como partículas e plateia.
   */
  update(dt: number): void {
    const a = CASTLE.animation;
    const t = (this.time.value += dt);

    for (let i = 0; i < this.signs.length; i++) {
      const scale = 1 + Math.sin(t * a.signPulseSpeed + i * 1.7) * a.signPulse;
      this.signs[i].scale.set(scale, scale, 1);
    }

    const gold = this.animated.get('gold:swing');
    if (gold) {
      const glow = 0.5 + 0.5 * Math.sin(t * a.bellGlowSpeed);
      gold.emissiveIntensity = a.bellGlowMin + (a.bellGlowMax - a.bellGlowMin) * glow;
    }
  }

  // ---------------------------------------------------------------- túnel ---

  /**
   * O bloco que cobre a pista: um retângulo com o arco recortado por baixo,
   * extrudado ao longo do túnel. Por dentro, anéis alternados rosa e branco
   * forram o arco — são as listras de bala da foto.
   */
  private buildTunnel(): void {
    const t = CASTLE.tunnel;
    const W = this.inner;
    const Wo = W + t.shellThickness;
    const bottom = -CASTLE.buriedDepth;

    const block = new Shape([
      new Vector2(-Wo, bottom),
      new Vector2(-Wo, CASTLE.terraceHeight),
      new Vector2(Wo, CASTLE.terraceHeight),
      new Vector2(Wo, bottom),
      ...archPoints(W, t.wallHeight, t.archRise, bottom, 28),
    ]);
    this.add(
      'ginger',
      new ExtrudeGeometry(block, { depth: t.length, bevelEnabled: false, curveSegments: 1 }),
      null,
    );

    // Anel = faixa em forma de arco, com 22 cm de espessura, sem fundo.
    const liner = 0.22;
    const hoop = new Shape([
      ...archPoints(W, t.wallHeight, t.archRise, bottom, 28),
      ...archPoints(W - liner, t.wallHeight, t.archRise - liner, bottom, 28).reverse(),
    ]);
    const count = Math.max(1, Math.round(t.length / t.hoopLength));
    const hoopLength = t.length / count;
    for (let i = 0; i < count; i++) {
      this.add(
        i % 2 === 0 ? 'hoopPink' : 'hoopWhite',
        new ExtrudeGeometry(hoop, { depth: hoopLength, bevelEnabled: false, curveSegments: 1 }),
        at(0, 0, i * hoopLength),
        false,
      );
    }
  }

  /**
   * Moldura da boca do túnel: marshmallows coloridos seguindo o arco, um friso
   * de bengala por fora e um de glacê por dentro. A da entrada ganha a placa.
   */
  private buildPortal(isFront: boolean): void {
    const t = CASTLE.tunnel;
    const W = this.inner;
    const depth = t.portalDepth;
    const zCenter = isFront ? -depth / 2 : t.length + depth / 2;

    // Linha média do anel, amostrada por comprimento de arco para os
    // marshmallows saírem todos do mesmo tamanho.
    const grow = t.shellThickness / 2 + 0.1;
    const middle = archPoints(W + grow, t.wallHeight, t.archRise + grow, -0.8, 64);
    const lengths = [0];
    for (let i = 1; i < middle.length; i++) {
      lengths.push(lengths[i - 1] + middle[i].distanceTo(middle[i - 1]));
    }
    const total = lengths[lengths.length - 1];
    const pointAt = (distance: number, out: Vector2): Vector2 => {
      const s = Math.min(total, Math.max(0, distance));
      let k = 1;
      while (k < lengths.length - 1 && lengths[k] < s) k++;
      const span = lengths[k] - lengths[k - 1] || 1;
      return out.copy(middle[k - 1]).lerp(middle[k], (s - lengths[k - 1]) / span);
    };

    const piece = total / t.marshmallowCount;
    const p = new Vector2();
    const a = new Vector2();
    const b = new Vector2();
    for (let i = 0; i < t.marshmallowCount; i++) {
      const s = (i + 0.5) * piece;
      pointAt(s, p);
      pointAt(s - 0.4, a);
      pointAt(s + 0.4, b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      this.add(
        CANDY_COLORS[i % CANDY_COLORS.length],
        new RoundedBoxGeometry(piece - 0.28, t.shellThickness + 0.5, depth, 1, 0.6),
        at(p.x, p.y, zCenter, 0, 0, angle),
      );
    }

    const outerGrow = t.shellThickness + 0.45;
    const outer = archPoints(W + outerGrow, t.wallHeight, t.archRise + outerGrow, -0.8, 40);
    this.add(
      'caneTrim',
      new TubeGeometry(
        new CatmullRomCurve3(outer.map((q) => new Vector3(q.x, q.y, zCenter))),
        70,
        0.38,
        8,
        false,
      ),
      null,
    );

    const lip = isFront ? -depth - 0.04 : t.length + depth + 0.04;
    const innerTrim = archPoints(W - 0.05, t.wallHeight, t.archRise - 0.05, -0.8, 40);
    this.add(
      'icing',
      new TubeGeometry(
        new CatmullRomCurve3(innerTrim.map((q) => new Vector3(q.x, q.y, lip))),
        60,
        0.28,
        6,
        false,
      ),
      null,
    );

    if (!isFront) return;

    // Placa "KART TRACK" apoiada no alto do arco, com dois pirulitos.
    const ringTop = t.wallHeight + t.archRise + t.shellThickness + 0.35;
    this.add(
      'hotPink',
      new RoundedBoxGeometry(10.4, 3.0, 0.8, 1, 0.35),
      at(0, ringTop + 1.5, zCenter),
    );
    for (const x of [-6.6, 6.6]) {
      this.addLollipop(x, ringTop - 0.8, zCenter, 4.6, 1.25);
    }
  }

  /** Sinos dourados pendurados no teto, em duas fileiras. */
  private buildBells(): void {
    const t = CASTLE.tunnel;
    const liner = 0.22;
    const halfWidth = this.inner - liner;
    const rise = t.archRise - liner;

    const bellProfile = [
      new Vector2(0.62, 0),
      new Vector2(0.6, 0.08),
      new Vector2(0.46, 0.3),
      new Vector2(0.38, 0.62),
      new Vector2(0.24, 0.9),
      new Vector2(0, 1.0),
    ];

    let index = 0;
    for (let z = 2.5; z < t.length - 1; z += t.bellSpacing) {
      for (const x of [-4.2, 4.2]) {
        const ceiling =
          t.wallHeight + rise * Math.sqrt(Math.max(0, 1 - (x / halfWidth) ** 2));
        const bellTop = ceiling - 1.1;
        // Cordão, sino e badalo balançam juntos, pendurados no teto.
        const motion: Motion = {
          mode: 'swing',
          pivot: new Vector3(x, ceiling, z),
          phase: index++ * CASTLE.animation.bellPhaseStep,
        };
        this.add('gold', new CylinderGeometry(0.04, 0.04, 1.3, 5), at(x, ceiling - 0.5, z), false, motion);
        this.add('gold', new LatheGeometry(bellProfile, 12), at(x, bellTop - 1.0, z), false, motion);
        this.add('gold', new SphereGeometry(0.17, 8, 6), at(x, bellTop - 1.08, z), false, motion);
      }
    }
  }

  // ---------------------------------------------------------------- corpo ---

  /** Terraço, ala direita, segundo andar e a torre central com o frontão. */
  private buildBody(): void {
    const t = CASTLE.tunnel;
    const Wo = this.inner + t.shellThickness;
    const bottom = -CASTLE.buriedDepth;
    const top = CASTLE.terraceHeight;

    // Volumes principais. Nenhum desce abaixo de 12 m sobre a pista: o teto
    // interno do túnel chega a 12 m, e qualquer bloco mais baixo que isso
    // apareceria atravessando o arco por dentro.
    this.box('ginger', Wo, 44, bottom, 13, 0, 28);
    this.box('ginger', -Wo - 5, -Wo, bottom, 12, 0, 22);
    this.box('ginger', -12, 38, 12.6, 23, 5, 28);
    this.box('ginger', 2, 18, 22.6, 31, 8, 22);

    // Glacê escorrendo e gomas no alto de cada fachada.
    this.icingEdge(-Wo, Wo, top, 0);
    this.gumdropRow(-Wo + 1, Wo - 1, top + 0.35, 1.3, 1.9, 0.72);
    this.icingEdge(Wo, 44, 13, 0);
    this.gumdropRow(Wo + 1.2, 43, 13.35, 1.1, 1.9, 0.72);
    this.icingEdge(-Wo - 5, -Wo, 12, 0);
    this.gumdropRow(-Wo - 4.2, -Wo - 0.8, 12.35, 1.1, 1.7, 0.62);
    this.icingEdge(-12, 38, 23, 5);
    this.gumdropRow(-11, 37, 23.35, 6.1, 1.8, 0.66);
    this.icingEdge(2, 18, 31, 8);

    // Botões de confeito na fachada do terraço, entre as janelas.
    for (let x = Wo + 2; x < 43; x += 1.55) {
      this.add(
        GUMDROP_COLORS[Math.floor(x) % GUMDROP_COLORS.length],
        new SphereGeometry(0.28, 8, 6),
        at(x, 10.6, -0.05, 0, 0, 0, 1, 1, 0.45),
        false,
      );
    }

    // Janelas em arco com moldura rosa.
    for (const x of [20, 26, 32, 38]) this.addWindow(x, 5.2, 0, 2.2, 3.6);
    for (const x of [-9, -3, 25, 31, 36]) this.addWindow(x, 16.4, 5, 2.0, 3.2);
    for (const x of [5.2, 14.8]) this.addWindow(x, 23.6, 8, 1.6, 2.4);
    // Porta principal, sob o letreiro.
    this.addWindow(10, top, 5, 4.0, 5.6);

    // Frontão triangular da torre central, com telhado rosa e beiral de glacê.
    const gableWidth = 8.6;
    const gableHeight = 6.5;
    const gable = new Shape([
      new Vector2(-gableWidth, 0),
      new Vector2(gableWidth, 0),
      new Vector2(0, gableHeight),
    ]);
    this.add(
      'ginger',
      new ExtrudeGeometry(gable, { depth: 14.8, bevelEnabled: false, curveSegments: 1 }),
      at(10, 31, 7.6),
    );
    const slope = Math.atan2(gableHeight, gableWidth);
    const slabLength = Math.hypot(gableWidth, gableHeight) + 0.8;
    for (const side of [-1, 1]) {
      const cx = 10 + side * (gableWidth / 2);
      const cy = 31 + gableHeight / 2;
      // Normal para fora da água do telhado.
      const nx = side * Math.sin(slope);
      const ny = Math.cos(slope);
      this.add(
        'hotPink',
        new BoxGeometry(slabLength, 0.7, 16),
        at(cx + nx * 0.35, cy + ny * 0.35, 15, 0, 0, -side * slope),
      );
      this.add(
        'icing',
        new RoundedBoxGeometry(slabLength, 0.8, 0.8, 1, 0.3),
        at(cx + nx * 0.5, cy + ny * 0.5, 7.1, 0, 0, -side * slope),
      );
    }
    this.add('hotPink', new SphereGeometry(0.7, 12, 8), at(10, 31 + gableHeight + 0.7, 7.4));
    const rosette = new CylinderGeometry(1.3, 1.3, 0.3, 24);
    rosette.rotateX(Math.PI / 2);
    this.add('swirl', rosette, at(10, 33.4, 7.45), false, {
      mode: 'spin',
      pivot: new Vector3(10, 33.4, 7.45),
      phase: 0,
    });
    // Plaquinha rosa atrás do letreiro "DOCE CASTELO".
    this.add('hotPink', new RoundedBoxGeometry(10.8, 3.2, 0.7, 1, 0.3), at(10, 28.4, 7.6));
  }

  /** Uma torre: corpo, faixas, beiral de glacê, janela e telhado. */
  private buildTower(tower: CastleTower): void {
    const t = CASTLE.tunnel;
    const Wo = this.inner + t.shellThickness;
    const { x, z, radius: r, height: h } = tower;
    // Torre sobre o túnel nasce no alto do bloco, nunca atravessando o arco.
    const base = Math.abs(x) - r < Wo ? CASTLE.terraceHeight - 0.5 : -CASTLE.buriedDepth;

    const body: MaterialName = tower.body === 'cane' ? 'caneBody' : tower.body;
    this.add(body, new CylinderGeometry(r, r * 1.05, h - base, 18), at(x, (h + base) / 2, z));

    // Faixas: uma rosa no meio da parte visível, uma de glacê no alto.
    const band = new TorusGeometry(r + 0.06, 0.22, 5, 18);
    band.rotateX(Math.PI / 2);
    this.add(tower.body === 'pink' ? 'icing' : 'pink', band.clone(), at(x, h - 5.5, z));
    this.add('icing', band, at(x, h - 0.9, z));

    this.add('icing', new CylinderGeometry(r + 0.45, r + 0.35, 0.9, 18), at(x, h + 0.2, z));
    for (let i = 0; i < 11; i++) {
      const angle = (i / 11) * Math.PI * 2 + this.random() * 0.2;
      const length = 0.5 + this.random() * 1.1;
      this.add(
        'icing',
        new SphereGeometry(1, 6, 4),
        at(
          x + Math.cos(angle) * (r + 0.32),
          h - 0.1 - length / 2,
          z + Math.sin(angle) * (r + 0.32),
          0,
          0,
          0,
          0.3,
          length / 2,
          0.3,
        ),
        false,
      );
    }

    this.addWindow(x, h - 4.4, z - r + 0.12, Math.min(1.5, r * 0.55), 2.4);

    const roofBase = h + 0.6;
    let roofTop = roofBase;
    if (tower.roof === 'cane' || tower.roof === 'blue') {
      const coneRadius = r + 0.55;
      const coneHeight = coneRadius * (tower.roof === 'cane' ? 3.3 : 2.6);
      this.add(
        tower.roof === 'cane' ? 'caneRoof' : 'blue',
        new ConeGeometry(coneRadius, coneHeight, 18),
        at(x, roofBase + coneHeight / 2, z),
      );
      roofTop = roofBase + coneHeight;
      this.add('icing', new SphereGeometry(0.36, 10, 8), at(x, roofTop, z));
      if (tower.roof === 'blue') {
        // Glacê escorrendo pela borda do cone azul, como na foto.
        for (let i = 0; i < 9; i++) {
          const angle = (i / 9) * Math.PI * 2;
          const length = 0.6 + this.random() * 0.9;
          this.add(
            'icing',
            new SphereGeometry(1, 6, 4),
            at(
              x + Math.cos(angle) * (coneRadius * 0.86),
              roofBase + 0.5,
              z + Math.sin(angle) * (coneRadius * 0.86),
              0,
              0,
              0,
              0.34,
              length / 2,
              0.34,
            ),
            false,
          );
        }
      }
    } else if (tower.roof === 'dome') {
      // Cúpula de açúcar em forma de cebola, com confeitos em volta.
      const s = r + 0.6;
      const profile = [
        [0.72, 0],
        [1.0, 0.32],
        [1.06, 0.62],
        [0.92, 0.98],
        [0.58, 1.32],
        [0.22, 1.62],
        [0, 1.78],
      ].map(([px, py]) => new Vector2(px * s, py * s));
      this.add('blue', new LatheGeometry(profile, 18), at(x, roofBase - 0.2, z));
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        this.add(
          GUMDROP_COLORS[i % GUMDROP_COLORS.length],
          new SphereGeometry(0.26, 6, 4),
          at(
            x + Math.cos(angle) * s * 1.05,
            roofBase - 0.2 + s * 0.62,
            z + Math.sin(angle) * s * 1.05,
          ),
          false,
        );
      }
      const cap = new SphereGeometry(s * 0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      this.add('icing', cap, at(x, roofBase - 0.2 + s * 1.12, z, 0, 0, 0, 1, 0.55, 1));
      roofTop = roofBase - 0.2 + s * 1.78;
      this.add('hotPink', new SphereGeometry(0.42, 10, 8), at(x, roofTop + 0.3, z));
      roofTop += 0.6;
    } else {
      const gum = new SphereGeometry(r + 0.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      this.add('hotPink', gum, at(x, roofBase - 0.3, z, 0, 0, 0, 1, 1.1, 1));
      roofTop = roofBase - 0.3 + (r + 0.4) * 1.1;
      this.add('icing', new SphereGeometry(0.4, 10, 8), at(x, roofTop + 0.2, z));
      roofTop += 0.5;
    }

    // Bandeirinha rosa no topo.
    this.add('icing', new CylinderGeometry(0.07, 0.07, 2.6, 6), at(x, roofTop + 1.2, z));
    // Segmentada na largura para conseguir ondular; o pivô é o mastro.
    this.add('hotPink', new BoxGeometry(1.5, 0.9, 0.08, 8, 1, 1), at(x + 0.78, roofTop + 2.0, z), false, {
      mode: 'wave',
      pivot: new Vector3(x, roofTop + 2.0, z),
      phase: x * 0.9 + z * 0.4,
    });
  }

  /**
   * Escada de jujubas descendo em diagonal do terraço até o gramado, com
   * postes de bengala e corrimão de glacê.
   */
  private buildStairs(): void {
    const top = new Vector2(19.5, -0.9);
    const foot = new Vector2(40, -20);
    const steps = 16;
    const width = 5;
    const landing = 13;
    const bottom = -CASTLE.buriedDepth;

    const run = foot.clone().sub(top).negate();
    const length = run.length();
    run.normalize();
    // Rotação que leva o X local do degrau para a direção da subida.
    const angle = Math.atan2(-run.y, run.x);
    const across = new Vector2(Math.sin(angle), Math.cos(angle));
    const stepRun = length / steps;
    const rise = landing / steps;

    for (let i = 0; i < steps; i++) {
      const u = stepRun * (i + 0.5);
      const cx = foot.x + run.x * u;
      const cz = foot.y + run.y * u;
      const stepTop = rise * (i + 1);
      this.add(
        'ginger',
        new BoxGeometry(stepRun + 0.05, stepTop - bottom, width),
        at(cx, (stepTop + bottom) / 2, cz, 0, angle, 0),
      );
      for (let k = 0; k < 4; k++) {
        const w = (k - 1.5) * 1.18;
        this.add(
          CANDY_COLORS[(i * 3 + k) % CANDY_COLORS.length] === 'icing'
            ? 'hotPink'
            : CANDY_COLORS[(i * 3 + k) % CANDY_COLORS.length],
          new SphereGeometry(1, 8, 5),
          at(cx + across.x * w, stepTop + 0.12, cz + across.y * w, 0, angle, 0, 0.36, 0.3, 0.56),
          false,
        );
      }
    }

    // Postes de bengala nas duas bordas, a cada quatro degraus.
    const postTops: Vector3[][] = [[], []];
    for (let i = 0; i <= steps; i += 4) {
      const u = stepRun * Math.min(i, steps - 0.5);
      const stepTop = rise * Math.min(i + 1, steps);
      for (let side = 0; side < 2; side++) {
        const w = (side === 0 ? -1 : 1) * (width / 2 - 0.25);
        const px = foot.x + run.x * u + across.x * w;
        const pz = foot.y + run.y * u + across.y * w;
        const postHeight = i === 0 ? 4.2 : 2.3;
        this.add(
          'caneBody',
          new CylinderGeometry(0.18, 0.18, postHeight, 10),
          at(px, stepTop + postHeight / 2, pz),
        );
        if (i === 0) {
          const hook = new TorusGeometry(0.55, 0.18, 6, 12, Math.PI);
          this.add('caneBody', hook, at(px - run.x * 0.55, stepTop + postHeight, pz - run.y * 0.55, 0, angle + Math.PI, 0));
        }
        postTops[side].push(new Vector3(px, stepTop + Math.min(postHeight, 2.3), pz));
      }
    }
    for (const rail of postTops) {
      this.add('icing', new TubeGeometry(new CatmullRomCurve3(rail), 40, 0.13, 6, false), null, false);
    }
  }

  /** Pirulitos, cristais de bala, gomas e arvorezinhas em volta da base. */
  private buildGarden(): void {
    const lollipops: [number, number, number, number][] = [
      [-18.5, -3.5, 5.6, 1.5],
      [17.2, -4.2, 4.6, 1.3],
      [24, -12.5, 5.2, 1.4],
      [46.5, -6, 6.2, 1.7],
      [-22, 12, 5.0, 1.3],
    ];
    for (const [x, z, height, radius] of lollipops) {
      this.addLollipop(x, this.groundAt(x, z) - 0.4, z, height, radius);
    }
    // Pirulitos também no alto do terraço e do segundo andar.
    this.addLollipop(33, 13, 2.5, 3.4, 1.1);
    this.addLollipop(-10.5, 23, 7.2, 3.2, 1.0);
    this.addLollipop(36.5, 23, 7.5, 3.2, 1.0);

    const crystals: [number, number][] = [
      [19.5, -1.8],
      [-20.5, -6.5],
      [28, -17.5],
      [45, -12],
      [35.5, -3],
      [-17.5, -2.5],
    ];
    const crystalColors: MaterialName[] = ['lavender', 'blue', 'pink', 'mint', 'yellow'];
    for (let c = 0; c < crystals.length; c++) {
      const [cx, cz] = crystals[c];
      const ground = this.groundAt(cx, cz);
      for (let i = 0; i < 4; i++) {
        const size = 0.55 + this.random() * 0.6;
        this.add(
          crystalColors[(c + i) % crystalColors.length],
          new OctahedronGeometry(1, 0),
          at(
            cx + (this.random() - 0.5) * 2.2,
            ground + size * 0.9,
            cz + (this.random() - 0.5) * 2.2,
            (this.random() - 0.5) * 0.5,
            this.random() * Math.PI,
            (this.random() - 0.5) * 0.5,
            size * 0.6,
            size * 1.5,
            size * 0.6,
          ),
          false,
        );
      }
    }

    // Gomas no chão, em grupinhos.
    for (let g = 0; g < 16; g++) {
      const onRight = g % 4 === 0;
      const gx = onRight ? -15.5 - this.random() * 6 : 16 + this.random() * 30;
      const gz = onRight ? -2 - this.random() * 8 : -1.5 - this.random() * 3.5;
      const ground = this.groundAt(gx, gz);
      const size = 0.45 + this.random() * 0.4;
      this.add(
        GUMDROP_COLORS[g % GUMDROP_COLORS.length],
        new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        at(gx, ground - 0.05, gz, 0, 0, 0, size, size * 1.1, size),
        false,
      );
    }

    // Arvorezinhas de bala redondas, como as da beira da pista na foto.
    const trees: [number, number][] = [
      [47, 1.5],
      [-23, 3],
      [-21.5, 20],
      [47, 18],
      [47.5, 30],
    ];
    for (let i = 0; i < trees.length; i++) {
      const [tx, tz] = trees[i];
      const ground = this.groundAt(tx, tz);
      this.add('icing', new CylinderGeometry(0.2, 0.26, 2.4, 8), at(tx, ground + 1.2, tz));
      this.add(
        GUMDROP_COLORS[(i * 2 + 1) % GUMDROP_COLORS.length],
        new SphereGeometry(1.5, 14, 10),
        at(tx, ground + 3.3, tz),
      );
    }
  }

  /**
   * Corações de goma flutuando diante da fachada, girando e subindo e
   * descendo devagar. Ficam bem acima da pista: a câmera nunca chega lá.
   */
  private buildHearts(): void {
    const h = CASTLE.hearts;
    const shape = new Shape();
    shape.moveTo(0, -1);
    shape.bezierCurveTo(-0.3, -0.7, -1.1, -0.2, -1.1, 0.35);
    shape.bezierCurveTo(-1.1, 0.95, -0.35, 1.15, 0, 0.6);
    shape.bezierCurveTo(0.35, 1.15, 1.1, 0.95, 1.1, 0.35);
    shape.bezierCurveTo(1.1, -0.2, 0.3, -0.7, 0, -1);
    const template = new ExtrudeGeometry(shape, {
      depth: h.thickness,
      bevelEnabled: true,
      bevelThickness: 0.16,
      bevelSize: 0.14,
      bevelSegments: 2,
      curveSegments: 10,
    });
    template.translate(0, 0, -h.thickness / 2);

    const colors: readonly MaterialName[] = ['hotPink', 'pink', 'lavender'];
    for (let i = 0; i < h.count; i++) {
      const u = h.count > 1 ? i / (h.count - 1) : 0.5;
      const x = h.fromX + (h.toX - h.fromX) * u;
      const y = h.baseHeight + (i % 3) * h.heightStep;
      const z = h.z - (i % 2) * h.zStagger;
      this.add(colors[i % colors.length], template.clone(), at(x, y, z, 0, 0, 0, h.size), false, {
        mode: 'float',
        pivot: new Vector3(x, y, z),
        phase: i * 1.3,
      });
    }
    template.dispose();
  }

  /** Os dois letreiros. Ficam fora da fusão: cada um tem a própria textura. */
  private buildSigns(): void {
    const t = CASTLE.tunnel;
    const ringTop = t.wallHeight + t.archRise + t.shellThickness + 0.35;
    this.addSign('KART TRACK', 9.6, 0, ringTop + 1.5, -t.portalDepth / 2 - 0.42);
    this.addSign('DOCE CASTELO', 10.2, 10, 28.4, 7.22);
  }

  // ---------------------------------------------------------------- peças ---

  private box(
    material: MaterialName,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
  ): void {
    this.add(
      material,
      new BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
      at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    );
  }

  /** Beiral de glacê no topo de uma fachada virada para -Z, com gotas. */
  private icingEdge(x0: number, x1: number, yTop: number, zFace: number): void {
    this.add(
      'icing',
      new RoundedBoxGeometry(x1 - x0 + 0.5, 0.8, 1.1, 1, 0.3),
      at((x0 + x1) / 2, yTop - 0.05, zFace + 0.3),
    );
    for (let x = x0 + 0.55; x < x1 - 0.3; x += 1.05) {
      const length = 0.5 + this.random() * 1.6;
      this.add(
        'icing',
        new SphereGeometry(1, 6, 4),
        at(x, yTop - 0.35 - length / 2 + 0.25, zFace - 0.14, 0, 0, 0, 0.3, length / 2, 0.26),
        false,
      );
    }
  }

  /** Fileira de gomas coloridas em cima de um beiral. */
  private gumdropRow(
    x0: number,
    x1: number,
    y: number,
    z: number,
    spacing: number,
    radius: number,
  ): void {
    const half = new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    let index = 0;
    for (let x = x0; x <= x1; x += spacing) {
      this.add(
        GUMDROP_COLORS[index++ % GUMDROP_COLORS.length],
        half.clone(),
        at(x, y, z, 0, 0, 0, radius, radius * 1.15, radius),
        false,
      );
    }
    half.dispose();
  }

  /** Janela (ou porta) em arco, virada para -Z, com moldura rosa e peitoril. */
  private addWindow(x: number, yBottom: number, zFace: number, width: number, height: number): void {
    const half = width / 2;
    const straight = Math.max(0.2, height - half);
    const opening = new Shape();
    opening.moveTo(-half, 0);
    opening.lineTo(half, 0);
    opening.lineTo(half, straight);
    opening.absarc(0, straight, half, 0, Math.PI, false);
    opening.lineTo(-half, 0);
    this.add(
      'window',
      new ExtrudeGeometry(opening, { depth: 0.3, bevelEnabled: false, curveSegments: 8 }),
      at(x, yBottom, zFace - 0.2),
      false,
    );

    const frame = Math.max(0.16, width * 0.09);
    this.add(
      'pink',
      new TorusGeometry(half + frame * 0.6, frame, 5, 10, Math.PI),
      at(x, yBottom + straight, zFace - 0.22),
      false,
    );
    for (const side of [-1, 1]) {
      this.add(
        'pink',
        new BoxGeometry(frame * 2, straight, frame * 2),
        at(x + side * (half + frame * 0.6), yBottom + straight / 2, zFace - 0.22),
        false,
      );
    }
    this.add(
      'icing',
      new RoundedBoxGeometry(width + frame * 4, 0.36, 0.8, 1, 0.15),
      at(x, yBottom - 0.1, zFace - 0.3),
      false,
    );
  }

  /** Pirulito: palito de glacê e disco em espiral virado para a pista. */
  private addLollipop(x: number, yBase: number, z: number, height: number, radius: number): void {
    this.add('icing', new CylinderGeometry(0.12, 0.12, height, 8), at(x, yBase + height / 2, z));
    const disc = new CylinderGeometry(radius, radius, 0.32, 24);
    disc.rotateX(Math.PI / 2);
    const center = new Vector3(x, yBase + height + radius * 0.8, z);
    // Fase pela posição, e não sorteada: sortear aqui mudaria a sequência do
    // gerador e, com ela, todo o glacê escorrido das torres.
    this.add('swirl', disc, at(center.x, center.y, center.z), false, {
      mode: 'spin',
      pivot: center,
      phase: x * 0.7 + z * 0.3,
    });
  }

  private addSign(text: string, width: number, x: number, y: number, z: number): void {
    const texture = createSignTexture(text, CASTLE.colors.signBackground);
    const material = new MeshStandardMaterial({
      color: texture ? 0xffffff : CASTLE.colors.hotPink,
      roughness: 0.4,
      metalness: 0,
      ...(texture
        ? { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.28 }
        : {}),
    });
    const sign = new Mesh(new PlaneGeometry(width, width / 4), material);
    // O plano nasce virado para +Z; a fachada olha para -Z.
    sign.rotation.y = Math.PI;
    sign.position.set(x, y, z);
    sign.receiveShadow = true;
    this.signs.push(sign);
    this.root.add(sign);
  }

  /** Altura do terreno num ponto do referencial local, relativa à origem. */
  private groundAt(localX: number, localZ: number): number {
    const f = this.frame;
    const wx = f.origin.x + f.left.x * localX + f.forward.x * localZ;
    const wz = f.origin.z + f.left.z * localX + f.forward.z * localZ;
    return this.path.terrainHeight(wx, wz) - f.origin.y;
  }

  private add(
    material: MaterialName,
    geometry: BufferGeometry,
    matrix: Matrix4 | null,
    castShadow = true,
    _motion: Motion | null = null,
  ): void {
    if (matrix) geometry.applyMatrix4(matrix);
    const key = castShadow ? material : `${material}:detalhe`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, castShadow, motion: null, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(geometry);
  }

  /**
   * Funde cada balde numa malha só.
   *
   * `mergeGeometries` exige que todas sejam indexadas ou todas não: a extrusão
   * e o octaedro saem sem índice, o resto com. Quando o balde mistura as duas,
   * todas viram não indexadas antes da fusão.
   */
  private flush(): void {
    for (const bucket of this.buckets.values()) {
      const list = bucket.geometries;
      const mixed = list.some((g) => g.index) && list.some((g) => !g.index);
      const ready = mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
      for (const g of ready) {
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
      }

      const merged = mergeGeometries(ready, false);
      const material = this.materials[bucket.material];
      if (merged) {
        this.addMesh(new Mesh(merged, material), bucket.castShadow);
      } else {
        // Não deveria acontecer; se acontecer, o castelo sai mais caro, mas inteiro.
        for (const g of ready) this.addMesh(new Mesh(g, material), bucket.castShadow);
        continue;
      }
      for (const g of new Set([...list, ...ready])) g.dispose();
    }
    this.buckets.clear();
  }

  private addMesh(mesh: Mesh, castShadow: boolean): void {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }
}

/**
 * Contorno do arco do túnel: sobe a parede reta da direita (+X), faz a
 * meia-elipse por cima e desce a parede da esquerda.
 */
function archPoints(
  halfWidth: number,
  wallHeight: number,
  rise: number,
  bottom: number,
  segments: number,
): Vector2[] {
  const points = [new Vector2(halfWidth, bottom)];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI;
    points.push(new Vector2(Math.cos(angle) * halfWidth, wallHeight + Math.sin(angle) * rise));
  }
  points.push(new Vector2(-halfWidth, bottom));
  return points;
}

const _euler = new Euler();
const _quaternion = new Quaternion();

/** Matriz de posição, rotação (graus em radianos, ordem XYZ) e escala. */
function at(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): Matrix4 {
  _quaternion.setFromEuler(_euler.set(rx, ry, rz));
  return new Matrix4().compose(new Vector3(x, y, z), _quaternion, new Vector3(sx, sy, sz));
}

function createMaterials(): Record<MaterialName, MeshStandardMaterial> {
  const c = CASTLE.colors;
  const candy = (
    color: number,
    roughness: number,
    emissive: number,
    top: number,
    bottom: number,
    rim: number,
    map?: Texture | null,
  ) =>
    addCandyCoat(
      new MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
        ...(emissive > 0 ? { emissive: color, emissiveIntensity: emissive } : {}),
        ...(map ? { map } : {}),
      }),
      top,
      bottom,
      rim,
    );

  const stripes = (repeatX: number, repeatY: number): Texture | null => {
    const texture = createStripeTexture(c.caneStripe, '#ffffff');
    texture?.repeat.set(repeatX, repeatY);
    return texture;
  };

  const swirl = createSwirlTexture();
  const plain = (color: number, roughness: number, emissive: number) =>
    new MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...(emissive > 0 ? { emissive: color, emissiveIntensity: emissive } : {}),
    });

  return {
    ginger: candy(c.gingerbread, 0.55, 0.03, 0xffe2c0, 0xc97a44, 0.05),
    icing: candy(c.icing, 0.28, 0.07, 0xffffff, 0xffe6f0, 0.08),
    pink: candy(c.pink, 0.22, 0.06, 0xffc9df, 0xff7fb0, 0.09),
    hotPink: candy(c.hotPink, 0.2, 0.07, 0xffaacd, 0xff3f86, 0.09),
    blue: candy(c.blue, 0.3, 0.06, 0xc9f5ff, 0x53bdeb, 0.1),
    orange: candy(c.orange, 0.3, 0.05, 0xffe18b, 0xff8c28, 0.06),
    peach: candy(c.peach, 0.34, 0.05, 0xffe8cc, 0xffa86a, 0.06),
    mint: plain(c.mint, 0.16, 0.1),
    yellow: plain(c.yellow, 0.16, 0.1),
    lavender: plain(c.lavender, 0.16, 0.1),
    window: plain(c.window, 0.6, 0),
    gold: plain(c.gold, 0.25, 0.35),
    hoopPink: plain(c.hoopPink, 0.24, 0.2),
    hoopWhite: plain(c.hoopWhite, 0.24, 0.16),
    caneRoof: candy(0xffffff, 0.2, 0.04, 0xffffff, 0xffd6e0, 0.06, stripes(4, 2)),
    caneBody: candy(0xffffff, 0.2, 0.04, 0xffffff, 0xffd6e0, 0.06, stripes(3, 5)),
    caneTrim: plain(0xffffff, 0.2, 0.08),
    swirl: new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.14,
      metalness: 0,
      emissive: 0xffffff,
      emissiveIntensity: 0.08,
      ...(swirl ? { map: swirl } : {}),
    }),
  };
}
