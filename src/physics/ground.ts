import { Vector3 } from 'three';
import type { SurfaceKind } from '../config/track';

export interface RaycastHit {
  /** Distância percorrida ao longo da direção do raio até o contato. */
  distance: number;
  point: Vector3;
  normal: Vector3;
  /** Material da superfície no ponto de contato. */
  surface: SurfaceKind;
}

export function createHit(): RaycastHit {
  return {
    distance: 0,
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
    surface: 'asfalto',
  };
}

/**
 * Superfície contra a qual as rodas fazem raycast.
 *
 * Duas implementações: `FlatGround`, o plano infinito das fases 1 a 3, e
 * `TrackSurface`, a pista de verdade da Fase 4. Manter a interface deixa o
 * banco de provas medir a física em terreno plano e controlado, sem o
 * traçado interferindo na medição.
 */
export interface GroundSampler {
  raycast(origin: Vector3, direction: Vector3, maxDistance: number, out: RaycastHit): boolean;
}

/** Plano infinito horizontal em y = `height`. Sempre asfalto. */
export class FlatGround implements GroundSampler {
  constructor(public height = 0) {}

  raycast(origin: Vector3, direction: Vector3, maxDistance: number, out: RaycastHit): boolean {
    // Só interessa raio descendo contra a face de cima do plano.
    if (direction.y >= -1e-4) return false;

    const distance = (origin.y - this.height) / -direction.y;
    if (distance < 0 || distance > maxDistance) return false;

    out.distance = distance;
    out.point.copy(origin).addScaledVector(direction, distance);
    out.normal.set(0, 1, 0);
    out.surface = 'asfalto';
    return true;
  }
}
