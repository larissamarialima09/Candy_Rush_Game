import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CANDY_FACTORY } from '../config/candyFactory';
import { CIRCUIT } from '../config/circuit';
import { createRandom } from '../core/mathUtils';
import { addCandyCoat } from '../fx/candyCoat';
import { createCottonCandyMaterial, createCottonPeakGeometry } from '../fx/cottonCandy';
import { createStripeTexture } from '../fx/proceduralTextures';
import type { CircuitPath } from './circuitPath';

const _matrix = new Matrix4();
const _quaternion = new Quaternion();
const _scale = new Vector3();

/** Onde a máquina ficou no mundo, e como ela está girada. */
export interface FactoryPlacement {
  /** Centro do tablado, na altura do eixo da pista. */
  readonly base: Vector3;
  /** Rumo da pista naquele ponto. */
  readonly heading: number;
  /** Giro do grupo, já resolvido para o +Z local apontar para a pista. */
  readonly angle: number;
}

/**
 * Resolve, uma vez, onde a máquina de doces cai no mundo.
 *
 * O giro merece explicação. Depois de `group.rotation.y = h`, o +Z local
 * aponta para `(sin h, cos h)` e o +X local para a ESQUERDA da pista. A máquina
 * é construída de frente para a pista (ver `config/candyFactory.ts`), então o
 * +Z local dela tem que cair sobre a direção que vai do tablado até o asfalto,
 * que é o oposto do lado em que ela foi posta. Resolvendo, isso dá
 * `h - side * PI/2`.
 *
 * Fazer essa conta AQUI, e não à mão em cada peça, é o que evita o erro que a
 * arquibancada tinha: com o lado escrito na unha, o mesmo número acertava de um
 * lado da pista e deixava a construção de costas do outro.
 */
export function candyFactoryPlacement(path: CircuitPath): FactoryPlacement {
  const index = path.indexAtFraction(CANDY_FACTORY.at);
  const sample = path.samples[index];
  const lateral = CANDY_FACTORY.side * (sample.halfWidth + CANDY_FACTORY.offsetFromEdge);
  const base = sample.position.clone().addScaledVector(sample.left, lateral);
  const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

  return {
    base,
    heading,
    angle: heading - CANDY_FACTORY.side * (Math.PI / 2),
  };
}

/** Leva um ponto do referencial local da máquina para o mundo. */
function toWorld(placement: FactoryPlacement, localX: number, localZ: number): Vector3 {
  const cosine = Math.cos(placement.angle);
  const sine = Math.sin(placement.angle);
  return new Vector3(
    placement.base.x + localX * cosine + localZ * sine,
    placement.base.y,
    placement.base.z - localX * sine + localZ * cosine,
  );
}

/**
 * Predicado "este ponto está em cima da máquina ou das montanhas?".
 *
 * Mesmo papel do `castleFootprint`: o cenário sorteado (árvores, colinas,
 * pirulitos) pergunta antes de plantar. Sem isso nasce árvore dentro do
 * algodão-doce, que é o tipo de coisa que denuncia o mundo como gerado.
 */
export function candyFactoryFootprint(
  path: CircuitPath,
): (x: number, z: number, margin?: number) => boolean {
  const placement = candyFactoryPlacement(path);
  const cosine = Math.cos(placement.angle);
  const sine = Math.sin(placement.angle);
  const area = CANDY_FACTORY.footprint;

  return (x: number, z: number, margin = 0): boolean => {
    const dx = x - placement.base.x;
    const dz = z - placement.base.z;
    // Projeção do ponto nos eixos locais: o retângulo do footprint está
    // escrito no referencial da máquina, então é o PONTO que vem até ele.
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;

    return (
      localX >= area.minX - margin &&
      localX <= area.maxX + margin &&
      localZ >= area.minZ - margin &&
      localZ <= area.maxZ + margin
    );
  };
}

/** Uma bala a instanciar: onde, de que tamanho e de que cor. */
interface Gumball {
  position: Vector3;
  radius: number;
  color: Color;
}

/**
 * A máquina de doces da referência, à beira da pista, com as montanhas de
 * algodão-doce fechando o fundo.
 *
 * A silhueta é o que faz a peça ser reconhecida de longe, e ela é simples:
 * base creme troncocônica, GLOBO DE VIDRO cheio de balas ocupando quase metade
 * da altura, tampa rosa abaulada e uma bengala de doce saindo dela. Tudo o
 * mais — canos listrados, potes, parapeito, a calha despejando balas na
 * direção da pista — é o que enche os olhos quando o kart passa perto.
 *
 * As balas dentro do globo, nos potes, na calha e derramadas no chão são
 * InstancedMesh com cor por instância: são quase trezentas esferas, e cada uma
 * como malha própria seria trezentas chamadas de desenho por quadro. Numa
 * máquina de 3,7 GB isso é a diferença entre rodar e engasgar.
 */
export class CandyFactory {
  readonly root = new Group();

  private readonly random = createRandom(CIRCUIT.randomSeed + 909);
  private readonly stripeTexture = createStripeTexture('#ff5c96', '#ffffff');
  private readonly palette = CIRCUIT.colors.pastels.map((hex) => new Color(hex));

  private readonly cream: MeshStandardMaterial;
  private readonly pink: MeshStandardMaterial;
  private readonly hotPink: MeshStandardMaterial;
  private readonly frosting: MeshStandardMaterial;
  private readonly gold: MeshStandardMaterial;
  private readonly stripe: MeshStandardMaterial;
  private readonly glass: MeshPhysicalMaterial;
  private readonly gumballMaterial: MeshStandardMaterial;
  private readonly capMaterials: Record<string, MeshStandardMaterial>;

  constructor(path: CircuitPath) {
    this.root.name = 'candy-factory';
    const colors = CANDY_FACTORY.colors;

    this.cream = addCandyCoat(
      new MeshStandardMaterial({ color: colors.cream, roughness: 0.3 }),
      0xffffff,
      0xffd7bb,
      0.05,
    );
    this.pink = addCandyCoat(
      new MeshStandardMaterial({
        color: colors.pink,
        roughness: 0.16,
        emissive: colors.pink,
        emissiveIntensity: 0.05,
      }),
      0xffc2dd,
      0xff2f87,
      0.075,
    );
    this.hotPink = addCandyCoat(
      new MeshStandardMaterial({
        color: colors.hotPink,
        roughness: 0.14,
        emissive: colors.hotPink,
        emissiveIntensity: 0.08,
      }),
      0xffaad0,
      0xff277d,
      0.09,
    );
    this.frosting = addCandyCoat(
      new MeshStandardMaterial({
        color: colors.frosting,
        roughness: 0.2,
        emissive: 0xffd8ec,
        emissiveIntensity: 0.05,
      }),
      0xffffff,
      0xffd6ea,
      0.045,
    );
    this.gold = addCandyCoat(
      new MeshStandardMaterial({
        color: colors.gold,
        roughness: 0.18,
        emissive: colors.gold,
        emissiveIntensity: 0.06,
      }),
      0xffe18b,
      0xff8c28,
      0.05,
    );
    this.stripe = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.16,
      ...(this.stripeTexture ? { map: this.stripeTexture } : {}),
    });

    // Vidro SEM `transmission`. Refração de verdade obriga o Three a alocar um
    // alvo de render extra da cena inteira, todo quadro — caro demais aqui, e
    // num globo cheio de balas opacas quase não se vê a diferença. Opacidade
    // com verniz dá o mesmo vidro de bala por uma fração do custo.
    this.glass = addCandyCoat(
      new MeshPhysicalMaterial({
        color: colors.glass,
        roughness: 0.02,
        metalness: 0,
        transparent: true,
        opacity: 0.34,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        depthWrite: false,
      }) as unknown as MeshStandardMaterial,
      0xffffff,
      0xaeeeff,
      0.24,
    ) as unknown as MeshPhysicalMaterial;

    // Cor branca de propósito: quem pinta cada bala é a cor por instância.
    this.gumballMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0,
    });

    this.capMaterials = {
      lavender: new MeshStandardMaterial({ color: colors.lavender, roughness: 0.18 }),
      mint: new MeshStandardMaterial({ color: colors.mint, roughness: 0.2 }),
      blue: new MeshStandardMaterial({ color: colors.blue, roughness: 0.18 }),
    };

    const placement = candyFactoryPlacement(path);

    // O tablado: a origem local é o PISO, e fundação e convés descem a partir
    // dela. Enterrar um pedaço garante que a máquina encoste no chão mesmo
    // onde o terreno desce sob a lateral do tablado.
    const machine = new Group();
    machine.position.copy(placement.base);
    machine.position.y =
      path.terrainHeight(placement.base.x, placement.base.z) +
      CANDY_FACTORY.deck.height -
      CANDY_FACTORY.buriedDepth;
    machine.rotation.y = placement.angle;

    this.buildDeck(machine);
    this.buildBody(machine);
    this.buildChute(machine);
    this.buildPipes(machine);
    this.buildJars(machine);
    this.root.add(machine);

    this.buildMountains(path, placement);
  }

  /** Tablado de bala com parapeito, onde a máquina se apoia. */
  private buildDeck(group: Group): void {
    const deck = CANDY_FACTORY.deck;

    const foundation = this.add(
      group,
      new RoundedBoxGeometry(deck.width + 1.2, 1.5, deck.depth + 1.2, 1, 0.55),
      this.hotPink,
    );
    foundation.position.y = -deck.height + 0.75;

    const floor = this.add(
      group,
      new RoundedBoxGeometry(deck.width, 1.0, deck.depth, 1, 0.4),
      this.pink,
    );
    floor.position.y = -0.5;

    const lip = this.add(
      group,
      new RoundedBoxGeometry(deck.width + 1.0, 0.4, deck.depth + 1.0, 1, 0.34),
      this.frosting,
    );
    lip.position.y = -0.05;

    // Parapeito nos fundos e nas duas laterais. A frente (+Z) fica aberta:
    // é por ali que a calha desce para a pista.
    const halfWidth = deck.width / 2;
    const halfDepth = deck.depth / 2;
    this.addRailing(group, -halfWidth + 0.6, halfWidth - 0.6, -halfDepth + 0.5, 'x');
    this.addRailing(group, -halfDepth + 0.5, halfDepth - 0.5, -halfWidth + 0.6, 'z');
    this.addRailing(group, -halfDepth + 0.5, halfDepth - 0.5, halfWidth - 0.6, 'z');
  }

  /**
   * Um trecho de parapeito: barra contínua, postes e uma bolinha de confeito
   * em cima de cada poste. `axis` diz ao longo de qual eixo local ele corre.
   */
  private addRailing(
    group: Group,
    from: number,
    to: number,
    offset: number,
    axis: 'x' | 'z',
  ): void {
    const span = Math.abs(to - from);
    const bar = this.add(
      group,
      axis === 'x'
        ? new RoundedBoxGeometry(span, 0.2, 0.18, 1, 0.09)
        : new RoundedBoxGeometry(0.18, 0.2, span, 1, 0.09),
      this.hotPink,
    );
    const center = (from + to) / 2;
    bar.position.set(axis === 'x' ? center : offset, 1.25, axis === 'x' ? offset : center);

    const posts = CANDY_FACTORY.deck.posts;
    for (let i = 0; i < posts; i++) {
      const along = from + (span * i) / (posts - 1);
      const x = axis === 'x' ? along : offset;
      const z = axis === 'x' ? offset : along;

      const post = this.add(group, new CylinderGeometry(0.1, 0.1, 1.2, 8), this.frosting);
      post.position.set(x, 0.6, z);

      const bead = this.add(group, new SphereGeometry(0.19, 10, 7), this.gold);
      bead.position.set(x, 1.45, z);
    }
  }

  /**
   * O corpo: troncocônico creme, globo de vidro cheio de balas, tampa rosa e a
   * bengala de doce saindo do topo.
   */
  private buildBody(group: Group): void {
    const machine = CANDY_FACTORY.machine;
    const bodyCenter = machine.bodyHeight / 2 + 0.55;

    const collar = this.add(
      group,
      new CylinderGeometry(machine.bodyBottomRadius + 0.1, machine.bodyBottomRadius + 0.35, 0.7, 24),
      this.hotPink,
    );
    collar.position.y = 0.35;

    const body = this.add(
      group,
      new CylinderGeometry(
        machine.bodyTopRadius,
        machine.bodyBottomRadius,
        machine.bodyHeight,
        24,
      ),
      this.cream,
    );
    body.position.y = bodyCenter;

    const band = this.add(
      group,
      new CylinderGeometry(machine.bodyTopRadius + 0.12, machine.bodyTopRadius + 0.26, 0.42, 24),
      this.pink,
    );
    band.position.y = bodyCenter + machine.bodyHeight / 2 - 0.3;

    // Prato de glacê onde o globo se encaixa: esconde a emenda entre o cilindro
    // e a esfera, que de perto entregaria as duas formas separadas.
    const shoulder = this.add(
      group,
      new SphereGeometry(machine.bodyTopRadius + 0.3, 24, 10),
      this.frosting,
    );
    shoulder.scale.set(1, 0.3, 1);
    shoulder.position.y = bodyCenter + machine.bodyHeight / 2 + 0.1;

    // As balas entram ANTES do vidro na lista de filhos, mas o que decide a
    // ordem de desenho é o `depthWrite: false` do vidro: sem ele, o globo
    // apagaria do buffer de profundidade tudo que está atrás e a máquina
    // apareceria vazia conforme a câmera girasse.
    const balls: Gumball[] = [];
    const inner = machine.bowlRadius - 0.55;
    for (let i = 0; i < machine.bowlGumballs; i++) {
      // Raiz cúbica do sorteio: sem ela as balas se amontoam no centro, porque
      // o volume de uma casca cresce com o cubo do raio.
      const radius = inner * Math.cbrt(this.random());
      const theta = this.random() * Math.PI * 2;
      const phi = Math.acos(2 * this.random() - 1);
      balls.push({
        position: new Vector3(
          Math.sin(phi) * Math.cos(theta) * radius,
          machine.bowlCenterY + Math.cos(phi) * radius,
          Math.sin(phi) * Math.sin(theta) * radius,
        ),
        radius: 0.3 + this.random() * 0.1,
        color: this.palette[i % this.palette.length],
      });
    }
    this.addGumballs(group, balls, false);

    const bowl = this.add(group, new SphereGeometry(machine.bowlRadius, 30, 20), this.glass);
    bowl.position.y = machine.bowlCenterY;
    bowl.castShadow = false;

    const neck = this.add(
      group,
      new CylinderGeometry(machine.lidRadius - 0.15, machine.lidRadius + 0.05, 0.5, 24),
      this.pink,
    );
    neck.position.y = machine.lidY - 0.45;

    const goldBand = this.add(
      group,
      new CylinderGeometry(machine.lidRadius, machine.lidRadius + 0.06, 0.3, 24),
      this.gold,
    );
    goldBand.position.y = machine.lidY - 0.1;

    const lid = this.add(
      group,
      new SphereGeometry(machine.lidRadius, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      this.hotPink,
    );
    lid.scale.set(1, 0.62, 1);
    lid.position.y = machine.lidY;

    const lidStripe = this.add(
      group,
      new CylinderGeometry(machine.lidRadius * 0.72, machine.lidRadius * 0.82, 0.12, 24),
      this.frosting,
    );
    lidStripe.position.y = machine.lidY + 0.6;

    // Bengala saindo da tampa. O gancho é meio toro no plano XY: ele nasce em
    // (raio, 0), passa pelo alto e termina em (-raio, 0) — então basta pôr o
    // centro do toro a um raio de distância do topo do mastro para os dois se
    // emendarem sem costura aparente.
    const caneBase = machine.lidY + 1.0;
    const caneTop = caneBase + 4.2;
    const post = this.add(group, new CylinderGeometry(0.34, 0.34, 4.2, 14), this.stripe);
    post.position.set(0, caneBase + 2.1, 0);

    const hookRadius = 1.3;
    const hook = this.add(
      group,
      new TorusGeometry(hookRadius, 0.34, 10, 22, Math.PI),
      this.stripe,
    );
    hook.position.set(-hookRadius, caneTop, 0);

    const caneTip = this.add(group, new CylinderGeometry(0.34, 0.34, 1.1, 14), this.stripe);
    caneTip.position.set(-hookRadius * 2, caneTop - 0.55, 0);

    // A bengala grande da foto, plantada no convés ao lado da máquina.
    const bigPost = this.add(group, new CylinderGeometry(0.55, 0.55, 11, 16), this.stripe);
    bigPost.position.set(-8.6, 5.5, 1.6);

    const bigHookRadius = 1.9;
    const bigHook = this.add(
      group,
      new TorusGeometry(bigHookRadius, 0.55, 12, 26, Math.PI),
      this.stripe,
    );
    bigHook.position.set(-8.6 + bigHookRadius, 11, 1.6);

    const bigTip = this.add(group, new CylinderGeometry(0.55, 0.55, 1.5, 16), this.stripe);
    bigTip.position.set(-8.6 + bigHookRadius * 2, 10.25, 1.6);
  }

  /**
   * A calha: despeja balas da barriga da máquina na direção da pista.
   *
   * Tudo vive num subgrupo inclinado. Girar o grupo e escrever as peças em
   * coordenadas retas é muito mais fácil de acertar do que girar cada trilho,
   * cada travessa e cada bala uma por uma — e foi justamente esse tipo de
   * rotação peça a peça que tinha deixado a calha torta.
   */
  private buildChute(group: Group): void {
    const chute = CANDY_FACTORY.chute;

    const mouth = this.add(group, new TorusGeometry(0.85, 0.22, 10, 20), this.gold);
    mouth.position.set(chute.offsetX, 4.6, 3.1);

    const nozzle = this.add(group, new CylinderGeometry(0.48, 0.66, 1.3, 16), this.hotPink);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(chute.offsetX, 4.6, 3.7);

    const ramp = new Group();
    ramp.position.set(chute.offsetX, chute.centerY, chute.centerZ);
    // Giro positivo em X derruba a ponta +Z: é o que faz a calha descer na
    // direção da pista em vez de subir.
    ramp.rotation.x = chute.tilt;
    group.add(ramp);

    const half = chute.length / 2;
    const bed = this.add(
      ramp,
      new RoundedBoxGeometry(chute.width, 0.24, chute.length, 1, 0.1),
      this.frosting,
    );
    bed.position.y = 0;

    for (const side of [-1, 1]) {
      const rail = this.add(
        ramp,
        new RoundedBoxGeometry(0.3, 0.62, chute.length, 1, 0.14),
        this.hotPink,
      );
      rail.position.set((side * (chute.width + 0.3)) / 2, 0.22, 0);
    }

    // Travessas: é o gradeado da foto, e é o que dá leitura de movimento às
    // balas que descem — sem elas a calha é uma rampa lisa e as balas parecem
    // paradas no ar.
    const slats = 11;
    for (let i = 0; i < slats; i++) {
      const slat = this.add(
        ramp,
        new RoundedBoxGeometry(chute.width - 0.15, 0.12, 0.2, 1, 0.05),
        this.pink,
      );
      slat.position.set(0, 0.16, -half + 0.4 + (i * (chute.length - 0.8)) / (slats - 1));
    }

    for (const z of [-half, half]) {
      for (const side of [-1, 1]) {
        const leg = this.add(ramp, new CylinderGeometry(0.12, 0.14, 1.5, 8), this.gold);
        leg.position.set((side * chute.width) / 2, -0.85, z * 0.85);
      }
    }

    const rolling: Gumball[] = [];
    for (let i = 0; i < chute.rolling; i++) {
      rolling.push({
        position: new Vector3(
          (this.random() - 0.5) * (chute.width - 0.9),
          0.45,
          -half + this.random() * chute.length,
        ),
        radius: 0.32 + this.random() * 0.1,
        color: this.palette[i % this.palette.length],
      });
    }
    this.addGumballs(ramp, rolling, true);

    // O monte derramado ao pé da calha, já no chão.
    const spilled: Gumball[] = [];
    const footZ = chute.centerZ + Math.cos(chute.tilt) * half;
    for (let i = 0; i < chute.spilled; i++) {
      const spread = this.random();
      spilled.push({
        position: new Vector3(
          chute.offsetX + (this.random() - 0.5) * (5.5 + spread * 3),
          -0.35 + this.random() * 0.25,
          footZ + spread * 5.5,
        ),
        radius: 0.34 + this.random() * 0.14,
        color: this.palette[i % this.palette.length],
      });
    }
    this.addGumballs(group, spilled, true);
  }

  /** Os canos listrados com anéis dourados, do lado oposto ao da calha. */
  private buildPipes(group: Group): void {
    const horizontal = this.add(group, new CylinderGeometry(0.42, 0.42, 7.2, 14), this.stripe);
    horizontal.rotation.z = Math.PI / 2;
    horizontal.position.set(6.4, 4.4, -2.2);

    for (const x of [3.0, 9.8]) {
      const collar = this.add(group, new TorusGeometry(0.5, 0.14, 8, 18), this.gold);
      collar.rotation.y = Math.PI / 2;
      collar.position.set(x, 4.4, -2.2);
    }

    const elbow = this.add(group, new TorusGeometry(1.1, 0.42, 10, 20, Math.PI / 2), this.stripe);
    elbow.rotation.set(0, Math.PI / 2, Math.PI);
    elbow.position.set(9.8, 4.4, -3.3);

    const riser = this.add(group, new CylinderGeometry(0.42, 0.42, 4.6, 14), this.stripe);
    riser.position.set(9.8, 2.1, -4.4);

    const cap = this.add(group, new CylinderGeometry(0.56, 0.56, 0.32, 16), this.gold);
    cap.position.set(9.8, 4.6, -4.4);

    // Cano de alimentação entrando na barriga da máquina, do lado esquerdo.
    const intake = this.add(group, new CylinderGeometry(0.3, 0.3, 4.4, 12), this.gold);
    intake.rotation.z = Math.PI / 2;
    intake.position.set(-5.4, 5.4, -0.6);
  }

  /** Potes de vidro cheios de balas, em cima do convés. */
  private buildJars(group: Group): void {
    for (let jarIndex = 0; jarIndex < CANDY_FACTORY.jars.length; jarIndex++) {
      const jar = CANDY_FACTORY.jars[jarIndex];
      const glass = this.add(
        group,
        new CylinderGeometry(jar.radius, jar.radius + 0.08, jar.height, 18),
        this.glass,
      );
      glass.castShadow = false;
      glass.position.set(jar.x, jar.height / 2 + 0.2, jar.z);

      const base = this.add(
        group,
        new CylinderGeometry(jar.radius + 0.12, jar.radius + 0.2, 0.26, 18),
        this.frosting,
      );
      base.position.set(jar.x, 0.23, jar.z);

      const lid = this.add(
        group,
        new CylinderGeometry(jar.radius + 0.1, jar.radius + 0.16, 0.28, 18),
        this.capMaterials[jar.cap] ?? this.frosting,
      );
      lid.position.set(jar.x, jar.height + 0.34, jar.z);

      const balls: Gumball[] = [];
      for (let i = 0; i < 18; i++) {
        const angle = this.random() * Math.PI * 2;
        const radius = this.random() * (jar.radius - 0.32);
        balls.push({
          position: new Vector3(
            jar.x + Math.cos(angle) * radius,
            0.6 + this.random() * (jar.height - 0.8),
            jar.z + Math.sin(angle) * radius,
          ),
          radius: 0.22 + this.random() * 0.06,
          // O índice tem que ser INTEIRO. Usar `jar.x` aqui (que vale -6.8)
          // dava um índice fracionário, `palette[...]` vinha `undefined` e o
          // `setColorAt` do Three estourava ao montar a cena.
          color: this.palette[(i + jarIndex * 2) % this.palette.length],
        });
      }
      this.addGumballs(group, balls, false);
    }
  }

  /**
   * As montanhas de algodão-doce.
   *
   * Cada uma é um grupo PRÓPRIO no mundo, não um filho da máquina, por um
   * motivo prático: elas ficam a dezenas de metros do tablado, e o chão lá não
   * está na mesma altura. Penduradas no grupo da máquina, herdariam a altura
   * dele e ficariam boiando ou enterradas. Cada uma pergunta ao terreno onde
   * ela mesma está.
   */
  private buildMountains(path: CircuitPath, placement: FactoryPlacement): void {
    for (const spec of CANDY_FACTORY.mountains) {
      const center = toWorld(placement, spec.x, spec.z);
      const ground = path.terrainHeight(center.x, center.z);

      const material = createCottonCandyMaterial({
        base: spec.base,
        swirl: spec.swirl,
        rim: spec.rim,
        puffMeters: spec.puffMeters,
        fiberMeters: 0.9,
        // O relevo acompanha o tamanho: um empurrão de um metro que dá volume
        // num pico de trinta metros deforma um de doze até descolar do chão.
        relief: spec.height * 0.032,
        fuzz: 0.9,
        rimStrength: 0.55,
      });

      const group = new Group();
      group.name = 'cotton-mountain';
      // Um tico enterrada: o deslocamento do shader mexe também nos vértices
      // da base, e sem essa folga o tufo abriria frestas contra a grama.
      group.position.set(center.x, ground - spec.height * 0.02, center.z);
      group.rotation.y = this.random() * Math.PI * 2;

      const geometry = createCottonPeakGeometry(spec.radius, spec.height);
      const peak = new Mesh(geometry, material);
      peak.castShadow = true;
      peak.receiveShadow = true;
      group.add(peak);

      // Tufos soltos no pé, para a montanha não terminar numa circunferência
      // perfeita contra o chão.
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + this.random();
        const puff = new Mesh(new SphereGeometry(1, 16, 12), material);
        const size = spec.radius * (0.22 + this.random() * 0.12);
        puff.position.set(
          Math.cos(angle) * spec.radius * 0.85,
          size * 0.55,
          Math.sin(angle) * spec.radius * 0.85,
        );
        puff.scale.set(size, size * 0.8, size);
        puff.castShadow = true;
        puff.receiveShadow = true;
        group.add(puff);
      }

      this.addMountainDots(group, geometry, spec.dots);
      this.root.add(group);
    }
  }

  /**
   * As balas coloridas cravadas no algodão-doce.
   *
   * As posições saem dos VÉRTICES da própria malha do pico, e não de uma conta
   * paralela de "onde deveria estar a superfície": qualquer fórmula repetida
   * aqui iria, mais cedo ou mais tarde, discordar do perfil e deixar as balas
   * boiando. Elas são puxadas um pouco para o eixo porque o shader empurra a
   * superfície para fora, e bala de doce fica CRAVADA no tufo.
   */
  private addMountainDots(group: Group, geometry: ReturnType<typeof createCottonPeakGeometry>, count: number): void {
    const positions = geometry.getAttribute('position');
    const balls: Gumball[] = [];

    for (let i = 0; i < count; i++) {
      const vertex = Math.floor(this.random() * positions.count);
      balls.push({
        position: new Vector3(
          positions.getX(vertex) * 0.9,
          positions.getY(vertex),
          positions.getZ(vertex) * 0.9,
        ),
        radius: 0.35 + this.random() * 0.3,
        color: this.palette[i % this.palette.length],
      });
    }

    this.addGumballs(group, balls, false);
  }

  /**
   * Desenha um punhado de balas como UMA InstancedMesh com cor por instância.
   *
   * A alternativa — uma malha por cor — obrigaria a repartir as balas em
   * baldes e a criar seis objetos onde um basta. `setColorAt` resolve isso: a
   * geometria e o material são um só, e cada instância carrega a própria cor.
   */
  private addGumballs(target: Group, balls: Gumball[], castShadow: boolean): void {
    if (balls.length === 0) return;

    const mesh = new InstancedMesh(new SphereGeometry(1, 10, 8), this.gumballMaterial, balls.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      _quaternion.identity();
      _scale.setScalar(ball.radius);
      _matrix.compose(ball.position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
      mesh.setColorAt(i, ball.color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    target.add(mesh);
  }

  /** Cria a malha, liga as sombras e pendura no grupo. Só para encurtar. */
  private add(
    group: Group,
    geometry: ConstructorParameters<typeof Mesh>[0],
    material: MeshStandardMaterial,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
}
