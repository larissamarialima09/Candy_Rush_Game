import { COOP } from '../config/coop';
import { clamp } from './mathUtils';

/**
 * Um controle, lido pela Gamepad API.
 *
 * A API do navegador não avisa quando um botão muda: ela entrega um retrato do
 * controle no instante em que você pergunta. Então este objeto é consultado uma
 * vez por PASSO DE FÍSICA, igual ao teclado, e não por quadro — assim um
 * jogador de gamepad e um de teclado recebem exatamente a mesma quantidade de
 * amostras de input, e nenhum dos dois acelera mais rápido por causa da taxa de
 * quadros.
 *
 * O índice é reservado na conexão: o primeiro controle plugado vira o índice 0.
 * Um controle desconectado no meio da corrida simplesmente devolve tudo zerado,
 * o que faz o kart desacelerar em vez de sair reto na primeira curva.
 */
export class GamepadSource {
  /** True enquanto houver um controle vivo neste índice. */
  connected = false;

  constructor(private readonly index: number) {}

  /** O retrato mais recente do controle, ou null se não houver nenhum. */
  private snapshot(): Gamepad | null {
    // `getGamepads` pode não existir (navegador antigo) e pode devolver buracos
    // no array quando um controle é desplugado.
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.index] ?? null;
    this.connected = pad !== null && pad.connected;
    return this.connected ? pad : null;
  }

  /**
   * Lê o controle inteiro de uma vez.
   *
   * Uma leitura por passo, e não uma por botão: cada chamada a `getGamepads`
   * aloca um array novo em alguns navegadores, e fazer isso seis vezes por
   * passo de física é lixo suficiente para aparecer no coletor.
   */
  read(out: GamepadReading): GamepadReading {
    const pad = this.snapshot();
    if (!pad) {
      out.connected = false;
      out.steer = 0;
      out.throttle = 0;
      out.brake = 0;
      out.handbrake = false;
      out.respawn = false;
      out.pause = false;
      return out;
    }

    const config = COOP.gamepad;
    out.connected = true;
    out.steer = shapeAxis(pad.axes[config.axes.steer] ?? 0);
    out.throttle = analogButton(pad, config.buttons.throttle);
    out.brake = analogButton(pad, config.buttons.brake);
    out.handbrake = anyPressed(pad, config.buttons.handbrake);
    out.respawn = anyPressed(pad, config.buttons.respawn);
    out.pause = anyPressed(pad, config.buttons.pause);
    return out;
  }
}

/** O retrato do controle já normalizado, reaproveitado a cada passo. */
export interface GamepadReading {
  connected: boolean;
  /** -1 (esquerda) .. +1 (direita), no sinal que o kart espera. */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  handbrake: boolean;
  respawn: boolean;
  pause: boolean;
}

export function createGamepadReading(): GamepadReading {
  return {
    connected: false,
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    respawn: false,
    pause: false,
  };
}

/**
 * Zona morta e curva de resposta do analógico.
 *
 * A zona morta é *reescalada*, não apenas cortada: passando do limiar, o valor
 * recomeça do zero e volta a chegar em 1 no fim do curso. Cortar sem reescalar
 * cria um degrau — o volante salta de nada para 18% assim que sai do centro.
 *
 * O expoente depois disso dá curso fino no meio (onde se corrige a traseira em
 * derrapagem) sem tirar esterço máximo no fim.
 *
 * O sinal é invertido no fim porque no kart `steer` positivo é ESQUERDA (ver
 * `InputState`), enquanto no analógico X positivo é direita.
 */
function shapeAxis(raw: number): number {
  const { deadzone, steerCurve } = COOP.gamepad;
  const magnitude = Math.abs(raw);
  if (magnitude <= deadzone) return 0;

  const rescaled = (magnitude - deadzone) / (1 - deadzone);
  const shaped = Math.pow(clamp(rescaled, 0, 1), steerCurve);
  return -Math.sign(raw) * shaped;
}

/**
 * Valor de um gatilho analógico, caindo para o botão digital quando o controle
 * não tem gatilho de verdade. Vários controles genéricos reportam gatilho como
 * botão liga-desliga, e aí `value` é 0 ou 1 — o que continua funcionando.
 */
function analogButton(pad: Gamepad, indices: readonly number[]): number {
  let best = 0;
  for (const index of indices) {
    const button = pad.buttons[index];
    if (!button) continue;
    const value = button.value > 0 ? button.value : button.pressed ? 1 : 0;
    if (value > best) best = value;
  }
  return best >= COOP.gamepad.triggerThreshold ? clamp(best, 0, 1) : 0;
}

function anyPressed(pad: Gamepad, indices: readonly number[]): boolean {
  for (const index of indices) {
    if (pad.buttons[index]?.pressed) return true;
  }
  return false;
}
