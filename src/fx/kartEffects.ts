import { Vector3 } from 'three';
import { EFFECTS } from '../config/effects';
import { SURFACES } from '../config/track';
import type { BarrierContact } from '../track/barriers';
import type { Kart } from '../vehicle/kart';
import type { ParticleSystem } from './particleSystem';

const LOCAL_FORWARD = new Vector3(0, 0, 1);
const LOCAL_LATERAL = new Vector3(1, 0, 0);
const WORLD_UP = new Vector3(0, 1, 0);

const _forward = new Vector3();
const _lateral = new Vector3();
const _position = new Vector3();
const _velocity = new Vector3();
const _origin = new Vector3();

/**
 * Liga o estado do kart às partículas.
 *
 * Duas fontes: fumaça de pneu nas rodas traseiras enquanto derrapa, e rastro
 * de turbo atrás do kart enquanto o boost dura. A cor da fumaça muda com o
 * NÍVEL DE CARGA — é o feedback mais importante do drift, porque deixa o
 * jogador saber quanto já carregou sem tirar os olhos da pista.
 *
 * Roda no render, com deltaTime variável. Nada aqui toca a física.
 */
export class KartEffects {
  /** Acumuladores de emissão: taxa fracionária vira partícula inteira. */
  private driftDebt = 0;
  private boostDebt = 0;
  private dustDebt = 0;
  private sparkDebt = 0;

  constructor(
    private readonly kart: Kart,
    private readonly particles: ParticleSystem,
  ) {}

  update(dt: number, barrier?: BarrierContact): void {
    if (dt <= 0) return;
    this.emitDriftSmoke(dt);
    this.emitBoostTrail(dt);
    this.emitSurfaceDust(dt);
    if (barrier?.touching) this.emitSparks(dt, barrier);
    else this.sparkDebt = 0;
  }

  /**
   * Poeira em superfície solta. Sai de cada roda que estiver em grama ou areia,
   * com a cor definida pelo próprio material — é o que avisa, sem olhar o HUD,
   * que você está pagando pedágio fora da pista.
   */
  private emitSurfaceDust(dt: number): void {
    const config = EFFECTS.particles.surface;
    const speed = this.kart.telemetry.speed;
    if (speed < config.minSpeed) {
      this.dustDebt = 0;
      return;
    }

    const intensity = Math.min(1, speed / config.referenceSpeed);
    this.dustDebt += config.rate * intensity * dt;
    const perWheel = Math.floor(this.dustDebt);
    this.dustDebt -= perWheel;
    if (perWheel === 0) return;

    for (const wheel of this.kart.wheels) {
      if (!wheel.grounded) continue;
      const material = SURFACES[wheel.surface];
      if (material.particle === 'none') continue;

      for (let n = 0; n < perWheel; n++) {
        _position.copy(wheel.contactPoint);
        _position.y += 0.05;

        _velocity
          .copy(WORLD_UP)
          .multiplyScalar(config.upwardSpeed * (0.5 + Math.random()))
          .addScaledVector(this.kart.body.velocity, -0.12);
        _velocity.x += (Math.random() - 0.5) * config.spread;
        _velocity.z += (Math.random() - 0.5) * config.spread;

        this.particles.spawn({
          position: _position,
          velocity: _velocity,
          life: config.life * (0.7 + Math.random() * 0.6),
          startSize: config.startSize,
          endSize: config.endSize,
          colorStart: material.particleColor,
          colorEnd: material.particleColor,
          drag: config.drag,
        });
      }
    }
  }

  /** Faíscas do raspão na barreira, jogadas para fora do contato. */
  private emitSparks(dt: number, barrier: BarrierContact): void {
    const config = EFFECTS.particles.sparks;
    const intensity = Math.min(1, barrier.slideSpeed / config.referenceSpeed);
    if (intensity <= 0.05) return;

    this.sparkDebt += config.rate * intensity * dt;
    while (this.sparkDebt >= 1) {
      this.sparkDebt -= 1;

      _position.copy(barrier.point);
      _velocity
        .copy(this.kart.body.velocity)
        .multiplyScalar(-0.25)
        .addScaledVector(WORLD_UP, config.speed * 0.35);
      _velocity.x += (Math.random() - 0.5) * config.spread;
      _velocity.y += Math.random() * config.spread * 0.5;
      _velocity.z += (Math.random() - 0.5) * config.spread;

      this.particles.spawn({
        position: _position,
        velocity: _velocity,
        life: config.life * (0.6 + Math.random() * 0.8),
        startSize: config.startSize,
        endSize: config.endSize,
        colorStart: config.colorStart,
        colorEnd: config.colorEnd,
        drag: config.drag,
      });
    }
  }

  private emitDriftSmoke(dt: number): void {
    const drift = this.kart.drift;
    const config = EFFECTS.particles.drift;

    if (!drift.drifting) {
      this.driftDebt = 0;
      return;
    }

    const body = this.kart.body;
    body.directionToWorld(LOCAL_LATERAL, _lateral);
    _lateral.y = 0;
    _lateral.normalize();

    const color = config.colorByLevel[Math.min(drift.level, 3)];
    // Quanto mais fundo o deslizamento, mais fumaça.
    const intensity = Math.min(1, Math.abs(this.kart.telemetry.slipAngleDeg) / 35);

    this.driftDebt += config.rate * intensity * dt;
    // A taxa é POR RODA: cada traseira no chão emite esta quantidade.
    const perWheel = Math.floor(this.driftDebt);
    this.driftDebt -= perWheel;
    if (perWheel === 0) return;

    for (const wheel of this.kart.wheels) {
      if (wheel.spec.isFront || !wheel.grounded) continue;

      for (let n = 0; n < perWheel; n++) {
        _position.copy(wheel.contactPoint);
        _position.y += 0.06;

        _velocity
          .copy(WORLD_UP)
          .multiplyScalar(config.upwardSpeed * (0.6 + Math.random() * 0.8))
          .addScaledVector(_lateral, -drift.direction * config.lateralSpeed * Math.random());
        _velocity.x += (Math.random() - 0.5) * config.spread;
        _velocity.z += (Math.random() - 0.5) * config.spread;

        this.particles.spawn({
          position: _position,
          velocity: _velocity,
          life: config.life * (0.7 + Math.random() * 0.6),
          startSize: config.startSize,
          endSize: config.endSize,
          colorStart: color,
          colorEnd: color,
          drag: config.drag,
        });
      }
    }
  }

  private emitBoostTrail(dt: number): void {
    const drift = this.kart.drift;
    const config = EFFECTS.particles.boost;

    if (!drift.isBoosting) {
      this.boostDebt = 0;
      return;
    }

    const body = this.kart.body;
    body.directionToWorld(LOCAL_FORWARD, _forward);
    body.getChassisPosition(_origin);
    // Saída do escapamento: logo atrás e um pouco acima do chassi.
    _origin.addScaledVector(_forward, -0.95);
    _origin.y += 0.15;

    const color = config.colorByLevel[Math.min(drift.boostLevel, 3)];
    this.boostDebt += config.rate * drift.boostTimeRemaining * dt;

    while (this.boostDebt >= 1) {
      this.boostDebt -= 1;

      _position.copy(_origin);
      _position.x += (Math.random() - 0.5) * 0.7;
      _position.z += (Math.random() - 0.5) * 0.7;

      _velocity
        .copy(_forward)
        .multiplyScalar(-config.backwardSpeed)
        .addScaledVector(body.velocity, 0.25);
      _velocity.x += (Math.random() - 0.5) * config.spread;
      _velocity.y += Math.random() * config.spread * 0.6;
      _velocity.z += (Math.random() - 0.5) * config.spread;

      this.particles.spawn({
        position: _position,
        velocity: _velocity,
        life: config.life * (0.7 + Math.random() * 0.6),
        startSize: config.startSize,
        endSize: config.endSize,
        colorStart: color,
        colorEnd: config.colorByLevel[0],
        drag: config.drag,
      });
    }
  }
}
