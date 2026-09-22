import { CONTROLS, type KeyMap } from '../config/controls';
import { createGamepadReading, GamepadSource, type GamepadReading } from './gamepad';
import { keyboard } from './keyboard';

/**
 * Estado de input já normalizado. Quem consome (o kart) nunca vê tecla:
 * vê eixos. Isso mantém a porta aberta para gamepad ou piloto automático.
 */
export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 — vira ré quando o kart está parado. */
  brake: number;
  /** -1 (esquerda) .. +1 (direita), já como intenção crua, sem suavização. */
  steer: number;
  handbrake: boolean;
  /** Pulso: true apenas no passo em que a tecla foi pressionada. */
  respawnPressed: boolean;
  /** Pulso da tecla de pausa. */
  pausePressed: boolean;
}

/** De onde um jogador tira o input. */
export interface InputOptions {
  /** Mapa de teclas deste jogador. */
  keys?: KeyMap;
  /**
   * Índice do controle na Gamepad API, ou null para não usar controle.
   * Teclado e controle convivem: vale o que estiver mais pisado no momento,
   * então ninguém precisa "escolher" um dispositivo antes de largar.
   */
  gamepadIndex?: number | null;
  /**
   * Se este jogador comanda os botões de toque na tela. Só um jogador pode,
   * porque só existe um conjunto de botões no HTML.
   */
  touch?: boolean;
}

export class Input {
  private readonly keys: KeyMap;
  private readonly gamepad: GamepadSource | null;
  private readonly reading: GamepadReading = createGamepadReading();

  private readonly touch = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    respawn: false,
  };
  private readonly usesTouch: boolean;

  private respawnLatched = false;
  private pauseLatched = false;

  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    respawnPressed: false,
    pausePressed: false,
  };

  constructor(options: InputOptions = {}) {
    this.keys = options.keys ?? CONTROLS;
    this.gamepad =
      options.gamepadIndex === null || options.gamepadIndex === undefined
        ? null
        : new GamepadSource(options.gamepadIndex);
    this.usesTouch = options.touch ?? false;
    if (this.usesTouch) this.bindTouchControls();
  }

  /** True quando o controle deste jogador está plugado e respondendo. */
  get gamepadConnected(): boolean {
    return this.reading.connected;
  }

  private bindTouchControls(): void {
    const bindings = [
      ['touch-left', 'left'],
      ['touch-right', 'right'],
      ['touch-gas', 'throttle'],
      ['touch-brake', 'brake'],
      ['touch-drift', 'handbrake'],
      ['touch-reset', 'respawn'],
    ] as const;

    for (const [id, control] of bindings) {
      const button = document.getElementById(id);
      if (!button) continue;

      const set = (active: boolean, event: Event) => {
        event.preventDefault();
        this.touch[control] = active;
        button.classList.toggle('active', active);
      };

      button.addEventListener('pointerdown', (event) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        set(true, event);
      });
      button.addEventListener('pointerup', (event) => set(false, event));
      button.addEventListener('pointercancel', (event) => set(false, event));
      button.addEventListener('pointerleave', (event) => set(false, event));
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }
  }

  /**
   * Chamado uma vez por passo de física, antes de simular.
   *
   * Teclado, toque e controle são combinados pegando o MAIOR valor de cada
   * eixo, não somando: com soma, segurar o acelerador no teclado e no gatilho
   * ao mesmo tempo daria 2, e o kart de quem tem controle plugado seria mais
   * rápido que o de quem não tem. Pegar o maior deixa os dispositivos
   * equivalentes e permite trocar de um para o outro no meio da corrida sem
   * nenhum solavanco.
   */
  sample(): InputState {
    if (this.gamepad) this.gamepad.read(this.reading);
    const pad = this.gamepad ? this.reading : null;

    const left = keyboard.any(this.keys.steerLeft) || this.touch.left;
    const right = keyboard.any(this.keys.steerRight) || this.touch.right;
    const keySteer = (left ? 1 : 0) - (right ? 1 : 0);

    const keyThrottle = keyboard.any(this.keys.throttle) || this.touch.throttle ? 1 : 0;
    const keyBrake = keyboard.any(this.keys.brake) || this.touch.brake ? 1 : 0;

    this.state.throttle = Math.max(keyThrottle, pad?.throttle ?? 0);
    this.state.brake = Math.max(keyBrake, pad?.brake ?? 0);
    this.state.steer = largestMagnitude(keySteer, pad?.steer ?? 0);
    this.state.handbrake =
      keyboard.any(this.keys.handbrake) || this.touch.handbrake || (pad?.handbrake ?? false);

    const respawnDown =
      keyboard.any(this.keys.respawn) || this.touch.respawn || (pad?.respawn ?? false);
    this.state.respawnPressed = respawnDown && !this.respawnLatched;
    this.respawnLatched = respawnDown;

    const pauseDown = keyboard.any(this.keys.pause) || (pad?.pause ?? false);
    this.state.pausePressed = pauseDown && !this.pauseLatched;
    this.pauseLatched = pauseDown;

    return this.state;
  }
}

/**
 * Entre dois comandos de direção, vale o mais forte — preservando o sinal.
 * Se os dois apontarem para lados opostos com a mesma força, o resultado é
 * zero, que é o que alguém segurando as duas coisas ao mesmo tempo merece.
 */
function largestMagnitude(a: number, b: number): number {
  if (Math.abs(a) === Math.abs(b)) return a + b === 0 ? 0 : a;
  return Math.abs(a) > Math.abs(b) ? a : b;
}

/** True se houver qualquer controle plugado. Usado pela tela de entrada. */
export function anyGamepadConnected(): boolean {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) if (pad?.connected) return true;
  return false;
}
