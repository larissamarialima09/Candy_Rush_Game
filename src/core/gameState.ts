/**
 * Estados do jogo.
 *
 * Existe porque até agora o jogo começava sozinho no meio da pista, sem nada
 * entre carregar a página e estar correndo. Com estados dá para ter uma tela
 * de entrada, pausa, e mais tarde um fim de corrida — e, o que importa mais
 * para a física, dá para NÃO simular enquanto ninguém está jogando.
 */
export type GameStateName = 'menu' | 'racing' | 'paused';

export class GameState {
  private current: GameStateName = 'menu';
  private readonly listeners: ((state: GameStateName) => void)[] = [];

  /** Segundos desde a última troca de estado. Usado nas animações de tela. */
  elapsed = 0;

  get name(): GameStateName {
    return this.current;
  }

  get isRacing(): boolean {
    return this.current === 'racing';
  }

  /** True quando a física deve avançar. Pausa e menu congelam o mundo. */
  get simulates(): boolean {
    return this.current === 'racing';
  }

  set(next: GameStateName): void {
    if (next === this.current) return;
    this.current = next;
    this.elapsed = 0;
    for (const listener of this.listeners) listener(next);
  }

  togglePause(): void {
    if (this.current === 'racing') this.set('paused');
    else if (this.current === 'paused') this.set('racing');
  }

  onChange(listener: (state: GameStateName) => void): void {
    this.listeners.push(listener);
  }

  update(dt: number): void {
    this.elapsed += dt;
  }
}
