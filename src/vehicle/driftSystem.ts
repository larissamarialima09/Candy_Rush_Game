import { DRIFT, type DriftLevel } from '../config/drift';
import { clamp } from '../core/mathUtils';

/**
 * Máquina de estados do drift e do boost.
 *
 * Não aplica força nenhuma e não sabe o que é um kart: recebe velocidade,
 * ângulo de deslizamento e se há rodas no chão, e devolve "quanto empuxo" e
 * "quanto teto de velocidade extra". Quem aplica é o `Kart`.
 *
 * Essa separação é de propósito — a física do drift tem que continuar valendo
 * mesmo que esta classe seja removida. Ela só observa e recompensa.
 */
export class DriftSystem {
  /** True enquanto o kart está oficialmente derrapando (carregando). */
  drifting = false;
  /** Carga acumulada, na mesma unidade de `DRIFT.charge.levels`. */
  charge = 0;
  /** Nível já conquistado com a carga atual: 0 a 3. */
  level: DriftLevel = 0;
  /** Sentido do deslizamento: -1, 0 ou +1. Usado pelos efeitos. */
  direction = 0;

  /** Nível do boost em curso, 0 se não há boost. */
  boostLevel: DriftLevel = 0;
  private boostTimeLeft = 0;
  private boostDuration = 0;

  /** True apenas no passo em que o boost foi disparado (para efeitos e som). */
  boostJustFired = false;
  /** True apenas no passo em que a carga foi perdida por rodada. */
  spunOut = false;

  private belowExitTimer = 0;

  /**
   * @param slipAngleDeg ângulo de deslizamento COM SINAL (+ = deslizando para
   *        um lado, - para o outro).
   */
  update(dt: number, speed: number, slipAngleDeg: number, onGround: boolean): void {
    this.boostJustFired = false;
    this.spunOut = false;

    this.updateBoost(dt);

    const detection = DRIFT.detection;
    const absSlip = Math.abs(slipAngleDeg);
    const fastEnough = speed >= detection.minSpeed;

    // Rodar não é derrapar: passar do limite queima toda a carga.
    if (this.drifting && absSlip >= detection.spinOutAngleDeg) {
      this.spunOut = true;
      this.stopDrifting(false);
      return;
    }

    if (!this.drifting) {
      if (fastEnough && onGround && absSlip >= detection.enterAngleDeg) {
        this.drifting = true;
        this.charge = 0;
        this.level = 0;
        this.belowExitTimer = 0;
      }
      return;
    }

    // --- Já está derrapando ---
    this.direction = Math.sign(slipAngleDeg);

    const stillSliding = absSlip >= detection.exitAngleDeg && fastEnough && onGround;
    if (stillSliding) {
      this.belowExitTimer = 0;
      this.charge += this.chargeRate(speed, absSlip) * dt;
      this.level = levelForCharge(this.charge);
    } else {
      // Tolerância curta: corrigir a traseira por um instante não encerra o
      // drift, senão é impossível segurar uma derrapagem longa.
      this.belowExitTimer += dt;
      if (this.belowExitTimer >= detection.exitGrace) this.stopDrifting(true);
    }
  }

  /**
   * Taxa de carga: mais rápida quanto mais fundo o deslizamento e quanto maior
   * a velocidade. Derrapar de leve e devagar quase não paga.
   */
  private chargeRate(speed: number, absSlip: number): number {
    const config = DRIFT.charge;
    const detection = DRIFT.detection;

    const depthSpan = Math.max(1, config.idealAngleDeg - detection.enterAngleDeg);
    const depth = clamp((absSlip - detection.enterAngleDeg) / depthSpan, 0, 1);
    const speedFactor = clamp(speed / config.speedReference, 0.4, 1.25);

    return config.baseRatePerSecond * (1 + depth * config.depthBonus) * speedFactor;
  }

  /** Encerra o drift. `release` decide se o boost conquistado é entregue. */
  private stopDrifting(release: boolean): void {
    if (release && this.level > 0) this.triggerBoost(this.level);
    this.drifting = false;
    this.charge = 0;
    this.level = 0;
    this.direction = 0;
    this.belowExitTimer = 0;
  }

  /**
   * Dispara um boost de um nível dado. Público porque a saída de drift não é a
   * única origem possível de turbo — largada e vácuo também disparam boost.
   */
  triggerBoost(level: DriftLevel): void {
    if (level === 0) return;
    const duration = DRIFT.boost.duration[level - 1];
    // Um boost novo só substitui o atual se for pelo menos tão forte: encadear
    // drifts fracos não pode cortar um boost de nível 3 pela metade.
    if (level < this.boostLevel && this.boostTimeLeft > 0) return;

    this.boostLevel = level;
    this.boostDuration = duration;
    this.boostTimeLeft = duration;
    this.boostJustFired = true;
  }

  private updateBoost(dt: number): void {
    if (this.boostTimeLeft <= 0) return;
    this.boostTimeLeft -= dt;
    if (this.boostTimeLeft <= 0) {
      this.boostTimeLeft = 0;
      this.boostLevel = 0;
    }
  }

  get isBoosting(): boolean {
    return this.boostLevel > 0;
  }

  /** Empuxo extra, em N, já com o decaimento aplicado. */
  get boostForce(): number {
    if (this.boostLevel === 0) return 0;
    const peak = DRIFT.boost.force[this.boostLevel - 1];
    return peak * Math.pow(this.boostTimeRemaining, DRIFT.boost.decayExponent);
  }

  /** Quanto sobe o teto de potência do motor, em m/s. */
  get speedCeilingBonus(): number {
    if (this.boostLevel === 0) return 0;
    const bonus = DRIFT.boost.speedCeilingBonus[this.boostLevel - 1];
    return bonus * this.boostTimeRemaining;
  }

  /** Fração restante do boost, 0..1. */
  get boostTimeRemaining(): number {
    if (this.boostDuration <= 0) return 0;
    return clamp(this.boostTimeLeft / this.boostDuration, 0, 1);
  }

  /**
   * Progresso dentro do nível atual, 0..1. É o que a barra do HUD desenha:
   * cheio significa "o próximo nível acabou de ser conquistado".
   */
  get levelProgress(): number {
    const levels = DRIFT.charge.levels;
    const level = this.level;
    if (level === 3) return 1;
    const from = level === 0 ? 0 : levels[level - 1];
    const to = levels[level];
    return clamp((this.charge - from) / Math.max(1e-6, to - from), 0, 1);
  }

  reset(): void {
    this.drifting = false;
    this.charge = 0;
    this.level = 0;
    this.direction = 0;
    this.boostLevel = 0;
    this.boostTimeLeft = 0;
    this.boostDuration = 0;
    this.belowExitTimer = 0;
    this.boostJustFired = false;
    this.spunOut = false;
  }
}

function levelForCharge(charge: number): DriftLevel {
  const levels = DRIFT.charge.levels;
  if (charge >= levels[2]) return 3;
  if (charge >= levels[1]) return 2;
  if (charge >= levels[0]) return 1;
  return 0;
}
