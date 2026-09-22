import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  type Scene,
  Vector3,
} from 'three';
import { QUALITY } from '../config/quality';
import { clamp } from '../core/mathUtils';
import type { Kart } from '../vehicle/kart';
import type { Wheel } from '../vehicle/wheel';

const _travel = new Vector3();
const _perpendicular = new Vector3();
const _fromLeft = new Vector3();
const _fromRight = new Vector3();
const _toLeft = new Vector3();
const _toRight = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Configuração das marcas. */
const SKID = {
  /** Largura da marca, em metros. Um pouco maior que o pneu, como na vida. */
  width: 0.28,
  /** Altura acima da superfície, para não brigar com o asfalto no z-buffer. */
  lift: 0.035,
  /** Distância mínima percorrida, em metros, para gravar um novo segmento. */
  minSegment: 0.25,
  /** Escorregamento lateral (m/s) a partir do qual o pneu marca. */
  minSlip: 1.4,
  /** Escorregamento em que a marca chega à opacidade máxima. */
  fullSlip: 5,
  maxOpacity: 0.5,
  /** Segundos até a marca sumir. */
  life: 9,
} as const;

/** Estado por roda entre um segmento e o seguinte. */
interface Trail {
  /** Último ponto de contato gravado. */
  readonly lastPoint: Vector3;
  /** False enquanto ainda não há um ponto anterior para ligar. */
  started: boolean;
}

/**
 * Marcas de pneu no chão.
 *
 * Uma malha só, com um anel de quadriláteros reescritos em ordem. Cada
 * segmento liga o contato anterior ao atual, formando uma fita contínua em vez
 * de manchas soltas — é a diferença entre "rastro de derrapagem" e "carimbos
 * espaçados" quando o kart está rápido.
 *
 * A opacidade vive no atributo de cor com QUATRO componentes. O three liga o
 * caminho de alfa por vértice sozinho quando o `color` tem itemSize 4, e é
 * isso que deixa cada segmento desbotar no seu próprio tempo sem precisar de
 * um material por marca.
 */
export class SkidMarks {
  private readonly geometry = new BufferGeometry();
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly born: Float32Array;
  private readonly strength: Float32Array;
  private readonly trails = new Map<Wheel, Trail>();

  private cursor = 0;
  private clock = 0;
  private readonly capacity: number;

  constructor(scene: Scene) {
    this.capacity = QUALITY.skidMarkCount;

    // Seis vértices por quadrilátero (dois triângulos, sem índice).
    this.positions = new Float32Array(this.capacity * 6 * 3);
    this.colors = new Float32Array(this.capacity * 6 * 4);
    this.born = new Float32Array(this.capacity).fill(-1000);
    this.strength = new Float32Array(this.capacity);

    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 4));

    const mesh = new Mesh(
      this.geometry,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    // Sem culling: a malha cobre a pista inteira e sua caixa nunca é calculada.
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  /**
   * Passo de render. É puro visual: deltaTime variável está certo aqui.
   *
   * Recebe TODOS os karts que marcam o chão de uma vez, e não um por chamada,
   * porque `clock` e `fade` valem para a malha inteira: chamar duas vezes por
   * quadro no coop faria o relógio andar em dobro e as marcas desbotarem na
   * metade do tempo configurado.
   *
   * O rastro em si já era por roda — `trails` é indexado pelo objeto `Wheel`,
   * que é distinto em cada kart — então dois pilotos derrapando lado a lado
   * deixam duas fitas separadas sem nenhum trabalho extra.
   */
  update(dt: number, karts: readonly Kart[]): void {
    this.clock += dt;
    for (const kart of karts) {
      for (const wheel of kart.wheels) this.updateWheel(wheel);
    }
    this.fade();
  }

  private updateWheel(wheel: Wheel): void {
    let trail = this.trails.get(wheel);
    if (!trail) {
      trail = { lastPoint: new Vector3(), started: false };
      this.trails.set(wheel, trail);
    }

    const slip = Math.abs(wheel.slipLateral);
    if (!wheel.grounded || slip < SKID.minSlip) {
      // Solta a fita: o próximo contato começa um rastro novo, em vez de ligar
      // no ponto onde o pneu parou de escorregar metros atrás.
      trail.started = false;
      return;
    }

    if (!trail.started) {
      trail.lastPoint.copy(wheel.contactPoint);
      trail.started = true;
      return;
    }

    _travel.copy(wheel.contactPoint).sub(trail.lastPoint);
    _travel.y = 0;
    // Só grava depois de andar o bastante. Sem isso, o kart parado com o pneu
    // girando consumiria o anel inteiro no mesmo lugar.
    if (_travel.lengthSq() < SKID.minSegment * SKID.minSegment) return;

    // A largura da marca é perpendicular ao avanço REAL do ponto de contato,
    // não à orientação da roda — num drift os dois são bem diferentes, e é o
    // avanço que desenha o rastro.
    _travel.normalize();
    _perpendicular.copy(UP).cross(_travel).normalize().multiplyScalar(SKID.width * 0.5);

    _fromLeft.copy(trail.lastPoint).add(_perpendicular);
    _fromRight.copy(trail.lastPoint).sub(_perpendicular);
    _toLeft.copy(wheel.contactPoint).add(_perpendicular);
    _toRight.copy(wheel.contactPoint).sub(_perpendicular);
    _fromLeft.y += SKID.lift;
    _fromRight.y += SKID.lift;
    _toLeft.y += SKID.lift;
    _toRight.y += SKID.lift;

    const strength = clamp((slip - SKID.minSlip) / (SKID.fullSlip - SKID.minSlip), 0, 1);
    this.pushQuad(strength);
    trail.lastPoint.copy(wheel.contactPoint);
  }

  private pushQuad(strength: number): void {
    const quad = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.born[quad] = this.clock;
    this.strength[quad] = strength;

    const base = quad * 6 * 3;
    write(this.positions, base, _fromLeft);
    write(this.positions, base + 3, _fromRight);
    write(this.positions, base + 6, _toRight);
    write(this.positions, base + 9, _fromLeft);
    write(this.positions, base + 12, _toRight);
    write(this.positions, base + 15, _toLeft);

    this.geometry.attributes.position.needsUpdate = true;
  }

  /** Envelhece todas as marcas e escreve a opacidade no atributo de cor. */
  private fade(): void {
    for (let quad = 0; quad < this.capacity; quad++) {
      const age = this.clock - this.born[quad];
      const alpha =
        age < 0 || age > SKID.life
          ? 0
          : (1 - age / SKID.life) * SKID.maxOpacity * this.strength[quad];

      const base = quad * 6 * 4;
      for (let v = 0; v < 6; v++) {
        const offset = base + v * 4;
        // Marca escura e levemente arroxeada: preto puro fica duro demais
        // contra o rosa da pista.
        this.colors[offset] = 0.16;
        this.colors[offset + 1] = 0.1;
        this.colors[offset + 2] = 0.16;
        this.colors[offset + 3] = alpha;
      }
    }
    this.geometry.attributes.color.needsUpdate = true;
  }

  clear(): void {
    this.born.fill(-1000);
    this.trails.clear();
    this.fade();
  }
}

function write(target: Float32Array, offset: number, vector: Vector3): void {
  target[offset] = vector.x;
  target[offset + 1] = vector.y;
  target[offset + 2] = vector.z;
}
