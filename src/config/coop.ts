/**
 * Coop local: dois pilotos humanos na mesma tela.
 *
 * Tela dividida não é só "desenhar duas vezes". Três coisas mudam de verdade:
 *
 * 1. **Custo.** A cena inteira é rasterizada uma vez por jogador. Numa máquina
 *    apertada isso é o dobro de tudo, então `pixelRatioScale` e
 *    `shadowMapScale` abaixo derrubam o orçamento gráfico assim que o segundo
 *    piloto entra. É o botão de emergência: se o coop engasgar, mexa neles
 *    primeiro.
 * 2. **Formato.** Cada metade tem proporção diferente da tela cheia. Uma faixa
 *    deitada (split horizontal) fica larga e baixa, o que corta o campo de
 *    visão vertical — por isso existe o `fovBonus`, que devolve um pouco do
 *    que a faixa tirou.
 * 3. **Leitura.** O HUD encolhe: dois velocímetros de 46px na mesma tela viram
 *    poluição. `hudScale` resolve isso sem tocar no CSS.
 *
 * Nada aqui altera a física. Dois jogadores humanos dirigem exatamente o mesmo
 * kart que um jogador sozinho dirige.
 */
export const COOP = {
  /**
   * Como a tela é cortada.
   *
   * `horizontal` empilha as faixas (P1 em cima, P2 embaixo) e é o padrão dos
   * jogos de corrida: o que importa em corrida é enxergar longe à frente, e a
   * faixa larga preserva a visão lateral que mostra quem está te ultrapassando.
   * `vertical` (lado a lado) só compensa em tela muito alta ou em retrato.
   */
  split: 'horizontal' as 'horizontal' | 'vertical',

  /** Espessura da linha que separa as duas faixas, em pixels de tela. */
  dividerThickness: 3,

  /**
   * Multiplicador do device pixel ratio quando o coop está ativo. 0.8 devolve
   * cerca de 36% dos pixels — quase sempre a diferença entre 60 e 30 quadros,
   * e é o ajuste que menos se percebe.
   */
  pixelRatioScale: 0.8,

  /**
   * Multiplicador da resolução do mapa de sombra no coop.
   *
   * Fica em 1 de propósito. O mapa de sombra é desenhado UMA vez por quadro e
   * as duas câmeras leem o mesmo mapa — ou seja, ele não é o que dobrou de
   * custo com o segundo jogador, e derrubá-lo pagaria em qualidade sem aliviar
   * o gargalo. Abaixe só se a máquina estiver estourando memória de vídeo, e
   * antes disso mexa em `pixelRatioScale`, que é onde o custo real está.
   */
  shadowMapScale: 1,

  /**
   * Quanto a caixa de sombra é alargada no coop.
   *
   * A caixa passa a ser centrada no ponto MÉDIO entre os dois karts, em vez de
   * em cima de um deles. Com o raio original, bastavam os dois se afastarem
   * meia reta para o de trás sair da caixa e perder a sombra — o carrinho
   * parece flutuar no instante em que isso acontece. Alargar cobre a separação
   * típica de uma disputa; alargar demais espalha a mesma resolução por uma
   * área maior e borra a sombra de todo mundo.
   */
  shadowRadiusScale: 1.45,

  /**
   * Graus de campo de visão somados em cada faixa, para compensar a altura
   * perdida no corte horizontal. Zero desliga a compensação.
   */
  fovBonus: 7,

  /** Escala do HUD por jogador no coop. 1 = mesmo tamanho da tela cheia. */
  hudScale: 0.74,

  /**
   * Cor da faixa de identificação de cada jogador (a tarja "P1"/"P2" no HUD).
   * A mesma cor pinta o kart, para a pessoa achar o próprio carrinho de
   * relance no meio do pelotão.
   */
  players: [
    { label: 'P1', tint: '#ff6fa5', body: 0xff6fa5, fur: 0xfffaf2, ear: 0xffc0d8 },
    { label: 'P2', tint: '#59c8ff', body: 0x59c8ff, fur: 0xf2fbff, ear: 0xa8e4ff },
  ],

  /**
   * Gamepad.
   *
   * O navegador expõe o controle no layout "standard": eixo 0 é o analógico
   * esquerdo na horizontal, botão 7 é o gatilho direito, e assim por diante.
   * Quem tiver um controle exótico ajusta os índices aqui.
   */
  gamepad: {
    /**
     * Abaixo desta fração, o analógico é tratado como centro. Todo controle
     * usado tem folga no repouso; sem zona morta o kart puxa sozinho.
     */
    deadzone: 0.18,

    /**
     * Expoente aplicado ao analógico da direção depois da zona morta. Acima de
     * 1 dá mais precisão no meio do curso (bom para corrigir a traseira) sem
     * perder o esterço máximo no fim.
     */
    steerCurve: 1.5,

    /** A partir de que fração o gatilho conta como acelerador pisado. */
    triggerThreshold: 0.12,

    /** Índices no layout padrão. */
    axes: { steer: 0 },
    buttons: {
      throttle: [7, 0] as readonly number[],
      brake: [6, 1] as readonly number[],
      handbrake: [5, 2] as readonly number[],
      respawn: [3] as readonly number[],
      pause: [9] as readonly number[],
    },
  },
} as const;
