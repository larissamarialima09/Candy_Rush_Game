import { ALL_KEY_MAPS } from '../config/controls';

/**
 * O teclado da máquina, uma vez só.
 *
 * Com coop local existem dois objetos `Input`, mas continua existindo UM
 * teclado. Se cada `Input` registrasse o próprio `keydown` no `window`, toda
 * tecla seria processada duas vezes e, pior, o `preventDefault` de um jogador
 * cancelaria a rolagem para o outro de maneira imprevisível.
 *
 * Então a escuta vive aqui, num único conjunto de teclas pressionadas que
 * qualquer número de jogadores consulta com o próprio mapa.
 */
class KeyboardSource {
  private readonly pressed = new Set<string>();
  private listening = false;

  /** Liga a escuta na primeira vez que alguém precisa do teclado. */
  private ensureListening(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    this.pressed.add(event.code);
    // Evita a página rolar com as setas e o espaço.
    if (isBoundKey(event.code)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  /**
   * Perder o foco solta tudo. Sem isso, trocar de janela com o acelerador
   * pisado deixa o kart acelerando sozinho para sempre, porque o `keyup`
   * acontece numa janela que não é a nossa e nunca chega aqui.
   */
  private readonly releaseAll = (): void => {
    this.pressed.clear();
  };

  isDown(code: string): boolean {
    this.ensureListening();
    return this.pressed.has(code);
  }

  /** True se qualquer uma das teclas da ação estiver pressionada. */
  any(codes: readonly string[]): boolean {
    this.ensureListening();
    for (const code of codes) if (this.pressed.has(code)) return true;
    return false;
  }

  release(): void {
    this.releaseAll();
  }
}

/** Instância única. Não há motivo para existirem dois teclados. */
export const keyboard = new KeyboardSource();

function isBoundKey(code: string): boolean {
  for (const map of ALL_KEY_MAPS) {
    for (const codes of Object.values(map)) {
      if ((codes as readonly string[]).includes(code)) return true;
    }
  }
  return false;
}
