import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type Scene,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CIRCUIT } from '../config/circuit';
import { START_GATE } from '../config/startGate';
import { TRACK } from '../config/track';
import {
  createCandyNormalMap,
  createCandyTrackTexture,
  createCheckerTexture,
  createSignTexture,
  createStripeTexture,
  createSwirlTexture,
} from '../fx/proceduralTextures';
import type { CircuitPath } from './circuitPath';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _color = new Color();

/**
 * Acumulador de triângulos com cor e UV por vértice. Todo o piso do circuito
 * (asfalto, escape, linhas, zebras, largada) sai de fitas construídas com este
 * mesmo acumulador, então só existe um jeito de errar o enrolamento.
 */
class RibbonBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly uvs: number[] = [];

  /**
   * Um quadrilátero plano. A ordem dos cantos importa: `leftStart` e `leftEnd`
   * são a borda da esquerda no sentido de corrida, e a borda esquerda precisa
   * ser sempre a de MAIOR deslocamento lateral — senão o triângulo sai
   * enrolado ao contrário e a fita fica invisível vista de cima.
   */
  quad(
    leftStart: Vector3,
    rightStart: Vector3,
    leftEnd: Vector3,
    rightEnd: Vector3,
    color: number,
    vStart = 0,
    vEnd = 1,
  ): void {
    _color.setHex(color);
    this.triangle(leftStart, rightStart, rightEnd, [0, vStart], [1, vStart], [1, vEnd]);
    this.triangle(leftStart, rightEnd, leftEnd, [0, vStart], [1, vEnd], [0, vEnd]);
  }

  private triangle(
    p1: Vector3,
    p2: Vector3,
    p3: Vector3,
    uv1: [number, number],
    uv2: [number, number],
    uv3: [number, number],
  ): void {
    this.positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    this.uvs.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
    for (let i = 0; i < 3; i++) this.colors.push(_color.r, _color.g, _color.b);
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));

    // A pista tem elevação e inclinação nas curvas, então as normais precisam
    // ser calculadas de verdade — chapar tudo para cima achataria a luz e a
    // inclinação sumiria visualmente.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

interface RibbonSpec {
  y: number;
  leftEdge: (index: number) => number;
  rightEdge: (index: number) => number;
  /** Cor do segmento, ou null para pular (zebra só existe em curva). */
  color: (index: number) => number | null;
}

function buildRibbon(path: CircuitPath, spec: RibbonSpec): BufferGeometry | null {
  const builder = new RibbonBuilder();
  const count = path.count;
  const repeat = CIRCUIT.textureRepeatMeters;

  for (let i = 0; i < count; i++) {
    const color = spec.color(i);
    if (color === null) continue;

    const next = (i + 1) % count;
    path.pointAt(i, spec.leftEdge(i), spec.y, _a);
    path.pointAt(i, spec.rightEdge(i), spec.y, _b);
    path.pointAt(next, spec.leftEdge(next), spec.y, _c);
    path.pointAt(next, spec.rightEdge(next), spec.y, _d);

    // V acompanha a distância percorrida, para a textura não esticar nas
    // curvas nem encolher nas retas.
    const vStart = path.samples[i].distance / repeat;
    const vEnd = vStart + _a.distanceTo(_c) / repeat;
    builder.quad(_a, _b, _c, _d, color, vStart, vEnd);
  }

  return builder.isEmpty ? null : builder.build();
}

/**
 * O piso do circuito no estilo "candy": escape de glacê, asfalto rosa com
 * confete, linhas cremes, zebras rosa/branco nas curvas, largada quadriculada
 * e um arco de bala sobre a linha.
 *
 * Puramente visual. A física continua sendo o plano infinito da Fase 1: não
 * há colisão, superfície com grip próprio nem checkpoint. Isso é Fase 4.
 */
export class CircuitSurface {
  readonly root = new Group();

  constructor(path: CircuitPath, scene: Scene) {
    // A largura agora varia ao longo da volta: nada de meia-largura constante.
    const half = (i: number) => path.samples[i].halfWidth;
    const layers = CIRCUIT.layers;
    const colors = CIRCUIT.colors;
    const visualRunoffWidth = TRACK.runoffWidth;
    const visualRunoffBleed = 0.8;
    const runoffColor = 0xffd7e8;

    // Material do asfalto: textura de confete multiplicada pela cor do vértice.
    const trackTexture = createCandyTrackTexture();
    const trackNormals = createCandyNormalMap();
    const asphaltMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // Menos áspero que de dia: à noite a pista tem que devolver um pouco da
      // luz das lanternas, senão vira um buraco preto sob o kart.
      roughness: 0.42,
      metalness: 0,
      ...(trackTexture ? { map: trackTexture } : {}),
      ...(trackNormals ? { normalMap: trackNormals } : {}),
    });
    // Relevo discreto: o confete se anuncia com a luz rasante e some de longe.
    if (trackNormals) asphaltMaterial.normalScale.set(0.55, 0.55);
    // Sem textura (fora do navegador), a cor do vértice precisa dar a cor final.
    const painted = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      roughness: 0.4,
      metalness: 0,
    });
    const runoffMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 5,
      polygonOffsetUnits: 5,
      roughness: 0.55,
      metalness: 0,
    });

    for (const side of [1, -1]) {
      this.add(
        buildRibbon(path, {
          y: layers.runoff,
          leftEdge: (i) => Math.max(side * (half(i) + visualRunoffWidth), side * half(i)),
          rightEdge: (i) => Math.min(side * (half(i) + visualRunoffWidth), side * half(i)),
          color: () => runoffColor,
        }),
        runoffMaterial,
      );
    }

    for (const side of [1, -1]) {
      this.add(
        buildRibbon(path, {
          y: layers.runoff - 0.012,
          leftEdge: (i) => Math.max(
            side * (half(i) + visualRunoffWidth + visualRunoffBleed),
            side * (half(i) + visualRunoffWidth),
          ),
          rightEdge: (i) => Math.min(
            side * (half(i) + visualRunoffWidth + visualRunoffBleed),
            side * (half(i) + visualRunoffWidth),
          ),
          color: () => runoffColor,
        }),
        runoffMaterial,
      );
    }

    this.add(
      buildRibbon(path, {
        y: layers.asphalt,
        leftEdge: (i) => half(i),
        rightEdge: (i) => -half(i),
        // Branco: deixa a textura mandar na cor.
        color: () => (trackTexture ? 0xffffff : colors.asphalt),
      }),
      asphaltMaterial,
    );

    // Sem linha branca de borda: a zebra quadriculada JÁ é a borda da pista,
    // como na referência. Uma linha branca por baixo dela só suja o contraste.
    this.addKerbs(path, painted);
    this.addCenterLine(path, painted);
    this.addStartLine(path, painted);
    this.addStartGate(path);

    this.root.traverse((object) => {
      if ((object as Mesh).isMesh) (object as Mesh).receiveShadow = true;
    });
    scene.add(this.root);
  }

  /**
   * Zebra quadriculada rosa e branca nas DUAS bordas, pela volta inteira.
   *
   * É ela que desenha o traçado de longe. Enquanto existia só no lado interno
   * das curvas, as retas ficavam sem borda nenhuma e a pista se dissolvia
   * dentro do verde do chão.
   *
   * As duas bordas usam a mesma fase de xadrez, então os quadrados ficam
   * alinhados de um lado ao outro — desalinhados, a pista parece torta.
   */
  private addKerbs(path: CircuitPath, material: MeshStandardMaterial): void {
    const half = (i: number) => path.samples[i].halfWidth;
    const kerb = CIRCUIT.kerb;
    const squareColor = (i: number) =>
      Math.floor(i / kerb.stripeSegments) % 2 === 0
        ? CIRCUIT.colors.kerbA
        : CIRCUIT.colors.kerbB;

    for (const side of [1, -1]) {
      const outer = (i: number) => side * (half(i) + kerb.width);
      const inner = (i: number) => side * half(i);
      this.add(
        buildRibbon(path, {
          y: CIRCUIT.layers.kerb,
          leftEdge: (i) => Math.max(outer(i), inner(i)),
          rightEdge: (i) => Math.min(outer(i), inner(i)),
          color: squareColor,
        }),
        material,
      );
    }
  }

  /** Linha branca contínua no meio da pista. */
  private addCenterLine(path: CircuitPath, material: MeshStandardMaterial): void {
    const halfLine = CIRCUIT.centerLine.width / 2;
    this.add(
      buildRibbon(path, {
        y: CIRCUIT.layers.edgeLine,
        leftEdge: () => halfLine,
        rightEdge: () => -halfLine,
        color: () => CIRCUIT.colors.centerLine,
      }),
      material,
    );
  }

  /**
   * Faixa quadriculada de largada, atravessando a pista.
   *
   * Construída sobre as AMOSTRAS do traçado, não como um retângulo plano.
   * A versão anterior desenhava um quadrilátero numa altura fixa: onde a
   * pista sobe ou se inclina, metade da faixa afundava no asfalto e a
   * bandeirada aparecia cortada na diagonal. Seguindo as amostras, cada
   * quadrado nasce exatamente na superfície, com a inclinação certa.
   */
  private addStartLine(path: CircuitPath, material: MeshStandardMaterial): void {
    const builder = new RibbonBuilder();
    const config = CIRCUIT.startLine;
    const y = CIRCUIT.layers.startLine;

    // Quantas amostras cobrem a profundidade pedida da faixa.
    const spacing = path.totalLength / path.count;
    const rows = Math.max(2, Math.round(config.depth / spacing));

    for (let row = 0; row < rows; row++) {
      const nearIndex = row % path.count;
      const farIndex = (row + 1) % path.count;
      const halfNear = path.samples[nearIndex].halfWidth;
      const halfFar = path.samples[farIndex].halfWidth;

      for (let column = 0; column < config.squares; column++) {
        // A largura é dividida em fração, não em metros: assim os quadrados
        // acompanham a pista se ela alargar entre uma amostra e a seguinte.
        const fromFraction = 1 - (column * 2) / config.squares;
        const toFraction = 1 - ((column + 1) * 2) / config.squares;
        const dark = (row + column) % 2 === 0;

        path.pointAt(nearIndex, halfNear * fromFraction, y, _a);
        path.pointAt(nearIndex, halfNear * toFraction, y, _b);
        path.pointAt(farIndex, halfFar * fromFraction, y, _c);
        path.pointAt(farIndex, halfFar * toFraction, y, _d);

        builder.quad(_a, _b, _c, _d, dark ? CIRCUIT.colors.startLineB : CIRCUIT.colors.startLineA);
      }
    }

    this.add(builder.build(), material);
  }

  /**
   * O portal "CANDY RUSH" sobre a linha de largada.
   *
   * Dois pilares de bengala com pé alargado, um arco achatado por cima,
   * pirulitos gigantes encostados nele, nuvenzinhas de rosto feliz, estrelas,
   * o letreiro com coroa e um semáforo pendurado — mais as bandeiras de
   * chegada no alto de cada pilar.
   *
   * Tudo olha para -Z, o lado do grid: é de lá que o jogador vê o portal na
   * largada. Virado para o outro lado, ele leria a placa de trás na única hora
   * em que ela importa.
   *
   * O arco é um meio toro ACHATADO em Y. Um meio toro puro tem o topo a um raio
   * inteiro acima dos pilares — com o vão de doze metros deste circuito, isso
   * daria um arco de catedral. Achatando, a altura do arco vira um número que
   * se ajusta (`arch.rise`) em vez de uma consequência do vão.
   */
  private addStartGate(path: CircuitPath): void {
    const config = START_GATE;
    const sample = path.samples[0];
    const halfSpan = sample.halfWidth + config.offsetFromEdge;
    const springline = config.pillar.footHeight + config.pillar.height;

    const group = new Group();
    group.name = 'start-gantry';
    group.position.copy(sample.position);
    group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);

    /**
     * Altura do arco a uma fração do vão (0 = topo, 1 = pilar). É a elipse do
     * arco achatado. Os enfeites são pendurados POR ESTA CONTA, e não por
     * alturas escritas à mão: se `rise` ou o vão mudarem, eles continuam
     * encostados no arco em vez de flutuarem ao lado dele.
     */
    const archHeightAt = (fraction: number): number =>
      springline + config.arch.rise * Math.sqrt(Math.max(0, 1 - fraction * fraction));

    const stripes = createStripeTexture('#ff5c96', '#ffffff');
    const cane = new MeshStandardMaterial({
      color: stripes ? 0xffffff : config.colors.pink,
      roughness: 0.22,
      metalness: 0,
      ...(stripes ? { map: stripes } : {}),
    });
    const frosting = new MeshStandardMaterial({
      color: config.colors.frosting,
      roughness: 0.25,
      metalness: 0,
    });
    const hotPink = new MeshStandardMaterial({
      color: config.colors.hotPink,
      roughness: 0.18,
      metalness: 0,
      emissive: config.colors.hotPink,
      emissiveIntensity: 0.06,
    });
    const gold = new MeshStandardMaterial({
      color: config.colors.gold,
      roughness: 0.2,
      metalness: 0,
      emissive: config.colors.gold,
      emissiveIntensity: 0.12,
    });

    this.addGatePillars(group, config, halfSpan, cane, frosting, hotPink);
    this.addGateArch(group, config, halfSpan, springline, cane);
    this.addGateDecorations(group, config, halfSpan, archHeightAt);
    this.addGateSign(group, config, archHeightAt(0), frosting, gold);

    this.root.add(group);
  }

  /** Os dois pilares de bengala, com pé alargado e bloco de bala no chão. */
  private addGatePillars(
    group: Group,
    config: typeof START_GATE,
    halfSpan: number,
    cane: MeshStandardMaterial,
    frosting: MeshStandardMaterial,
    hotPink: MeshStandardMaterial,
  ): void {
    const pillar = config.pillar;
    const checker = createCheckerTexture(config.flag.squares);
    const flagMaterial = new MeshStandardMaterial({
      color: checker ? 0xffffff : 0xffffff,
      roughness: 0.4,
      metalness: 0,
      side: DoubleSide,
      ...(checker ? { map: checker } : {}),
    });

    for (const side of [1, -1]) {
      const x = side * halfSpan;

      const plinth = new Mesh(
        new RoundedBoxGeometry(pillar.plinthSize, pillar.plinthHeight, pillar.plinthSize, 1, 0.22),
        hotPink,
      );
      plinth.position.set(x, pillar.plinthHeight / 2, 0);
      plinth.castShadow = true;
      group.add(plinth);

      const foot = new Mesh(
        new CylinderGeometry(pillar.radius * 1.1, pillar.footRadius, pillar.footHeight, 20),
        frosting,
      );
      foot.position.set(x, pillar.plinthHeight + pillar.footHeight / 2, 0);
      foot.castShadow = true;
      group.add(foot);

      const post = new Mesh(
        new CylinderGeometry(pillar.radius, pillar.radius * 1.08, pillar.height, 20),
        cane,
      );
      post.position.set(x, pillar.footHeight + pillar.height / 2, 0);
      post.castShadow = true;
      group.add(post);

      // Mastro e bandeira de chegada no alto do pilar.
      const top = pillar.footHeight + pillar.height;
      const pole = new Mesh(
        new CylinderGeometry(config.flag.poleRadius, config.flag.poleRadius, config.flag.poleHeight, 10),
        frosting,
      );
      pole.position.set(x, top + config.flag.poleHeight / 2, 0);
      pole.castShadow = true;
      group.add(pole);

      const knob = new Mesh(new SphereGeometry(config.flag.poleRadius * 2.4, 12, 9), hotPink);
      knob.position.set(x, top + config.flag.poleHeight, 0);
      group.add(knob);

      // A bandeira sai para FORA da pista: para dentro, ela cobriria o
      // letreiro justamente de quem está no grid olhando para ele.
      const flag = new Mesh(new PlaneGeometry(config.flag.width, config.flag.height), flagMaterial);
      // Mesma armadilha da placa e da estrela: o plano nasce virado para +Z.
      flag.rotation.y = Math.PI;
      flag.position.set(
        x + side * config.flag.width / 2,
        top + config.flag.poleHeight - config.flag.height * 0.7,
        0,
      );
      flag.castShadow = true;
      flag.name = 'gate-flag';
      group.add(flag);
    }
  }

  /** O tubo do arco, achatado para virar pórtico em vez de catedral. */
  private addGateArch(
    group: Group,
    config: typeof START_GATE,
    halfSpan: number,
    springline: number,
    cane: MeshStandardMaterial,
  ): void {
    const arch = new Mesh(
      new TorusGeometry(halfSpan, config.arch.thickness, 14, 44, Math.PI),
      cane,
    );
    arch.position.set(0, springline, 0);
    arch.scale.y = config.arch.rise / halfSpan;
    arch.castShadow = true;
    group.add(arch);
  }

  /** Pirulitos, nuvens de rosto feliz e estrelas, encostados no arco. */
  private addGateDecorations(
    group: Group,
    config: typeof START_GATE,
    halfSpan: number,
    archHeightAt: (fraction: number) => number,
  ): void {
    const swirl = createSwirlTexture();
    const lollipopMaterial = new MeshStandardMaterial({
      color: swirl ? 0xffffff : config.colors.hotPink,
      roughness: 0.16,
      metalness: 0,
      side: DoubleSide,
      ...(swirl ? { map: swirl } : {}),
    });
    const starMaterial = new MeshStandardMaterial({
      color: config.colors.star,
      roughness: 0.2,
      metalness: 0,
      side: DoubleSide,
      emissive: config.colors.star,
      emissiveIntensity: 0.18,
    });

    // Tudo fica na FRENTE do tubo do arco (-Z), para não ser engolido por ele.
    const front = -config.arch.thickness - 0.25;

    for (const side of [1, -1]) {
      const lollipop = new Mesh(
        new CylinderGeometry(config.lollipop.radius, config.lollipop.radius, config.lollipop.thickness, 28),
        lollipopMaterial,
      );
      // O disco nasce deitado; de pé, ele encara quem está no grid.
      lollipop.rotation.x = Math.PI / 2;
      lollipop.position.set(
        side * halfSpan * config.lollipop.at,
        archHeightAt(config.lollipop.at),
        front,
      );
      lollipop.castShadow = true;
      group.add(lollipop);

      this.addGateCloud(
        group,
        config,
        side * halfSpan * config.cloud.at,
        archHeightAt(config.cloud.at),
        front,
      );

      const star = new Mesh(
        starGeometry(config.star.outerRadius, config.star.innerRadius),
        starMaterial,
      );
      // À frente da NUVEM, e não apenas do tubo do arco.
      //
      // A nuvem vizinha é uma bola de raio `cloud.radius`, e a superfície
      // dianteira dela fica um raio inteiro à frente do próprio centro — bem
      // mais para cá do que o tubo. Por isso a folga sai da conta do raio da
      // nuvem, e não de um número escolhido a olho.
      star.position.set(
        side * halfSpan * config.star.at,
        archHeightAt(config.star.at),
        front - config.cloud.radius - 0.8,
      );
      // Virada para o grid, pelo mesmo motivo que a placa: `starGeometry` monta
      // o leque no sentido anti-horário visto de +Z, então a face nasce
      // apontando para +Z, de costas para quem larga — e some da tela.
      //
      // O sintoma é característico: no relatório do preview a peça aparece com
      // triângulos coletados e ZERO pintados. Peça escondida atrás de outra
      // ainda conta como pintada, então zero é sempre face virada ao contrário.
      star.rotation.y = Math.PI;
      star.rotation.z = side * 0.25;
      star.name = 'gate-star';
      group.add(star);
    }
  }

  /**
   * Uma nuvenzinha de marshmallow com rosto feliz.
   *
   * Os olhos são meio toro com a abertura para BAIXO, que é o "^" de olho
   * fechado sorrindo; a boca é o mesmo meio toro virado, com a abertura para
   * cima. Toro no plano XY já encara -Z, então nenhum dos dois precisa girar
   * fora do próprio eixo.
   */
  private addGateCloud(
    group: Group,
    config: typeof START_GATE,
    x: number,
    y: number,
    z: number,
  ): void {
    const radius = config.cloud.radius;
    const cloudMaterial = new MeshStandardMaterial({
      color: config.colors.cloud,
      roughness: 0.55,
      metalness: 0,
      emissive: config.colors.cloud,
      emissiveIntensity: 0.1,
    });
    const faceMaterial = new MeshStandardMaterial({
      color: config.colors.face,
      roughness: 0.4,
      metalness: 0,
    });
    const cheekMaterial = new MeshStandardMaterial({
      color: config.colors.cheek,
      roughness: 0.4,
      metalness: 0,
    });

    for (const puff of [
      { x: 0, y: 0, scale: 1 },
      { x: -radius * 0.78, y: -radius * 0.22, scale: 0.72 },
      { x: radius * 0.8, y: -radius * 0.18, scale: 0.68 },
      { x: -radius * 0.16, y: radius * 0.58, scale: 0.6 },
    ]) {
      const blob = new Mesh(new SphereGeometry(radius * puff.scale, 14, 11), cloudMaterial);
      blob.position.set(x + puff.x, y + puff.y, z);
      blob.castShadow = true;
      group.add(blob);
    }

    const faceZ = z - radius * 0.92;
    for (const side of [1, -1]) {
      const eye = new Mesh(
        new TorusGeometry(radius * 0.17, radius * 0.045, 6, 12, Math.PI),
        faceMaterial,
      );
      eye.position.set(x + side * radius * 0.32, y + radius * 0.08, faceZ);
      group.add(eye);

      const cheek = new Mesh(new SphereGeometry(radius * 0.13, 10, 8), cheekMaterial);
      cheek.scale.z = 0.35;
      cheek.position.set(x + side * radius * 0.52, y - radius * 0.12, faceZ);
      group.add(cheek);
    }

    const mouth = new Mesh(
      new TorusGeometry(radius * 0.19, radius * 0.05, 6, 14, Math.PI),
      faceMaterial,
    );
    // Meia volta em Z: a abertura passa a apontar para cima, virando sorriso.
    mouth.rotation.z = Math.PI;
    mouth.position.set(x, y - radius * 0.18, faceZ);
    group.add(mouth);
  }

  /** Letreiro "CANDY RUSH", coroa em cima e semáforo pendurado embaixo. */
  private addGateSign(
    group: Group,
    config: typeof START_GATE,
    archTop: number,
    frosting: MeshStandardMaterial,
    gold: MeshStandardMaterial,
  ): void {
    const width = config.sign.width;
    // A textura da placa é 4:1. O plano TEM que ter a mesma proporção, senão as
    // letras saem esticadas.
    const height = width / 4;
    const centerY = archTop + config.sign.aboveArch + height / 2;
    const signZ = -config.arch.thickness - 0.5;

    const texture = createSignTexture(config.sign.text, '#ff4f93');
    const signMaterial = new MeshStandardMaterial({
      color: texture ? 0xffffff : config.colors.hotPink,
      roughness: 0.35,
      metalness: 0,
      ...(texture
        ? { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.3 }
        : {}),
    });

    // Placa de trás, com folga nas bordas: é ela que dá o contorno grosso de
    // glacê da referência e tapa o vão quando o portal é visto de lado.
    const backing = new Mesh(
      new RoundedBoxGeometry(width + 0.7, height + 0.7, 0.45, 1, 0.3),
      frosting,
    );
    backing.position.set(0, centerY, signZ + 0.28);
    backing.castShadow = true;
    group.add(backing);

    const sign = new Mesh(new PlaneGeometry(width, height), signMaterial);
    // O plano nasce virado para +Z, e o grid está em -Z.
    sign.rotation.y = Math.PI;
    sign.position.set(0, centerY, signZ);
    group.add(sign);

    // --- Coroa ---
    const crown = config.crown;
    const crownY = centerY + height / 2 + crown.bandHeight / 2;
    const band = new Mesh(
      new CylinderGeometry(crown.bandRadius, crown.bandRadius, crown.bandHeight, 18),
      gold,
    );
    band.position.set(0, crownY, signZ + 0.2);
    band.castShadow = true;
    group.add(band);

    for (const spike of [-1, 0, 1]) {
      const tall = spike === 0 ? 1.35 : 1;
      const cone = new Mesh(
        new ConeGeometry(crown.spikeRadius, crown.spikeHeight * tall, 10),
        gold,
      );
      cone.position.set(
        spike * crown.bandRadius * 0.72,
        crownY + (crown.spikeHeight * tall) / 2 + crown.bandHeight / 2,
        signZ + 0.2,
      );
      cone.castShadow = true;
      group.add(cone);

      const tip = new Mesh(new SphereGeometry(crown.spikeRadius * 0.55, 10, 8), gold);
      tip.position.set(
        spike * crown.bandRadius * 0.72,
        crownY + crown.spikeHeight * tall + crown.bandHeight / 2,
        signZ + 0.2,
      );
      group.add(tip);
    }

    // --- Semáforo decorativo ---
    const lights = config.lights;
    const barWidth = lights.spacing * lights.count + 0.8;
    const barY = centerY - height / 2 - lights.belowSign - lights.barHeight / 2;

    const bar = new Mesh(
      new RoundedBoxGeometry(barWidth, lights.barHeight, lights.barDepth, 1, 0.2),
      new MeshStandardMaterial({ color: config.colors.lightBar, roughness: 0.4, metalness: 0 }),
    );
    bar.position.set(0, barY, signZ + 0.1);
    bar.castShadow = true;
    group.add(bar);

    const bulbMaterial = new MeshStandardMaterial({
      color: config.colors.lightOn,
      roughness: 0.15,
      metalness: 0,
      emissive: config.colors.lightOn,
      emissiveIntensity: 0.9,
    });
    for (let i = 0; i < lights.count; i++) {
      const bulb = new Mesh(new SphereGeometry(lights.radius, 14, 10), bulbMaterial);
      bulb.scale.z = 0.5;
      bulb.position.set(
        (i - (lights.count - 1) / 2) * lights.spacing,
        barY,
        signZ - lights.barDepth * 0.35,
      );
      group.add(bulb);
    }
  }

  private add(geometry: BufferGeometry | null, material: MeshStandardMaterial): void {
    if (!geometry) return;
    this.root.add(new Mesh(geometry, material));
  }
}

/**
 * Estrela de cinco pontas, chapada: um leque de triângulos do centro para a
 * borda, alternando raio de fora e raio de dentro.
 *
 * Feita à mão porque o Three não tem estrela, e um `ExtrudeGeometry` com um
 * `Shape` traria o motor de triangulação inteiro para desenhar dez triângulos.
 */
function starGeometry(outerRadius: number, innerRadius: number): BufferGeometry {
  const points = 5;
  const positions: number[] = [];

  for (let i = 0; i < points * 2; i++) {
    const angleA = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const angleB = ((i + 1) / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const radiusA = i % 2 === 0 ? outerRadius : innerRadius;
    const radiusB = i % 2 === 0 ? innerRadius : outerRadius;

    positions.push(
      0, 0, 0,
      Math.cos(angleA) * radiusA, Math.sin(angleA) * radiusA, 0,
      Math.cos(angleB) * radiusB, Math.sin(angleB) * radiusB, 0,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}
