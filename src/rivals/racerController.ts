import { Vector3 } from 'three';
import { RACE } from '../config/race';
import { clamp } from '../core/mathUtils';
import type { InputState } from '../core/input';
import type { CircuitPath } from '../track/circuitPath';
import type { Kart } from '../vehicle/kart';

const LOCAL_FORWARD = new Vector3(0, 0, 1);
const _forward = new Vector3();
const _target = new Vector3();

export interface RivalProfile {
  readonly name: string;
  readonly cornering: number;
  readonly pace: number;
  readonly wander: number;
  readonly wanderPeriod: number;
}

/**
 * Piloto rival.
 *
 * Segue o eixo da pista por perseguição pura e escolhe a velocidade lendo a
 * curvatura à frente: `v = raiz(aceleração * raio)`. Frear pela curva que
 * ainda vai chegar, e não pela que já está embaixo do kart, é o que separa um
 * piloto de um carrinho de autorama.
 *
 * O que impede o rival de parecer trilho são três coisas, e todas vivem no
 * perfil dele: mira um pouco fora do eixo (`wander`, com uma fase própria),
 * ousa uma fração diferente da velocidade de curva (`cornering`) e segura uma
 * fração diferente do acelerador na reta (`pace`).
 *
 * Não trapaceia: produz o MESMO `InputState` que o teclado produz e entrega
 * ao mesmo `Kart`. Se o rival é rápido, é porque a física deixa.
 */
export class RacerController {
  private readonly input: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    respawnPressed: false,
    pausePressed: false,
  };

  /** Relógio próprio, para o desvio de cada piloto ter fase diferente. */
  private clock: number;
  /** Sentido de guinada que `steer = +1` produz. Medido uma vez, lá embaixo. */
  private readonly steerSign: number;

  constructor(
    private readonly path: CircuitPath,
    private readonly profile: RivalProfile,
    phase: number,
    steerSign: number,
  ) {
    this.clock = phase;
    this.steerSign = steerSign;
  }

  /** Um passo fixo: devolve o input que este piloto daria agora. */
  update(dt: number, kart: Kart): InputState {
    this.clock += dt;

    const config = RACE.rival;
    const position = kart.body.position;
    const index = this.path.nearestSampleIndex(position.x, position.z);
    const count = this.path.count;

    // --- Para onde mirar ---
    // O desvio da linha ideal é uma senóide lenta, com fase por piloto: dá
    // uma trajetória que respira em vez de um trilho.
    const drift =
      Math.sin((this.clock / this.profile.wanderPeriod) * Math.PI * 2) * this.profile.wander;
    const aheadIndex = (index + config.lookaheadSamples) % count;
    const lateralLimit = this.path.samples[aheadIndex].halfWidth * 0.7;
    this.path.pointAt(aheadIndex, clamp(drift, -lateralLimit, lateralLimit), 0, _target);

    // --- Volante ---
    kart.body.directionToWorld(LOCAL_FORWARD, _forward);
    _forward.y = 0;
    _forward.normalize();

    const dx = _target.x - position.x;
    const dz = _target.z - position.z;
    const distance = Math.hypot(dx, dz);
    let steer = 0;
    if (distance > 1e-4) {
      const cross = _forward.z * (dx / distance) - _forward.x * (dz / distance);
      const dot = _forward.x * (dx / distance) + _forward.z * (dz / distance);
      steer = clamp(this.steerSign * Math.atan2(cross, dot) * config.steerGain, -1, 1);
    }

    // Escorregando demais: para de insistir na curva e endireita. Sem isso a
    // ele entra em pião e fica girando no lugar até alguém bater nele.
    const slip = kart.telemetry.slipAngleDeg;
    if (Math.abs(slip) > config.countersteerAngle) {
      steer = clamp(steer * 0.25, -1, 1);
    }

    // --- Velocidade alvo, pela curva que ainda vem ---
    const brakeIndex = (index + config.brakeLookaheadSamples) % count;
    const curvature = Math.abs(this.path.samples[brakeIndex].curvature);
    const radius = curvature > 1e-4 ? 1 / curvature : 1000;
    const targetSpeed = Math.min(
      config.maxSpeed * this.profile.pace,
      Math.sqrt(config.corneringAccel * radius) * this.profile.cornering,
    );

    const speed = kart.telemetry.speed;
    this.input.throttle = speed < targetSpeed ? this.profile.pace : 0;
    this.input.brake = speed > targetSpeed * config.brakeThreshold ? 1 : 0;
    this.input.steer = steer;
    this.input.handbrake = false;
    this.input.respawnPressed = false;
    this.input.pausePressed = false;

    return this.input;
  }
}

/**
 * Descobre para que lado `steer = +1` gira, simulando dois segundos.
 *
 * Medido em vez de deduzido: a convenção sai da combinação entre a direção da
 * roda, o produto vetorial usado no pneu e o eixo do mundo. Chutar esse sinal
 * já custou uma sessão inteira de depuração — com ele invertido, o piloto
 * briga consigo mesmo e o kart não sai do lugar.
 */
export function measureSteerSign(makeKart: () => Kart, ground: Parameters<Kart['update']>[2]): number {
  const probe = makeKart();
  const input: InputState = {
    throttle: 1,
    brake: 0,
    steer: 1,
    handbrake: false,
    respawnPressed: false,
    pausePressed: false,
  };
  let yaw = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) {
    probe.update(dt, input, ground);
    yaw += probe.body.angularVelocity.y * dt;
  }
  return Math.sign(yaw) || 1;
}
