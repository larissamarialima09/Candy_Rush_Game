import { Vector3 } from 'three';
import type { SurfaceKind } from '../config/track';

/** Configuração imutável de uma roda. Vem toda de `config/kart.ts`. */
export interface WheelSpec {
  name: string;
  /** Ponto de fixação da suspensão, local ao chassi. */
  positionLocal: Vector3;
  radius: number;
  steered: boolean;
  powered: boolean;
  isFront: boolean;
  /** Fração da força total de freio que cabe a esta roda. */
  brakeShare: number;
}

/**
 * Estado por roda, recalculado a cada passo de física.
 * A roda não tem lógica própria: quem resolve as forças é o `Kart`,
 * porque as forças dependem de estado do veículo inteiro (motor, freio, peso).
 */
export class Wheel {
  grounded = false;
  /** Compressão da mola em metros (0 = totalmente estendida). */
  compression = 0;
  /** Carga vertical no contato, em N. É o que limita o grip. */
  suspensionForce = 0;

  readonly contactPoint = new Vector3();
  readonly contactNormal = new Vector3(0, 1, 0);
  /** Centro da roda no mundo — usado só pelo render. */
  readonly worldCenter = new Vector3();

  /** Ângulo de esterço aplicado nesta roda, em radianos. */
  steerAngle = 0;
  /** Ângulo acumulado de rotação da roda, em radianos (visual). */
  spinAngle = 0;

  /** Velocidades no ponto de contato, em m/s. */
  slipLongitudinal = 0;
  slipLateral = 0;

  /** Forças efetivamente aplicadas neste passo, em N. */
  forceLongitudinal = 0;
  forceLateral = 0;
  /** True quando o pneu está saturado (pedindo mais grip do que tem). */
  saturated = false;

  /** Material sob esta roda. Define grip, teto de velocidade e partícula. */
  surface: SurfaceKind = 'asfalto';

  constructor(readonly spec: WheelSpec) {}
}
