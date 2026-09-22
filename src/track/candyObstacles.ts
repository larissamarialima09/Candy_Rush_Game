import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CIRCUIT } from '../config/circuit';
import { TRACK } from '../config/track';
import { clamp } from '../core/mathUtils';
import { createStripeTexture, createSwirlTexture } from '../fx/proceduralTextures';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath, PathSample } from './circuitPath';

const Y_AXIS = new Vector3(0, 1, 0);
const _delta = new Vector3();
const _normal = new Vector3();
const _kartPosition = new Vector3();
const _center = new Vector3();
const _velocity = new Vector3();
const _stringDirection = new Vector3();
const _stringMidpoint = new Vector3();
const _stringRotation = new Quaternion();

interface CandyHazard {
  readonly root: Group;
  readonly bob: Group;
  readonly string: Mesh;
  readonly base: Vector3;
  readonly left: Vector3;
  readonly tangent: Vector3;
  readonly pivotY: number;
  readonly ropeLength: number;
  readonly maxAngle: number;
  readonly phase: number;
  readonly speed: number;
  readonly radius: number;
  readonly center: Vector3;
  readonly velocity: Vector3;
  previousX: number;
}

/**
 * Obstaculos de pirulito pendular numa parte da pista.
 *
 * Eles sao leves de proposito: a geometria e simples, a colisao e uma esfera
 * movel, e o resto do jogo continua usando a fisica atual do kart.
 */
export class CandyObstacles {
  readonly root = new Group();
  private readonly hazards: CandyHazard[] = [];
  private time = 0;

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'candy-obstacles';
    this.addPendulumSection(path);
    this.update(0);
    scene.add(this.root);
  }

  update(dt: number): void {
    this.time += dt;
    for (const hazard of this.hazards) this.updateHazard(hazard, dt);
  }

  collide(kart: Kart): void {
    const body = kart.body;
    body.getChassisPosition(_kartPosition);

    for (const hazard of this.hazards) {
      _delta.copy(_kartPosition).sub(hazard.center);
      _delta.y *= 0.35;

      const contactRadius = hazard.radius + TRACK.barriers.kartRadius;
      const distance = _delta.length();
      if (distance >= contactRadius) continue;

      if (distance > 1e-4) _normal.copy(_delta).multiplyScalar(1 / distance);
      else _normal.copy(hazard.left);
      _normal.y = clamp(_normal.y, -0.25, 0.25);
      _normal.normalize();

      const penetration = contactRadius - distance;
      body.position.addScaledVector(_normal, penetration * 0.9);

      const obstacleSpeed = hazard.velocity.dot(_normal);
      const kartSpeed = body.velocity.dot(_normal);
      const closingSpeed = Math.max(0, obstacleSpeed - kartSpeed);
      const push = 4.5 + closingSpeed * 1.1;

      body.velocity.multiplyScalar(0.82);
      body.velocity.addScaledVector(_normal, push);
      body.angularVelocity.y += (_normal.x * body.velocity.z - _normal.z * body.velocity.x) * 0.035;
    }
  }

  private addPendulumSection(path: CircuitPath): void {
    const specs = [
      { at: 0.285, phase: 0, maxAngle: 0.58 },
      { at: 0.305, phase: Math.PI * 0.72, maxAngle: 0.66 },
      { at: 0.325, phase: Math.PI * 1.38, maxAngle: 0.6 },
    ] as const;

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const index = path.indexAtFraction(spec.at);
      const sample = path.samples[index];
      const hazard = this.createPendulum(path, sample, index, spec.phase, spec.maxAngle, i);
      this.hazards.push(hazard);
      this.root.add(hazard.root);
    }
  }

  private createPendulum(
    path: CircuitPath,
    sample: PathSample,
    index: number,
    phase: number,
    maxAngle: number,
    variant: number,
  ): CandyHazard {
    const group = new Group();
    const halfSpan = sample.halfWidth + 3.0;
    const baseHeight = path.surfaceHeight(index, 0);
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

    const postStripe = createStripeTexture('#ff5c96', '#fff2f7');
    postStripe?.repeat.set(1.35, 3.8);
    const caneStripe = createStripeTexture('#ff5c96', '#fff2f7');
    caneStripe?.repeat.set(1.0, 4.6);
    const spiral = createSwirlTexture(['#ff3f92', '#fff0f7']);
    const pink = new MeshStandardMaterial({
      color: 0xff4f9a,
      roughness: 0.12,
      emissive: 0xff4f9a,
      emissiveIntensity: 0.06,
    });
    const softPink = new MeshStandardMaterial({
      color: 0xff9fc4,
      roughness: 0.18,
      emissive: 0xff9fc4,
      emissiveIntensity: 0.03,
    });
    const yellow = new MeshStandardMaterial({ color: 0xffc24d, roughness: 0.18, emissive: 0xffc24d, emissiveIntensity: 0.04 });
    const whiteStripe = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.16,
      map: postStripe,
    });
    const caneMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.16,
      emissive: 0xffffff,
      emissiveIntensity: 0.04,
      map: caneStripe,
    });
    const swirlMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      map: spiral,
      emissive: 0xffd6e8,
      emissiveIntensity: 0.1,
    });

    for (const x of [-halfSpan, halfSpan]) {
      const post = shadowed(new Mesh(new CylinderGeometry(0.42, 0.42, 7.0, 18), whiteStripe));
      post.position.set(x, 3.5, 0);
      group.add(post);

      const foot = shadowed(new Mesh(new RoundedBoxGeometry(1.7, 0.74, 1.7, 1, 0.28), yellow));
      foot.position.set(x, 0.35, 0);
      group.add(foot);

      const topCap = shadowed(new Mesh(new CylinderGeometry(0.6, 0.6, 0.72, 18), softPink));
      topCap.position.set(x, 6.98, 0);
      group.add(topCap);
    }

    const beam = shadowed(new Mesh(new RoundedBoxGeometry(halfSpan * 2 + 1.4, 0.58, 0.82, 1, 0.3), pink));
    beam.position.y = 6.95;
    group.add(beam);

    for (const x of [-halfSpan + 0.35, halfSpan - 0.35, 0]) {
      const collar = shadowed(new Mesh(new CylinderGeometry(0.54, 0.54, 0.8, 18), yellow));
      collar.rotation.z = Math.PI / 2;
      collar.position.set(x, 6.95, 0);
      group.add(collar);
    }

    const string = shadowed(new Mesh(new CylinderGeometry(0.16, 0.16, 1, 14), caneMaterial));
    group.add(string);

    const bob = new Group();
    const discRadius = 1.8 + (variant % 2) * 0.12;
    const discThickness = 0.56;
    const body = shadowed(new Mesh(new CylinderGeometry(discRadius, discRadius, discThickness, 40), softPink));
    body.rotation.x = Math.PI / 2;
    bob.add(body);

    const rim = shadowed(new Mesh(new TorusGeometry(discRadius + 0.02, 0.13, 8, 40), pink));
    rim.position.z = discThickness * 0.51;
    bob.add(rim);

    const rimBack = shadowed(new Mesh(new TorusGeometry(discRadius + 0.02, 0.13, 8, 40), pink));
    rimBack.position.z = -discThickness * 0.51;
    bob.add(rimBack);

    const sideBand = shadowed(new Mesh(new CylinderGeometry(discRadius + 0.03, discRadius + 0.03, 0.22, 40), softPink));
    sideBand.rotation.x = Math.PI / 2;
    bob.add(sideBand);

    const faceA = shadowed(new Mesh(new CylinderGeometry(discRadius * 0.92, discRadius * 0.92, 0.06, 40), swirlMaterial));
    faceA.rotation.x = Math.PI / 2;
    faceA.position.z = discThickness * 0.56;
    bob.add(faceA);

    const faceB = shadowed(new Mesh(new CylinderGeometry(discRadius * 0.92, discRadius * 0.92, 0.06, 40), swirlMaterial));
    faceB.rotation.x = Math.PI / 2;
    faceB.position.z = -discThickness * 0.56;
    bob.add(faceB);

    const sprinkleMaterials = CIRCUIT.colors.pastels.map(
      (color) => new MeshStandardMaterial({ color, roughness: 0.16, emissive: color, emissiveIntensity: 0.08 }),
    );
    for (let i = 0; i < 18; i++) {
      const sprinkle = shadowed(
        new Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.09, 1, 0.04), sprinkleMaterials[(i + variant) % sprinkleMaterials.length]),
      );
      const angle = (i / 18) * Math.PI * 2 + variant * 0.22;
      const ring = i % 3 === 0 ? discRadius * 0.48 : discRadius * 0.78;
      sprinkle.position.set(Math.cos(angle) * ring, Math.sin(angle) * ring, discThickness * 0.68);
      sprinkle.rotation.z = angle + Math.PI / 2;
      bob.add(sprinkle);
    }
    group.add(bob);

    group.position.copy(sample.position);
    group.position.y = baseHeight;
    group.rotation.y = heading;

    const hazard: CandyHazard = {
      root: group,
      bob,
      string,
      base: group.position.clone(),
      left: sample.left.clone(),
      tangent: sample.tangent.clone().setY(0).normalize(),
      pivotY: 6.88,
      ropeLength: 4.8,
      maxAngle,
      phase,
      speed: 1.35 + variant * 0.16,
      radius: discRadius,
      center: new Vector3(),
      velocity: new Vector3(),
      previousX: 0,
    };

    return hazard;
  }

  private updateHazard(hazard: CandyHazard, dt: number): void {
    const angle = Math.sin(this.time * hazard.speed + hazard.phase) * hazard.maxAngle;
    const localX = Math.sin(angle) * hazard.ropeLength;
    const localY = hazard.pivotY - Math.cos(angle) * hazard.ropeLength;
    const pivot = new Vector3(0, hazard.pivotY, 0);
    const bobCenter = new Vector3(localX, localY, 0);

    hazard.bob.position.copy(bobCenter);
    hazard.bob.rotation.z = -angle * 0.45;

    _stringDirection.copy(bobCenter).sub(pivot);
    const stringLength = _stringDirection.length();
    _stringMidpoint.copy(pivot).add(bobCenter).multiplyScalar(0.5);
    _stringRotation.setFromUnitVectors(Y_AXIS, _stringDirection.normalize());
    hazard.string.position.copy(_stringMidpoint);
    hazard.string.quaternion.copy(_stringRotation);
    hazard.string.scale.set(1, stringLength, 1);

    _center
      .copy(hazard.base)
      .addScaledVector(hazard.left, localX)
      .addScaledVector(hazard.tangent, 0);
    _center.y += localY;

    hazard.center.copy(_center);
    if (dt > 0) {
      _velocity.copy(hazard.left).multiplyScalar((localX - hazard.previousX) / dt);
      hazard.velocity.copy(_velocity);
    } else {
      hazard.velocity.set(0, 0, 0);
    }
    hazard.previousX = localX;
  }
}

function shadowed<T extends Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
