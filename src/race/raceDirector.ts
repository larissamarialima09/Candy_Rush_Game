import { Vector3 } from 'three';
import { RACE } from '../config/race';
import type { CircuitPath } from '../track/circuitPath';
import { LapTracker } from '../track/lapTracker';
import type { Kart } from '../vehicle/kart';

const _a = new Vector3();
const _b = new Vector3();
const _delta = new Vector3();
const _normal = new Vector3();

/** Um competidor: o jogador ou um adversário. */
export interface Competitor {
  readonly name: string;
  readonly kart: Kart;
  readonly isPlayer: boolean;
  /** Portais/checkpoints que validam a volta deste competidor. */
  readonly tracker: LapTracker;
  /** Progresso total percorrido, em metros, contando as voltas. */
  progress: number;
  /** Volta atual, começando em 0. */
  lap: number;
  /** Posição na corrida, 1 = liderando. */
  position: number;
  /** Índice da amostra do traçado mais próxima, do passo anterior. */
  lastSampleIndex: number;
  /** True depois de cruzar a linha na última volta. */
  finished: boolean;
  /** Tempo total, em segundos, no momento em que terminou. */
  finishTime: number;
}

/**
 * Dirige a corrida: mede o progresso de cada um, ordena as posições, resolve
 * as colisões entre karts e decide quem terminou.
 *
 * A volta é validada pelos mesmos portais/checkpoints usados pelo HUD. O
 * progresso ainda é medido em metros para ordenar karts lado a lado, mas a
 * chegada só conta quando o competidor cruza a linha depois de passar pelos
 * checkpoints da volta. Isso evita atalhos e também evita a classificação
 * errada quando o traçado passa perto de si mesmo.
 */
export class RaceDirector {
  readonly competitors: Competitor[] = [];
  /** Tempo de corrida, em segundos. Só anda depois da largada. */
  elapsed = 0;
  /**
   * True quando TODOS os pilotos humanos cruzaram a linha na última volta.
   *
   * Com coop local isso é o que encerra a corrida, e não o primeiro humano a
   * terminar: cortar para a tela de resultado assim que o piloto 1 chega
   * roubaria do piloto 2 a volta que ele ainda estava correndo.
   */
  playersFinished = false;
  /** Posição final do primeiro piloto humano, 1 = venceu. */
  playerPosition = 0;
  /** Primeiro competidor a completar todas as voltas. */
  winner: Competitor | null = null;

  constructor(
    private readonly path: CircuitPath,
    _legacyLapTrackers?: readonly LapTracker[],
  ) {
    void _legacyLapTrackers;
  }

  add(name: string, kart: Kart, isPlayer: boolean, tracker = new LapTracker(this.path)): Competitor {
    const competitor: Competitor = {
      name,
      kart,
      isPlayer,
      tracker,
      progress: 0,
      lap: 0,
      position: this.competitors.length + 1,
      lastSampleIndex: this.path.nearestSampleIndex(
        kart.body.position.x,
        kart.body.position.z,
      ),
      finished: false,
      finishTime: 0,
    };
    this.competitors.push(competitor);
    return competitor;
  }

  /** Um passo fixo, depois da física de todos os karts. */
  update(dt: number): void {
    this.elapsed += dt;

    for (const competitor of this.competitors) {
      if (!competitor.finished) this.updateProgress(dt, competitor);
    }

    this.resolveKartCollisions();
    this.updatePositions();

    // Varredura à mão em vez de `filter` + `every`: isto roda 60 vezes por
    // segundo, e cada `filter` seria um array novo para o coletor recolher no
    // meio da simulação.
    let humanCount = 0;
    let firstHumanPosition = 0;
    let allFinished = true;
    for (const competitor of this.competitors) {
      if (!competitor.isPlayer) continue;
      if (humanCount === 0) firstHumanPosition = competitor.position;
      humanCount++;
      if (!competitor.finished) allFinished = false;
    }

    if (humanCount > 0 && allFinished) {
      this.playersFinished = true;
      this.playerPosition = firstHumanPosition;
    }
  }

  /**
   * Todos os pilotos humanos, na ordem em que entraram na corrida.
   *
   * Aloca um array — use fora do passo fixo (montagem de tela, resultado), e
   * não dentro do laço de simulação.
   */
  get humans(): Competitor[] {
    return this.competitors.filter((competitor) => competitor.isPlayer);
  }

  private updateProgress(dt: number, competitor: Competitor): void {
    competitor.tracker.update(dt, competitor.kart);

    const position = competitor.kart.body.position;
    const index = this.path.nearestSampleIndex(position.x, position.z);
    competitor.lastSampleIndex = index;
    competitor.lap = competitor.tracker.lap;

    competitor.progress = competitor.lap * this.path.totalLength + this.path.samples[index].distance;

    if (competitor.tracker.lap >= RACE.laps && !competitor.finished) {
      competitor.finished = true;
      competitor.finishTime = this.elapsed;
      if (!this.winner) this.winner = competitor;
    }
  }

  /**
   * Colisão entre karts: empurra e troca momento.
   *
   * Só a componente NORMAL da velocidade relativa é trocada; a tangencial
   * passa intacta. É o que faz um toque lado a lado abrir espaço em vez de
   * grudar os dois karts um no outro.
   */
  private resolveKartCollisions(): void {
    const config = RACE.collision;
    const minimum = config.radius * 2;

    for (let i = 0; i < this.competitors.length; i++) {
      for (let j = i + 1; j < this.competitors.length; j++) {
        const firstCompetitor = this.competitors[i];
        const secondCompetitor = this.competitors[j];
        const first = firstCompetitor.kart.body;
        const second = secondCompetitor.kart.body;

        _a.copy(first.position);
        _b.copy(second.position);
        _delta.copy(_b).sub(_a);
        _delta.y = 0;

        const distance = _delta.length();
        if (distance >= minimum || distance < 1e-4) continue;

        _normal.copy(_delta).divideScalar(distance);
        const overlap = minimum - distance;

        // Separa os dois pela metade da sobreposição cada.
        first.position.addScaledVector(_normal, -overlap * 0.5);
        second.position.addScaledVector(_normal, overlap * 0.5);

        // Velocidade de aproximação ao longo da normal.
        const approach =
          (second.velocity.x - first.velocity.x) * _normal.x +
          (second.velocity.z - first.velocity.z) * _normal.z;
        if (approach >= 0) continue;

        // Massas iguais: cada um leva metade do impulso.
        const impulse = -approach * (1 + config.restitution) * 0.5;
        first.velocity.addScaledVector(_normal, -impulse);
        second.velocity.addScaledVector(_normal, impulse);

        // Empurrãozinho extra, para o contato separar de vez.
        first.velocity.addScaledVector(_normal, -config.push * 0.5);
        second.velocity.addScaledVector(_normal, config.push * 0.5);

        const impact = -approach;
        const firstBias = firstCompetitor.isPlayer ? 0.9 : 1.15;
        const secondBias = secondCompetitor.isPlayer ? 0.9 : 1.15;
        const firstSlowdown = Math.min(0.38, impact * 0.035 * firstBias);
        const secondSlowdown = Math.min(0.38, impact * 0.035 * secondBias);
        first.velocity.multiplyScalar(1 - firstSlowdown);
        second.velocity.multiplyScalar(1 - secondSlowdown);

        const spin = Math.min(2.4, impact * 0.08);
        first.angularVelocity.y -= spin * firstBias;
        second.angularVelocity.y += spin * secondBias;
      }
    }
  }

  private updatePositions(): void {
    // Quem terminou fica na frente, na ordem em que terminou; o resto ordena
    // por distância percorrida.
    const sorted = [...this.competitors].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.progress - a.progress;
    });
    for (let i = 0; i < sorted.length; i++) sorted[i].position = i + 1;
  }

  get player(): Competitor | undefined {
    return this.competitors.find((c) => c.isPlayer);
  }

  reset(): void {
    this.elapsed = 0;
    this.playersFinished = false;
    this.playerPosition = 0;
    this.winner = null;
    for (const competitor of this.competitors) {
      competitor.progress = 0;
      competitor.lap = 0;
      competitor.finished = false;
      competitor.finishTime = 0;
      competitor.lastSampleIndex = this.path.nearestSampleIndex(
        competitor.kart.body.position.x,
        competitor.kart.body.position.z,
      );
      competitor.tracker.reset();
    }
  }
}
