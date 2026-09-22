import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SPEED_RAMP } from '../config/trackFeatures';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath } from './circuitPath';

const _kartPosition = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _point = new Vector3();

/**
 * Rampa de aceleração: uma fita de bala com setas de neon, logo depois do
 * Túnel de Donut. Passar por cima entrega turbo.
 *
 * Duas decisões explicam a forma dela.
 *
 * A primeira: ela é COLADA na pista, e não uma laje apoiada em cima. A versão
 * anterior era um bloco rígido e plano, posto na altura do eixo e girado só no
 * rumo — mas a pista sobe, desce e se inclina nas curvas, então o bloco não
 * assentava: uma borda subia e a outra afundava no asfalto. A linha de largada
 * já tinha passado por isso e a solução é a mesma: construir sobre as AMOSTRAS
 * do traçado, com `path.pointAt`, que devolve o ponto já com a inclinação
 * aplicada. Assim cada pedaço nasce exatamente na superfície.
 *
 * A segunda: o turbo NÃO é reimplementado aqui. A rampa chama
 * `kart.drift.triggerBoost`, o mesmo caminho da saída de drift — cujo próprio
 * comentário no `DriftSystem` diz que ele é público justamente porque o drift
 * não é a única origem possível de turbo. Com isso ela herda o decaimento da
 * força, o teto de potência extra, a regra de um boost forte não ser cortado
 * por um fraco, e até o brilho do escapamento que o `kartView` desenha.
 */
export class SpeedRamp {
  readonly root = new Group();

  /** Distância acumulada, em metros, do centro da rampa na volta. */
  private readonly centerDistance: number;
  private readonly totalLength: number;

  constructor(private readonly path: CircuitPath, scene: Scene) {
    this.root.name = 'speed-ramp';
    this.totalLength = path.totalLength;

    const centerIndex = path.indexAtFraction(SPEED_RAMP.at);
    this.centerDistance = path.samples[centerIndex].distance;

    // Quantas amostras cobrem o comprimento pedido. A fita é construída em
    // coordenadas de MUNDO, então o grupo fica sem transformação nenhuma.
    const spacing = path.totalLength / path.count;
    const halfSpan = Math.max(1, Math.round(SPEED_RAMP.length / 2 / spacing));

    this.buildDecal(centerIndex, halfSpan);
    this.buildArrows(centerIndex, halfSpan);
    this.buildPosts(centerIndex, halfSpan);

    scene.add(this.root);
  }

  /** O tapete e as duas bordas listradas, os três seguindo o traçado. */
  private buildDecal(centerIndex: number, halfSpan: number): void {
    const config = SPEED_RAMP;
    const left = config.lateral + config.halfWidth;
    const right = config.lateral - config.halfWidth;
    const rail = 0.42;

    const pad = new MeshStandardMaterial({
      color: config.colors.padLight,
      roughness: 0.2,
      metalness: 0,
      side: DoubleSide,
      emissive: config.colors.padLight,
      emissiveIntensity: 0.08,
      // A fita divide altura com o asfalto: sem isto as duas brigam no
      // z-buffer e a rampa pisca conforme a câmera anda.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const stripe = new MeshStandardMaterial({
      color: config.colors.padStripe,
      roughness: 0.18,
      metalness: 0,
      side: DoubleSide,
      emissive: config.colors.padStripe,
      emissiveIntensity: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    this.root.add(new Mesh(this.ribbon(centerIndex, halfSpan, right + rail, left - rail, config.height), pad));
    this.root.add(new Mesh(this.ribbon(centerIndex, halfSpan, left - rail, left, config.height), stripe));
    this.root.add(new Mesh(this.ribbon(centerIndex, halfSpan, right, right + rail, config.height), stripe));
  }

  /**
   * Uma fita entre dois deslocamentos laterais, acompanhando as amostras.
   * `innerLateral` tem que ser MENOR que `outerLateral`: a ordem dos cantos
   * decide o enrolamento, e trocada a fita sai virada para baixo.
   */
  private ribbon(
    centerIndex: number,
    halfSpan: number,
    innerLateral: number,
    outerLateral: number,
    height: number,
  ): BufferGeometry {
    const count = this.path.count;
    const positions: number[] = [];

    for (let step = -halfSpan; step < halfSpan; step++) {
      const index = (centerIndex + step + count * 2) % count;
      const next = (index + 1) % count;

      this.path.pointAt(index, outerLateral, height, _a);
      this.path.pointAt(index, innerLateral, height, _b);
      this.path.pointAt(next, outerLateral, height, _c);
      this.path.pointAt(next, innerLateral, height, _d);

      positions.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _d.x, _d.y, _d.z);
      positions.push(_a.x, _a.y, _a.z, _d.x, _d.y, _d.z, _c.x, _c.y, _c.z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Setas de neon apontando no sentido de corrida.
   *
   * Cada barra é pequena (menos de um metro), então ela é posta como malha
   * rígida no ponto devolvido por `pointAt` e girada pelo rumo daquela amostra.
   * Ignorar a inclinação DENTRO de uma peça deste tamanho custa milímetros —
   * o erro que importava era o da laje de nove metros, não o deste pedacinho.
   */
  private buildArrows(centerIndex: number, halfSpan: number): void {
    const config = SPEED_RAMP;
    const count = this.path.count;
    const arrow = new MeshStandardMaterial({
      color: config.colors.arrow,
      roughness: 0.1,
      metalness: 0,
      emissive: config.colors.arrow,
      // Alta: é a seta que diz ao jogador "passe AQUI", inclusive à noite.
      emissiveIntensity: 1.6,
    });

    for (let i = 0; i < config.chevrons; i++) {
      const offset = Math.round((-halfSpan + (2 * halfSpan * (i + 0.7)) / (config.chevrons + 0.4)));
      const index = (centerIndex + offset + count * 2) % count;
      const sample = this.path.samples[index];
      const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

      for (const side of [1, -1]) {
        const bar = new Mesh(new RoundedBoxGeometry(config.halfWidth * 1.25, 0.05, 0.4, 1, 0.05), arrow);
        this.path.pointAt(index, config.lateral + side * config.halfWidth * 0.42, config.arrowHeight, _point);
        bar.position.copy(_point);
        bar.rotation.y = heading + side * 0.62;
        this.root.add(bar);
      }
    }
  }

  /**
   * Postes de bala marcando a entrada, FORA do asfalto.
   *
   * Na versão anterior eles ficavam a meia-largura da rampa, ou seja, em cima
   * da pista — e o portal não tem colisão, então o kart passava por dentro
   * deles. Agora ficam além da borda do asfalto, onde só servem de moldura.
   */
  private buildPosts(centerIndex: number, halfSpan: number): void {
    const config = SPEED_RAMP;
    const count = this.path.count;
    const post = new MeshStandardMaterial({ color: config.colors.post, roughness: 0.22, metalness: 0 });
    const postTop = new MeshStandardMaterial({
      color: config.colors.postTop,
      roughness: 0.16,
      metalness: 0,
      emissive: config.colors.postTop,
      emissiveIntensity: 0.15,
    });

    for (const step of [-halfSpan, halfSpan]) {
      const index = (centerIndex + step + count * 2) % count;
      const edge = this.path.samples[index].halfWidth + 0.9;

      for (const side of [1, -1]) {
        this.path.pointAt(index, side * edge, 0, _point);

        const mast = new Mesh(new CylinderGeometry(0.16, 0.18, 1.5, 12), post);
        mast.position.copy(_point).setY(_point.y + 0.75);
        mast.castShadow = true;
        this.root.add(mast);

        const ball = new Mesh(new SphereGeometry(0.3, 12, 9), postTop);
        ball.position.copy(_point).setY(_point.y + 1.62);
        ball.castShadow = true;
        this.root.add(ball);
      }
    }
  }

  /**
   * Dispara o turbo se o kart estiver em cima do tapete.
   *
   * Chamado a cada passo enquanto o kart cruza, o que é proposital: o boost é
   * renovado durante a travessia e começa a contar de verdade quando o kart
   * deixa a rampa. É assim que ela dá "empurrão ao sair" em vez de acabar no
   * meio dela.
   */
  collide(kart: Kart): void {
    kart.body.getChassisPosition(_kartPosition);

    const index = this.path.nearestSampleIndex(_kartPosition.x, _kartPosition.z);
    const lateral = this.path.lateralOffset(index, _kartPosition.x, _kartPosition.z);
    if (Math.abs(lateral - SPEED_RAMP.lateral) > SPEED_RAMP.halfWidth) return;

    // Diferença de distância percorrida, dada a volta FECHADA: sem tratar o
    // fecho, uma rampa perto da linha de chegada nunca dispararia para quem
    // chega por trás dela.
    let along = this.path.samples[index].distance - this.centerDistance;
    if (along > this.totalLength / 2) along -= this.totalLength;
    if (along < -this.totalLength / 2) along += this.totalLength;
    if (Math.abs(along) > SPEED_RAMP.length / 2) return;

    kart.drift.triggerBoost(SPEED_RAMP.boostLevel);
  }
}
