import { Vector3 } from 'three';
import { TRACK } from '../config/track';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath } from './circuitPath';

/** Um portal atravessando a pista. A volta só vale se todos forem cruzados. */
export interface Checkpoint {
  /** Índice da amostra do eixo onde o portal fica. */
  readonly sampleIndex: number;
  readonly position: Vector3;
  /** Direção de corrida no portal — é a normal do plano do portal. */
  readonly forward: Vector3;
  readonly halfWidth: number;
  /** Rumo (rotação em Y) para reposicionar o kart olhando na direção certa. */
  readonly heading: number;
}

const _kartPosition = new Vector3();
const _toKart = new Vector3();
const _respawn = new Vector3();

/**
 * Checkpoints em sequência, contagem de voltas e cronometragem.
 *
 * A volta só fecha se TODOS os portais forem cruzados na ordem. É isso que
 * impede corte de percurso: qualquer atalho pula pelo menos um portal, e a
 * passagem pela largada simplesmente não conta.
 *
 * A detecção é por cruzamento de plano, não por proximidade: guarda-se de que
 * lado do portal o kart estava e detecta-se a troca de sinal. Assim funciona
 * em qualquer velocidade, sem depender de o kart ser amostrado dentro de uma
 * caixa (a 120 km/h ele anda 55 cm por passo de física).
 */
export class LapTracker {
  readonly checkpoints: readonly Checkpoint[];

  /** Índice do próximo portal a cruzar. 0 é a largada. */
  nextCheckpoint = 1;
  /** Último portal cruzado — é dele que sai o respawn. */
  lastCheckpoint = 0;

  lap = 0;
  currentLapTime = 0;
  lastLapTime = 0;
  bestLapTime = Infinity;
  /** True apenas no passo em que uma volta foi fechada. */
  lapJustCompleted = false;

  /** Segundos acumulados fora da pista. Zera ao voltar ao asfalto. */
  offTrackTimer = 0;
  /** True apenas no passo em que o kart foi devolvido à pista. */
  justRescued = false;

  /** Lado do plano de cada portal no passo anterior. */
  private readonly previousSide: number[];
  private started = false;

  constructor(private readonly path: CircuitPath) {
    const count = TRACK.checkpoints.count;
    const checkpoints: Checkpoint[] = [];

    for (let i = 0; i < count; i++) {
      const sampleIndex = path.indexAtFraction(i / count);
      const sample = path.samples[sampleIndex];
      checkpoints.push({
        sampleIndex,
        position: sample.position.clone(),
        forward: sample.tangent.clone(),
        halfWidth: sample.halfWidth + TRACK.checkpoints.lateralMargin,
        heading: Math.atan2(sample.tangent.x, sample.tangent.z),
      });
    }

    this.checkpoints = checkpoints;
    this.previousSide = new Array(count).fill(-1);
  }

  /** Um passo fixo. Chamado depois da física do kart. */
  update(dt: number, kart: Kart): void {
    this.lapJustCompleted = false;
    this.justRescued = false;

    kart.body.getChassisPosition(_kartPosition);
    this.updateCrossings(_kartPosition);

    if (this.started) this.currentLapTime += dt;
    this.updateOffTrack(dt, kart);
  }

  private updateCrossings(kartPosition: Vector3): void {
    for (let i = 0; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i];
      _toKart.copy(kartPosition).sub(checkpoint.position);

      const ahead = _toKart.dot(checkpoint.forward);
      const side = ahead >= 0 ? 1 : -1;
      const previous = this.previousSide[i];
      this.previousSide[i] = side;

      // Só interessa a travessia de trás para a frente, e dentro da largura.
      if (previous >= 0 || side <= 0) continue;
      const lateral = Math.abs(
        _toKart.x * this.path.samples[checkpoint.sampleIndex].left.x +
          _toKart.z * this.path.samples[checkpoint.sampleIndex].left.z,
      );
      if (lateral > checkpoint.halfWidth) continue;

      this.onCheckpointCrossed(i);
    }
  }

  private onCheckpointCrossed(index: number): void {
    if (index === 0) {
      // A largada só fecha volta se todos os outros portais já foram cruzados.
      if (!this.started) {
        this.started = true;
        this.currentLapTime = 0;
        this.nextCheckpoint = 1;
        this.lastCheckpoint = 0;
        return;
      }
      if (this.nextCheckpoint !== 0) return;

      this.lap++;
      this.lastLapTime = this.currentLapTime;
      if (this.lastLapTime < this.bestLapTime) this.bestLapTime = this.lastLapTime;
      this.currentLapTime = 0;
      this.lapJustCompleted = true;
      this.nextCheckpoint = 1;
      this.lastCheckpoint = 0;
      return;
    }

    if (index !== this.nextCheckpoint) return;
    this.lastCheckpoint = index;
    this.nextCheckpoint = (index + 1) % this.checkpoints.length;
  }

  /**
   * Fora da pista: conta o tempo e, estourado o limite, devolve o kart ao
   * último portal válido. Voltar ao portal ANTERIOR, e não ao mais próximo,
   * é o que impede usar o resgate como atalho.
   */
  private updateOffTrack(dt: number, kart: Kart): void {
    if (!kart.telemetry.offTrack || kart.telemetry.wheelsOnGround === 0) {
      this.offTrackTimer = 0;
      return;
    }

    this.offTrackTimer += dt;
    if (this.offTrackTimer < TRACK.offTrack.graceSeconds) return;

    this.rescue(kart);
  }

  /**
   * Coloca o kart na linha de largada, na altura certa da pista.
   *
   * A altura de largada NÃO pode ser um número fixo em config: a pista tem
   * elevação, e o ponto zero dela depende do perfil inteiro. Com um valor
   * fixo, mudar a elevação da pista fazia o kart nascer enterrado no asfalto.
   */
  placeAtStart(kart: Kart): void {
    const checkpoint = this.checkpoints[0];
    _respawn.copy(checkpoint.position);
    _respawn.y += TRACK.offTrack.respawnHeight;
    kart.respawnAt(_respawn, checkpoint.heading);
  }

  /** Devolve o kart ao último portal cruzado, parado e apontado para a frente. */
  rescue(kart: Kart): void {
    const checkpoint = this.checkpoints[this.lastCheckpoint];
    _respawn.copy(checkpoint.position);
    _respawn.y += TRACK.offTrack.respawnHeight;
    kart.respawnAt(_respawn, checkpoint.heading);
    this.offTrackTimer = 0;
    this.justRescued = true;
  }

  reset(): void {
    this.nextCheckpoint = 1;
    this.lastCheckpoint = 0;
    this.lap = 0;
    this.currentLapTime = 0;
    this.lastLapTime = 0;
    this.bestLapTime = Infinity;
    this.offTrackTimer = 0;
    this.started = false;
    this.previousSide.fill(-1);
  }

  /** Fração de portais já cruzados nesta volta, 0..1. Para o HUD. */
  get lapProgress(): number {
    const count = this.checkpoints.length;
    const done = this.nextCheckpoint === 0 ? count : this.nextCheckpoint;
    return done / count;
  }
}
