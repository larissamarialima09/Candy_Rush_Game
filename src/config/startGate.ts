/**
 * O portal "CANDY RUSH" sobre a linha de largada.
 *
 * Tudo em METROS, num referencial local do portal:
 * - origem no eixo da pista, exatamente sobre a linha de largada;
 * - +Z aponta no sentido de corrida;
 * - +X aponta para a ESQUERDA da pista;
 * - +Y para cima, a partir da superfície do asfalto ali.
 *
 * O letreiro, o semáforo e os enfeites ficam virados para -Z, ou seja, para
 * quem está no grid: é de lá que o jogador olha na largada, e é esse o
 * enquadramento da foto de referência.
 */
export const START_GATE = {
  /**
   * Distância de cada pilar até a borda do asfalto.
   *
   * Restrição dura: o portal NÃO tem colisão. Quem segura o kart é a barreira de
   * bala, a `TRACK.barriers.offsetFromEdge` (5 m) da borda, então o kart chega
   * no máximo a 5 m menos o raio dele (0,75 m) — 9,65 m do eixo neste circuito.
   * Peça do portal mais para dentro do que isso é atravessada pelo kart na
   * frente da câmera.
   *
   * A conta ingênua engana: a pista chega TORTA na linha de largada (a tangente
   * ali está uns doze graus fora de +Z, porque a última curva desemboca de
   * lado). O portal inteiro herda esse giro, e a folga real fica menor do que o
   * deslocamento lateral faz parecer. E quem manda não é o fuste do pilar: é o
   * BLOCO do pé, a peça mais larga e mais baixa.
   *
   * `tools/checkScenery.ts` mede essa folga a cada execução.
   */
  offsetFromEdge: 7.2,

  /** Os dois pilares de bengala. */
  pillar: {
    radius: 1.15,
    height: 7.4,
    /** Pé alargado, que dá a base pesada da referência. */
    footRadius: 1.75,
    footHeight: 1.1,
    /**
     * Bloco de bala no chão, em volta do pé. É a peça do portal que chega mais
     * perto da pista, então é ela que decide a folga — ver `offsetFromEdge`.
     */
    plinthSize: 4.0,
    plinthHeight: 0.55,
  },

  /**
   * O arco. O tubo é um meio toro ACHATADO: um meio toro puro teria o topo a um
   * raio inteiro de altura (uns 12 m acima dos pilares), que é uma catedral, não
   * um pórtico de kart. `rise` é a altura real do arco acima dos pilares.
   */
  arch: {
    thickness: 1.0,
    rise: 4.5,
  },

  /** O letreiro de cima. A textura é 4:1, então a altura sai da largura. */
  sign: {
    text: 'CANDY RUSH',
    width: 11.5,
    /**
     * Altura da BASE da placa em relação ao topo do arco. NEGATIVO de
     * propósito: a placa tem que morder o arco, como na referência, onde ela
     * nasce de dentro dele. Com valor positivo aparecia céu no vão entre os
     * dois e o letreiro parecia pendurado no nada.
     */
    aboveArch: -0.3,
  },

  /**
   * Semáforo decorativo pendurado sob a placa.
   *
   * DECORATIVO mesmo: não existe contagem regressiva no jogo — a corrida começa
   * assim que a tela aparece. As luzes ficam acesas, como na referência. Se um
   * dia entrar uma largada com contagem, é aqui que ela se pendura.
   */
  lights: {
    count: 4,
    radius: 0.34,
    spacing: 1.3,
    barHeight: 1.15,
    barDepth: 0.5,
    /** Quanto o semáforo fica abaixo da base da placa. */
    belowSign: 0.75,
  },

  /** Pirulitos gigantes encostados no arco, um de cada lado. */
  lollipop: {
    radius: 1.9,
    thickness: 0.36,
    /** Posição ao longo do arco, 0 = topo, 1 = pilar. */
    at: 0.78,
  },

  /** Nuvenzinhas de rosto feliz, entre o pirulito e o letreiro. */
  cloud: {
    radius: 1.15,
    at: 0.5,
  },

  /**
   * Estrelas de açúcar, entre o semáforo e as nuvens.
   *
   * Duas coisas as escondem com facilidade: o semáforo, que ocupa de -3 a +3 no
   * X local, e a nuvem vizinha, que é uma bola larga. O `at` abaixo as põe
   * depois da ponta do semáforo, e a profundidade (em `circuitSurface`) as põe
   * à frente da nuvem, de modo que passem por cima dela como na referência.
   */
  star: {
    outerRadius: 1.15,
    innerRadius: 0.48,
    at: 0.36,
  },

  /** Bandeiras de chegada no alto dos pilares. */
  flag: {
    poleHeight: 3.4,
    poleRadius: 0.12,
    width: 2.3,
    height: 1.45,
    /** Quadrados por lado do xadrez. */
    squares: 4,
  },

  /** Coroa em cima do letreiro. */
  crown: {
    bandRadius: 0.85,
    bandHeight: 0.34,
    spikeHeight: 0.8,
    spikeRadius: 0.26,
  },

  colors: {
    pink: 0xff7fb5,
    hotPink: 0xf5459a,
    frosting: 0xfff6fb,
    gold: 0xffc83d,
    /** Corpo do semáforo: escuro o bastante para a luz acesa aparecer. */
    lightBar: 0x3b2436,
    lightOn: 0xff5c96,
    cloud: 0xfffdff,
    face: 0x7a3a55,
    cheek: 0xffb3d0,
    star: 0xffd94f,
  },
} as const;
