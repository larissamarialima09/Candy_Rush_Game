/**
 * Mapeamento de teclas. Cada ação aceita várias teclas (KeyboardEvent.code).
 *
 * São três mapas porque o coop local não pode simplesmente reaproveitar o de um
 * jogador só: sozinho, o jogador dirige tanto no WASD quanto nas setas, o que é
 * comodidade pura. Com dois na mesma tela, as setas precisam pertencer ao
 * segundo piloto — senão uma tecla comanda dois karts ao mesmo tempo.
 */

/** Um jogador sozinho: aceita WASD e setas, tanto faz. */
export const CONTROLS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  respawn: ['KeyR'],
  pause: ['Escape', 'KeyP'],
} as const;

/** Coop, piloto 1: lado esquerdo do teclado. */
export const CONTROLS_COOP_P1 = {
  throttle: ['KeyW'],
  brake: ['KeyS'],
  steerLeft: ['KeyA'],
  steerRight: ['KeyD'],
  handbrake: ['ShiftLeft', 'Space'],
  respawn: ['KeyR'],
  pause: ['Escape', 'KeyP'],
} as const;

/**
 * Coop, piloto 2: setas e as teclas à direita delas.
 *
 * O freio de mão é `ShiftRight` ou `Enter` porque ambos ficam ao alcance do
 * polegar de quem está com a mão nas setas. `Slash` (a tecla `?`) é o respawn
 * pela mesma razão — nenhum dos dois exige atravessar o teclado no meio de uma
 * curva, que é quando essas teclas são usadas.
 */
export const CONTROLS_COOP_P2 = {
  throttle: ['ArrowUp'],
  brake: ['ArrowDown'],
  steerLeft: ['ArrowLeft'],
  steerRight: ['ArrowRight'],
  handbrake: ['ShiftRight', 'Enter', 'Numpad0'],
  respawn: ['Slash', 'NumpadDecimal'],
  pause: ['Escape'],
} as const;

/** Forma de um mapa de teclas, para quem recebe um dos três acima. */
export type KeyMap = {
  readonly [K in keyof typeof CONTROLS]: readonly string[];
};

export type ControlAction = keyof typeof CONTROLS;

/** Todos os mapas, para o `preventDefault` saber quais teclas o jogo consome. */
export const ALL_KEY_MAPS: readonly KeyMap[] = [
  CONTROLS,
  CONTROLS_COOP_P1,
  CONTROLS_COOP_P2,
];
