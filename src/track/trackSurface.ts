import { Vector3 } from 'three';
import type { SurfaceKind } from '../config/track';
import type { GroundSampler, RaycastHit } from '../physics/ground';
import type { CircuitPath } from './circuitPath';

const _planePoint = new Vector3();
const _planeNormal = new Vector3();
const _delta = new Vector3();

/**
 * A pista como superfície física.
 *
 * O raycast NÃO é feito contra a malha. A pista é gerada a partir da spline,
 * então a altura e a normal em qualquer ponto do mundo podem ser calculadas
 * diretamente: acha-se a amostra do eixo mais próxima (índice espacial),
 * mede-se o deslocamento lateral e a inclinação da curva dá o resto.
 *
 * Isso é mais rápido e muito mais estável do que testar triângulos: são 240
 * consultas por segundo (quatro rodas a 60 Hz) e nenhuma delas pode falhar por
 * o raio passar exatamente na aresta entre dois triângulos.
 *
 * O raio é intersectado com o PLANO TANGENTE da superfície sob a origem. Para
 * rampas suaves como esta pista o erro é desprezível, e o método não itera.
 */
export class TrackSurface implements GroundSampler {
  constructor(private readonly path: CircuitPath) {}

  raycast(origin: Vector3, direction: Vector3, maxDistance: number, out: RaycastHit): boolean {
    if (direction.y >= -1e-4) return false;

    const index = this.path.nearestSampleIndex(origin.x, origin.z);
    const lateral = this.path.lateralOffset(index, origin.x, origin.z);

    _planePoint.set(origin.x, this.path.surfaceHeight(index, lateral), origin.z);
    // A normal inclinada só vale sobre o asfalto; fora dele o terreno é plano,
    // senão a inclinação da curva viraria uma rampa infinita na grama.
    const paved = Math.abs(lateral) <= this.path.samples[index].halfWidth;
    if (paved) _planeNormal.copy(this.path.samples[index].normal);
    else _planeNormal.set(0, 1, 0);

    const denominator = direction.dot(_planeNormal);
    if (denominator >= -1e-6) return false;

    const distance = _delta.copy(_planePoint).sub(origin).dot(_planeNormal) / denominator;
    if (distance < 0 || distance > maxDistance) return false;

    out.distance = distance;
    out.point.copy(origin).addScaledVector(direction, distance);
    out.normal.copy(_planeNormal);
    // O material é lido no ponto de contato, não na origem do raio: numa roda
    // bem na borda isso é a diferença entre grip de asfalto e de grama.
    const contactIndex = this.path.nearestSampleIndex(out.point.x, out.point.z);
    out.surface = this.path.surfaceAt(
      contactIndex,
      this.path.lateralOffset(contactIndex, out.point.x, out.point.z),
    );
    return true;
  }

  /** Material sob um ponto qualquer do mundo, sem raycast. */
  surfaceAtPoint(x: number, z: number): SurfaceKind {
    const index = this.path.nearestSampleIndex(x, z);
    return this.path.surfaceAt(index, this.path.lateralOffset(index, x, z));
  }

  /** Altura da superfície sob um ponto qualquer do mundo. */
  heightAtPoint(x: number, z: number): number {
    const index = this.path.nearestSampleIndex(x, z);
    return this.path.surfaceHeight(index, this.path.lateralOffset(index, x, z));
  }
}
