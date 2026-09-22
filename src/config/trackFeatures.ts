/**
 * Coisas NA pista que mudam a corrida: a rampa de aceleração e as geleias.
 *
 * As duas são o par clássico — uma recompensa por passar no lugar certo e um
 * castigo por passar no lugar errado. Por isso moram no mesmo arquivo: quem for
 * ajustar o equilíbrio de uma vai querer olhar a outra na mesma tela.
 *
 * Nenhuma das duas tem colisão de corpo rígido. A rampa é um GATILHO (você
 * passa por cima e ganha turbo) e a geleia é um amortecedor (você passa dentro
 * e perde velocidade). Nada aqui empurra o kart para fora do traçado.
 */

/**
 * Rampa de aceleração, logo depois do Túnel de Donut.
 *
 * O turbo não é inventado aqui: ela dispara o MESMO boost que o drift entrega,
 * via `DriftSystem.triggerBoost`. Assim a rampa herda de graça o decaimento, o
 * teto de potência extra e a regra de um boost forte não ser cortado por um
 * fraco — e o brilho do escapamento no `kartView` acende sozinho.
 */
export const SPEED_RAMP = {
  /**
   * Fração da volta. O donut está em 0,43, e a rampa vem depois dele, já na
   * saída — é onde o turbo rende, porque há reta pela frente para gastá-lo.
   */
  at: 0.5,

  /**
   * Comprimento ao longo da pista e meia-largura do tapete, em metros.
   *
   * A meia-largura era 3,2 m — 6,4 m numa pista de 10,8 m, ou seja, quase
   * metade dela. Uma rampa desse tamanho não é um alvo: é uma faixa que se
   * pega sem querer. Com 1,7 m ela ocupa cerca de um terço da largura e volta
   * a ser uma escolha de traçado.
   */
  length: 9,
  halfWidth: 1.7,

  /** Deslocamento do centro da rampa em relação ao eixo da pista, em metros. */
  lateral: 0,

  /**
   * Altura do DECALQUE acima do asfalto, em metros.
   *
   * A rampa é uma fita colada na pista, não uma laje. A primeira versão era um
   * bloco rígido e plano, posto na altura do eixo e girado só no rumo — e a
   * pista tem inclinação nas curvas e curvatura, então o bloco não assentava:
   * uma borda subia e a outra afundava no asfalto. É exatamente a armadilha que
   * a linha de largada já documenta em `circuitSurface.addStartLine`. Seguindo
   * as amostras do traçado, cada pedaço nasce na superfície, com a inclinação
   * certa.
   */
  height: 0.14,
  /** As setas ficam um fio acima do tapete, para não brigarem com ele. */
  arrowHeight: 0.17,

  /**
   * Nível do boost entregue, de 1 a 3. Dois é o meio-termo: mais que um drift
   * curto, menos que um drift longo bem feito — a rampa não pode valer mais do
   * que pilotar bem.
   */
  boostLevel: 2 as 1 | 2 | 3,

  /** Setas de luz apontando no sentido de corrida. */
  chevrons: 3,

  colors: {
    padLight: 0xfff2f8,
    padStripe: 0xff8cc0,
    /** Rosa de neon das setas. É emissivo: tem que puxar o olho de longe. */
    arrow: 0xff2e93,
    post: 0xffffff,
    postTop: 0xff5c96,
  },
} as const;

/** Um ponto onde nasce uma geleia. */
export interface JellySpot {
  /** Fração da volta. */
  at: number;
  /** Deslocamento lateral, em metros. Positivo = esquerda do sentido. */
  lateral: number;
  /** Raio, em metros. */
  radius: number;
  /** Índice da cor em `JELLY_BLOBS.colors`. */
  color: number;
}

/**
 * Geleias na última curva, antes da linha de chegada.
 *
 * São pequenas e ESCALONADAS de propósito. Enfileiradas na mesma altura da
 * pista elas viram um pedágio: todo mundo perde a mesma velocidade e a manobra
 * deixa de existir. Alternadas, sempre sobra uma linha limpa para quem estiver
 * disposto a procurá-la — e é isso que transforma o trecho em decisão.
 */
export const JELLY_BLOBS = {
  spots: [
    { at: 0.905, lateral: -3.2, radius: 0.85, color: 0 },
    { at: 0.905, lateral: 0.6, radius: 0.75, color: 1 },
    { at: 0.93, lateral: -0.9, radius: 0.8, color: 2 },
    { at: 0.93, lateral: 3.3, radius: 0.9, color: 3 },
    { at: 0.955, lateral: -3.6, radius: 0.75, color: 1 },
    { at: 0.955, lateral: 1.8, radius: 0.85, color: 0 },
    { at: 0.975, lateral: -1.6, radius: 0.8, color: 3 },
  ] as readonly JellySpot[],

  /**
   * Fração da velocidade que SOBREVIVE a cada SEGUNDO dentro da geleia.
   *
   * Por segundo, não por passo — a mesma armadilha que a barreira documenta em
   * `TRACK.barriers.slidePerSecond`. Aplicado por passo, qualquer número
   * plausível vira uma parada seca a 60 Hz. Com 0,05, atravessar uma geleia
   * leva cerca de dois décimos de segundo e custa quase metade da velocidade.
   */
  slowPerSecond: 0.05,

  /**
   * Empurrãozinho para fora, em m/s. Sem ele o kart pode ficar preso dentro da
   * geleia perdendo velocidade sem conseguir sair, que é castigo demais.
   */
  push: 1.6,

  /** Balanço de gelatina parada: amplitude e velocidade. */
  wobble: {
    amplitude: 0.07,
    speed: 2.3,
    /** Amplitude extra logo depois de alguém passar por ela. */
    hitAmplitude: 0.34,
    /** Segundos até o tremor da batida sumir. */
    hitDecay: 0.9,
  },

  /** Rosa, azul, verde e amarelo, como na referência. */
  colors: [0xff4f9a, 0x4fc3f5, 0x7fd36a, 0xffc93d],

  face: {
    eyeRadius: 0.17,
    eyeSpread: 0.36,
    eyeHeight: 0.18,
    mouthRadius: 0.16,
    cheek: 0xff9ec4,
    ink: 0x5c2340,
  },
} as const;
