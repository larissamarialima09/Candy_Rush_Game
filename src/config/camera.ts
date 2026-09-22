/**
 * Câmera perseguidora com peso (Fase 2).
 *
 * A câmera NÃO é filha do kart. Ela é um corpo próprio puxado por molas: uma
 * mola para a posição e outra, mais mole, para o ponto de mira. É desse atraso
 * que vem a sensação de peso — a câmera chega um pouco depois, e é isso que faz
 * a mesma velocidade parecer mais rápida.
 *
 * As molas são integradas no PASSO FIXO junto com a física, e o render
 * interpola. Uma mola integrada com deltaTime variável muda de comportamento
 * entre 60 e 144 fps, o que é exatamente o tipo de coisa que dá "a câmera
 * parece diferente no meu monitor".
 */
export const CAMERA = {
  // O campo de visão não mora aqui: ele é dinâmico e vive em
  // `config/effects.ts`, junto com o resto da sensação de velocidade.
  near: 0.1,
  far: 2000,

  /** Posição de repouso da câmera, no espaço do kart (metros). */
  offset: {
    /** Distância atrás do kart. */
    distance: 5.6,
    /** Altura acima da origem do chassi. */
    height: 2.25,
  },

  /**
   * Mola da POSIÇÃO. `stiffness` é a aceleração por metro de erro;
   * `damping` é a força contrária por m/s.
   *
   * Amortecimento crítico = 2 * raiz(stiffness) ≈ 21 para stiffness 110.
   * Abaixo disso a câmera passa do ponto e volta (elástica, mais viva);
   * acima, ela chega devagar e nunca ultrapassa (pesada, mais segura).
   * Regra de estabilidade: `damping * dt < 2` e `stiffness * dt² < 4`.
   */
  follow: {
    stiffness: 180,
    damping: 27,
  },

  /**
   * Mola da MIRA, de propósito mais mole que a da posição. Quando o kart gira
   * rápido, a mira demora a acompanhar e o kart sai do centro da tela — é o
   * que dá leitura de derrapagem sem precisar de nenhum efeito.
   */
  aim: {
    stiffness: 125,
    damping: 23,
  },

  /** Para onde a câmera olha, à FRENTE do kart (nunca para o kart). */
  look: {
    /** Distância à frente, parado (metros). */
    aheadBase: 3.8,
    /** Metros extras de antecipação por m/s de velocidade. */
    aheadPerSpeed: 0.13,
    /** Altura do ponto de mira acima da origem do chassi. */
    height: 0.82,
  },

  /**
   * Resposta à aceleração longitudinal: a câmera fica para trás quando o kart
   * acelera forte e chega mais perto quando freia.
   */
  acceleration: {
    /** Metros de recuo por m/s² de aceleração. */
    metersPerAccel: 0.035,
    /** Recuo máximo ao acelerar (metros). */
    maxPullBack: 0.55,
    /** Aproximação máxima ao frear (metros). */
    maxPullIn: 0.55,
    /**
     * Filtro do sinal de aceleração (por segundo). A aceleração medida passo a
     * passo é ruidosa — sem filtro a câmera treme em piso irregular.
     * Valores baixos = reação lenta e suave; altos = nervosa.
     */
    smoothing: 8.0,
  },

  /**
   * Inclinação lateral nas curvas. A aceleração lateral é estimada por
   * `taxa de guinada * velocidade`, que é estável e não precisa de derivada.
   *
   * Se a câmera estiver inclinando para o lado ERRADO, inverta o sinal de
   * `degreesPerLateralAccel`.
   */
  roll: {
    /** Graus de inclinação por m/s² de aceleração lateral. */
    degreesPerLateralAccel: 0.16,
    /** Teto de inclinação, em graus. O enunciado pede de 3 a 6. */
    maxDegrees: 4.5,
    /** Velocidade de convergência da inclinação (por segundo). */
    responsiveness: 7.5,
    /** Abaixo desta velocidade (m/s) não há inclinação nenhuma. */
    minSpeed: 3.0,
  },

  /**
   * Modo vitrine, usado na tela de entrada: a câmera gira devagar em volta do
   * kart parado. É o que transforma o menu numa cena viva em vez de uma
   * imagem estática por cima de um jogo congelado.
   */
  showcase: {
    /** Voltas por segundo em torno do kart. */
    revolutionsPerSecond: 0.045,
    distance: 5.4,
    height: 2.0,
    lookHeight: 0.7,
  },

  /** A câmera nunca desce abaixo desta altura acima do chão. */
  minHeightAboveGround: 0.65,

  /**
   * Respawn corta a suavização: a câmera é teleportada para a posição ideal com
   * velocidade zero. Sem isso ela varre o mapa inteiro atrás do kart.
   */
  snapOnRespawn: true,
} as const;
