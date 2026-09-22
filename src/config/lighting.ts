/**
 * Iluminação do mundo de doces.
 *
 * Uma nota sobre o HDR em `assets/rooftop_night_4k.exr`: é um terraço à noite.
 * Extrair a iluminação dele dava um mundo cinza e lavado sob a laje de um
 * prédio, e pastel precisa de luz clara e ambiente colorido para existir como
 * pastel. Por isso os valores abaixo são escritos à mão, de dia claro.
 */
const KEY_BEARING_DEGREES = 34;
const KEY_ELEVATION_DEGREES = 52;

export const LIGHTING = {
  /**
   * Ambiente: azul de céu vindo de cima, rosa rebatido do chão.
   * Alta de propósito. Num mundo pastel, sombra escura vira sujeira — a
   * sombra tem que ser mais fria e mais rosa, não mais preta.
   */
  hemisphere: {
    skyColor: 0xbfe0ff,
    groundColor: 0xffd6e6,
    /**
     * Alta, mas não tanto quanto antes: com 2.1 aqui mais o sol, as cores
     * claras saturavam em branco e o verde do chão sumia. Luz ambiente forte
     * demais achata um mundo pastel exatamente como luz de menos o escurece.
     */
    intensity: 1.45,
  },

  sun: {
    color: 0xfff4e2,
    intensity: 2.2,
    distance: 80,
    bearingRadians: (KEY_BEARING_DEGREES * Math.PI) / 180,
    elevationDegrees: KEY_ELEVATION_DEGREES,
  },

  /**
   * Contraluz fria do lado oposto, para desenhar a silhueta dos objetos
   * contra o fundo claro. Sem ela, tudo que está de costas para o sol vira
   * uma mancha chapada.
   */
  rim: {
    color: 0xc8e6ff,
    intensity: 0.75,
    bearingRadians: ((KEY_BEARING_DEGREES + 155) * Math.PI) / 180,
    elevationDegrees: 20,
    distance: 60,
  },

  /**
   * Luz quente presa ao kart. De dia ela é sutil: serve para o carrinho e o
   * coelho terem sempre um pouco de cor própria, mesmo dentro de uma sombra.
   */
  kartLamp: {
    color: 0xffd2e6,
    intensity: 3.2,
    distance: 12,
    decay: 1.8,
    offset: { x: 0, y: 2.2, z: 0.4 },
  },

  shadows: {
    enabled: true,
    /**
     * Meia-largura, em metros, da caixa de sombra. Ela SEGUE O KART em vez de
     * cobrir o circuito inteiro: cobrir 250 m com 1024 pixels daria uma
     * sombra borrada e sem serventia.
     */
    radius: 38,
    near: 1,
    far: 220,
    bias: -0.0006,
    normalBias: 0.035,
  },

  /** Névoa. Usa a cor do horizonte, senão o mundo acaba numa parede. */
  fog: {
    near: 210,
    far: 780,
  },

  /** Exposição do tone mapping. */
  exposure: 1.0,
} as const;
