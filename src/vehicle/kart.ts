import { Quaternion, Vector3 } from 'three';
import { DRIFT } from '../config/drift';
import { KART } from '../config/kart';
import { PHYSICS } from '../config/physics';
import { SURFACES, type SurfaceKind } from '../config/track';
import { DriftSystem } from './driftSystem';
import { clamp, degToRad, lerp, moveTowards } from '../core/mathUtils';
import type { InputState } from '../core/input';
import { createHit, type GroundSampler, type RaycastHit } from '../physics/ground';
import { RigidBody } from '../physics/rigidBody';
import { Wheel, type WheelSpec } from './wheel';

const LOCAL_FORWARD = new Vector3(0, 0, 1);
const LOCAL_DOWN = new Vector3(0, -1, 0);
const LOCAL_UP = new Vector3(0, 1, 0);

// Rascunhos de passo. Nada de `new` dentro do loop de física.
const _attach = new Vector3();
const _down = new Vector3();
const _up = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _velAtPoint = new Vector3();
const _force = new Vector3();
const _applyPoint = new Vector3();
const _tmp = new Vector3();
const _respawnPosition = new Vector3();
const _respawnOrientation = new Quaternion();
const UP_AXIS = new Vector3(0, 1, 0);

/** Números que o HUD e (mais tarde) os efeitos leem. Só leitura. */
export interface KartTelemetry {
  speed: number;
  forwardSpeed: number;
  /**
   * Ângulo entre para onde o kart aponta e para onde ele anda, em graus,
   * COM SINAL e no intervalo -180..180. É a entrada do detector de drift.
   */
  slipAngleDeg: number;
  steerAngleDeg: number;
  wheelsOnGround: number;
  driveForce: number;
  reversing: boolean;
  /** True apenas no passo em que o kart foi reposicionado. A câmera usa isso
   *  para cortar a suavização em vez de varrer o mapa atrás do kart. */
  respawned: boolean;
  /** Material predominante sob as rodas neste instante. */
  surface: SurfaceKind;
  /** True quando NENHUMA roda está sobre asfalto ou zebra. */
  offTrack: boolean;
}

export class Kart {
  readonly body: RigidBody;
  readonly wheels: Wheel[];
  /** Detector de drift e medidor de boost. Só observa a física; não a força. */
  readonly drift = new DriftSystem();

  /** Estado do volante depois da suavização, em -1..1. */
  private steerInput = 0;
  private invertedTimer = 0;
  /**
   * Multiplicador de teto de velocidade da superfície, medido no passo
   * anterior. Um passo de atraso (16 ms) é invisível, e evita ter de rodar os
   * raycasts das rodas antes de decidir a força do motor.
   */
  private surfaceSpeedFactor = 1;
  private readonly hit: RaycastHit = createHit();

  // Snapshots para interpolação de render.
  private readonly prevPosition = new Vector3();
  private readonly prevOrientation = new Quaternion();
  private readonly currPosition = new Vector3();
  private readonly currOrientation = new Quaternion();

  readonly telemetry: KartTelemetry = {
    speed: 0,
    forwardSpeed: 0,
    slipAngleDeg: 0,
    steerAngleDeg: 0,
    wheelsOnGround: 0,
    driveForce: 0,
    reversing: false,
    respawned: false,
    surface: 'asfalto',
    offTrack: false,
  };

  constructor() {
    const c = KART.chassis;
    this.body = new RigidBody({
      mass: c.mass,
      size: new Vector3(c.size.x, c.size.y, c.size.z),
      centerOfMass: new Vector3(c.centerOfMass.x, c.centerOfMass.y, c.centerOfMass.z),
      inertiaScale: new Vector3(c.inertiaScale.x, c.inertiaScale.y, c.inertiaScale.z),
      linearDamping: c.linearDamping,
      angularDamping: c.angularDamping,
    });

    this.wheels = buildWheels();
    this.respawn();
  }

  /** Recoloca o kart no ponto de partida, zerando velocidades. */
  respawn(): void {
    const spawn = KART.spawn;
    _respawnPosition.set(spawn.position.x, spawn.position.y, spawn.position.z);
    this.respawnAt(_respawnPosition, degToRad(spawn.headingDegrees));
  }

  /**
   * Reposiciona o kart num ponto e rumo quaisquer, parado.
   * É o que o sistema de checkpoints usa para devolver quem saiu da pista ao
   * último portal válido, olhando na direção certa.
   */
  respawnAt(position: Vector3, headingRadians: number): void {
    _respawnOrientation.setFromAxisAngle(UP_AXIS, headingRadians);
    this.body.setChassisTransform(position, _respawnOrientation);
    this.steerInput = 0;
    this.invertedTimer = 0;
    this.telemetry.respawned = true;
    this.drift.reset();
    for (const wheel of this.wheels) {
      wheel.grounded = false;
      wheel.compression = 0;
      wheel.suspensionForce = 0;
      wheel.steerAngle = 0;
    }
    this.body.getChassisPosition(this.currPosition);
    this.currOrientation.copy(this.body.orientation);
    this.prevPosition.copy(this.currPosition);
    this.prevOrientation.copy(this.currOrientation);
  }

  /** Um passo de física de tamanho FIXO. */
  update(dt: number, input: InputState, ground: GroundSampler): void {
    this.prevPosition.copy(this.currPosition);
    this.prevOrientation.copy(this.currOrientation);
    this.telemetry.respawned = false;

    if (input.respawnPressed) this.respawn();

    this.body.directionToWorld(LOCAL_FORWARD, _forward);
    const forwardSpeed = this.body.velocity.dot(_forward);

    // O ângulo de deslizamento é medido ANTES de qualquer força deste passo:
    // é o estado real do kart, e é a única entrada do detector de drift.
    const slipAngleDeg = this.computeSlipAngle();
    this.telemetry.slipAngleDeg = slipAngleDeg;
    this.drift.update(
      dt,
      this.body.velocity.length(),
      slipAngleDeg,
      this.telemetry.wheelsOnGround > 0,
    );

    this.updateSteering(dt, input);

    // --- Estado do trem de força para este passo ---
    const eng = KART.engine;
    const reversing = input.brake > 0 && forwardSpeed < eng.reverseEngageSpeed;
    const throttleCut = input.handbrake && KART.handbrake.cutsThrottle;
    const throttle = throttleCut ? 0 : input.throttle;

    let driveTotal = 0;
    if (reversing) {
      const ratio = clamp(-forwardSpeed / eng.reverseTopSpeed, 0, 1);
      driveTotal = -eng.reverseForce * (1 - ratio) * input.brake;
    } else if (throttle > 0) {
      // Curva de torque: empuxo cheio parado, caindo até zero no teto.
      // O boost levanta esse teto — sem isso o empuxo extra empurraria contra
      // uma curva de torque já zerada e o turbo não passaria da máxima normal.
      // A superfície corta o teto de potência: na grama o motor entrega força
      // até bem antes, e é isso que torna cortar caminho ruim negócio.
      const cutoff =
        (eng.powerCutoffSpeed + this.drift.speedCeilingBonus) * this.surfaceSpeedFactor;
      const ratio = clamp(forwardSpeed / cutoff, 0, 1);
      const curve = Math.max(0, 1 - Math.pow(ratio, eng.powerFalloffExponent));
      driveTotal = eng.maxDriveForce * curve * throttle;
    }

    const braking = !reversing && input.brake > 0 ? input.brake : 0;
    // Sem acelerador e sem freio: freio-motor.
    const coasting = throttle === 0 && braking === 0 && !reversing;

    const poweredCount = this.wheels.reduce((n, w) => n + (w.spec.powered ? 1 : 0), 0);
    const drivePerWheel = poweredCount > 0 ? driveTotal / poweredCount : 0;

    this.applyAero();
    this.applyBoost();

    let onGround = 0;
    let speedFactorSum = 0;
    let pavedWheels = 0;
    for (const wheel of this.wheels) {
      this.updateWheel(wheel, dt, ground, {
        drivePerWheel,
        braking,
        coasting,
        handbrake: input.handbrake,
      });
      if (wheel.grounded) {
        onGround++;
        const surface = SURFACES[wheel.surface];
        speedFactorSum += surface.maxSpeed;
        if (!surface.offTrack) pavedWheels++;
      }
    }

    // Média das rodas no chão: com duas na grama e duas no asfalto o kart fica
    // no meio do caminho, em vez de decidir tudo pela pior roda.
    this.surfaceSpeedFactor = onGround > 0 ? speedFactorSum / onGround : 1;
    this.telemetry.offTrack = onGround > 0 && pavedWheels === 0;
    this.telemetry.surface = dominantSurface(this.wheels);

    this.body.integrate(dt, PHYSICS.gravity);
    this.updateRecovery(dt);

    this.body.getChassisPosition(this.currPosition);
    this.currOrientation.copy(this.body.orientation);

    this.updateTelemetry(forwardSpeed, driveTotal, reversing, onGround);
  }

  /**
   * Volante: a intenção crua (-1/0/1) vira um ângulo suavizado, e o ângulo
   * máximo disponível ENCOLHE com a velocidade. Sem isso, um toque na tecla
   * a 90 km/h roda o kart instantaneamente.
   */
  private updateSteering(dt: number, input: InputState): void {
    const s = KART.steering;
    const rate = input.steer === 0 ? s.returnRate : s.turnRate;
    this.steerInput = moveTowards(this.steerInput, input.steer, rate * dt);

    const speed = this.body.velocity.length();
    const t = clamp(speed / s.falloffSpeed, 0, 1);
    let factor = lerp(1, s.highSpeedFactor, t);
    let maxAngle = degToRad(s.maxAngleDegrees);

    // Assistência de contra-esterço: derrapando, o kart devolve parte do
    // esterço que a alta velocidade tinha tirado. Sem isso o batente disponível
    // a 80 km/h é pequeno demais para segurar a traseira, e o drift vira uma
    // loteria em vez de uma habilidade.
    if (this.drift.drifting) {
      factor = lerp(factor, 1, DRIFT.steering.driftFalloffRelief);
      maxAngle *= DRIFT.steering.driftSteerMultiplier;
    }

    const angle = maxAngle * factor * this.steerInput;

    for (const wheel of this.wheels) {
      if (wheel.spec.steered) wheel.steerAngle = angle;
    }
  }

  /**
   * Rede de segurança: sem colisão de chassi (Fase 4), um kart capotado tem
   * os raios das rodas apontando para o céu e cai para sempre.
   */
  private updateRecovery(dt: number): void {
    const r = KART.recovery;

    if (this.body.position.y < r.fallThroughHeight) {
      this.respawn();
      return;
    }

    this.body.directionToWorld(LOCAL_UP, _tmp);
    const upsideDown = _tmp.y < 0.2;
    const stopped = this.body.velocity.length() < r.stuckSpeed;

    if (upsideDown && stopped) {
      this.invertedTimer += dt;
      if (this.invertedTimer >= r.invertedTimeout) this.respawn();
    } else {
      this.invertedTimer = 0;
    }
  }

  /**
   * Ângulo entre para onde o kart aponta e para onde ele realmente anda.
   * Com sinal, no intervalo -180..180, medido no plano horizontal.
   */
  private computeSlipAngle(): number {
    _tmp.copy(this.body.velocity);
    _tmp.y = 0;
    // Abaixo de 1 m/s o ângulo é só ruído numérico.
    if (_tmp.lengthSq() < 1) return 0;

    this.body.directionToWorld(LOCAL_FORWARD, _forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) return 0;
    _forward.normalize();

    const along = _tmp.dot(_forward);
    // Componente lateral com sinal: é o y de (frente × velocidade).
    const lateral = _forward.z * _tmp.x - _forward.x * _tmp.z;
    return (Math.atan2(lateral, along) * 180) / Math.PI;
  }

  /**
   * Empuxo do boost, aplicado no CENTRO DE MASSA de propósito: força pura, sem
   * torque. Aplicada na traseira daria um agachamento bonito e também uma
   * rotação parasita bem no momento em que se quer o kart apontado reto.
   */
  private applyBoost(): void {
    const force = this.drift.boostForce;
    if (force <= 0) return;
    this.body.directionToWorld(LOCAL_FORWARD, _forward);
    _force.copy(_forward).multiplyScalar(force);
    this.body.addForce(_force);
  }

  /** Arrasto (contra a velocidade) e downforce (para baixo no mundo). */
  private applyAero(): void {
    const speed = this.body.velocity.length();
    if (speed < 1e-3) return;

    _force.copy(this.body.velocity).multiplyScalar(-KART.aero.dragCoefficient * speed);
    _force.y -= KART.aero.downforceCoefficient * speed * speed;
    this.body.addForce(_force);
  }

  private updateWheel(
    wheel: Wheel,
    dt: number,
    ground: GroundSampler,
    ctx: { drivePerWheel: number; braking: number; coasting: boolean; handbrake: boolean },
  ): void {
    const susp = KART.suspension;
    const spec = wheel.spec;

    this.body.localToWorld(spec.positionLocal, _attach);
    this.body.directionToWorld(LOCAL_DOWN, _down);

    // O raio vai do ponto de fixação até onde o pneu tocaria com a mola solta.
    const rayLength = susp.restLength + spec.radius;

    if (!ground.raycast(_attach, _down, rayLength, this.hit)) {
      wheel.grounded = false;
      wheel.surface = 'asfalto';
      wheel.compression = 0;
      wheel.suspensionForce = 0;
      wheel.forceLateral = 0;
      wheel.forceLongitudinal = 0;
      wheel.saturated = false;
      wheel.worldCenter.copy(_attach).addScaledVector(_down, susp.restLength);
      return;
    }

    wheel.grounded = true;
    wheel.surface = this.hit.surface;
    wheel.compression = clamp(rayLength - this.hit.distance, 0, susp.maxTravel);
    wheel.contactPoint.copy(this.hit.point);
    wheel.contactNormal.copy(this.hit.normal);
    wheel.worldCenter.copy(_attach).addScaledVector(_down, susp.restLength - wheel.compression);

    _up.copy(_down).multiplyScalar(-1);

    // --- Suspensão: mola + amortecedor, ao longo do eixo do chassi ---
    this.body.getPointVelocity(_attach, _velAtPoint);
    // Positivo quando a mola está comprimindo.
    const compressionSpeed = -_velAtPoint.dot(_up);
    const damper = compressionSpeed > 0 ? susp.damperBump : susp.damperRebound;
    let springForce = susp.stiffness * wheel.compression + damper * compressionSpeed;
    // A suspensão empurra, nunca puxa.
    springForce = clamp(springForce, 0, susp.maxForce);
    wheel.suspensionForce = springForce;

    _force.copy(_up).multiplyScalar(springForce);
    this.body.addForceAtPoint(_force, this.hit.point);

    // --- Referencial do pneu, projetado no plano do chão ---
    this.body.directionToWorld(LOCAL_FORWARD, _forward);
    if (wheel.steerAngle !== 0) _forward.applyAxisAngle(_up, wheel.steerAngle);
    // Remove a componente normal para as forças ficarem no plano de contato.
    _forward.addScaledVector(this.hit.normal, -_forward.dot(this.hit.normal));
    if (_forward.lengthSq() < 1e-8) return;
    _forward.normalize();
    _right.copy(this.hit.normal).cross(_forward).normalize();

    this.body.getPointVelocity(this.hit.point, _velAtPoint);
    const vLong = _velAtPoint.dot(_forward);
    const vLat = _velAtPoint.dot(_right);
    wheel.slipLongitudinal = vLong;
    wheel.slipLateral = vLat;

    const tires = KART.tires;
    const surface = SURFACES[wheel.surface];
    const load = springForce; // carga vertical: é ela que compra grip
    const massShare = this.body.mass * tires.tireMassShare;

    // --- Grip lateral ---
    // Força que zeraria a velocidade lateral neste passo, saturada pelo limite
    // do eixo. Front e rear têm limites diferentes de propósito: é essa
    // diferença que define subesterço x sobresterço.
    let gripCoefficient = (spec.isFront ? tires.frontGrip : tires.rearGrip) * surface.grip;
    if (ctx.handbrake && !spec.isFront) gripCoefficient *= KART.handbrake.rearGripMultiplier;

    const maxLateral = Math.min(gripCoefficient * load, tires.maxLateralForce);
    const desiredLateral = (-vLat * massShare) / dt;
    let lateral = clamp(desiredLateral, -maxLateral, maxLateral);

    // --- Força longitudinal: tração, freio, rolamento, freio-motor ---
    const brakes = KART.brakes;
    // Só as rodas de tração recebem empuxo do motor. O kart é traseira pura.
    let longitudinal = spec.powered ? ctx.drivePerWheel : 0;

    let resistance = ctx.braking * brakes.force * spec.brakeShare;
    if (ctx.handbrake && !spec.isFront) resistance += KART.handbrake.rearBrakeForce * 0.5;
    resistance += brakes.rollingResistance * surface.rollingResistance * Math.abs(vLong);
    if (ctx.coasting) resistance += brakes.engineBraking * Math.abs(vLong);

    // Resistência nunca pode inverter o sentido de rotação da roda dentro de
    // um passo — isso faria o kart "quicar" para trás ao parar.
    const maxStopping = (Math.abs(vLong) * massShare) / dt;
    resistance = Math.min(resistance, maxStopping);
    longitudinal -= Math.sign(vLong) * resistance;

    const maxLongitudinal = tires.longitudinalGrip * surface.grip * load;
    longitudinal = clamp(longitudinal, -maxLongitudinal, maxLongitudinal);

    // --- Círculo (elipse) de atrito: lateral e longitudinal dividem o pneu ---
    wheel.saturated = Math.abs(desiredLateral) > maxLateral;
    if (tires.useFrictionCircle && maxLateral > 1e-3 && maxLongitudinal > 1e-3) {
      const load2 = Math.hypot(longitudinal / maxLongitudinal, lateral / maxLateral);
      if (load2 > 1) {
        longitudinal /= load2;
        lateral /= load2;
        wheel.saturated = true;
      }
    }

    wheel.forceLongitudinal = longitudinal;
    wheel.forceLateral = lateral;

    _force.copy(_forward).multiplyScalar(longitudinal);
    _tmp.copy(_right).multiplyScalar(lateral);
    _force.add(_tmp);

    // A força do pneu é aplicada ACIMA do ponto de contato. Aplicada no chão,
    // o braço de alavanca até o centro de massa capota o kart antes mesmo de
    // o pneu escorregar. Ver `tires.forceApplicationHeight`.
    _applyPoint
      .copy(this.hit.point)
      .addScaledVector(this.hit.normal, tires.forceApplicationHeight);
    this.body.addForceAtPoint(_force, _applyPoint);

    // Giro visual da roda, a partir da velocidade de avanço no contato.
    wheel.spinAngle += (vLong / spec.radius) * dt;
  }

  private updateTelemetry(
    forwardSpeed: number,
    driveTotal: number,
    reversing: boolean,
    onGround: number,
  ): void {
    const t = this.telemetry;
    t.speed = this.body.velocity.length();
    t.forwardSpeed = forwardSpeed;
    t.driveForce = driveTotal;
    t.reversing = reversing;
    t.wheelsOnGround = onGround;
    t.steerAngleDeg = (this.wheels.find((w) => w.spec.steered)?.steerAngle ?? 0) * (180 / Math.PI);
    // `slipAngleDeg` já foi medido no início do passo, antes de qualquer força:
    // é ele que alimenta o detector de drift.
  }

  /** Transformação interpolada para o render (evita microtravamento). */
  getRenderTransform(alpha: number, outPosition: Vector3, outOrientation: Quaternion): void {
    outPosition.copy(this.prevPosition).lerp(this.currPosition, alpha);
    outOrientation.copy(this.prevOrientation).slerp(this.currOrientation, alpha);
  }
}

/**
 * Material predominante sob o kart: o mais repetido entre as rodas no chão.
 * Empate resolve pela primeira roda, o que é irrelevante na prática.
 */
function dominantSurface(wheels: readonly Wheel[]): SurfaceKind {
  const tally = new Map<SurfaceKind, number>();
  let best: SurfaceKind = 'asfalto';
  let bestCount = 0;

  for (const wheel of wheels) {
    if (!wheel.grounded) continue;
    const count = (tally.get(wheel.surface) ?? 0) + 1;
    tally.set(wheel.surface, count);
    if (count > bestCount) {
      bestCount = count;
      best = wheel.surface;
    }
  }
  return best;
}

function buildWheels(): Wheel[] {
  const w = KART.wheels;
  const frontBias = KART.brakes.frontBias;

  const specs: WheelSpec[] = [
    {
      name: 'FL',
      positionLocal: new Vector3(-w.halfTrackFront, w.attachY, w.frontAxleZ),
      radius: w.radiusFront,
      steered: true,
      powered: false,
      isFront: true,
      brakeShare: frontBias / 2,
    },
    {
      name: 'FR',
      positionLocal: new Vector3(w.halfTrackFront, w.attachY, w.frontAxleZ),
      radius: w.radiusFront,
      steered: true,
      powered: false,
      isFront: true,
      brakeShare: frontBias / 2,
    },
    {
      name: 'RL',
      positionLocal: new Vector3(-w.halfTrackRear, w.attachY, w.rearAxleZ),
      radius: w.radiusRear,
      steered: false,
      powered: true,
      isFront: false,
      brakeShare: (1 - frontBias) / 2,
    },
    {
      name: 'RR',
      positionLocal: new Vector3(w.halfTrackRear, w.attachY, w.rearAxleZ),
      radius: w.radiusRear,
      steered: false,
      powered: true,
      isFront: false,
      brakeShare: (1 - frontBias) / 2,
    },
  ];

  return specs.map((spec) => new Wheel(spec));
}
