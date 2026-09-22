import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  type Scene,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CIRCUIT } from '../config/circuit';
import { DONUT_TUNNEL } from '../config/donutTunnel';
import { QUALITY } from '../config/quality';
import { TRACK } from '../config/track';
import { addCandyCoat } from '../fx/candyCoat';
import { createCottonCandyMaterial } from '../fx/cottonCandy';
import { createStripeTexture, createSwirlTexture } from '../fx/proceduralTextures';
import { createRandom } from '../core/mathUtils';
import { CandyCastle, castleFootprint } from './candyCastle';
import { CandyFactory, candyFactoryFootprint } from './candyFactory';
import type { CircuitPath, PathSample } from './circuitPath';

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const _axisY = new Vector3(0, 1, 0);
const _tilt = new Quaternion();

/** Uma instância a desenhar: posição, rumo, escala e rotação extra opcional. */
interface Placement {
  position: Vector3;
  headingY: number;
  scale: number;
  /** Rotação aplicada ANTES do rumo, para deitar cápsulas etc. */
  preRotation?: Quaternion;
}

interface InstanceOptions {
  color: number;
  roughness?: number;
  castShadow?: boolean;
  stripes?: boolean;
  /** Ignora a luz da cena. Usado pelas nuvens, que são fundo, não objeto. */
  unlit?: boolean;
  /** Brilho próprio, 0 a 1. Dá vida a doces e placas sem precisar de luz. */
  emissive?: number;
  /**
   * Material pronto, quando a cor e a rugosidade não bastam — é o caso do
   * algodão-doce, cuja aparência inteira vive num shader. Se vier, manda em
   * tudo o mais desta lista.
   */
  material?: MeshStandardMaterial;
  /**
   * Nome da malha. Não é enfeite: é por ele que o banco de provas e o
   * rasterizador do preview conseguem perguntar "esta peça existe mesmo e
   * chegou a ser pintada?". Peça sem nome vira "(sem nome)" no relatório, junto
   * com todas as outras, e some no meio do bolo.
   */
  name?: string;
}

/**
 * Tudo que fica ao redor do asfalto, no estilo "Kawaii Candy World": barreiras
 * de bala, postes-pirulito, placas, cones, arquibancada, sweet shop, árvores de
 * doce, colinas de gumdrop e nuvens de marshmallow.
 *
 * Não é enfeite gratuito. Um circuito em campo aberto sempre parece lento — a
 * sensação de velocidade vem do que passa PERTO da câmera. Por isso os objetos
 * baixos (cones, placas, barreiras) ficam deliberadamente rentes à pista.
 *
 * Nada aqui tem colisão. Você atravessa as barreiras; isso é Fase 4.
 */
/** Onde a arquibancada ficou, para a plateia sentar exatamente nela. */
export interface GrandstandAnchor {
  readonly position: Vector3;
  readonly heading: number;
  /**
   * Sinal do X LOCAL em que os degraus sobem, ou seja, para que lado fica o
   * "longe da pista" depois de o grupo já ter sido girado pelo rumo. NÃO é o
   * lado do mundo em que a arquibancada caiu: ver `awaySignFor`, que explica
   * por que a diferença entre as duas coisas importa.
   */
  readonly side: number;
}

export class CircuitScenery {
  readonly root = new Group();
  /** Preenchido ao construir a arquibancada. A plateia lê daqui. */
  grandstandAnchor: GrandstandAnchor = {
    position: new Vector3(),
    heading: 0,
    side: 1,
  };
  /** O Doce Castelo sobre a pista. O laço de render chama `castle.update`. */
  readonly castle: CandyCastle;
  private readonly random = createRandom(CIRCUIT.randomSeed);
  private readonly stripeTexture = createStripeTexture();
  /** Área ocupada pelo Doce Castelo: o cenário sorteado não nasce ali dentro. */
  private readonly inCastle: (x: number, z: number, margin?: number) => boolean;
  /** Idem para a máquina de doces e as montanhas de algodão-doce. */
  private readonly inFactory: (x: number, z: number, margin?: number) => boolean;

  constructor(path: CircuitPath, scene: Scene) {
    this.inCastle = castleFootprint(path);
    this.inFactory = candyFactoryFootprint(path);
    this.addCandyArenaFrame(path);
    this.addCandyBarriers(path);
    this.addLollipopPoles(path);
    this.addGrandstand(path);
    this.addArenaGrandstands(path);
    this.addSweetShop(path);
    this.root.add(new CandyFactory(path).root);
    this.addCupcakeBalloons(path);
    this.castle = new CandyCastle(path);
    this.root.add(this.castle.root);
    this.addDonutTunnel(path);
    this.addCandyTrees(path);
    this.addGumdropHills(path);
    this.addClouds(path);
    scene.add(this.root);
  }

  /** Moldura externa de balas, deixando o mapa com cara de arena de brinquedo. */
  private addCandyArenaFrame(path: CircuitPath): void {
    const bounds = boundsOf(path, 82);
    const palette = [...CIRCUIT.colors.pastels, 0xffffff, 0xffb9d2, 0xffe7a8];
    const buckets: Placement[][] = palette.map(() => []);
    const spacing = 4.4;
    let index = 0;

    const addBlock = (x: number, z: number, headingY: number) => {
      const colorIndex = index++ % palette.length;
      buckets[colorIndex].push({
        position: new Vector3(x, path.terrainHeight(x, z) + 0.55, z),
        headingY,
        scale: 1,
      });
    };

    for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
      addBlock(x, bounds.minZ, Math.PI / 2);
      addBlock(x, bounds.maxZ, Math.PI / 2);
    }
    for (let z = bounds.minZ; z <= bounds.maxZ; z += spacing) {
      addBlock(bounds.minX, z, 0);
      addBlock(bounds.maxX, z, 0);
    }

    const block = new RoundedBoxGeometry(3.9, 1.1, 1.15, 1, 0.35);
    for (let i = 0; i < palette.length; i++) {
      this.addInstances(block.clone(), buckets[i], {
        color: palette[i],
        roughness: 0.18,
        castShadow: true,
        emissive: 0.04,
        name: 'arena-frame',
      });
    }
    block.dispose();
  }

  /**
   * Barreira de bala nos DOIS lados, ao longo de toda a volta.
   *
   * Contínua de propósito. A colisão (`BarrierSystem`) vale em qualquer ponto
   * do traçado; se a barreira visual só existisse nas curvas, o kart bateria
   * numa parede invisível nas retas. Barreira que se vê e barreira que se
   * sente são a mesma barreira, no mesmo deslocamento lateral.
   */
  private addCandyBarriers(path: CircuitPath): void {
    const config = CIRCUIT.tireWall;
    // Muro de blocos de bala multicolorido, como o da referência.
    const palette = [...CIRCUIT.colors.pastels, 0xffffff, 0xff9ec4];
    const buckets: Placement[][] = palette.map(() => []);
    let index = 0;

    placeAlong(path, config.spacing, (sample, i) => {
      // A cor avança ao longo da PISTA, não entre os lados. Alternando por
      // lado (o bug anterior), cada índice par caía sempre no mesmo lado: um
      // muro ficava inteiro de uma cor e o outro inteiro de outra.
      const bucket = buckets[index++ % buckets.length];
      for (const side of [1, -1]) {
        const lateral = side * (sample.halfWidth + TRACK.barriers.offsetFromEdge);
        bucket.push(placementAt(path, i, lateral, 0, config.radius, 1));
      }
    });

    // O bloco é mais comprido na direção da PISTA (Z local, depois do rumo).
    // Deitá-lo no eixo errado faz o muro virar uma fileira de tijolos de
    // través, com vãos entre eles.
    // Uma subdivisão só no arredondamento. São quase 500 blocos no circuito;
    // com três subdivisões eles sozinhos custavam mais de 200 mil triângulos,
    // o que nesta máquina é a diferença entre rodar e engasgar. De longe, a
    // quina mais dura não se nota.
    const geometry = new RoundedBoxGeometry(
      config.radius * 2.1,
      config.radius * 2.1,
      config.height + config.radius * 2,
      1,
      config.radius * 0.5,
    );
    for (let i = 0; i < palette.length; i++) {
      this.addInstances(geometry, buckets[i], {
        color: palette[i],
        roughness: 0.18,
        castShadow: true,
        name: 'barrier',
      });
    }
  }

  /** Postes-pirulito: mastro listrado com um disco de bala no topo. */
  private addLollipopPoles(path: CircuitPath): void {
    const config = CIRCUIT.poles;
    const poles: Placement[] = [];
    const candyA: Placement[] = [];
    const candyB: Placement[] = [];
    let index = 0;

    placeAlong(path, config.spacing, (sample, i) => {
      // Alterna os lados para não virar um corredor.
      const side = index % 2 === 0 ? 1 : -1;
      const lateral = side * (sample.halfWidth + config.offsetFromEdge);
      const pole = placementAt(path, i, lateral, 0, config.height / 2, 1);
      // Dentro do túnel do castelo o poste atravessaria a parede.
      if (this.inCastle(pole.position.x, pole.position.z, 1)) {
        index++;
        return;
      }
      poles.push(pole);

      const candy = placementAt(path, i, lateral, 0, config.height, 1);
      (index % 4 < 2 ? candyA : candyB).push(candy);
      index++;
    });

    this.addInstances(
      new CylinderGeometry(config.radius, config.radius, config.height, 10),
      poles,
      { color: config.color, roughness: 0.25, stripes: true, castShadow: true, name: 'pole' },
    );

    // O "pirulito": um disco achatado virado para quem passa.
    const candyGeometry = new CylinderGeometry(
      config.flag.width / 2,
      config.flag.width / 2,
      0.28,
      20,
    );
    candyGeometry.rotateX(Math.PI / 2);
    this.addInstances(candyGeometry, candyA, {
      color: config.flag.colorA,
      roughness: 0.15,
      stripes: true,
      castShadow: true,
    });
    this.addInstances(candyGeometry, candyB, {
      color: config.flag.colorB,
      roughness: 0.15,
      stripes: true,
      castShadow: true,
    });
  }

  /** Arquibancada em degraus, virada para a pista. */
  private addGrandstand(path: CircuitPath): void {
    const config = CIRCUIT.grandstand;
    const index = path.indexAtFraction(config.at);
    const sample = path.samples[index];
    const heading = headingOf(sample);
    const lateral = config.side * (sample.halfWidth + Math.max(config.offsetFromEdge, 38));

    const base = sample.position.clone().addScaledVector(sample.left, lateral);
    // Para que lado os degraus sobem é MEDIDO, não escrito: ver `awaySignFor`.
    const awaySign = awaySignFor(path, base, heading);
    // E a altura vem da pegada inteira, não do centro: ver `groundUnder`.
    const ground = groundUnder(
      path,
      base,
      heading,
      config.length,
      config.rows * config.rowDepth,
      awaySign,
    );
    base.y = ground.max;

    const group = new Group();
    group.name = 'grandstand';
    group.userData.awaySign = awaySign;
    const frameMaterial = new MeshStandardMaterial({ color: config.frameColor, roughness: 0.4 });
    const seatMaterial = new MeshStandardMaterial({ color: config.seatColor, roughness: 0.35 });

    // Depois da rotação de rumo, o Z local corre ao longo da pista, então o
    // comprimento vai em Z e os degraus sobem em X.
    for (let row = 0; row < config.rows; row++) {
      const height = config.rowHeight * (row + 1);
      const step = new Mesh(
        new BoxGeometry(config.rowDepth, height, config.length),
        row % 2 === 0 ? frameMaterial : seatMaterial,
      );
      step.position.set(awaySign * row * config.rowDepth, height / 2, 0);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }

    // Saia de fundação até o ponto mais baixo do chão coberto.
    const drop = ground.max - ground.min;
    if (drop > 0.01) {
      const depth = config.rows * config.rowDepth + 1.4;
      const apron = new Mesh(
        new BoxGeometry(depth, drop + 0.6, config.length + 0.8),
        frameMaterial,
      );
      apron.position.set(awaySign * (depth / 2 - 0.9), -(drop + 0.6) / 2 + 0.05, 0);
      apron.receiveShadow = true;
      group.add(apron);
    }

    group.position.copy(base);
    group.rotation.y = heading;
    this.root.add(group);

    this.grandstandAnchor = { position: base.clone(), heading, side: awaySign };
  }

  /** Arquibancadas extras em volta do circuito, como uma arena de doces. */
  addArenaGrandstands(path: CircuitPath): void {
    const stands = [
      { at: 0.14, side: 1, offset: 46, length: 34, rows: 5 },
      { at: 0.34, side: -1, offset: 48, length: 28, rows: 4 },
      { at: 0.58, side: 1, offset: 48, length: 32, rows: 5 },
      { at: 0.82, side: -1, offset: 46, length: 28, rows: 4 },
    ] as const;

    const pastels = CIRCUIT.colors.pastels;
    const bodies: Placement[][] = pastels.map(() => []);
    const heads: Placement[][] = pastels.map(() => []);
    let spectatorIndex = 0;

    for (const stand of stands) {
      const index = path.indexAtFraction(stand.at);
      const sample = path.samples[index];
      const heading = headingOf(sample);

      // O afastamento pedido é um DESEJO, não uma ordem. O circuito volta sobre
      // si mesmo, e a auditoria flagrou três peças de arquibancada sobre o
      // asfalto perto da fração 0,546 — vindas de uma arquibancada ancorada
      // longe dali, que a 48 m caiu em cima de outro trecho da pista. Aqui ela
      // recua até caber; se não couber de jeito nenhum, não é construída.
      const offset = clearOffsetFor(
        path,
        index,
        stand.side,
        stand.length,
        stand.rows * 1.15,
        stand.offset,
        14,
      );
      if (offset < 0) continue;

      const lateral = stand.side * (sample.halfWidth + offset);
      const base = sample.position.clone().addScaledVector(sample.left, lateral);

      const away = awaySignFor(path, base, heading);
      const ground = groundUnder(path, base, heading, stand.length, stand.rows * 1.15, away);
      base.y = ground.max;

      const group = new Group();
      group.position.copy(base);
      group.rotation.y = heading;

      this.addGrandstandStructure(
        group,
        away,
        stand.length,
        stand.rows,
        ground.max - ground.min,
      );
      this.addGrandstandCrowd(
        base,
        heading,
        away,
        stand.length,
        stand.rows,
        bodies,
        heads,
        spectatorIndex,
      );
      spectatorIndex += stand.rows * 11;

      this.root.add(group);
    }

    const bodyGeometry = new SphereGeometry(0.38, 9, 7);
    bodyGeometry.scale(1, 0.95, 0.85);
    const headGeometry = new SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < pastels.length; i++) {
      this.addInstances(bodyGeometry.clone(), bodies[i], {
        color: pastels[i],
        roughness: 0.35,
        emissive: 0.08,
      });
      this.addInstances(headGeometry.clone(), heads[i], {
        color: pastels[(i + 2) % pastels.length],
        roughness: 0.32,
        emissive: 0.08,
      });
    }
    bodyGeometry.dispose();
    headGeometry.dispose();
  }

  // Aqui vivia `addShowcaseGrandstands`, removida.
  //
  // Ela punha duas arquibancadas em `boundsOf(path, 54)` — ou seja, na borda da
  // caixa do mapa, dezenas de metros longe de qualquer asfalto — e com o rumo
  // escrito à mão (0 e PI), um rumo de MUNDO sem relação nenhuma com a direção
  // que a pista tem naquele ponto. Daí as duas queixas: ficavam soltas no meio
  // do campo, e uma delas lia como virada ao contrário.
  //
  // Corrigir os números não resolveria: o método inteiro partia da premissa
  // errada de posicionar por coordenada de mundo. Quem faz certo é
  // `addArenaGrandstands`, que coloca por FRAÇÃO DA VOLTA, ao lado da pista, e
  // tira rumo e lado da própria geometria do traçado.

  /**
   * A estrutura em si. `side` aqui é o sinal do X LOCAL que se afasta da
   * pista, medido por `awaySignFor` — nunca um lado do mundo escrito à mão.
   * `skirt` é o desnível do terreno sob a pegada, em metros.
   */
  private addGrandstandStructure(
    group: Group,
    side: number,
    length: number,
    rows: number,
    skirt = 0,
  ): void {
    group.name = 'grandstand';
    // Guardado para o banco de provas poder conferir, de fora e sem refazer a
    // conta, para que lado esta arquibancada acabou virada.
    group.userData.awaySign = side;
    const rowDepth = 1.15;
    const rowHeight = 0.58;
    const frame = new MeshStandardMaterial({ color: 0xfff1f7, roughness: 0.35 });
    const seatA = new MeshStandardMaterial({ color: 0xff83b5, roughness: 0.32 });
    const seatB = new MeshStandardMaterial({ color: 0x72d7ef, roughness: 0.32 });
    const rail = new MeshStandardMaterial({ color: 0xff5c96, roughness: 0.22 });
    const lamp = new MeshStandardMaterial({
      color: 0xfff4cf,
      roughness: 0.2,
      emissive: 0xffd07a,
      emissiveIntensity: 0.7,
    });

    for (let row = 0; row < rows; row++) {
      const height = rowHeight * (row + 1);
      const step = new Mesh(
        new BoxGeometry(rowDepth, height, length),
        row % 2 === 0 ? seatA : seatB,
      );
      step.position.set(side * row * rowDepth, height / 2, 0);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }

    const face = new Mesh(new BoxGeometry(0.36, rows * rowHeight + 0.7, length + 1.6), frame);
    face.position.set(-side * 0.55, (rows * rowHeight + 0.7) / 2, 0);
    face.castShadow = true;
    face.receiveShadow = true;
    group.add(face);

    const postGeometry = new CylinderGeometry(0.12, 0.12, rows * rowHeight + 1.4, 8);
    for (const z of [-(length + 1.4) / 2, (length + 1.4) / 2]) {
      const post = new Mesh(postGeometry.clone(), rail);
      post.position.set(-side * 0.85, (rows * rowHeight + 1.4) / 2, z);
      post.castShadow = true;
      group.add(post);

      const flag = new Mesh(new ConeGeometry(0.45, 1.1, 3), rail);
      flag.rotation.z = Math.PI / 2;
      flag.position.set(-side * 1.35, rows * rowHeight + 1.45, z);
      flag.castShadow = true;
      group.add(flag);

      const lampPole = new Mesh(new CylinderGeometry(0.08, 0.08, 3.2, 8), rail);
      lampPole.position.set(-side * 1.55, rows * rowHeight + 1.65, z);
      lampPole.castShadow = true;
      group.add(lampPole);

      for (let i = 0; i < 4; i++) {
        const bulb = new Mesh(new SphereGeometry(0.2, 10, 8), lamp);
        bulb.position.set(
          -side * 1.55,
          rows * rowHeight + 3.1 + (i % 2) * 0.42,
          z + (i - 1.5) * 0.5,
        );
        group.add(bulb);
      }
    }

    const topRail = new Mesh(new BoxGeometry(0.18, 0.18, length + 1.8), rail);
    topRail.position.set(-side * 0.85, rows * rowHeight + 0.76, 0);
    topRail.castShadow = true;
    group.add(topRail);

    // Saia de fundação. A estrutura se apoia no ponto MAIS ALTO do chão que ela
    // cobre, para não engolir a primeira fila; esta saia desce dali até o ponto
    // mais baixo, fechando o vão que fazia a arquibancada parecer flutuando
    // sobre a grama nas pontas.
    if (skirt > 0.01) {
      const depth = rows * rowDepth + 1.6;
      const apron = new Mesh(new BoxGeometry(depth, skirt + 0.6, length + 1.6), frame);
      apron.position.set(side * (depth / 2 - 1.0), -(skirt + 0.6) / 2 + 0.05, 0);
      apron.receiveShadow = true;
      group.add(apron);
    }
  }

  private addGrandstandCrowd(
    base: Vector3,
    heading: number,
    side: number,
    length: number,
    rows: number,
    bodies: Placement[][],
    heads: Placement[][],
    seedOffset: number,
  ): void {
    const seats = Math.max(11, Math.round(length / 2.4));
    const rowDepth = 1.15;
    const rowHeight = 0.58;
    const cosine = Math.cos(heading);
    const sine = Math.sin(heading);
    const pastels = CIRCUIT.colors.pastels;

    for (let row = 0; row < rows; row++) {
      for (let seat = 0; seat < seats; seat++) {
        const localX = side * (row * rowDepth + 0.35);
        const localY = rowHeight * (row + 1) + 0.32;
        const localZ = (seat - (seats - 1) / 2) * (length / seats);
        const world = new Vector3(
          base.x + localX * cosine + localZ * sine,
          base.y + localY,
          base.z - localX * sine + localZ * cosine,
        );
        // De frente para a pista: ela está no sentido oposto ao que os degraus
        // sobem, o que dá exatamente um quarto de volta a partir do rumo.
        const facing = heading - side * (Math.PI / 2);
        const color = (seedOffset + row * seats + seat) % pastels.length;
        bodies[color].push({
          position: world,
          headingY: facing,
          scale: 1,
        });
        heads[color].push({
          position: world.clone().add(new Vector3(0, 0.44, 0)),
          headingY: facing,
          scale: 1,
        });
      }
    }
  }

  /** Sweet shop ao lado da reta: paredes creme, telhado rosa, toldo listrado. */
  private addSweetShop(path: CircuitPath): void {
    const config = CIRCUIT.pitBuilding;
    const index = path.indexAtFraction(config.at);
    const sample = path.samples[index];
    const half = sample.halfWidth;
    const group = new Group();

    // Comprimento ao longo da pista (Z local), profundidade para o lado (X local).
    const walls = new Mesh(
      new BoxGeometry(config.depth, config.height, config.length),
      new MeshStandardMaterial({ color: config.wallColor, roughness: 0.5 }),
    );
    walls.position.y = config.height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Telhado arredondado: meia esfera achatada, cara de cobertura de glacê.
    const roof = new Mesh(
      new SphereGeometry(config.length / 2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshStandardMaterial({ color: config.roofColor, roughness: 0.3 }),
    );
    roof.scale.set(config.depth / config.length, 0.55, 1);
    roof.position.y = config.height;
    roof.castShadow = true;
    group.add(roof);

    const awning = new Mesh(
      new BoxGeometry(2.2, 0.4, config.length * 0.8),
      new MeshStandardMaterial({
        color: config.awningColor,
        roughness: 0.3,
        ...(this.stripeTexture ? { map: this.stripeTexture } : {}),
      }),
    );
    awning.position.set(-config.side * (config.depth / 2 + 0.9), config.height * 0.62, 0);
    awning.castShadow = true;
    group.add(awning);

    const lateral = config.side * (half + config.offsetFromEdge);
    group.position.copy(sample.position).addScaledVector(sample.left, lateral);
    group.position.y = path.surfaceHeight(index, lateral);
    group.rotation.y = headingOf(sample);
    this.root.add(group);
  }

  /**
   * Túnel de Donut: um donut gigante em pé, com a pista passando pelo furo.
   *
   * Entrou no lugar da passarela de waffle, que era uma plataforma sobre
   * pilares e não tinha nada de doce vista de dentro do kart.
   *
   * A orientação sai de graça: um toro do Three nasce com o furo no eixo Z, e o
   * rumo da pista já põe o +Z local no sentido de corrida. Então o donut só
   * precisa do mesmo `headingOf` que todo o resto do cenário usa — nenhuma
   * rotação extra, que é onde este tipo de peça costuma sair torta.
   *
   * A metade de baixo fica enterrada de propósito; ver `config/donutTunnel.ts`.
   */
  private addDonutTunnel(path: CircuitPath): void {
    const config = DONUT_TUNNEL;
    const index = path.indexAtFraction(config.at);
    const sample = path.samples[index];
    const ringRadius = config.holeRadius + config.tubeRadius;

    const group = new Group();
    group.name = 'donut-tunnel';

    const dough = addCandyCoat(
      new MeshStandardMaterial({
        color: config.colors.dough,
        roughness: 0.55,
        emissive: config.colors.dough,
        emissiveIntensity: 0.03,
      }),
      config.colors.doughTop,
      config.colors.doughBottom,
      0.04,
    );
    const icing = addCandyCoat(
      new MeshStandardMaterial({
        color: config.colors.icing,
        // Bem lisa: glacê de donut é laqueado, e é o brilho que separa a
        // cobertura da massa fosca embaixo dela.
        roughness: 0.12,
        emissive: config.colors.icing,
        emissiveIntensity: 0.07,
        // Casca fina: vista de dentro do túnel, a face de trás precisa existir.
        side: DoubleSide,
      }),
      config.colors.icingTop,
      config.colors.icingBottom,
      0.11,
    );

    const body = this.addMesh(
      group,
      new Mesh(
        new TorusGeometry(ringRadius, config.tubeRadius, config.tubeSegments, config.ringSegments),
        dough,
      ),
    );
    body.name = 'donut-dough';
    body.position.y = config.centerHeight;

    /**
     * Até onde a cobertura desce, por ponto do anel. A ondulação é o escorrido:
     * sem ela a borda do glacê seria um círculo perfeito, que é a coisa que
     * mais denuncia geometria gerada.
     */
    const icingSpan = (u: number): number =>
      config.frosting.span +
      Math.sin(u * config.frosting.waves) * config.frosting.waveAmplitude;

    const shell = this.addMesh(
      group,
      new Mesh(
        icingShellGeometry(
          ringRadius,
          config.tubeRadius + config.frosting.thickness,
          icingSpan,
          config.ringSegments,
          config.tubeSegments,
        ),
        icing,
      ),
    );
    shell.name = 'donut-icing';
    shell.position.y = config.centerHeight;

    this.addDonutSprinkles(group, ringRadius, icingSpan);

    group.position.copy(sample.position);
    group.position.y = path.surfaceHeight(index, 0);
    group.rotation.y = headingOf(sample);
    this.root.add(group);
  }

  /**
   * Os granulados grudados na cobertura.
   *
   * Uma InstancedMesh só, com cor por instância: são quase cem barrinhas, e cada
   * uma como malha própria seria cem chamadas de desenho. Cada granulado é
   * DEITADO na superfície — o eixo curto dele é alinhado com a normal do toro e
   * o comprimento sorteia um giro no plano tangente.
   */
  private addDonutSprinkles(
    group: Group,
    ringRadius: number,
    icingSpan: (u: number) => number,
  ): void {
    const config = DONUT_TUNNEL;
    const surfaceRadius = config.tubeRadius + config.frosting.thickness + 0.05;
    const palette = [...CIRCUIT.colors.pastels, 0xffffff].map((hex) => new Color(hex));

    const geometry = new RoundedBoxGeometry(
      config.sprinkles.length,
      config.sprinkles.thickness,
      config.sprinkles.thickness,
      1,
      config.sprinkles.thickness * 0.45,
    );
    const mesh = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0 }),
      config.sprinkles.count,
    );
    mesh.name = 'donut-sprinkles';
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const normal = new Vector3();
    const align = new Quaternion();
    const spin = new Quaternion();
    const up = new Vector3(0, 1, 0);

    for (let i = 0; i < config.sprinkles.count; i++) {
      const u = this.random() * Math.PI * 2;
      // Recuado da borda do escorrido, senão metade dos granulados fica
      // pendurada no vazio, além de onde a cobertura chega.
      const v = (this.random() * 2 - 1) * icingSpan(u) * 0.85;
      const cosV = Math.cos(v);
      const radial = ringRadius + surfaceRadius * cosV;

      _position.set(radial * Math.cos(u), radial * Math.sin(u), surfaceRadius * Math.sin(v));
      normal.set(cosV * Math.cos(u), cosV * Math.sin(u), Math.sin(v)).normalize();

      align.setFromUnitVectors(up, normal);
      spin.setFromAxisAngle(up, this.random() * Math.PI * 2);
      _quaternion.copy(align).multiply(spin);

      _scale.setScalar(0.85 + this.random() * 0.45);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
      mesh.setColorAt(i, palette[Math.floor(this.random() * palette.length)]);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.position.y = config.centerHeight;
    group.add(mesh);
  }

  /** Baloes de ar quente com cesta de cupcake, preenchendo o ceu da pista. */
  /**
   * Balões de ar quente com cesta de cupcake, espalhados por TODO o mapa.
   *
   * Eram cinco, presos a frações da volta, e por isso só existiam numa faixa ao
   * lado da pista: o céu do resto do mapa ficava vazio. Agora são sorteados na
   * caixa inteira do circuito.
   *
   * Tudo em InstancedMesh, quatro chamadas de desenho no total. A versão
   * anterior criava umas sete malhas por balão; com dezesseis balões isso seria
   * uma centena de objetos no ar, e esta máquina não tem folga para isso.
   */
  private addCupcakeBalloons(path: CircuitPath): void {
    const config = CIRCUIT.balloons;
    const bounds = boundsOf(path, config.spread);

    const bodies: Placement[] = [];
    const frostings: Placement[] = [];
    const baskets: Placement[] = [];
    const ropes: Placement[] = [];

    for (let i = 0; i < QUALITY.balloonCount; i++) {
      const x = bounds.minX + this.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + this.random() * (bounds.maxZ - bounds.minZ);
      const scale = config.minScale + this.random() * (config.maxScale - config.minScale);
      const base =
        path.terrainHeight(x, z) +
        config.minHeight +
        this.random() * (config.maxHeight - config.minHeight);
      const heading = this.random() * Math.PI * 2;

      // As alturas são medidas a partir da cesta e multiplicadas pela escala,
      // porque a instância não tem um grupo-pai para escalar o conjunto.
      bodies.push({ position: new Vector3(x, base + 5.4 * scale, z), headingY: heading, scale });
      frostings.push({ position: new Vector3(x, base + 2.2 * scale, z), headingY: heading, scale });
      baskets.push({ position: new Vector3(x, base + 1.4 * scale, z), headingY: heading, scale });
      ropes.push({ position: new Vector3(x, base + 2.9 * scale, z), headingY: heading, scale });
    }

    const body = new SphereGeometry(2.5, 18, 14);
    body.scale(1.02, 1.22, 1.02);
    this.addInstances(body, bodies, {
      color: 0xffffff,
      roughness: 0.2,
      stripes: true,
      emissive: 0.05,
      name: 'balloon',
    });

    const frosting = new SphereGeometry(1.3, 14, 9);
    frosting.scale(1.25, 0.42, 1.25);
    this.addInstances(frosting, frostings, { color: 0xfff0f7, roughness: 0.18, emissive: 0.08 });

    this.addInstances(new CylinderGeometry(0.82, 1.08, 1.15, 12), baskets, {
      color: 0xffb964,
      roughness: 0.28,
    });

    // As quatro cordas viram uma peça só: de trinta metros de altura ninguém
    // conta cordinha, e assim são quatro instâncias a menos por balão.
    const rope = new CylinderGeometry(0.06, 0.06, 2.3, 6);
    this.addInstances(rope, ropes, { color: 0xff85b4, roughness: 0.35 });
  }

  /**
   * Árvores de bala por amostragem com rejeição: sorteia um ponto na caixa do
   * circuito e descarta se estiver perto demais (invadiria a pista) ou longe
   * demais (não aparece nunca).
   */
  private addCandyTrees(path: CircuitPath): void {
    const config = CIRCUIT.trees;
    const bounds = boundsOf(path, config.maxDistanceFromTrack);
    const varieties = config.varieties;

    const trunks: Placement[] = [];
    /** Um balde de copas por variedade, na mesma ordem do config. */
    const tops: Placement[][] = varieties.map(() => []);

    // Roleta ponderada: sorteia a variedade na proporção pedida pelos pesos.
    const totalWeight = varieties.reduce((sum, variety) => sum + variety.weight, 0);
    const pickVariety = (): number => {
      let ticket = this.random() * totalWeight;
      for (let i = 0; i < varieties.length; i++) {
        ticket -= varieties[i].weight;
        if (ticket <= 0) return i;
      }
      return varieties.length - 1;
    };

    let attempts = 0;
    while (trunks.length < QUALITY.treeCount && attempts < QUALITY.treeCount * 40) {
      attempts++;
      const x = bounds.minX + this.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + this.random() * (bounds.maxZ - bounds.minZ);
      const distance = path.distanceToCenterline(x, z);
      if (distance < config.minDistanceFromTrack) continue;
      if (distance > config.maxDistanceFromTrack) continue;

      const variety = pickVariety();
      const margin = varieties[variety].size;
      if (this.inCastle(x, z, margin)) continue;
      if (this.inFactory(x, z, margin)) continue;

      const scale = 1 + (this.random() - 0.5) * 2 * config.scaleVariation;
      const heading = this.random() * Math.PI * 2;
      // O terreno acompanha a pista: plantar em y = 0 enterraria metade delas.
      const ground = path.terrainHeight(x, z);

      trunks.push({
        position: new Vector3(x, ground + (config.trunkHeight * scale) / 2, z),
        headingY: heading,
        scale,
      });

      tops[variety].push({
        position: new Vector3(x, ground + config.trunkHeight * scale, z),
        headingY: heading,
        scale,
      });
    }

    // Um palito listrado só, para as quatro variedades.
    this.addInstances(
      new CylinderGeometry(config.trunkRadius, config.trunkRadius * 1.3, config.trunkHeight, 8),
      trunks,
      {
        color: config.trunkColor,
        roughness: 0.25,
        stripes: true,
        castShadow: true,
        // É o PALITO que encosta na grama; a copa fica no alto dele. Os dois
        // levam nomes separados para a auditoria de chão cobrar contato só de
        // quem deve ter.
        name: 'tree-trunk',
      },
    );

    for (let i = 0; i < varieties.length; i++) {
      this.addTreeTop(varieties[i], tops[i]);
    }
  }

  /**
   * A copa de uma variedade de árvore, numa InstancedMesh só.
   *
   * Cada geometria é construída já DESLOCADA para cima, porque a instância só
   * carrega posição, rumo e escala — o pé da copa precisa cair no topo do
   * palito sem depender de um segundo nível de transformação.
   */
  private addTreeTop(
    variety: { kind: string; color: number; size: number },
    placements: Placement[],
  ): void {
    if (placements.length === 0) return;
    const size = variety.size;

    if (variety.kind === 'algodao') {
      // Algodão-doce: reusa o shader das montanhas, que já sabe fazer fibra,
      // felpudo e brilho de açúcar contra a luz.
      const geometry = new SphereGeometry(size, 14, 11);
      geometry.scale(1, 1.12, 1);
      geometry.translate(0, size * 1.05, 0);
      this.addInstances(geometry, placements, {
        color: variety.color,
        castShadow: true,
        name: 'tree-algodao',
        material: createCottonCandyMaterial({
          base: variety.color,
          swirl: 0xffffff,
          rim: 0xd8f4ff,
          puffMeters: 1.6,
          fiberMeters: 0.3,
          relief: 0.12,
          fuzz: 0.8,
          rimStrength: 0.45,
        }),
      });
      return;
    }

    if (variety.kind === 'pirulito') {
      // Disco de espiral, de pé, virado para quem olha.
      const geometry = new CylinderGeometry(size, size, size * 0.26, 22);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, size * 0.95, 0);
      const swirl = createSwirlTexture(['#ff3f92', '#ffffff']);
      this.addInstances(geometry, placements, {
        color: 0xffffff,
        roughness: 0.14,
        castShadow: true,
        name: 'tree-pirulito',
        material: new MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.14,
          metalness: 0,
          side: DoubleSide,
          emissive: 0xffd6e8,
          emissiveIntensity: 0.1,
          ...(swirl ? { map: swirl } : { color: variety.color }),
        }),
      });
      return;
    }

    if (variety.kind === 'cupcake') {
      // Cupcake: forminha cônica com uma cobertura abaulada em cima.
      const wrapper = new CylinderGeometry(size * 0.62, size * 0.46, size * 0.8, 14);
      wrapper.translate(0, size * 0.4, 0);
      this.addInstances(wrapper, placements, {
        color: 0xfff0e2,
        roughness: 0.4,
        castShadow: true,
      });

      const top = new SphereGeometry(size * 0.72, 14, 10);
      top.scale(1, 1.05, 1);
      top.translate(0, size * 1.05, 0);
      this.addInstances(top, placements, {
        color: variety.color,
        roughness: 0.2,
        emissive: 0.12,
        castShadow: true,
        name: 'tree-cupcake',
      });
      return;
    }

    // Sorvete: uma casquinha e uma bola por cima.
    const cone = new ConeGeometry(size * 0.55, size * 0.95, 14);
    cone.rotateZ(Math.PI);
    cone.translate(0, size * 0.48, 0);
    this.addInstances(cone, placements, {
      color: 0xffc98a,
      roughness: 0.45,
      castShadow: true,
    });

    const scoop = new SphereGeometry(size * 0.72, 14, 11);
    scoop.translate(0, size * 1.18, 0);
    this.addInstances(scoop, placements, {
      color: variety.color,
      roughness: 0.18,
      emissive: 0.12,
      castShadow: true,
      name: 'tree-sorvete',
    });
  }

  /** Colinas de gumdrop: meias esferas pastel preenchendo o horizonte. */
  private addGumdropHills(path: CircuitPath): void {
    const config = CIRCUIT.hills;
    const pastels = CIRCUIT.colors.pastels;
    const bounds = boundsOf(path, config.maxDistanceFromTrack);
    const byColor: Placement[][] = pastels.map(() => []);

    let attempts = 0;
    let placed = 0;
    while (placed < QUALITY.hillCount && attempts < QUALITY.hillCount * 40) {
      attempts++;
      const x = bounds.minX + this.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + this.random() * (bounds.maxZ - bounds.minZ);
      const distance = path.distanceToCenterline(x, z);
      if (distance < config.minDistanceFromTrack) continue;
      if (distance > config.maxDistanceFromTrack) continue;

      const radius = config.minRadius + this.random() * (config.maxRadius - config.minRadius);
      if (this.inCastle(x, z, radius)) continue;
      if (this.inFactory(x, z, radius)) continue;
      byColor[Math.floor(this.random() * pastels.length)].push({
        position: new Vector3(x, path.terrainHeight(x, z) - radius * 0.25, z),
        headingY: this.random() * Math.PI * 2,
        scale: radius,
      });
      placed++;
    }

    // Esfera de raio 1: a escala da instância vira o raio da colina.
    const geometry = new SphereGeometry(1, 14, 10);
    for (let i = 0; i < pastels.length; i++) {
      this.addInstances(geometry, byColor[i], {
        color: pastels[i],
        roughness: 0.14,
        emissive: 0.05,
        name: 'hill',
      });
    }
  }

  /** Nuvens de marshmallow, bem alto e bem longe. Não recebem sombra. */
  private addClouds(path: CircuitPath): void {
    const config = CIRCUIT.clouds;
    const bounds = boundsOf(path, 0);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const puffs: Placement[] = [];

    for (let i = 0; i < QUALITY.cloudCount; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = config.spread * (0.35 + this.random() * 0.65);
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      const y = config.minHeight + this.random() * (config.maxHeight - config.minHeight);
      const size = config.minRadius + this.random() * (config.maxRadius - config.minRadius);

      // Cada nuvem são três bolhas coladas: uma esfera sozinha parece um balão.
      for (let p = 0; p < 3; p++) {
        puffs.push({
          position: new Vector3(
            x + (p - 1) * size * 0.85,
            y + (p === 1 ? size * 0.3 : 0),
            z + (this.random() - 0.5) * size * 0.5,
          ),
          headingY: 0,
          scale: size * (p === 1 ? 1 : 0.78),
        });
      }
    }

    // Sem luz: as nuvens estavam recebendo a iluminação da cena e saíam
    // CINZAS, com cara de fumaça suja. Nuvem de marshmallow é fundo — tem que
    // ficar branca sempre, olhe-se de onde se olhar.
    this.addInstances(new SphereGeometry(1, 12, 8), puffs, {
      color: config.color,
      unlit: true,
      name: 'cloud',
    });
  }

  private addInstances(
    geometry: BufferGeometry,
    placements: Placement[],
    options: InstanceOptions,
  ): void {
    if (placements.length === 0) {
      geometry.dispose();
      return;
    }

    const material = options.material
      ? options.material
      : options.unlit
      ? new MeshBasicMaterial({ color: options.color, fog: true })
      : new MeshStandardMaterial({
          color: options.color,
          roughness: options.roughness ?? 0.4,
          metalness: 0,
          ...(options.emissive
            ? { emissive: options.color, emissiveIntensity: options.emissive }
            : {}),
          ...(options.stripes && this.stripeTexture ? { map: this.stripeTexture } : {}),
        });

    const mesh = new InstancedMesh(geometry, material, placements.length);
    if (options.name) mesh.name = options.name;
    mesh.castShadow = options.castShadow ?? false;
    mesh.receiveShadow = true;

    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i];
      _position.copy(placement.position);
      _quaternion.setFromAxisAngle(_axisY, placement.headingY);
      if (placement.preRotation) {
        _tilt.copy(placement.preRotation);
        _quaternion.multiply(_tilt);
      }
      _scale.setScalar(placement.scale);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
  }

  private addMesh(group: Group, mesh: Mesh): Mesh {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
}

/** Percorre a pista chamando `visit` a cada `spacing` metros. */
function placeAlong(
  path: CircuitPath,
  spacing: number,
  visit: (sample: PathSample, index: number) => void,
): void {
  let nextDistance = 0;
  for (let i = 0; i < path.count; i++) {
    const sample = path.samples[i];
    if (sample.distance < nextDistance) continue;
    nextDistance = sample.distance + spacing;
    visit(sample, i);
  }
}

/**
 * Posiciona um objeto no referencial da pista. A altura é medida a partir do
 * TERRENO naquele deslocamento lateral, não de y = 0 — com a pista subindo e
 * descendo, altura absoluta enterraria metade do cenário.
 */
function placementAt(
  path: CircuitPath,
  index: number,
  lateral: number,
  along: number,
  height: number,
  scale: number,
): Placement {
  const sample = path.samples[index];
  const position = sample.position
    .clone()
    .addScaledVector(sample.left, lateral)
    .addScaledVector(sample.tangent, along);
  position.y = path.surfaceHeight(index, lateral) + height;
  return { position, headingY: headingOf(sample), scale };
}

/** Rotação em torno de Y que alinha um objeto com a direção da pista. */
function headingOf(sample: PathSample): number {
  return Math.atan2(sample.tangent.x, sample.tangent.z);
}

/**
 * Sinal do X LOCAL que aponta para LONGE da pista.
 *
 * Depois de `group.rotation.y = heading`, o X local do grupo aponta, no mundo,
 * para `(cos heading, -sin heading)`. Se esse eixo calhar de apontar para o
 * asfalto, os degraus sobem na direção errada e a arquibancada fica de COSTAS
 * para a pista.
 *
 * Era exatamente o que acontecia com a arquibancada do lado +X do mapa: ela
 * estava escrita à mão com `side: 1` e `heading: PI`, e o PI inverte o X local,
 * de modo que o mesmo número que acertava do outro lado passava a significar o
 * oposto. Medir o sinal em vez de escrevê-lo faz esse erro não ter como voltar,
 * seja qual for o rumo ou o lado em que a construção for posta.
 */
function awaySignFor(path: CircuitPath, base: Vector3, heading: number): number {
  const sample = path.samples[path.nearestSampleIndex(base.x, base.z)];
  const awayX = base.x - sample.position.x;
  const awayZ = base.z - sample.position.z;
  // Onde o X local vai parar no mundo, depois do giro.
  const axisX = Math.cos(heading);
  const axisZ = -Math.sin(heading);
  return axisX * awayX + axisZ * awayZ >= 0 ? 1 : -1;
}

/**
 * Altura do terreno sob a PEGADA inteira de uma construção comprida.
 *
 * Uma arquibancada de sessenta metros é uma caixa rígida; o chão embaixo dela
 * não é. Medir a altura só no ponto central — que era o que se fazia — apoia o
 * meio e deixa as pontas no ar sempre que o terreno sobe ou desce ao longo do
 * comprimento. Era o sintoma de "arquibancada que não encosta na grama".
 *
 * Devolve o ponto mais alto e o mais baixo do chão coberto. Quem constrói apoia
 * a estrutura no MAIS ALTO, para nenhum degrau ser engolido, e desce uma saia
 * até o MAIS BAIXO, para não sobrar fresta por onde se veja o vão.
 *
 * A altura sai de `terrainHeight(x, z)`, que é a MESMA função que gera a malha
 * da grama. Usar `surfaceHeight(index, lateral)` aqui era a segunda fonte do
 * erro: ela responde sobre a amostra do eixo que se pediu, e num circuito que
 * volta sobre si mesmo a amostra mais próxima do canto da arquibancada pode
 * perfeitamente ser outra — aí o cenário e o chão discordam da altura.
 */
/**
 * Maior afastamento, até o pedido, em que a PEGADA inteira de uma construção
 * fica livre do traçado. Devolve -1 se nem o mínimo serve.
 *
 * Existe porque o circuito volta sobre si mesmo. Uma arquibancada posta a 48 m
 * de um trecho pode cair em cima de OUTRO trecho da pista, e foi o que
 * aconteceu: a auditoria flagrou três peças sobre o asfalto perto da fração
 * 0,546 da volta, vindas de uma arquibancada ancorada bem longe dali.
 *
 * Ajustar o número na mão resolveria hoje e voltaria a quebrar no próximo
 * traçado — é a mesma armadilha do lado escrito à unha. Aqui a colocação
 * PERGUNTA ao traçado e recua sozinha até caber.
 */
function clearOffsetFor(
  path: CircuitPath,
  index: number,
  side: number,
  length: number,
  depth: number,
  requested: number,
  minimum: number,
): number {
  const sample = path.samples[index];
  const heading = headingOf(sample);
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);

  for (let offset = requested; offset >= minimum; offset -= 1) {
    const lateral = side * (sample.halfWidth + offset);
    const base = sample.position.clone().addScaledVector(sample.left, lateral);
    const away = awaySignFor(path, base, heading);
    let clear = true;

    for (let a = 0; a <= 4 && clear; a++) {
      const localZ = (a / 4 - 0.5) * length;
      for (let b = 0; b <= 2 && clear; b++) {
        const localX = away * (b / 2) * depth;
        const x = base.x + localX * cosine + localZ * sine;
        const z = base.z - localX * sine + localZ * cosine;
        // `distanceToCenterline` mede até a amostra mais próxima de QUALQUER
        // parte da volta, que é exatamente a pergunta certa aqui.
        const nearest = path.samples[path.nearestSampleIndex(x, z)];
        if (path.distanceToCenterline(x, z) < nearest.halfWidth + 6) clear = false;
      }
    }

    if (clear) return offset;
  }

  return -1;
}

function groundUnder(
  path: CircuitPath,
  base: Vector3,
  heading: number,
  length: number,
  depth: number,
  awaySign: number,
): { min: number; max: number } {
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  let min = Infinity;
  let max = -Infinity;

  for (let a = 0; a <= 8; a++) {
    const localZ = (a / 8 - 0.5) * length;
    for (let b = 0; b <= 3; b++) {
      const localX = awaySign * (b / 3) * depth;
      const height = path.terrainHeight(
        base.x + localX * cosine + localZ * sine,
        base.z - localX * sine + localZ * cosine,
      );
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
  }

  return { min, max };
}

/**
 * Casca de cobertura sobre um toro.
 *
 * É a mesma superfície do donut — um toro paramétrico — com o tubo um tiquinho
 * mais gordo e varrido só em PARTE da volta da seção, de `-span(u)` a `+span(u)`.
 * O `span` variar com a posição no anel é o que dá a borda escorrida.
 *
 * O `arc` da `TorusGeometry` do Three não serve aqui: ele recorta a volta do
 * ANEL (transformaria o donut num pedaço de donut), e o que se precisa é
 * recortar a volta da SEÇÃO, deixando a massa aparecendo por baixo.
 *
 * As normais são escritas na mão, e não calculadas depois: a fórmula do toro
 * dá a normal exata, enquanto `computeVertexNormals` na borda recortada daria
 * uma normal enviesada pela falta dos triângulos vizinhos que ali não existem.
 */
function icingShellGeometry(
  ringRadius: number,
  tubeRadius: number,
  span: (u: number) => number,
  ringSegments: number,
  tubeSegments: number,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= ringSegments; i++) {
    const u = (i / ringSegments) * Math.PI * 2;
    const limit = span(u);
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);

    for (let j = 0; j <= tubeSegments; j++) {
      const v = (j / tubeSegments - 0.5) * 2 * limit;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const radial = ringRadius + tubeRadius * cosV;

      positions.push(radial * cosU, radial * sinU, tubeRadius * sinV);
      normals.push(cosV * cosU, cosV * sinU, sinV);
      uvs.push(i / ringSegments, j / tubeSegments);
    }
  }

  const stride = tubeSegments + 1;
  for (let i = 0; i < ringSegments; i++) {
    for (let j = 0; j < tubeSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function boundsOf(path: CircuitPath, margin: number) {
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

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  };
}
