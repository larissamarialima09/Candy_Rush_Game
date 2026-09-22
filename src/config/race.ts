/**
 * A corrida: adversários, dificuldade e condição de vitória.
 */
export const RACE = {
  /** Voltas para terminar a corrida. */
  laps: 3,

  /**
   * Os adversários. Cada um tem cor de kart, cor de pelo e um perfil de
   * pilotagem próprio — sem isso todos correriam exatamente igual, em fila
   * indiana, o que entrega o truque logo na primeira curva.
   */
  rivals: [
    {
      name: 'Bidu',
      body: 0x4a9ff5,
      fur: 0xfff2e0,
      ear: 0xffb27a,
      /** Fração da velocidade de curva que este piloto ousa (0..1). */
      cornering: 0.94,
      /** Fração do acelerador nas retas. */
      pace: 1.0,
      /** Amplitude do desvio da linha ideal, em metros. */
      wander: 1.6,
      /** Segundos entre mudanças do desvio. Alto = piloto mais estável. */
      wanderPeriod: 4.2,
    },
    {
      name: 'Lili',
      body: 0xff6fa5,
      fur: 0xfffaf2,
      ear: 0xffc0d8,
      cornering: 0.9,
      pace: 0.97,
      wander: 2.4,
      wanderPeriod: 3.1,
    },
    {
      name: 'Zizo',
      body: 0x6fd36f,
      fur: 0xffd98a,
      ear: 0xc98a4a,
      cornering: 0.87,
      pace: 0.95,
      wander: 3.0,
      wanderPeriod: 2.4,
    },
  ],

  rival: {
    /** Quantas amostras à frente o piloto mira. Mais = linha mais suave. */
    lookaheadSamples: 13,
    /** Quantas amostras à frente ele "lê" a curva para decidir frear. */
    brakeLookaheadSamples: 26,
    /** Ganho do volante. Alto demais faz o kart serpentear. */
    steerGain: 2.1,
    /**
     * Aceleração lateral (m/s²) que o rival acredita ter. É daqui que sai a
     * velocidade de curva: v = raiz(aceleração * raio).
     */
    corneringAccel: 22,
    /** Teto de velocidade do rival, em m/s. */
    maxSpeed: 30,
    /** Acima desta fração da velocidade alvo, ela freia. */
    brakeThreshold: 1.08,
    /**
     * Ângulo de deslizamento (graus) a partir do qual o rival corrige em vez de
     * insistir na curva. Sem isso ela roda e fica girando no lugar.
     */
    countersteerAngle: 26,
  },

  /** Posições de largada, atrás da linha. */
  grid: {
    /** Distância entre fileiras, em metros. */
    rowSpacing: 4.5,
    /** Deslocamento lateral alternado, em metros. */
    lateralOffset: 2.2,
  },

  /** Colisão entre karts. */
  collision: {
    /** Raio de cada kart, em metros. */
    radius: 1.05,
    /** Quanto da velocidade de aproximação vira repique (0..1). */
    restitution: 0.35,
    /** Empurrão lateral extra, para o toque "abrir espaço" em vez de grudar. */
    push: 2.4,
  },
} as const;
