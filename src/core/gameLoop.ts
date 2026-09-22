import { PHYSICS } from '../config/physics';

/**
 * Loop com passo fixo e acumulador.
 *
 * A física SEMPRE avança em blocos de `PHYSICS.fixedTimeStep`, aconteça o que
 * acontecer com a taxa de quadros. O render recebe um `alpha` (0..1) que diz
 * onde estamos entre o penúltimo e o último estado simulado, para interpolar
 * as transformações visuais. Sem isso, 60 Hz de física em uma tela de 144 Hz
 * produz microtravamentos constantes.
 */
export class GameLoop {
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;

  /** Suavizado, só para o HUD. */
  fps = 0;

  constructor(
    private readonly fixedUpdate: (fixedDt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (frameDt > 0) this.fps += ((1 / frameDt) - this.fps) * 0.08;

    // Um frame gigante (aba em segundo plano, breakpoint) não pode virar
    // dezenas de passos de física de uma vez.
    if (frameDt > PHYSICS.maxFrameTime) frameDt = PHYSICS.maxFrameTime;

    this.accumulator += frameDt;

    const dt = PHYSICS.fixedTimeStep;
    let steps = 0;
    while (this.accumulator >= dt && steps < PHYSICS.maxStepsPerFrame) {
      this.fixedUpdate(dt);
      this.accumulator -= dt;
      steps++;
    }

    // Se estourou o orçamento de passos, descarta o resto: melhor rodar em
    // câmera lenta do que acumular dívida e travar de vez.
    if (steps === PHYSICS.maxStepsPerFrame) this.accumulator = 0;

    this.render(this.accumulator / dt, frameDt);
  };
}
