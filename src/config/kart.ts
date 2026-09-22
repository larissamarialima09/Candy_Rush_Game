/**
 * TODO o tuning do kart vive aqui. Nenhum destes números pode aparecer
 * hardcoded dentro da lógica de física ou de veículo.
 *
 * Convenção de eixos (espaço local do chassi):
 *   +X = direita   +Y = cima   +Z = FRENTE
 * A origem do chassi é o centro geométrico da caixa. O centro de massa é
 * deslocado a partir dela (veja `centerOfMass`).
 */

export const KART = {
  chassis: {
    /** Massa total (kart + piloto), em kg. */
    mass: 165,

    /** Extensões totais da caixa do chassi: largura (X), altura (Y), comprimento (Z), em metros. */
    size: { x: 1.05, y: 0.5, z: 1.85 },

    /**
     * Centro de massa em coordenadas locais do chassi.
     * Baixo (Y negativo) => menos rolagem e menos tendência a capotar.
     * Levemente atrás (Z negativo) => mais carga na traseira, tração melhor
     * na saída de curva e traseira mais preguiçosa para soltar.
     */
    centerOfMass: { x: 0, y: -0.2, z: -0.09 },

    /**
     * Multiplicadores sobre a inércia de caixa uniforme.
     * x = pitch (cabecear), y = yaw (girar), z = roll (rolar).
     * Baixar `y` deixa o kart mais ávido para rodar — é o parâmetro mais
     * direto para "agilidade" sem mexer em grip.
     *
     * `z` está acima de 1 de propósito: uma caixa uniforme subestima muito a
     * inércia de rolagem de um kart com piloto sentado, e inércia de rolagem
     * baixa demais briga com o amortecedor da suspensão (ver `damperBump`).
     */
    inertiaScale: { x: 1.0, y: 0.75, z: 1.6 },

    /** Amortecimento numérico. Mantenha baixo: o arrasto de verdade está em `aero`. */
    linearDamping: 0.02,
    /** Amortecimento angular. Segura o kart de ficar girando eternamente no ar. */
    angularDamping: 0.55,
  },

  /**
   * Posição de fixação da suspensão de cada roda, em coordenadas locais do
   * chassi. O raio parte daqui apontando para baixo (eixo -Y do chassi).
   */
  wheels: {
    halfTrackFront: 0.58,
    halfTrackRear: 0.62,
    /** Distância do eixo dianteiro à origem do chassi (Z positivo = frente). */
    frontAxleZ: 0.66,
    /** Distância do eixo traseiro à origem do chassi. */
    rearAxleZ: -0.66,
    /** Altura do ponto de fixação da suspensão. */
    attachY: -0.13,
    radiusFront: 0.24,
    radiusRear: 0.27,
    /** Largura visual da roda (só render). */
    width: 0.2,
  },

  suspension: {
    /** Comprimento da mola em repouso, do ponto de fixação até o centro da roda. */
    restLength: 0.26,
    /** Curso máximo de compressão. Nunca maior que `restLength`. */
    maxTravel: 0.2,
    /**
     * Rigidez da mola, em N/m, POR RODA.
     * Em repouso o kart afunda `peso_da_roda / stiffness` ≈ 5 cm num curso de
     * 20 cm. Mais rígido = menos rolagem e transferência de peso mais imediata,
     * mas o kart fica nervoso em piso irregular.
     */
    stiffness: 14000,
    /**
     * Amortecimento na compressão (N por m/s).
     *
     * >>> LIMITE DE ESTABILIDADE — leia antes de aumentar. <<<
     * O integrador é explícito e o passo é 1/60 s. Um amortecedor forte demais
     * não "amortece mais", ele OSCILA na frequência do passo e o kart começa a
     * bater as rodas no chão em passos alternados (perdendo tração e grip sem
     * nenhum sintoma visual óbvio). As duas condições que precisam valer:
     *
     *   amortecimento * dt / massa_de_canto            < 2   (~41 kg por canto)
     *   amortecimento * Σ(meia-bitola²) * dt / I_rolagem < 2   (Σx² ≈ 1.44, I ≈ 30)
     *
     * Com os valores atuais sobra folga (0.32 e 0.64). O amortecimento crítico
     * vertical é ~1520; ficar entre 30% e 60% dele é o território saudável.
     */
    damperBump: 500,
    /** Amortecimento na extensão. Costuma ser maior que o de compressão. */
    damperRebound: 800,
    /** Teto de força da suspensão por roda (N). Evita explosões numéricas. */
    maxForce: 14000,
  },

  engine: {
    /**
     * Empuxo máximo somado das rodas de tração, em N (a 0 km/h).
     * Dividido pela massa dá a aceleração de largada: 2050/165 ≈ 12.4 m/s².
     */
    maxDriveForce: 2050,
    /**
     * Velocidade (m/s) em que a curva de torque chega a ZERO. NÃO é a
     * velocidade final: esta fica onde o empuxo empata com o arrasto, hoje
     * por volta de 26 m/s (~94 km/h).
     *
     * Subir este número deixa a curva mais "cheia" no meio sem precisar de
     * mais força de largada — é o jeito de ter arrancada sóbria e final alto.
     */
    powerCutoffSpeed: 40,
    /**
     * Expoente da curva de queda: força = max * (1 - (v/topSpeed)^expo).
     * 1 = queda linear. 2 = mantém empuxo forte no meio e despenca no fim
     * (sensação de "puxa até em cima"). >2 = ainda mais topo.
     */
    powerFalloffExponent: 2.0,
    /** Empuxo da marcha à ré, em N. */
    reverseForce: 1300,
    /** Velocidade máxima de ré, em m/s. */
    reverseTopSpeed: 9,
    /** Velocidade (m/s) abaixo da qual segurar o freio engata a ré. */
    reverseEngageSpeed: 0.6,
  },

  brakes: {
    /**
     * Força total de frenagem, em N, somando as quatro rodas.
     * 4200/165 ≈ 25 m/s² — abaixo do limite de grip (≈34), então o freio é
     * limitado pelo PEDAL e não pelo pneu. É o que dá sensação de dosagem;
     * com força acima do grip toda frenagem vira a mesma frenagem.
     */
    force: 4200,
    /** Fração da frenagem que vai para o eixo dianteiro (0..1). */
    frontBias: 0.62,
    /** Resistência ao rolamento: N por (m/s) de velocidade longitudinal, por roda. */
    rollingResistance: 4,
    /** Freio-motor quando não há acelerador nem freio (N por m/s, por roda). */
    engineBraking: 4,
  },

  handbrake: {
    /** Multiplicador aplicado ao grip lateral TRASEIRO enquanto segura o espaço. */
    rearGripMultiplier: 0.5,
    /**
     * Força de frenagem extra só no eixo traseiro (N).
     * Baixa de propósito: o freio de mão aqui serve para SOLTAR a traseira,
     * não para frear. Com força alta ele vira um freio e o drift passa a custar
     * tanta velocidade que fazer a linha limpa fica sempre mais rápido — que é
     * exatamente o que o comparativo do `npm run sim` reprova.
     */
    rearBrakeForce: 600,
    /** Se true, o freio de mão corta o acelerador. Deixe false para poder derrapar acelerando. */
    cutsThrottle: false,
  },

  /**
   * Pneus. O limite de grip é proporcional à carga vertical da roda
   * (`grip * forçaDaSuspensão`), então transferência de peso funciona de graça:
   * frear alivia a traseira, acelerar alivia a dianteira.
   *
   * >>> A DIFERENÇA ENTRE frontGrip E rearGrip É O CARÁTER DO KART. <<<
   *   frontGrip > rearGrip  => traseira solta, sobresterço, diverte e assusta
   *   frontGrip < rearGrip  => estável, subesterço, seguro e mais chato
   */
  tires: {
    frontGrip: 1.5,
    rearGrip: 1.4,
    /** Limite de grip para forças longitudinais (tração/freio), também vezes a carga. */
    longitudinalGrip: 1.9,
    /**
     * Fração da massa do kart usada para calcular a força que "mata" a
     * velocidade lateral de uma roda em um passo. 0.25 = a massa dividida
     * igualmente. Maior = pneu mais mordido antes de atingir o limite.
     */
    tireMassShare: 0.22,

    /**
     * Altura (em metros ACIMA do ponto de contato) onde a força do pneu é
     * aplicada. Truque padrão de jogo de corrida: aplicar a força lateral no
     * chão gera um torque de rolagem enorme e o kart capota.
     *
     * O limite de tombamento é `meia-bitola / (altura_do_CM - este_valor)`.
     * Ele PRECISA ser maior que `frontGrip`/`rearGrip`, senão o kart tomba
     * antes de escorregar. Com 0 aqui, o carro capota; com um valor igual à
     * altura do CM, o chassi não rola nada e fica sem vida.
     */
    forceApplicationHeight: 0.16,
    /**
     * Círculo de atrito: força lateral e longitudinal dividem o mesmo budget.
     * Com true, acelerar forte no meio da curva faz a traseira escorregar.
     */
    useFrictionCircle: true,
    /** Teto absoluto de força lateral por roda, em N. Rede de segurança. */
    maxLateralForce: 9000,
  },

  steering: {
    /** Ângulo máximo das rodas dianteiras, em graus, a baixa velocidade. */
    maxAngleDegrees: 33,
    /**
     * Fração do ângulo máximo disponível quando o kart está em `falloffSpeed`.
     * 0.35 = a 26 m/s você só tem 35% do esterço. Isso é o que impede o kart
     * de rodar sozinho na reta.
     */
    highSpeedFactor: 0.35,
    /** Velocidade (m/s) em que o esterço já caiu para `highSpeedFactor`. */
    falloffSpeed: 26,
    /** Velocidade de giro do volante (unidades de input por segundo). */
    turnRate: 5.0,
    /** Velocidade de retorno do volante ao centro quando solta a tecla. */
    returnRate: 8.0,
  },

  aero: {
    /**
     * Arrasto: força = dragCoefficient * v^2, contra a velocidade.
     * Junto com a curva de torque, é isto que define a velocidade final real.
     */
    dragCoefficient: 1.15,
    /**
     * Downforce: força = downforceCoefficient * v^2, para baixo no eixo do mundo.
     * Aumenta o grip em alta (porque grip é proporcional à carga). Suba se o
     * kart ficar leve demais nas retas.
     */
    downforceCoefficient: 1.6,
  },

  /**
   * Rede de segurança. Sem colisão do chassi (isso é Fase 4), um kart que
   * capota fica de barriga para cima e os raycasts das rodas apontam para o
   * céu: ele nunca mais acha o chão. Estes limites o trazem de volta.
   */
  recovery: {
    /** Altura de mundo abaixo da qual o kart é dado como perdido. */
    fallThroughHeight: -3,
    /** Segundos capotado e parado antes do respawn automático. */
    invertedTimeout: 1.5,
    /** Velocidade (m/s) abaixo da qual conta como "parado". */
    stuckSpeed: 2.0,
  },

  spawn: {
    position: { x: 0, y: 0.9, z: 0 },
    /** Rotação inicial em torno de Y, em graus. */
    headingDegrees: 0,
  },
} as const;
