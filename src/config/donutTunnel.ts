/**
 * O Túnel de Donut: um donut gigante em pé, com a pista passando pelo buraco.
 *
 * Substituiu a passarela de waffle, que era uma plataforma sobre pilares.
 *
 * Tudo em METROS, num referencial local do donut:
 * - origem no eixo da pista, na altura do asfalto;
 * - +Z aponta no sentido de corrida — que é também o eixo do buraco, porque um
 *   toro do Three já nasce com o furo no eixo Z. Por isso o donut não precisa
 *   de nenhuma rotação extra além do rumo da pista;
 * - +Y para cima.
 *
 * A parte de baixo do toro fica ENTERRADA de propósito. Um donut inteiro apoiado
 * no chão só tocaria a pista num ponto; afundando o centro, o furo vira um arco
 * largo ao nível do asfalto, que é exatamente o que se vê na referência — a
 * massa mergulha no chão dos dois lados da estrada.
 */
export const DONUT_TUNNEL = {
  /** Fração da volta onde o túnel fica (a mesma da antiga passarela). */
  at: 0.43,

  /**
   * Raio do buraco e altura do centro do donut acima do asfalto.
   *
   * Estes dois números decidem a largura da passagem AO NÍVEL DA PISTA, que vale
   * `raiz(buraco² - altura²)` para cada lado. Com 11,5 e 5,0 dá 10,35 m de cada
   * lado, contra os 9,65 m que o kart alcança antes de a barreira segurá-lo —
   * ou seja, sobra folga e a massa nunca entra no caminho de quem corre.
   */
  holeRadius: 11.5,
  centerHeight: 5.0,

  /** Espessura da massa. */
  tubeRadius: 3.8,

  /** Segmentos ao redor do anel e ao redor da seção da massa. */
  ringSegments: 44,
  tubeSegments: 18,

  frosting: {
    /** Quanto a cobertura fica mais gorda que a massa. */
    thickness: 0.2,
    /**
     * Até onde a cobertura desce pela seção da massa, em radianos a partir da
     * linha externa. Acima de PI/2 ela passa das "bochechas" e começa a entrar
     * no furo; abaixo disso, fica só na parte de fora.
     */
    span: 1.85,
    /** Ondulação da borda escorrida, e quantas ondas ao redor do donut. */
    waveAmplitude: 0.22,
    waves: 9,
  },

  sprinkles: {
    count: 96,
    length: 0.66,
    thickness: 0.18,
  },

  colors: {
    /** Massa frita: dourado quente. */
    dough: 0xf0b46a,
    doughTop: 0xffd89c,
    doughBottom: 0xd98c3f,
    /** Cobertura rosa de bala. */
    icing: 0xff6fae,
    icingTop: 0xffb2d6,
    icingBottom: 0xf03e90,
  },
} as const;
