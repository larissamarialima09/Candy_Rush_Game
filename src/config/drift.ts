/**
 * Drift e boost — o coração do jogo (Fase 3).
 *
 * O modelo é híbrido, e a divisão importa:
 *
 *  - A DERRAPAGEM é física de verdade. O freio de mão reduz o grip traseiro
 *    (`KART.handbrake`) e a transferência de peso faz o resto. Nada aqui força
 *    o kart a girar; o kart gira porque o pneu traseiro perdeu.
 *
 *  - O JOGO apenas OBSERVA essa física e transforma em recompensa: se o ângulo
 *    de deslizamento passa de um limiar com velocidade suficiente, um medidor
 *    carrega; ao sair, devolve boost proporcional ao que carregou.
 *
 * O laço que precisa funcionar é: entrar na curva, carregar, soltar com turbo
 * na saída, repetir. E encadear curvas assim precisa ser MAIS RÁPIDO do que
 * fazer a linha limpa — se não for, o balanceamento está errado. O
 * `npm run sim` compara as duas coisas e diz qual ganhou.
 */
export const DRIFT = {
  detection: {
    /** Abaixo desta velocidade (m/s) não existe drift, só manobra de garagem. */
    minSpeed: 8,
    /** Ângulo de deslizamento (graus) que INICIA a contagem. */
    enterAngleDeg: 12,
    /**
     * Ângulo que ENCERRA. Menor que o de entrada de propósito: sem essa
     * histerese o medidor pisca ligando e desligando no limiar.
     */
    exitAngleDeg: 7,
    /**
     * Tolerância, em segundos, para o kart cruzar o limiar de saída sem perder
     * o drift. É o que permite corrigir a traseira no meio da curva.
     */
    exitGrace: 0.2,
    /**
     * Acima deste ângulo o kart rodou, não derrapou: a carga é PERDIDA.
     * Sem isso, girar em pião seria a forma ótima de carregar o boost.
     */
    spinOutAngleDeg: 100,
  },

  charge: {
    /** Carga por segundo de drift, no ângulo mínimo. */
    baseRatePerSecond: 1.2,
    /** Ângulo (graus) que rende a taxa máxima de carga. */
    idealAngleDeg: 40,
    /** Multiplicador extra de carga quando se está no ângulo ideal. */
    depthBonus: 0.9,
    /** Velocidade (m/s) de referência: derrapar devagar carrega mais devagar. */
    speedReference: 18,
    /**
     * Carga acumulada necessária para cada nível. Em drift bem feito a taxa
     * fica perto de 1.9/s, então dá +-0.3s, 0.9s e 1.5s de derrapagem.
     */
    levels: [0.35, 0.85, 1.5],
  },

  boost: {
    /** Empuxo extra, em N, por nível (índice 0 = nível 1). */
    force: [700, 1125, 1550],
    /** Duração, em segundos, por nível. */
    duration: [0.8, 1.3, 1.85],
    /**
     * Quanto sobe o teto de potência do motor (m/s) durante o boost. Sem isso
     * o empuxo extra empurraria contra uma curva de torque já zerada e o boost
     * não passaria da velocidade máxima normal.
     */
    speedCeilingBonus: [3.5, 5.5, 8],
    /**
     * Decaimento: força = pico * (tempo_restante / duração) ^ expoente.
     * Abaixo de 1 o boost segura a força e desiste no fim, que é o que dá a
     * sensação de "empurrão" em vez de "rampa".
     */
    decayExponent: 0.55,
  },

  steering: {
    /**
     * Multiplicador no ângulo máximo de esterço enquanto derrapa. O
     * contra-esterço já funciona por física, mas o limite de ângulo em alta
     * velocidade (`KART.steering.highSpeedFactor`) tira justamente o ângulo de
     * que se precisa para segurar a traseira. Isso devolve parte dele.
     */
    driftSteerMultiplier: 1.4,
    /** Quanto da queda de esterço por velocidade é aliviada no drift (0..1). */
    driftFalloffRelief: 0.5,
  },
} as const;

export type DriftLevel = 0 | 1 | 2 | 3;
