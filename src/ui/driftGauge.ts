import { DRIFT } from '../config/drift';
import { EFFECTS } from '../config/effects';
import { clamp } from '../core/mathUtils';
import type { Kart } from '../vehicle/kart';

/** Cores do medidor por nível conquistado. Mesma família das partículas. */
const LEVEL_COLORS = ['#ffffff', '#ff9ec4', '#a89bf0', '#ffd76a'];
const LEVEL_LABELS = ['', 'TURBO 1', 'TURBO 2', 'TURBO 3'];

/**
 * Velocímetro, medidor de drift e a camada de efeitos de tela — de UM jogador.
 *
 * Assim como o `RaceHud`, procura os elementos dentro de uma raiz e por classe,
 * porque no coop existem dois de tudo. Em especial os efeitos de tela: vinheta
 * e linhas de velocidade precisam ficar confinadas à faixa de quem está
 * acelerando, senão o turbo de um jogador embaça a tela do outro.
 *
 * O medidor mostra a carga ao longo dos TRÊS níveis de uma vez (não o
 * progresso dentro do nível atual): assim dá para ver o próximo limiar
 * chegando e decidir se segura o drift mais um pouco.
 */
export class DriftGauge {
  private readonly meter: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;
  private readonly speedValue: HTMLElement;

  private readonly vignette: HTMLElement;
  private readonly speedLines: HTMLElement;
  private readonly chromatic: HTMLElement;

  // Opacidades suavizadas, para as camadas não piscarem.
  private vignetteOpacity = 0;
  private speedLinesOpacity = 0;
  private chromaticOpacity = 0;

  constructor(root: ParentNode) {
    this.meter = requireChild(root, '.drift-meter');
    this.fill = requireChild(this.meter, '.drift-fill');
    this.label = requireChild(this.meter, '.drift-label');
    this.speedValue = requireChild(requireChild(root, '.speedo'), '.value');

    this.vignette = requireChild(root, '.fx-vignette');
    this.speedLines = requireChild(root, '.fx-speedlines');
    this.chromatic = requireChild(root, '.fx-chromatic');
  }

  update(kart: Kart, dt: number): void {
    const drift = kart.drift;
    const speed = kart.telemetry.speed;

    this.speedValue.textContent = Math.round(speed * 3.6).toString();

    // --- Medidor ---
    const maxCharge = DRIFT.charge.levels[2];
    const chargeRatio = clamp(drift.charge / maxCharge, 0, 1);
    const level = drift.isBoosting ? drift.boostLevel : drift.level;

    this.fill.style.width = `${(drift.isBoosting ? drift.boostTimeRemaining : chargeRatio) * 100}%`;
    this.fill.style.backgroundColor = LEVEL_COLORS[level];
    this.label.textContent = drift.isBoosting
      ? LEVEL_LABELS[drift.boostLevel]
      : level > 0
        ? LEVEL_LABELS[level]
        : 'DRIFT';
    this.label.style.color = LEVEL_COLORS[level];
    this.meter.classList.toggle('active', drift.drifting);
    this.meter.classList.toggle('boosting', drift.isBoosting);

    this.updateScreenEffects(kart, dt);
  }

  private updateScreenEffects(kart: Kart, dt: number): void {
    const config = EFFECTS.overlay;
    const speed = kart.telemetry.speed;
    const boost = kart.drift.boostTimeRemaining;

    const speedT = clamp(
      (speed - config.vignetteStartSpeed) /
        Math.max(1, config.referenceSpeed - config.vignetteStartSpeed),
      0,
      1,
    );

    const targetVignette = config.vignetteMax * speedT;
    // Linhas de velocidade só aparecem no fim da escala e no turbo — se
    // aparecessem sempre, virariam papel de parede e parariam de significar.
    const targetLines = config.speedLinesMax * Math.max(speedT * speedT, boost);
    const targetChromatic = config.chromaticMax * boost;

    const t = Math.min(1, config.responsiveness * dt);
    this.vignetteOpacity += (targetVignette - this.vignetteOpacity) * t;
    this.speedLinesOpacity += (targetLines - this.speedLinesOpacity) * t;
    this.chromaticOpacity += (targetChromatic - this.chromaticOpacity) * t;

    this.vignette.style.opacity = this.vignetteOpacity.toFixed(3);
    this.speedLines.style.opacity = this.speedLinesOpacity.toFixed(3);
    this.chromatic.style.opacity = this.chromaticOpacity.toFixed(3);
  }
}

function requireChild(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado no HUD`);
  return element;
}
