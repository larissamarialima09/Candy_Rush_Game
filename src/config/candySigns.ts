/**
 * Placas de direção, bandeiras de pista e nuvens voadoras.
 *
 * Três peças de sinalização e enfeite que compartilham o mesmo arquivo porque
 * compartilham o mesmo papel: dizer ao jogador onde ele está. As placas marcam
 * pontos do traçado, as bandeiras marcam a largada e as nuvens dão profundidade
 * ao céu entre um marco e outro.
 *
 * Referencial local de cada peça, como no resto do cenário:
 * +Z no sentido de corrida, +X para a esquerda da pista, +Y para cima.
 */

/** Uma placa de direção plantada à beira da pista. */
export interface SignpostSpec {
  /** Fração da volta. */
  at: number;
  /** Lado da pista: 1 = esquerda do sentido de corrida. */
  side: number;
  /** Distância além da borda do asfalto, em metros. */
  offsetFromEdge: number;
}

export const CANDY_SIGNS = {
  /**
   * As duas placas: uma logo no começo da pista e outra pouco depois do Túnel
   * de Donut, que fica em 0,43.
   *
   * Ficam ALÉM da barreira de bala (5 m da borda). Cenário dentro do alcance
   * do kart é atravessado, porque nada disto tem colisão.
   */
  signposts: [
    { at: 0.03, side: 1, offsetFromEdge: 8.5 },
    { at: 0.47, side: -1, offsetFromEdge: 8.5 },
  ] as readonly SignpostSpec[],

  signpost: {
    postHeight: 4.6,
    postRadius: 0.22,
    /** Pirulito no topo do mastro. */
    topRadius: 0.62,
    /** As setas, de cima para baixo. `dir` +1 aponta para a esquerda local. */
    boards: [
      { color: 0xff5c96, icon: 0xffd94f, dir: 1, y: 3.9 },
      { color: 0x63d0e8, icon: 0xff9ec4, dir: -1, y: 3.0 },
      { color: 0xffd24d, icon: 0xffffff, dir: 1, y: 2.1 },
      { color: 0xc79bf5, icon: 0xffffff, dir: -1, y: 1.2 },
    ],
    boardWidth: 2.3,
    boardHeight: 0.66,
    boardDepth: 0.2,
  },

  /**
   * Bandeiras quadriculadas logo no início da pista, uma de cada lado.
   *
   * Duas por lado, escalonadas, para a largada ter moldura sem virar corredor.
   */
  startFlags: {
    at: [0.004, 0.018] as readonly number[],
    offsetFromEdge: 7.0,
    poleHeight: 3.6,
    poleRadius: 0.17,
    flagWidth: 1.9,
    flagHeight: 1.2,
    /** Quadrados por lado do xadrez. Poucos e graúdos leem melhor de longe. */
    squares: 4,
    starRadius: 0.42,
    starColor: 0xffd94f,
  },

  /**
   * Nuvens voadoras com rosto e arco-íris, espalhadas pelo céu do mapa.
   *
   * São CÉU por projeto: não encostam no chão, e a auditoria de contato tem uma
   * dispensa explícita para elas. Ficam abaixo das nuvens de marshmallow do
   * horizonte (que vivem a 90–190 m) para não se misturarem com o fundo.
   */
  flyingClouds: {
    count: 10,
    minHeight: 34,
    maxHeight: 72,
    /** Quanto além da caixa do circuito elas podem ir, em metros. */
    spread: 90,
    minScale: 1.0,
    maxScale: 2.1,
    body: 0xfffdff,
    cheek: 0xffb3d0,
    ink: 0x6b2f4d,
    /** O arco-íris atrás da nuvem, de fora para dentro. */
    rainbow: [0xff7fb5, 0xffa14d, 0xffd24d, 0x8fdb6a, 0x63d0e8, 0xc79bf5],
    rainbowTube: 0.26,
  },
} as const;
