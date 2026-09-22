/**
 * A pista como SISTEMA (Fase 4), não como cenário.
 *
 * Até a fase anterior a física era um plano infinito e o circuito era pintura.
 * Agora a superfície é de verdade: tem largura variável, sobe e desce, se
 * inclina nas curvas, e cada pedaço do mundo tem um material com grip e
 * velocidade máxima próprios.
 *
 * Os perfis abaixo são definidos por FRAÇÃO DA VOLTA (0 = largada, 1 = volta
 * completa) e interpolados de forma cíclica e suave. É mais fácil de ajustar
 * do que editar dezenas de pontos do traçado, e garante que o fim da volta
 * emenda no começo sem degrau.
 */

export interface TrackProfilePoint {
  /** Posição na volta, 0..1. */
  at: number;
  value: number;
}

export const TRACK = {
  /**
   * Meia-largura do asfalto, em metros, ao longo da volta.
   * Estreitar antes de uma curva difícil e alargar na saída é o truque mais
   * barato para uma pista "respirar".
   */
  halfWidthProfile: [
    { at: 0.0, value: 5.6 },
    { at: 0.12, value: 5.2 },
    { at: 0.26, value: 4.4 },
    { at: 0.4, value: 5.0 },
    { at: 0.55, value: 4.2 },
    { at: 0.68, value: 4.8 },
    { at: 0.82, value: 5.4 },
    { at: 0.93, value: 4.6 },
  ] as readonly TrackProfilePoint[],

  /**
   * Elevação do eixo da pista, em metros.
   * Mantida modesta de propósito: o terreno em volta acompanha a altura da
   * amostra mais próxima do eixo, então desníveis grandes criariam degraus
   * onde dois trechos da pista passam perto um do outro.
   */
  elevationProfile: [
    { at: 0.0, value: 0.0 },
    { at: 0.16, value: 2.6 },
    { at: 0.3, value: 3.4 },
    { at: 0.45, value: 0.8 },
    { at: 0.58, value: -1.6 },
    { at: 0.72, value: -0.4 },
    { at: 0.86, value: 1.8 },
  ] as readonly TrackProfilePoint[],

  banking: {
    /**
     * Graus de inclinação por unidade de curvatura (1/m).
     * A curva mais fechada do traçado tem raio de 12 m (curvatura 0.083), então
     * 110 graus por unidade dá ~9 graus lá e quase nada nas retas.
     */
    degreesPerCurvature: 110,
    maxDegrees: 9,
    /**
     * Janela de suavização, em amostras. Sem isso a inclinação liga e desliga
     * junto com a curvatura e a pista fica com dobras.
     */
    smoothingSamples: 14,
  },

  /** Faixa de escape, em metros de cada lado, além do asfalto. */
  runoffWidth: 5.5,

  /**
   * O terreno em volta acompanha a altura da pista e vai voltando ao nível
   * zero conforme se afasta. Física, malha do chão e posicionamento de cenário
   * usam TODOS a mesma função de altura — se usassem funções diferentes, o
   * kart flutuaria ou afundaria no visual.
   */
  terrain: {
    /** Até esta distância do eixo (m), o terreno acompanha a pista inteira. */
    fadeStart: 45,
    /** A partir daqui o terreno é plano em y = 0. */
    fadeEnd: 115,
    // O tamanho da célula da malha mora em `config/quality.ts`.
  },

  checkpoints: {
    /**
     * Quantos portais ao longo da volta, contando a largada. Precisam ser
     * poucos o bastante para não incomodar e muitos o bastante para impedir
     * corte de percurso: um atalho tem que necessariamente pular um portal.
     */
    count: 14,
    /** Folga lateral, além da borda do asfalto, para o portal contar. */
    lateralMargin: 6,
  },

  offTrack: {
    /**
     * Segundos fora da pista antes do reposicionamento. Curto demais pune quem
     * só pisou na grama; longo demais transforma o corte de percurso em rota.
     */
    graceSeconds: 2.6,
    /** Altura acima da pista em que o kart reaparece. */
    respawnHeight: 0.8,
  },

  barriers: {
    /** Distância entre a borda do ASFALTO e a barreira, em metros. */
    offsetFromEdge: 5.0,
    /** Raio de colisão do kart, em metros. */
    kartRadius: 0.75,
    /**
     * Quanto da velocidade normal à barreira volta como repique. Baixo de
     * propósito: bater não pode catapultar o kart de volta para a pista.
     */
    restitution: 0.2,
    /**
     * Fração da velocidade AO LONGO da barreira que sobrevive a cada SEGUNDO
     * de raspão. É este número que faz a barreira RASPAR em vez de travar:
     * perto de 1 o kart desliza junto do muro; perto de 0 ele gruda e a
     * corrida acaba ali.
     *
     * Por segundo, não por passo. Aplicado por passo, 0.94 vira 0.94^60 = 2%
     * de sobrevivência por segundo — o kart parava seco no muro.
     */
    slidePerSecond: 0.55,
    /**
     * Quanto o impacto alinha o kart com a barreira (0..1 por segundo).
     * Sem isso o kart bate de lado e fica arando o muro de través.
     */
    alignment: 3.5,
    /** Velocidade normal mínima (m/s) para contar como raspão e soltar faísca. */
    scrapeSpeed: 2.5,
  },
} as const;

/** Tipos de superfície. Cada um muda como o kart se comporta em cima dele. */
export type SurfaceKind = 'asfalto' | 'zebra' | 'grama' | 'areia';

export interface SurfaceMaterial {
  /** Multiplicador sobre o grip dos pneus. */
  grip: number;
  /** Multiplicador sobre o teto de velocidade do motor. */
  maxSpeed: number;
  /** Multiplicador sobre a resistência ao rolamento. */
  rollingResistance: number;
  /** Que partícula a roda levanta. */
  particle: 'none' | 'poeira' | 'areia';
  /** Cor da partícula levantada. */
  particleColor: number;
  /** Se o kart está "fora da pista" quando as rodas estão aqui. */
  offTrack: boolean;
}

/**
 * >>> ESTES NÚMEROS DEFINEM O CUSTO DE ERRAR. <<<
 *
 * Se a grama estiver punitiva demais, cada errinho vira um recomeço e o jogo
 * fica frustrante. Se estiver leve demais, cortar caminho pela grama passa a
 * ser mais rápido do que fazer a curva, e o traçado deixa de importar.
 */
export const SURFACES: Record<SurfaceKind, SurfaceMaterial> = {
  asfalto: {
    grip: 1.0,
    maxSpeed: 1.0,
    rollingResistance: 1.0,
    particle: 'none',
    particleColor: 0xffffff,
    offTrack: false,
  },
  zebra: {
    // Zebra agarra quase igual, mas cobra: chacoalha e tira um pouco de grip.
    grip: 0.9,
    maxSpeed: 1.0,
    rollingResistance: 1.4,
    particle: 'none',
    particleColor: 0xffffff,
    offTrack: false,
  },
  // Campo de marshmallow, além da barreira e nos cortes de percurso: bem pior
  // que o escape. É este degrau que faz o traçado importar.
  grama: {
    grip: 0.5,
    maxSpeed: 0.55,
    rollingResistance: 3.5,
    particle: 'poeira',
    particleColor: 0xd9f2e2,
    offTrack: true,
  },
  // Área de escape (o "glacê" do cenário): pisar aqui é um errinho, não uma
  // sentença. Fica entre o asfalto e a barreira, então é onde se raspa no
  // muro — se fosse pesada demais, todo toque na barreira acabaria a corrida.
  areia: {
    grip: 0.7,
    maxSpeed: 0.72,
    rollingResistance: 2.2,
    particle: 'areia',
    particleColor: 0xffe3ee,
    offTrack: true,
  },
};
