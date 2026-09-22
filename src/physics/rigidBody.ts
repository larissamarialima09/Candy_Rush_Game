import { Quaternion, Vector3 } from 'three';

/**
 * Corpo rígido de 6 graus de liberdade com integração semi-implícita (Euler
 * simplético): primeiro a velocidade é atualizada com as forças acumuladas,
 * depois a posição é atualizada com a velocidade NOVA. É estável o suficiente
 * para molas rígidas em passo fixo e é o que praticamente todo jogo usa.
 *
 * Convenções:
 *  - `position` é a posição de MUNDO do CENTRO DE MASSA, não da origem do chassi.
 *    Isso mantém as equações de torque limpas (τ = r × F com r medido do CM).
 *  - Pontos locais informados de fora (rodas, etc.) são relativos à ORIGEM DO
 *    CHASSI. A conversão desconta `centerOfMassLocal` internamente.
 *  - O tensor de inércia é diagonal no espaço local (aproximação de caixa).
 *    Termos giroscópicos (ω × Iω) são ignorados de propósito: em veículo eles
 *    são irrelevantes e só trazem instabilidade numérica.
 */
export interface RigidBodyOptions {
  mass: number;
  /** Extensões TOTAIS da caixa usada para aproximar a inércia (x, y, z). */
  size: Vector3;
  /** Centro de massa em coordenadas locais, relativo à origem do chassi. */
  centerOfMass: Vector3;
  /** Multiplicador por eixo sobre a inércia da caixa (x=pitch, y=yaw, z=roll). */
  inertiaScale: Vector3;
  linearDamping: number;
  angularDamping: number;
}

// Vetores de rascunho reaproveitados: alocação por passo de física é lixo caro.
const _r = new Vector3();
const _tmp = new Vector3();
const _spin = new Quaternion();
const _invRot = new Quaternion();

export class RigidBody {
  /** Posição de mundo do centro de massa. */
  readonly position = new Vector3();
  readonly orientation = new Quaternion();
  readonly velocity = new Vector3();
  /** Velocidade angular de mundo, em rad/s. */
  readonly angularVelocity = new Vector3();

  readonly centerOfMassLocal = new Vector3();

  readonly mass: number;
  readonly invMass: number;
  /** Inversa da inércia no espaço LOCAL (diagonal). */
  readonly invInertiaLocal = new Vector3();

  private readonly force = new Vector3();
  private readonly torque = new Vector3();

  linearDamping: number;
  angularDamping: number;

  constructor(options: RigidBodyOptions) {
    this.mass = options.mass;
    this.invMass = 1 / options.mass;
    this.centerOfMassLocal.copy(options.centerOfMass);
    this.linearDamping = options.linearDamping;
    this.angularDamping = options.angularDamping;

    // Inércia de uma caixa sólida homogênea: I_x = m/12 * (y² + z²), etc.
    const { x: sx, y: sy, z: sz } = options.size;
    const k = options.mass / 12;
    const ix = k * (sy * sy + sz * sz) * options.inertiaScale.x;
    const iy = k * (sx * sx + sz * sz) * options.inertiaScale.y;
    const iz = k * (sx * sx + sy * sy) * options.inertiaScale.z;
    this.invInertiaLocal.set(1 / ix, 1 / iy, 1 / iz);
  }

  /** Posiciona o corpo informando onde a ORIGEM DO CHASSI deve ficar. */
  setChassisTransform(chassisPosition: Vector3, orientation: Quaternion): void {
    this.orientation.copy(orientation);
    _tmp.copy(this.centerOfMassLocal).applyQuaternion(this.orientation);
    this.position.copy(chassisPosition).add(_tmp);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }

  /** Posição de mundo da origem do chassi (o que a malha visual usa). */
  getChassisPosition(out: Vector3): Vector3 {
    out.copy(this.centerOfMassLocal).applyQuaternion(this.orientation);
    return out.multiplyScalar(-1).add(this.position);
  }

  /** Converte um ponto local (relativo à origem do chassi) para mundo. */
  localToWorld(local: Vector3, out: Vector3): Vector3 {
    out.copy(local).sub(this.centerOfMassLocal).applyQuaternion(this.orientation);
    return out.add(this.position);
  }

  /** Converte uma direção local para mundo (sem translação). */
  directionToWorld(local: Vector3, out: Vector3): Vector3 {
    return out.copy(local).applyQuaternion(this.orientation);
  }

  /** Velocidade de um ponto de mundo solidário ao corpo: v + ω × r. */
  getPointVelocity(worldPoint: Vector3, out: Vector3): Vector3 {
    _r.copy(worldPoint).sub(this.position);
    return out.copy(this.angularVelocity).cross(_r).add(this.velocity);
  }

  addForce(force: Vector3): void {
    this.force.add(force);
  }

  /** Força aplicada em um ponto de mundo: gera força linear E torque. */
  addForceAtPoint(force: Vector3, worldPoint: Vector3): void {
    this.force.add(force);
    _r.copy(worldPoint).sub(this.position).cross(force);
    this.torque.add(_r);
  }

  addTorque(torque: Vector3): void {
    this.torque.add(torque);
  }

  /**
   * Avança um passo FIXO. `gravity` é a aceleração no eixo Y (negativa).
   * Aplicada no centro de massa, portanto sem torque.
   */
  integrate(dt: number, gravity: number): void {
    // --- Linear ---
    _tmp.copy(this.force).multiplyScalar(this.invMass);
    _tmp.y += gravity;
    this.velocity.addScaledVector(_tmp, dt);
    this.velocity.multiplyScalar(Math.max(0, 1 - this.linearDamping * dt));

    // --- Angular: α = R · (I_local⁻¹ · (Rᵀ · τ)) ---
    _invRot.copy(this.orientation).invert();
    _tmp.copy(this.torque).applyQuaternion(_invRot);
    _tmp.multiply(this.invInertiaLocal);
    _tmp.applyQuaternion(this.orientation);
    this.angularVelocity.addScaledVector(_tmp, dt);
    this.angularVelocity.multiplyScalar(Math.max(0, 1 - this.angularDamping * dt));

    // --- Integração das posições com a velocidade já atualizada ---
    this.position.addScaledVector(this.velocity, dt);

    // dq/dt = ½ · ω(quaternion puro) · q
    _spin.set(this.angularVelocity.x, this.angularVelocity.y, this.angularVelocity.z, 0);
    _spin.multiply(this.orientation);
    this.orientation.x += _spin.x * 0.5 * dt;
    this.orientation.y += _spin.y * 0.5 * dt;
    this.orientation.z += _spin.z * 0.5 * dt;
    this.orientation.w += _spin.w * 0.5 * dt;
    this.orientation.normalize();

    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }
}
