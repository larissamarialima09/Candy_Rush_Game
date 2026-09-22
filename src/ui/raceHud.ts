import { TRACK } from '../config/track';
import type { LapTracker } from '../track/lapTracker';
import type { Kart } from '../vehicle/kart';

/**
 * Voltas, tempos e o aviso central — de UM jogador.
 *
 * Tudo é procurado dentro de um elemento raiz, por classe, em vez de por id no
 * documento inteiro. Isso existe por causa do coop: com dois jogadores há dois
 * HUDs vivos ao mesmo tempo, e id é único por documento — o segundo
 * `getElementById('lap-count')` devolveria o contador do primeiro jogador, e os
 * dois placares mostrariam a volta da mesma pessoa.
 *
 * O aviso tem prioridade: fora da pista mostra a contagem até o resgate, e
 * fechar uma volta melhor rouba a tela por um instante. Duas mensagens nunca
 * disputam o mesmo espaço.
 */
export class RaceHud {
  private readonly lapCount: HTMLElement;
  private readonly lapTime: HTMLElement;
  private readonly lastLap: HTMLElement;
  private readonly bestLap: HTMLElement;
  private readonly warning: HTMLElement;
  private readonly coinBox: HTMLElement;
  private readonly coinCount: HTMLElement;

  /** Segundos restantes de exibição da mensagem de volta. */
  private messageTimer = 0;
  private messageText = '';
  /** Segundos restantes do pulinho do contador de moedas. */
  private coinPopTimer = 0;

  constructor(root: ParentNode) {
    this.lapCount = requireChild(root, '.lap-count');
    this.lapTime = requireChild(root, '.lap-time');
    this.lastLap = requireChild(root, '.last-lap');
    this.bestLap = requireChild(root, '.best-lap');
    this.warning = requireChild(root, '.warning');
    this.coinBox = requireChild(root, '.coins');
    this.coinCount = requireChild(root, '.coin-count');
  }

  /** Contador de moedas, com um pulinho a cada coleta. */
  updateCoins(collected: number, justCollected: boolean, dt: number): void {
    this.coinCount.textContent = collected.toString();
    if (justCollected) this.coinPopTimer = 0.14;

    this.coinPopTimer = Math.max(0, this.coinPopTimer - dt);
    this.coinBox.classList.toggle('pop', this.coinPopTimer > 0);
  }

  update(tracker: LapTracker, kart: Kart, dt: number): void {
    this.lapCount.textContent = (tracker.lap + 1).toString();
    this.lapTime.textContent = formatTime(tracker.currentLapTime);
    this.lastLap.textContent = tracker.lastLapTime > 0 ? formatTime(tracker.lastLapTime) : '--:--.--';
    this.bestLap.textContent = Number.isFinite(tracker.bestLapTime)
      ? formatTime(tracker.bestLapTime)
      : '--:--.--';

    if (tracker.lapJustCompleted) {
      const isBest = tracker.lastLapTime <= tracker.bestLapTime;
      this.messageText = isBest
        ? `VOLTA MAIS RÁPIDA  ${formatTime(tracker.lastLapTime)}`
        : `VOLTA  ${formatTime(tracker.lastLapTime)}`;
      this.messageTimer = 2.4;
    }
    if (tracker.justRescued) {
      this.messageText = 'DE VOLTA À PISTA';
      this.messageTimer = 1.6;
    }

    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.updateWarning(tracker, kart);
  }

  /** Mensagem avulsa, para avisos que não vêm do cronômetro de voltas. */
  flash(text: string, seconds = 1.8): void {
    this.messageText = text;
    this.messageTimer = seconds;
  }

  private updateWarning(tracker: LapTracker, kart: Kart): void {
    // Fora da pista vence a mensagem de volta: é informação acionável agora.
    if (kart.telemetry.offTrack && tracker.offTrackTimer > 0.35) {
      const remaining = Math.max(
        0,
        TRACK.offTrack.graceSeconds - tracker.offTrackTimer,
      );
      this.warning.textContent = `FORA DA PISTA  ${remaining.toFixed(1)}`;
      this.warning.classList.add('show');
      return;
    }

    if (this.messageTimer > 0) {
      this.warning.textContent = this.messageText;
      this.warning.classList.add('show');
      return;
    }

    this.warning.classList.remove('show');
  }
}

/** m:ss.cc — o formato que todo jogo de corrida usa e que se lê de relance. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--.--';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

function requireChild(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado no HUD`);
  return element;
}
