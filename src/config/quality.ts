/**
 * Orçamento gráfico.
 *
 * Este projeto roda numa máquina com 3,7 GB de RAM total, onde o navegador
 * disputa memória com tudo o mais. Um canvas WebGL que pede mais do que sobra
 * simplesmente não abre — e falha em silêncio, com a tela preta.
 *
 * Os padrões aqui são conservadores de propósito. Se o jogo estiver leve na
 * sua máquina, subir estes números é a primeira coisa a fazer, e nenhum deles
 * muda o comportamento do kart.
 */
export const QUALITY = {
  /**
   * Teto do device pixel ratio. Em tela retina, 2 quadruplica a contagem de
   * pixels — é o parâmetro que mais pesa e o menos perceptível.
   */
  maxPixelRatio: 1.5,

  /** Resolução do mapa de sombra. 1024² ≈ 4 MB de vídeo; 2048² ≈ 16 MB. */
  shadowMapSize: 1024,

  /** Teto de partículas vivas. Cada uma é uma instância desenhada. */
  particlePoolSize: 300,

  /** Tamanho da célula da malha do terreno, em metros. Maior = menos vértices. */
  terrainCellSize: 6,

  /**
   * Quantos "pontos de doce" são plantados ao redor da pista. Cada ponto vira
   * um pirulito, uma bengala, um cupcake, um grupinho de gumdrops ou um tufo
   * de grama — então o número de objetos desenhados é várias vezes maior.
   */
  candyPropCount: 190,

  /** Quantidade de cenário espalhado. */
  treeCount: 90,
  hillCount: 60,
  cloudCount: 24,
  /**
   * Balões no céu. Cada um são quatro instâncias (balão, glacê, cesta, cordas),
   * todas em InstancedMesh — então subir este número custa pouco, mas ele
   * ainda é orçamento: são objetos desenhados em cima de tudo o mais.
   */
  balloonCount: 16,

  /** Lado do plano de horizonte, em metros. */
  horizonPlaneSize: 2500,

  /**
   * Quantos segmentos de marca de pneu ficam no chão de uma vez. É um anel:
   * ao encher, o mais antigo é reescrito. Cada segmento são 6 vértices.
   */
  skidMarkCount: 320,

  /**
   * Brilho de tela (bloom). Custa dois alvos de render em meia resolução, o
   * que nesta máquina é caro. Desligado, o brilho continua existindo via
   * materiais emissivos e a camada de CSS — só não vaza para os pixels
   * vizinhos.
   */
  bloom: false,
} as const;
