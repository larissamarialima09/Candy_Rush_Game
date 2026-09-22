import type { GameState, GameStateName } from '../core/gameState';
import { anyGamepadConnected } from '../core/input';

/**
 * Telas de entrada e de pausa.
 *
 * A tela de entrada some por transição de opacidade e só então recebe
 * `hidden`. Sem o `hidden` no fim, um elemento invisível continua por cima do
 * canvas e engole todo clique — bug clássico de menu que "some" mas trava o
 * jogo atrás dele.
 *
 * A escolha de modo acontece aqui e é entregue de volta por callback em vez de
 * ser lida depois: quantos jogadores existem decide quantas câmeras, quantos
 * HUDs e quanto orçamento gráfico o jogo monta, e essas coisas precisam
 * acontecer ANTES de a corrida começar.
 */
export class Screens {
  private readonly start: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly gamepadHint: HTMLElement | null;

  constructor(state: GameState, onStart: (playerCount: number) => void) {
    this.start = requireElement('start-screen');
    this.pause = requireElement('pause-screen');
    this.gamepadHint = document.getElementById('gamepad-hint');

    const solo = requireElement('play-button');
    const coop = document.getElementById('play-coop-button');
    const resume = requireElement('resume-button');

    solo.addEventListener('click', () => onStart(1));
    coop?.addEventListener('click', () => onStart(2));
    resume.addEventListener('click', () => state.set('racing'));

    state.onChange((name) => this.apply(name));
    this.apply(state.name);

    this.watchGamepads();

    // Foco no botão para quem joga de teclado: espaço ou enter começam.
    if (state.name === 'menu') solo.focus();
  }

  /**
   * O aviso de controle só aparece quando há um plugado.
   *
   * A Gamepad API esconde os controles até o primeiro botão ser apertado — é
   * uma proteção contra sites que identificam visitantes pelo hardware. Por
   * isso a checagem não pode ser feita uma vez no carregamento: é preciso
   * escutar o evento de conexão, que é justamente o que dispara quando a pessoa
   * mexe no controle pela primeira vez.
   */
  private watchGamepads(): void {
    if (!this.gamepadHint) return;

    const refresh = () => {
      if (this.gamepadHint) this.gamepadHint.hidden = !anyGamepadConnected();
    };

    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    refresh();
  }

  private apply(name: GameStateName): void {
    if (name === 'menu') {
      this.start.hidden = false;
      this.start.classList.remove('fading');
    } else {
      this.start.classList.add('fading');
      // 320ms é a duração da transição no CSS. Esconder antes cortaria o
      // desvanecimento; esconder depois é o que libera os cliques.
      window.setTimeout(() => {
        if (this.start.classList.contains('fading')) this.start.hidden = true;
      }, 320);
    }

    this.pause.classList.toggle('visible', name === 'paused');
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado`);
  return element;
}
