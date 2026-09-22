/**
 * Constantes globais de simulação.
 *
 * A física roda em passo fixo. Nada aqui deve ser multiplicado por um
 * deltaTime variável: o loop chama a simulação sempre com `fixedTimeStep`.
 */
export const PHYSICS = {
  /** Passo fixo da simulação, em segundos. 1/60 = 60 Hz. */
  fixedTimeStep: 1 / 60,

  /**
   * Máximo de passos de física por frame. Impede a "espiral da morte" quando
   * o navegador engasga: preferimos rodar em câmera lenta a travar.
   */
  maxStepsPerFrame: 5,

  /** Tempo máximo de frame aceito pelo acumulador (segundos). */
  maxFrameTime: 0.25,

  /**
   * Gravidade. O valor real (-9.81) deixa o kart "boiando" e lento para
   * assentar depois de um salto. Jogos de kart exageram. Sobe o módulo para
   * deixar o carro mais colado e a suspensão mais nervosa.
   */
  gravity: -18.0,
} as const;
