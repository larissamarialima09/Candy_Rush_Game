/**
 * Efeitos de sensação de velocidade.
 *
 * Ordem de importância, e vale respeitar ao tunar: FOV dinâmico primeiro,
 * partículas depois, tremor por último. O FOV sozinho faz mais pela sensação
 * de velocidade do que todo o resto somado — é ele que estica a periferia da
 * tela e faz o cenário passar voando.
 */
export const EFFECTS = {
  fov: {
    /** Campo de visão com o kart parado, em graus. */
    atRest: 66,
    /** Campo de visão na velocidade de referência. */
    atTopSpeed: 82,
    /** Quanto o boost soma por cima disso, em graus. */
    boostBonus: 7,
    /** Velocidade (m/s) tratada como "máxima" para a interpolação. */
    referenceSpeed: 26,
    /**
     * Velocidade de convergência (por segundo). Baixo demais e o FOV parece
     * borracha; alto demais e ele pulsa a cada toque no acelerador.
     */
    responsiveness: 4.5,
  },

  shake: {
    /** Amplitude, em metros, na velocidade de referência. */
    speedAmplitude: 0.018,
    /** Amplitude extra durante o boost. */
    boostAmplitude: 0.028,
    /** Multiplicador quando o kart está fora do asfalto. */
    offTrackMultiplier: 2.6,
    /** Velocidade (m/s) de referência para a amplitude. */
    referenceSpeed: 26,
    /** Frequências do ruído, em Hz. Duas incomensuráveis para não pulsar. */
    frequencyA: 23.3,
    frequencyB: 17.1,
    /** Tremor de rotação, em graus, na amplitude máxima. */
    rollDegrees: 0.4,
    /** Abaixo desta velocidade (m/s) não treme nada. */
    minSpeed: 6,
  },

  /** Camada de HTML sobre o canvas: vinheta, linhas de velocidade, turbo. */
  overlay: {
    /** Opacidade máxima da vinheta na velocidade de referência. */
    vignetteMax: 0.55,
    /** Velocidade (m/s) em que a vinheta começa a aparecer. */
    vignetteStartSpeed: 12,
    referenceSpeed: 26,
    /** Opacidade máxima das linhas de velocidade (só no boost e em alta). */
    speedLinesMax: 0.7,
    /** Opacidade da aberração cromática durante o turbo. */
    chromaticMax: 0.45,
    /** Suavização das transições, por segundo. */
    responsiveness: 5,
  },

  particles: {
    // O tamanho do pool mora em `config/quality.ts`: é orçamento gráfico.
    drift: {
      /** Partículas por segundo, por roda traseira, em drift pleno. */
      rate: 90,
      life: 0.85,
      startSize: 0.28,
      endSize: 1.25,
      /** Velocidade inicial: para cima e para fora do sentido do deslizamento. */
      upwardSpeed: 1.6,
      lateralSpeed: 2.6,
      spread: 1.1,
      /** Arrasto das partículas (por segundo). */
      drag: 1.8,
      /**
       * Cor por nível de carga: sem carga, nível 1, nível 2, nível 3.
       * É o feedback mais importante do drift — dá para saber o nível sem
       * olhar para o HUD.
       */
      colorByLevel: [0xfff2f7, 0xff9ec4, 0xa89bf0, 0xffd76a],
    },

    boost: {
      /** Partículas por segundo enquanto o turbo está ativo. */
      rate: 120,
      life: 0.55,
      startSize: 0.34,
      endSize: 0.05,
      /** Velocidade para trás, somada à do kart. */
      backwardSpeed: 5.5,
      spread: 0.9,
      drag: 2.4,
      colorByLevel: [0xffffff, 0xffc8dd, 0xc0b6ff, 0xffe08a],
    },

    /** Poeira levantada em superfície solta. A cor vem do material da pista. */
    surface: {
      /** Partículas por segundo, por roda, na velocidade de referência. */
      rate: 55,
      /** Abaixo desta velocidade (m/s) a roda não levanta nada. */
      minSpeed: 4,
      referenceSpeed: 20,
      life: 0.7,
      startSize: 0.22,
      endSize: 0.95,
      upwardSpeed: 1.2,
      spread: 1.4,
      drag: 2.2,
    },

    /** Faíscas ao raspar na barreira. Curtas, rápidas e brilhantes. */
    sparks: {
      /** Partículas por segundo enquanto raspa, na velocidade de referência. */
      rate: 140,
      referenceSpeed: 20,
      life: 0.3,
      startSize: 0.14,
      endSize: 0.02,
      /** Velocidade de saída, contra o sentido do raspão. */
      speed: 6.5,
      spread: 2.4,
      drag: 3.5,
      colorStart: 0xfff0c0,
      colorEnd: 0xff9ec4,
    },
  },
} as const;
