import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../config/camera';
import { EFFECTS } from '../config/effects';
import { clamp, degToRad, lerp } from '../core/mathUtils';
import type { Kart } from '../vehicle/kart';

const LOCAL_FORWARD = new Vector3(0, 0, 1);
const WORLD_UP = new Vector3(0, 1, 0);

// Rascunhos: a câmera roda dentro do passo fixo, então nada de alocar aqui.
const _kartPosition = new Vector3();
const _forward = new Vector3();
const _anchor = new Vector3();
const _aimTarget = new Vector3();
const _accel = new Vector3();
const _anchorVelocity = new Vector3();
const _aimVelocity = new Vector3();
const _renderPosition = new Vector3();
const _renderAim = new Vector3();
const _viewDirection = new Vector3();
const _up = new Vector3();

/**
 * Câmera perseguidora com peso.
 *
 * Duas molas independentes (posição e mira) integradas no passo fixo, mais três
 * modulações que dependem do estado do kart: recuo por aceleração, antecipação
 * da mira por velocidade e inclinação lateral por aceleração de curva.
 *
 * O `update` roda no passo fixo; o `applyToRender` interpola entre os dois
 * últimos estados, igual ao kart, para não microtravar em telas rápidas.
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;

  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private readonly aim = new Vector3();
  private readonly aimVelocity = new Vector3();
  private rollAngle = 0;

  // Alvos do passo anterior, para estimar a velocidade dos alvos por diferença
  // finita. Ver a nota sobre atraso permanente em `integrateSpring`.
  private readonly previousAnchor = new Vector3();
  private readonly previousAimTarget = new Vector3();

  /** Aceleração longitudinal filtrada, em m/s². */
  private smoothedAccel = 0;
  private previousForwardSpeed = 0;

  /** Campo de visão atual, em graus. É o efeito de velocidade mais forte. */
  private fov: number = EFFECTS.fov.atRest;
  /** Compensação fixa da tela dividida, em graus. Zero em tela cheia. */
  private fovBonus = 0;
  /** Amplitude do tremor, em metros. */
  private shakeMeters = 0;
  /** Relógio do ruído do tremor. Só avança no passo fixo. */
  private shakeClock = 0;
  /** Ângulo da órbita do menu, em radianos. */
  private showcaseAngle = 0;

  // Snapshots para interpolação de render.
  private readonly prevPosition = new Vector3();
  private readonly prevAim = new Vector3();
  private prevRoll = 0;
  private prevFov: number = EFFECTS.fov.atRest;
  private prevShake = 0;

  private initialized = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(
      EFFECTS.fov.atRest,
      aspect,
      CAMERA.near,
      CAMERA.far,
    );
  }

  /** Aceleração longitudinal filtrada, em m/s². É ela que move a câmera para
   *  trás ou para a frente. Exposta para diagnóstico. */
  get accelerationSignal(): number {
    return this.smoothedAccel;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Graus somados ao campo de visão, de forma permanente.
   *
   * Existe para a tela dividida: numa faixa baixa, o FOV vertical calculado
   * pela velocidade enxerga pouco à frente. O bônus é somado DEPOIS de toda a
   * modulação por velocidade e turbo, e não substitui nada — a sensação de
   * aceleração continua vindo da variação do FOV, só que deslocada para cima.
   */
  setFovBonus(degrees: number): void {
    this.fovBonus = degrees;
  }

  reset(kart: Kart): void {
    const body = kart.body;
    body.getChassisPosition(_kartPosition);
    body.directionToWorld(LOCAL_FORWARD, _forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, 1);
    _forward.normalize();

    _anchor
      .copy(_kartPosition)
      .addScaledVector(_forward, -CAMERA.offset.distance)
      .addScaledVector(WORLD_UP, CAMERA.offset.height);
    _aimTarget
      .copy(_kartPosition)
      .addScaledVector(_forward, CAMERA.look.aheadBase)
      .addScaledVector(WORLD_UP, CAMERA.look.height);

    this.snapTo(_anchor, _aimTarget);
    this.initialized = true;
  }

  /**
   * Um passo FIXO de câmera.
   * @param offTrack true quando o kart está fora do asfalto — só intensifica
   *        o tremor. Nenhuma penalidade de jogo depende disso.
   */
  update(dt: number, kart: Kart, offTrack = false): void {
    this.prevPosition.copy(this.position);
    this.prevAim.copy(this.aim);
    this.prevRoll = this.rollAngle;
    this.prevFov = this.fov;
    this.prevShake = this.shakeMeters;
    this.shakeClock += dt;

    const body = kart.body;
    body.getChassisPosition(_kartPosition);
    body.directionToWorld(LOCAL_FORWARD, _forward);

    // Achatar o forward: a câmera segue o RUMO do kart, não a atitude dele.
    // Se ela copiasse arfagem e rolagem, cada ondulação viraria enjoo.
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, 1);
    _forward.normalize();

    const forwardSpeed = kart.telemetry.forwardSpeed;

    // Respawn é tratado ANTES de medir aceleração: o teletransporte não pode
    // virar uma desaceleração gigante no filtro.
    const snapping =
      !this.initialized || (kart.telemetry.respawned && CAMERA.snapOnRespawn);
    if (snapping) {
      this.smoothedAccel = 0;
      this.previousForwardSpeed = forwardSpeed;
    }

    // --- Recuo por aceleração ---
    const rawAccel = (forwardSpeed - this.previousForwardSpeed) / dt;
    this.previousForwardSpeed = forwardSpeed;
    const smoothing = Math.min(1, CAMERA.acceleration.smoothing * dt);
    this.smoothedAccel += (rawAccel - this.smoothedAccel) * smoothing;

    const accelOffset = clamp(
      this.smoothedAccel * CAMERA.acceleration.metersPerAccel,
      -CAMERA.acceleration.maxPullIn,
      CAMERA.acceleration.maxPullBack,
    );

    // --- Âncora: onde a câmera GOSTARIA de estar neste instante ---
    const distance = CAMERA.offset.distance + accelOffset;
    _anchor
      .copy(_kartPosition)
      .addScaledVector(_forward, -distance)
      .addScaledVector(WORLD_UP, CAMERA.offset.height);

    // --- Mira: à frente do kart, com antecipação crescendo com a velocidade ---
    const ahead =
      CAMERA.look.aheadBase + Math.max(0, forwardSpeed) * CAMERA.look.aheadPerSpeed;
    _aimTarget
      .copy(_kartPosition)
      .addScaledVector(_forward, ahead)
      .addScaledVector(WORLD_UP, CAMERA.look.height);

    if (snapping) {
      this.snapTo(_anchor, _aimTarget);
      this.initialized = true;
    }

    // Velocidade dos alvos por diferença finita, usada como pré-alimentação.
    _anchorVelocity.copy(_anchor).sub(this.previousAnchor).divideScalar(dt);
    _aimVelocity.copy(_aimTarget).sub(this.previousAimTarget).divideScalar(dt);
    this.previousAnchor.copy(_anchor);
    this.previousAimTarget.copy(_aimTarget);

    integrateSpring(
      this.position,
      this.velocity,
      _anchor,
      _anchorVelocity,
      CAMERA.follow.stiffness,
      CAMERA.follow.damping,
      dt,
    );
    integrateSpring(
      this.aim,
      this.aimVelocity,
      _aimTarget,
      _aimVelocity,
      CAMERA.aim.stiffness,
      CAMERA.aim.damping,
      dt,
    );

    // Nunca atravessar o chão. Zerar a velocidade vertical evita que a mola
    // continue empurrando para baixo e a câmera "arraste" no piso.
    const floor = CAMERA.minHeightAboveGround;
    if (this.position.y < floor) {
      this.position.y = floor;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    this.updateRoll(dt, kart, forwardSpeed);
    this.updateFieldOfView(dt, kart);
    this.updateShake(dt, kart, offTrack);
  }

  /**
   * FOV dinâmico. É o efeito de velocidade mais importante do jogo: esticar a
   * periferia da tela faz o cenário passar voando sem custar um único pixel de
   * pós-processamento. Parado ~70°, na máxima ~95°, no turbo até ~111°.
   */
  private updateFieldOfView(dt: number, kart: Kart): void {
    const config = EFFECTS.fov;
    const speedT = clamp(kart.telemetry.speed / config.referenceSpeed, 0, 1);
    const boostT = kart.drift.boostTimeRemaining;
    const target =
      lerp(config.atRest, config.atTopSpeed, speedT) +
      config.boostBonus * boostT +
      this.fovBonus;

    this.fov += (target - this.fov) * Math.min(1, config.responsiveness * dt);
  }

  /**
   * Amplitude do tremor. Cresce com a velocidade, salta no turbo e multiplica
   * fora do asfalto. O deslocamento em si é calculado no render, para o tremor
   * não realimentar a mola da câmera.
   */
  private updateShake(dt: number, kart: Kart, offTrack: boolean): void {
    const config = EFFECTS.shake;
    const speed = kart.telemetry.speed;

    let target = 0;
    if (speed > config.minSpeed) {
      const t = clamp(
        (speed - config.minSpeed) / (config.referenceSpeed - config.minSpeed),
        0,
        1,
      );
      target = config.speedAmplitude * t;
      target += config.boostAmplitude * kart.drift.boostTimeRemaining;
      if (offTrack) target *= config.offTrackMultiplier;
    }

    this.shakeMeters += (target - this.shakeMeters) * Math.min(1, 8 * dt);
  }

  /**
   * Inclinação lateral. A aceleração lateral é estimada por
   * `taxa de guinada * velocidade` — mesma coisa que v²/raio, mas sem derivada
   * e sem ruído. O sinal é negativo porque guinada positiva (anti-horária,
   * curva à esquerda) tem que inclinar a câmera para a esquerda.
   */
  private updateRoll(dt: number, kart: Kart, forwardSpeed: number): void {
    const cfg = CAMERA.roll;
    let target = 0;

    if (Math.abs(forwardSpeed) > cfg.minSpeed) {
      const lateralAccel = kart.body.angularVelocity.y * forwardSpeed;
      target = clamp(
        -lateralAccel * cfg.degreesPerLateralAccel,
        -cfg.maxDegrees,
        cfg.maxDegrees,
      );
    }

    const t = Math.min(1, cfg.responsiveness * dt);
    this.rollAngle += (target - this.rollAngle) * t;
  }

  /**
   * Modo vitrine do menu: gira devagar em volta do kart parado.
   *
   * Usa `snapTo` a cada passo de propósito. As molas ficam sempre exatamente
   * onde deveriam estar, então quando a corrida começa a câmera já está no
   * lugar certo e não dá aquele solavanco de "recuperar o atraso".
   */
  showcase(dt: number, kart: Kart): void {
    const config = CAMERA.showcase;
    this.showcaseAngle += config.revolutionsPerSecond * Math.PI * 2 * dt;

    kart.body.getChassisPosition(_kartPosition);
    _anchor.set(
      _kartPosition.x + Math.sin(this.showcaseAngle) * config.distance,
      _kartPosition.y + config.height,
      _kartPosition.z + Math.cos(this.showcaseAngle) * config.distance,
    );
    _aimTarget.set(_kartPosition.x, _kartPosition.y + config.lookHeight, _kartPosition.z);

    this.snapTo(_anchor, _aimTarget);
    this.initialized = true;

    // O FOV volta ao repouso e o tremor zera: o menu é uma cena calma.
    this.fov += (EFFECTS.fov.atRest + this.fovBonus - this.fov) * Math.min(1, 3 * dt);
    this.prevFov = this.fov;
    this.shakeMeters = 0;
    this.prevShake = 0;
  }

  /** Corta a suavização: usado no respawn e no primeiro quadro. */
  private snapTo(position: Vector3, aim: Vector3): void {
    this.position.copy(position);
    this.aim.copy(aim);
    this.velocity.set(0, 0, 0);
    this.aimVelocity.set(0, 0, 0);
    this.rollAngle = 0;
    this.smoothedAccel = 0;
    this.previousAnchor.copy(position);
    this.previousAimTarget.copy(aim);
    this.prevPosition.copy(position);
    this.prevAim.copy(aim);
    this.prevRoll = 0;
    this.fov = EFFECTS.fov.atRest + this.fovBonus;
    this.prevFov = this.fov;
    this.shakeMeters = 0;
    this.prevShake = 0;
    this.shakeClock = 0;
  }

  /** `alpha` vem do acumulador do loop. */
  applyToRender(alpha: number): void {
    _renderPosition.copy(this.prevPosition).lerp(this.position, alpha);
    _renderAim.copy(this.prevAim).lerp(this.aim, alpha);
    const roll = this.prevRoll + (this.rollAngle - this.prevRoll) * alpha;

    this.camera.position.copy(_renderPosition);

    // Roll aplicado girando o vetor "cima" em torno da direção de visão, antes
    // do lookAt. É o jeito mais barato de inclinar sem brigar com o lookAt.
    _viewDirection.copy(_renderAim).sub(_renderPosition);
    if (_viewDirection.lengthSq() < 1e-8) _viewDirection.set(0, 0, 1);
    _viewDirection.normalize();

    _up.copy(WORLD_UP).applyAxisAngle(_viewDirection, degToRad(roll));
    this.camera.up.copy(_up);
    this.camera.lookAt(_renderAim);

    const fov = this.prevFov + (this.fov - this.prevFov) * alpha;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.applyShake(alpha);
  }

  /**
   * Tremor, aplicado DEPOIS do lookAt e nos eixos locais da câmera, para ser
   * tremor de câmera e não deslocamento no mundo. Duas frequências
   * incomensuráveis somadas evitam o padrão pulsante de uma senóide só.
   */
  private applyShake(alpha: number): void {
    const amplitude = this.prevShake + (this.shakeMeters - this.prevShake) * alpha;
    if (amplitude < 1e-4) return;

    const config = EFFECTS.shake;
    const t = this.shakeClock;
    const x = Math.sin(t * Math.PI * 2 * config.frequencyA);
    const y = Math.sin(t * Math.PI * 2 * config.frequencyB + 1.7);

    this.camera.translateX(x * amplitude);
    this.camera.translateY(y * amplitude);

    const maxAmplitude = config.speedAmplitude + config.boostAmplitude;
    const normalized = clamp(amplitude / maxAmplitude, 0, 1);
    this.camera.rotateZ(degToRad(config.rollDegrees * normalized) * y);
  }
}

/**
 * Mola amortecida semi-implícita, igual à física do kart: primeiro a
 * velocidade, depois a posição com a velocidade nova.
 *
 * O amortecimento é aplicado sobre a velocidade RELATIVA ao alvo, não sobre a
 * velocidade absoluta da câmera. Sem isso, seguir um alvo em velocidade
 * constante deixa um atraso permanente de `velocidade * amortecimento /
 * rigidez` — a 22 m/s isso são mais de 3 metros, e a câmera acabava afastando
 * com a VELOCIDADE em vez de com a ACELERAÇÃO, atropelando (e invertendo) o
 * recuo configurado em `CAMERA.acceleration`.
 *
 * Com a pré-alimentação, movimento uniforme não gera erro nenhum e a mola só
 * reage ao que muda: acelerar, frear, virar. Que é exatamente o peso que se
 * quer sentir.
 */
const _delta = new Vector3();
const _relativeVelocity = new Vector3();
function integrateSpring(
  position: Vector3,
  velocity: Vector3,
  target: Vector3,
  targetVelocity: Vector3,
  stiffness: number,
  damping: number,
  dt: number,
): void {
  _delta.copy(target).sub(position);
  _relativeVelocity.copy(velocity).sub(targetVelocity);
  _accel.copy(_delta).multiplyScalar(stiffness).addScaledVector(_relativeVelocity, -damping);
  velocity.addScaledVector(_accel, dt);
  position.addScaledVector(velocity, dt);
}
