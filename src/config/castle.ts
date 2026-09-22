/**
 * "Doce Castelo" — o castelo de biscoito com o túnel por onde a pista passa.
 *
 * Tudo em METROS, num referencial local do castelo:
 * - origem no eixo da pista, exatamente na boca do túnel;
 * - +Z aponta no sentido de corrida (para dentro do túnel);
 * - +X aponta para a ESQUERDA da pista, que ali é o lado de fora do circuito,
 *   onde há espaço livre para o corpo do castelo;
 * - +Y para cima, a partir da altura da pista na boca do túnel.
 *
 * A fachada da foto de referência (arco de marshmallow, placa "KART TRACK",
 * escada de jujuba) fica virada para quem CHEGA, não para quem sai: é o que o
 * jogador vê de longe desde o grid de largada.
 */

export type CastleTowerBody = 'peach' | 'pink' | 'blue' | 'orange' | 'cane';
export type CastleTowerRoof = 'cane' | 'blue' | 'dome' | 'gumdrop';

export interface CastleTower {
  x: number;
  z: number;
  radius: number;
  /** Altura do topo do cilindro, antes do telhado. */
  height: number;
  body: CastleTowerBody;
  roof: CastleTowerRoof;
}

export const CASTLE = {
  /**
   * Fração da volta onde fica a boca do túnel. Tem que cair num trecho RETO:
   * o castelo é rígido, e numa curva a pista atravessaria a parede do túnel.
   * Entre 0.07 e 0.15 a reta principal é praticamente uma linha.
   */
  at: 0.112,

  /** Quanto das fundações fica enterrado, para nada flutuar onde o chão desce. */
  buriedDepth: 2.5,

  tunnel: {
    /** Comprimento do túnel ao longo da pista. */
    length: 30,
    /**
     * Folga entre a barreira de bala e a parede interna. Generosa: a câmera
     * vem atrás e um pouco de lado, e não pode entrar na parede num raspão.
     * Com 2 m sobrava só meio metro: a reta desvia quase 1 m dentro do túnel.
     */
    wallMargin: 2.5,
    /** Altura da parede reta antes de o arco começar. */
    wallHeight: 4.2,
    /** Quanto o arco sobe acima da parede reta. */
    archRise: 7.8,
    /** Espessura da casca do túnel, que é também a do anel de marshmallow. */
    shellThickness: 2.4,
    /** Comprimento de cada anel listrado (rosa, branco, rosa...) por dentro. */
    hoopLength: 1.5,
    /** Quanto o anel de marshmallow avança para fora da fachada. */
    portalDepth: 2.2,
    /** Quantos marshmallows formam o arco da entrada. */
    marshmallowCount: 15,
    /** Distância entre os sinos pendurados no teto. */
    bellSpacing: 4.5,
  },

  /** Topo do bloco que cobre o túnel (o "passadiço" da foto). */
  terraceHeight: 15.5,

  /**
   * Animações do castelo. São PURAMENTE visuais: rodam no quadro, com
   * deltaTime variável, e nada aqui encosta na física ou no kart.
   * Ângulos em radianos, velocidades em radianos por segundo.
   */
  animation: {
    /** Giro dos discos de pirulito e da roseta do frontão. */
    lollipopSpin: 1.4,
    /** Balanço dos sinos no teto do túnel. */
    bellSwingAngle: 0.28,
    bellSwingSpeed: 2.4,
    /** Defasagem entre um sino e o próximo: faz uma "onda" correr pelo túnel. */
    bellPhaseStep: 0.5,
    /** Brilho pulsante dos sinos dourados (intensidade de emissão). */
    bellGlowMin: 0.25,
    bellGlowMax: 0.75,
    bellGlowSpeed: 3.2,
    /** Bandeirinhas: altura da onda por metro de bandeira, velocidade e número de onda. */
    flagWaveAmplitude: 0.22,
    flagWaveSpeed: 7,
    flagWaveNumber: 3.5,
    /**
     * Luzes correndo pelos anéis listrados do túnel, no sentido de corrida.
     * Min/max multiplicam a emissão original dos anéis.
     */
    tunnelLightMin: 0.6,
    tunnelLightMax: 3.2,
    tunnelLightSpeed: 5,
    /** Distância, em metros, entre duas cristas de luz. */
    tunnelLightWavelength: 6,
    /** "Respiração" dos letreiros: escala extra máxima e velocidade. */
    signPulse: 0.04,
    signPulseSpeed: 2.4,
    /** Corações flutuantes: giro, altura do sobe-e-desce e velocidade dele. */
    heartSpin: 0.9,
    heartBobHeight: 0.6,
    heartBobSpeed: 1.6,
  },

  /**
   * Corações de goma flutuando diante da fachada, bem acima da pista (a
   * câmera nunca chega a essa altura). Distribuídos de `fromX` a `toX`.
   */
  hearts: {
    count: 8,
    fromX: -15,
    toX: 40,
    baseHeight: 19.5,
    /** Os corações alternam entre três alturas, subindo este tanto cada. */
    heightStep: 2.8,
    /** Distância à frente da fachada (Z negativo = antes da boca do túnel). */
    z: -5,
    zStagger: 1.5,
    size: 1.15,
    thickness: 0.4,
  },

  /**
   * Retângulos, no referencial local, onde nada do cenário espalhado (árvores,
   * colinas, doces, postes) pode nascer. Sem isso uma árvore atravessaria a
   * parede do castelo. O primeiro cobre o castelo; o segundo, a escada.
   */
  footprint: [
    { minX: -23, maxX: 48, minZ: -4, maxZ: 36 },
    { minX: 12, maxX: 48, minZ: -25, maxZ: -4 },
  ],

  /**
   * As torres, da esquerda para a direita de quem olha a fachada, na ordem da
   * foto: bengala baixa, cones azuis ao fundo, a coluna listrada, as cúpulas de
   * açúcar ladeando a torre central e as agulhas de bengala mais altas atrás.
   */
  towers: [
    { x: 42, z: 6, radius: 3.2, height: 23, body: 'peach', roof: 'cane' },
    { x: 40, z: 22, radius: 2.4, height: 27, body: 'orange', roof: 'blue' },
    { x: 34, z: 16, radius: 2.6, height: 33, body: 'pink', roof: 'blue' },
    { x: 30, z: 25, radius: 2.2, height: 36, body: 'pink', roof: 'blue' },
    { x: 29, z: 3.5, radius: 2.0, height: 21, body: 'cane', roof: 'gumdrop' },
    { x: 22, z: 7.5, radius: 2.8, height: 29, body: 'blue', roof: 'dome' },
    { x: 15, z: 20, radius: 2.3, height: 39, body: 'pink', roof: 'cane' },
    { x: 4, z: 21, radius: 2.3, height: 42, body: 'orange', roof: 'cane' },
    { x: -1.5, z: 8.5, radius: 2.8, height: 29, body: 'blue', roof: 'dome' },
    { x: -6, z: 26, radius: 2.2, height: 31, body: 'blue', roof: 'dome' },
    { x: -9, z: 16, radius: 2.6, height: 33, body: 'orange', roof: 'cane' },
    { x: -18.5, z: 4, radius: 3.0, height: 22, body: 'peach', roof: 'cane' },
  ] as readonly CastleTower[],

  /** Paleta da foto: biscoito, glacê, rosa, azul-açúcar e bengala vermelha. */
  colors: {
    gingerbread: 0xe29a5c,
    icing: 0xfffaf3,
    pink: 0xff9dc4,
    hotPink: 0xff5c95,
    blue: 0x86d6f5,
    orange: 0xffb163,
    peach: 0xffcf9a,
    mint: 0x8fe3b4,
    yellow: 0xffd94f,
    lavender: 0xc6a4f4,
    window: 0x7a3a55,
    gold: 0xffc83d,
    hoopPink: 0xff8fbb,
    hoopWhite: 0xfff3f8,
    /** Vermelho das listras de bengala, como string CSS para o canvas. */
    caneStripe: '#e8394f',
    signBackground: '#ff5c95',
  },
} as const;
