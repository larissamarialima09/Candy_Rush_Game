/**
 * A "Máquina de Doces" — o chicletódromo de vidro à beira da pista.
 *
 * Tudo em METROS, num referencial local da máquina:
 * - origem no centro do tablado, na altura do PISO dele (o convés);
 * - +Z aponta para a PISTA, porque é para lá que a calha despeja as balas e é
 *   de lá que o jogador olha — construir a máquina de frente para a pista e
 *   depois girar o grupo é bem mais fácil do que pensar em qual lado da pista
 *   ela caiu;
 * - +X corre ao longo da pista;
 * - +Y para cima.
 *
 * As montanhas de algodão-doce ficam em -Z, ATRÁS da máquina, como na foto de
 * referência: a máquina na frente, o maciço cor-de-rosa fechando o horizonte.
 */

export interface CottonMountainSpec {
  /** Posição no referencial local da máquina. */
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Cor dominante, cor do rodamoinho e cor do brilho de contorno. */
  base: number;
  swirl: number;
  rim: number;
  /** Quantas balas coloridas grudadas no tufo. */
  dots: number;
  /** Tamanho do tufo grande do shader, em metros. */
  puffMeters: number;
}

export const CANDY_FACTORY = {
  /**
   * Fração da volta (0 = largada). Tem que cair num trecho RETO e no lado de
   * FORA do circuito: a máquina é um bloco rígido de vinte e poucos metros, e
   * o lado de dentro daquele trecho é por onde a própria pista volta.
   */
  at: 0.225,

  /**
   * De que lado da pista, 1 = esquerda do sentido de corrida. No alto do
   * traçado a esquerda é o lado de fora do circuito, que é onde há campo.
   */
  side: 1,

  /**
   * Distância da borda do asfalto até o centro do tablado. Perto o bastante
   * para a máquina encher a tela na reta, longe o bastante para a calha de
   * balas não invadir a área de escape.
   */
  offsetFromEdge: 34,

  /** Quanto da fundação fica enterrado, para nada flutuar onde o chão desce. */
  buriedDepth: 1.1,

  /** O tablado onde a máquina se apoia. Largura corre ao longo da pista. */
  deck: {
    width: 22,
    depth: 16,
    /** Altura do conjunto fundação + convés, abaixo da origem local. */
    height: 2.3,
    /** Postes do parapeito por lateral. */
    posts: 6,
  },

  /** O corpo da máquina: base creme, globo de vidro, tampa rosa. */
  machine: {
    bodyTopRadius: 2.7,
    bodyBottomRadius: 3.55,
    bodyHeight: 5.2,
    /** Raio do globo de vidro. É o herói da silhueta: generoso de propósito. */
    bowlRadius: 3.7,
    bowlCenterY: 9.6,
    /** Quantas balas dentro do globo. */
    bowlGumballs: 150,
    lidY: 13.6,
    lidRadius: 2.45,
  },

  /** A calha que despeja balas na direção da pista. */
  chute: {
    /** Centro da calha e inclinação, em radianos (positivo = ponta caída). */
    centerY: 2.2,
    centerZ: 8.5,
    offsetX: -1.2,
    tilt: 0.42,
    length: 8.8,
    width: 2.6,
    /** Balas rolando na calha e derramadas no chão ao pé dela. */
    rolling: 22,
    spilled: 46,
  },

  /** Potes de vidro em cima do convés, cada um cheio de balas. */
  jars: [
    { x: -6.8, z: 3.2, radius: 1.05, height: 3.2, cap: 'lavender' },
    { x: 6.4, z: 3.6, radius: 1.05, height: 3.2, cap: 'mint' },
    { x: 7.8, z: -1.2, radius: 0.95, height: 2.8, cap: 'blue' },
  ] as const,

  /**
   * As montanhas de algodão-doce. Uma bem grande fechando o fundo e duas
   * menores escalonadas, que é o que dá profundidade ao maciço — três picos do
   * mesmo tamanho lado a lado leem como cerca, não como montanha.
   */
  mountains: [
    {
      x: -4,
      z: -34,
      radius: 20,
      height: 31,
      base: 0xffc0dc,
      swirl: 0xc4ecff,
      rim: 0xffe0f0,
      dots: 26,
      puffMeters: 9,
    },
    {
      x: -30,
      z: -19,
      radius: 12,
      height: 19,
      base: 0xffd6ea,
      swirl: 0xfffdff,
      rim: 0xffe8f4,
      dots: 14,
      puffMeters: 6,
    },
    {
      x: 20,
      z: -27,
      radius: 14,
      height: 23,
      base: 0xd3efff,
      swirl: 0xffcfe6,
      rim: 0xe4f7ff,
      dots: 18,
      puffMeters: 7,
    },
  ] as readonly CottonMountainSpec[],

  /**
   * Retângulo, no referencial local, onde nada do cenário sorteado (árvores,
   * colinas, doces) pode nascer. Cobre o tablado e o pé das montanhas — sem
   * isso nasce pirulito dentro do algodão-doce.
   */
  footprint: { minX: -46, maxX: 38, minZ: -58, maxZ: 15 },

  /** Paleta da foto: creme, rosa-bala, glacê, dourado e vidro azulado. */
  colors: {
    cream: 0xfff1dc,
    pink: 0xff7fb5,
    hotPink: 0xf5459a,
    frosting: 0xfff6fb,
    gold: 0xffb945,
    glass: 0xdff7ff,
    lavender: 0xc79bf5,
    mint: 0x8fdb6a,
    blue: 0x63d0e8,
  },
} as const;
