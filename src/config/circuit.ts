/**
 * Circuito de kart — CENÁRIO, não sistema de pista.
 *
 * Tudo aqui é geometria e decoração: asfalto, zebras, muros de pneu, postes,
 * arquibancada, box, árvores. Nada disso tem colisão, checkpoint, contagem de
 * volta ou grip próprio — a física continua sendo o plano infinito da Fase 1.
 * Esses sistemas são a Fase 4 e vão substituir boa parte deste arquivo.
 *
 * Serve para dois propósitos imediatos: dar curvas de verdade para julgar a
 * câmera, e dar referência visual de velocidade (o que passa perto do olho).
 */

/**
 * Eixo central do traçado, em metros, no plano XZ. A curva é FECHADA: o último
 * ponto liga de volta no primeiro, e é suavizada com Catmull-Rom.
 *
 * O kart nasce em (0, 0) apontando para +Z, então o primeiro trecho é a reta
 * principal e a linha de largada fica na origem.
 *
 * Traçado: reta principal longa, curva 1 rápida à esquerda, reta superior,
 * grampo, reta de retorno, esses, curva ampla e uma última à direita que
 * despeja de volta na reta.
 */
export const CENTERLINE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 45],
  [0, 85],
  [-8, 110],
  [-26, 128],
  [-50, 135],
  [-76, 134],
  [-98, 126],
  [-112, 110],
  [-110, 90],
  [-96, 80],
  [-80, 74],
  [-74, 56],
  [-79, 34],
  [-73, 14],
  [-56, 4],
  [-38, 6],
  [-24, -6],
  [-22, -24],
  [-12, -38],
  [4, -46],
  [18, -40],
  [20, -26],
  [12, -13],
];

export const CIRCUIT = {
  /** Quantos segmentos ao longo de toda a volta. Mais = curvas mais lisas. */
  samples: 480,

  /**
   * Janela, em amostras, usada para medir a curvatura. Medir entre amostras
   * vizinhas (janela 1) dá um valor ruidoso, e como a zebra e o muro de pneu
   * ligam e desligam por limiar de curvatura, o ruído vira zebra tracejada e
   * muro furado. Uma janela de ~5 amostras (uns 5 metros) alisa isso.
   */
  curvatureWindow: 5,

  // A largura da pista NÃO mora mais aqui: ela varia ao longo da volta e é
  // definida por `TRACK.halfWidthProfile`, junto com elevação e inclinação.

  /**
   * Alturas de desenho. Tudo é plano (elevação é Fase 4); estes valores só
   * evitam que as camadas briguem no z-buffer.
   */
  /**
   * Alturas de desenho, em metros ACIMA da superfície.
   *
   * Foram levantadas: com valores de milímetros, a malha do terreno passava
   * por cima da fita e comia pedaços da pista. O terreno agora mergulha por
   * baixo (ver `Terrain`), e esta folga é o segundo cinto de segurança.
   */
  layers: {
    runoff: 0.03,
    asphalt: 0.09,
    edgeLine: 0.11,
    startLine: 0.115,
    kerb: 0.13,
  },

  /**
   * Paleta "Kawaii Candy World", tirada do guia de estilo enviado.
   * Pastéis saturados, nada de cinza: o cinza mata o brilho de bala.
   */
  colors: {
    /**
     * Cor base da pista. Saturada de propósito: pastel demais e a pista
     * desaparece dentro do verde do chão, que era o que estava acontecendo.
     */
    asphalt: 0xf0679f,
    /**
     * Escape. Verde, quase igual ao chão: na referência não existe faixa de
     * escape visível — a zebra é a borda da pista e logo depois vem a grama.
     * O escape continua existindo como SUPERFÍCIE (grip e velocidade
     * próprios), só não se anuncia como uma faixa clara.
     */
    runoff: 0xbfdfa2,
    /** Linha branca no meio da pista. */
    centerLine: 0xffffff,
    edgeLine: 0xffffff,
    /** Zebra quadriculada: rosa forte e branco. */
    kerbA: 0xf0518f,
    kerbB: 0xffffff,
    startLineA: 0xffffff,
    startLineB: 0x1a1a22,
    /**
     * Chão verde-pistache. Mais fechado do que pareceria certo no código: com
     * a luz ambiente alta que a cena usa, um verde claro demais desbota para
     * quase branco e o mundo perde a cor.
     */
    grass: 0xb4dc93,
    /** Pastéis saturados de bala, para gumdrops, árvores e doces. */
    pastels: [0xff7fb5, 0x63d0e8, 0xc79bf5, 0xffd24d, 0x8fdb6a, 0xffa14d],
  },

  /** A textura de confete se repete a cada N metros de pista. */
  textureRepeatMeters: 9,

  /** Linhas brancas de borda. */
  edgeLineWidth: 0.22,

  kerb: {
    width: 1.2,
    /**
     * Curvatura mínima para a zebra existir. ZERO: na referência a zebra
     * quadriculada corre pelas DUAS bordas da volta inteira, e é ela que
     * desenha o traçado de longe. Deixá-la só nas curvas era o que fazia a
     * pista sumir dentro do chão nas retas.
     */
    minCurvature: 0,
    /** Quantos segmentos por quadrado da zebra. Maior = xadrez mais graúdo. */
    stripeSegments: 4,
  },

  /** Linha branca contínua no meio da pista. */
  centerLine: {
    width: 0.28,
  },

  startLine: {
    /** Profundidade da faixa quadriculada, em metros. */
    depth: 1.6,
    /** Quantos quadrados ao longo da largura da pista. */
    squares: 14,
  },

  // O pórtico de largada virou o portal "CANDY RUSH" e ganhou config própria,
  // em `config/startGate.ts` — eram números demais (pilares, arco, letreiro,
  // semáforo, bandeiras, coroa) para continuarem pendurados aqui.

  /**
   * Barreira de bala: cápsulas rosa e creme deitadas ao longo da borda, uma
   * emendada na outra. Substitui o muro de pneus do cenário anterior.
   */
  tireWall: {
    /**
     * Espaçamento entre cápsulas, em metros. Deve bater com o comprimento
     * TOTAL da cápsula (`height + 2 * radius`), senão elas se sobrepõem e as
     * listras se atravessam, ou abrem vãos entre um gomo e o outro.
     */
    spacing: 2.24,
    radius: 0.32,
    height: 1.6,
    // A distância até a pista NÃO mora aqui: quem manda é
    // `TRACK.barriers.offsetFromEdge`, para a barreira que se vê e a que se
    // sente serem a mesma. A barreira é contínua nos dois lados da volta.
    colorA: 0xff7fa8,
    colorB: 0xfff2f6,
  },

  /** Postes-pirulito: mastro listrado com um disco de bala no topo. */
  poles: {
    /** Um poste a cada N metros de pista. */
    spacing: 34,
    height: 7.5,
    radius: 0.14,
    offsetFromEdge: 7.5,
    color: 0xffffff,
    flag: { width: 1.9, height: 1.9, colorA: 0xff9ec4, colorB: 0xc9b6f5 },
  },

  /** Colinas de gumdrop: meias esferas pastel espalhadas ao redor do circuito. */
  hills: {
    minDistanceFromTrack: 30,
    maxDistanceFromTrack: 160,
    minRadius: 3.5,
    maxRadius: 11,
  },

  /** Nuvens de marshmallow. Puro enfeite de horizonte. */
  clouds: {
    /** Bem alto e bem longe: nuvem baixa demais parece balão preso na pista. */
    minHeight: 90,
    maxHeight: 190,
    spread: 620,
    minRadius: 12,
    maxRadius: 30,
    color: 0xfffdff,
  },

  /** Objetos baixos e próximos da pista: nada dá mais sensação de velocidade. */
  markers: {
    /** Placas de frenagem, a cada N metros. */
    boardSpacing: 22,
    boardWidth: 1.1,
    boardHeight: 0.75,
    boardPostHeight: 0.85,
    boardOffsetFromEdge: 3.0,
    boardColor: 0xfff2f6,
    /** Cones no interior das curvas. */
    coneSpacing: 9,
    coneRadius: 0.22,
    coneHeight: 0.55,
    coneOffsetFromEdge: 1.4,
    coneMinCurvature: 0.045,
    coneColor: 0xffb14d,
  },

  grandstand: {
    /**
     * Posição ao longo da volta, 0..1 (0 = linha de largada).
     * Tem que cair num trecho RETO: a arquibancada é uma caixa rígida de
     * dezenas de metros colocada num único ponto do traçado, então numa curva
     * ela corta a pista pela corda. A reta principal vai de 0 a ~0.16.
     */
    at: 0.06,
    /** De que lado da pista (1 = esquerda do sentido de corrida). */
    side: -1,
    /**
     * Distância da borda do asfalto. Generosa de propósito: a barreira já
     * está a 5 m, e a arquibancada precisa ficar atrás dela com folga para
     * não invadir a pista quando a largura da pista aumenta.
     */
    offsetFromEdge: 26,
    length: 34,
    rows: 7,
    rowDepth: 1.1,
    rowHeight: 0.62,
    frameColor: 0xfff2f6,
    seatColor: 0xa9e3d0,
  },

  /** A "sweet shop" do guia de estilo, ao lado da reta. */
  pitBuilding: {
    /**
     * Também num trecho reto, e do lado oposto ao da arquibancada.
     * Recuada para perto da largada: em 0.1 ela ficava exatamente onde desce
     * a escada de jujuba do Doce Castelo (`config/castle.ts`).
     */
    at: 0.035,
    side: 1,
    offsetFromEdge: 20,
    length: 30,
    depth: 8,
    height: 4.2,
    wallColor: 0xfff0e2,
    roofColor: 0xff8fb1,
    awningColor: 0xffd98e,
  },

  /**
   * Árvores de bala: tronco listrado de pirulito e uma copa feita de esferas
   * pastel amontoadas, em vez de um cone verde.
   */
  // As QUANTIDADES de árvore, colina e nuvem moram em `config/quality.ts`:
  // são orçamento gráfico, não direção de arte.
  trees: {
    /** Não nascem a menos que isto da linha de centro (metros). */
    minDistanceFromTrack: 22,
    /** Nem além disto. */
    maxDistanceFromTrack: 110,
    /** Palito listrado de bala, comum às quatro variedades. */
    trunkRadius: 0.26,
    trunkHeight: 2.6,
    trunkColor: 0xffffff,
    scaleVariation: 0.4,

    /**
     * As quatro árvores da referência: sorvete rosa, algodão-doce azul,
     * pirulito de espiral e cupcake amarelo.
     *
     * Antes havia uma só — palito com três bolas pastel sorteadas — e de longe
     * noventa cópias dela viravam um campo de arbustos iguais. O que dá vida a
     * um horizonte é a variedade de SILHUETA, não de cor: as quatro formas se
     * distinguem a cem metros, e as cores só confirmam.
     *
     * `weight` reparte o total de árvores de `QUALITY.treeCount`.
     */
    varieties: [
      { kind: 'sorvete', weight: 3, color: 0xff7fb5, size: 1.5 },
      { kind: 'algodao', weight: 3, color: 0x7fd8ff, size: 1.8 },
      { kind: 'pirulito', weight: 2, color: 0xff4f9a, size: 1.6 },
      { kind: 'cupcake', weight: 2, color: 0xffd24d, size: 1.4 },
    ] as const,
  },

  /**
   * Balões de ar quente com cesta de cupcake, espalhados por TODO o mapa.
   *
   * Eram cinco, presos a frações da volta — ou seja, só apareciam ao lado da
   * pista. Agora são sorteados na caixa inteira do circuito, que é o que enche
   * o céu de verdade. A quantidade mora em `QUALITY.balloonCount`: é orçamento
   * gráfico, não direção de arte.
   */
  balloons: {
    minHeight: 26,
    maxHeight: 62,
    /** Quanto além da caixa do circuito eles podem ir, em metros. */
    spread: 120,
    minScale: 0.8,
    maxScale: 1.45,
  },

  /** Semente do gerador: o cenário é idêntico a cada recarregamento. */
  randomSeed: 1337,
} as const;
