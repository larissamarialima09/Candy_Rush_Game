import type { Kart } from '../vehicle/kart';

/**
 * HUD provisório de tuning. Não é o HUD do jogo — é instrumentação para a
 * Fase 1. Mostra exatamente os números que você vai querer olhar enquanto
 * decide se o kart está gostoso: velocidade, ângulo de deslizamento e o
 * estado de cada pneu (carga e se está saturado, ou seja, escorregando).
 */
export class DebugHud {
  private accumulator = 0;
  private readonly element: HTMLElement;

  constructor(elementId = 'hud') {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`HUD element #${elementId} não encontrado`);
    this.element = element;
  }

  update(kart: Kart, fps: number, frameDt: number): void {
    // 10 Hz basta: escrever innerHTML todo frame é desperdício.
    this.accumulator += frameDt;
    if (this.accumulator < 0.1) return;
    this.accumulator = 0;

    const t = kart.telemetry;
    const kmh = t.speed * 3.6;

    const wheelLines = kart.wheels
      .map((wheel) => {
        const load = wheel.grounded ? `${wheel.suspensionForce.toFixed(0).padStart(5)}N` : '  ---';
        const flag = !wheel.grounded ? 'AR ' : wheel.saturated ? 'SLIP' : '    ';
        const lat = wheel.slipLateral.toFixed(2).padStart(6);
        return `  ${wheel.spec.name}  ${load}  lat ${lat}  ${flag}`;
      })
      .join('\n');

    const drift = kart.drift;
    const driftLine = drift.isBoosting
      ? `TURBO ${drift.boostLevel}  ${(drift.boostForce).toFixed(0)}N  ${(drift.boostTimeRemaining * 100).toFixed(0)}%`
      : drift.drifting
        ? `DRIFT nível ${drift.level}  carga ${drift.charge.toFixed(2)}`
        : '—';

    this.element.innerHTML =
      `<span class="big">${kmh.toFixed(0)}</span> <span class="dim">km/h</span>\n` +
      `escorrega  ${t.slipAngleDeg.toFixed(1).padStart(6)}°\n` +
      `esterço    ${t.steerAngleDeg.toFixed(1).padStart(6)}°\n` +
      `tração     ${t.driveForce.toFixed(0).padStart(6)} N${t.reversing ? '  (ré)' : ''}\n` +
      `no chão    ${t.wheelsOnGround}/4\n` +
      `drift      ${driftLine}\n` +
      `${wheelLines}\n` +
      `<span class="dim">${fps.toFixed(0)} fps · WASD · espaço = freio de mão · R = respawn</span>`;
  }
}
