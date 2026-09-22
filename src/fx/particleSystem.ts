import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  type Camera,
  type Scene,
  Vector3,
} from 'three';
import { QUALITY } from '../config/quality';

const _matrix = new Matrix4();
const _scale = new Vector3();
const _color = new Color();
const _from = new Color();
const _to = new Color();

/** Parâmetros de uma partícula no momento em que nasce. */
export interface SpawnOptions {
  position: Vector3;
  velocity: Vector3;
  life: number;
  startSize: number;
  endSize: number;
  colorStart: number;
  colorEnd: number;
  drag: number;
}

/**
 * Pool fixo de partículas desenhado em uma única InstancedMesh.
 *
 * Blending aditivo, de propósito. InstancedMesh dá cor por instância mas não
 * transparência por instância; com blending aditivo, "desbotar até o preto" é
 * exatamente igual a "desaparecer". Resolve o alfa de graça e ainda combina
 * com a estética de brilho de bala.
 *
 * As partículas são visuais: são atualizadas no render, com deltaTime
 * variável. Nada aqui influencia a física.
 */
export class ParticleSystem {
  private readonly mesh: InstancedMesh;
  private readonly positions: Vector3[] = [];
  private readonly velocities: Vector3[] = [];
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly startSize: Float32Array;
  private readonly endSize: Float32Array;
  private readonly drag: Float32Array;
  private readonly colorStart: Color[] = [];
  private readonly colorEnd: Color[] = [];

  private cursor = 0;
  /** Partículas vivas neste instante — só para diagnóstico. */
  alive = 0;

  constructor(scene: Scene, capacity = QUALITY.particlePoolSize) {
    const geometry = new CircleGeometry(0.5, 8);
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      // A cor por instância multiplica esta; branco deixa a instância mandar.
      color: 0xffffff,
      toneMapped: false,
    });

    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;

    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.startSize = new Float32Array(capacity);
    this.endSize = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    for (let i = 0; i < capacity; i++) {
      this.positions.push(new Vector3());
      this.velocities.push(new Vector3());
      this.colorStart.push(new Color());
      this.colorEnd.push(new Color());
      // Nasce escondido: escala zero.
      _matrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _matrix);
      this.mesh.setColorAt(i, _color.setHex(0x000000));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    scene.add(this.mesh);
  }

  get capacity(): number {
    return this.life.length;
  }

  /**
   * Emite uma partícula. O pool é circular: quando enche, a mais antiga é
   * reciclada. Prefiro isso a deixar de emitir — o efeito degrada suave em vez
   * de sumir bem na hora em que a ação está mais intensa.
   */
  spawn(options: SpawnOptions): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;

    this.positions[i].copy(options.position);
    this.velocities[i].copy(options.velocity);
    this.life[i] = options.life;
    this.maxLife[i] = options.life;
    this.startSize[i] = options.startSize;
    this.endSize[i] = options.endSize;
    this.drag[i] = options.drag;
    this.colorStart[i].setHex(options.colorStart);
    this.colorEnd[i].setHex(options.colorEnd);
  }

  /** Avança e redesenha. `camera` é usada para orientar os billboards. */
  update(dt: number, camera: Camera): void {
    const billboard: Quaternion = camera.quaternion;
    let alive = 0;

    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;

      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        _matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _matrix);
        continue;
      }

      alive++;
      const t = 1 - this.life[i] / this.maxLife[i];

      const velocity = this.velocities[i];
      velocity.multiplyScalar(Math.max(0, 1 - this.drag[i] * dt));
      this.positions[i].addScaledVector(velocity, dt);

      const size = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      _scale.setScalar(size);
      _matrix.compose(this.positions[i], billboard, _scale);
      this.mesh.setMatrixAt(i, _matrix);

      // Desbota até o preto: com blending aditivo, preto é invisível.
      _from.copy(this.colorStart[i]);
      _to.copy(this.colorEnd[i]);
      _color.copy(_from).lerp(_to, t).multiplyScalar(1 - t * t);
      this.mesh.setColorAt(i, _color);
    }

    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
