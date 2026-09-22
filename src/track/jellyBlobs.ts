import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { JELLY_BLOBS, type JellySpot } from '../config/trackFeatures';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath } from './circuitPath';

const _kartPosition = new Vector3();
const _delta = new Vector3();
const _normal = new Vector3();

interface Jelly {
  readonly group: Group;
  /** Centro no mundo, para a colisão. */
  readonly center: Vector3;
  readonly radius: number;
  readonly phase: number;
  /** Sobe para 1 quando alguém passa por ela, e decai sozinho. */
  shake: number;
}

/**
 * Geleias fofas na última curva: pequenas, coloridas e com cara de pudim.
 *
 * Elas não empurram nem param ninguém — só AMORTECEM. Atravessar uma custa
 * velocidade, e é só isso. Escolhi assim de propósito: um obstáculo que
 * arremessa o kart perto da linha de chegada decide a corrida por acidente,
 * enquanto um que cobra tempo deixa a decisão com quem pilota.
 *
 * Vale para todo mundo. O `main` chama `collide` para os pilotos humanos E para
 * os rivais, no passo fixo, exatamente como já fazia com os obstáculos de
 * pirulito — ninguém aqui tem passe livre.
 */
export class JellyBlobs {
  readonly root = new Group();
  private readonly jellies: Jelly[] = [];
  private time = 0;

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'jelly-blobs';

    for (let i = 0; i < JELLY_BLOBS.spots.length; i++) {
      this.jellies.push(this.createJelly(path, JELLY_BLOBS.spots[i], i));
    }
    for (const jelly of this.jellies) this.root.add(jelly.group);

    scene.add(this.root);
  }

  /** Só balanço: é puro visual, então pode andar com o dt do quadro. */
  update(dt: number): void {
    this.time += dt;
    const wobble = JELLY_BLOBS.wobble;

    for (const jelly of this.jellies) {
      jelly.shake = Math.max(0, jelly.shake - dt / wobble.hitDecay);

      const amplitude = wobble.amplitude + wobble.hitAmplitude * jelly.shake;
      const swing = Math.sin(this.time * wobble.speed + jelly.phase) * amplitude;

      // Esmaga e estica mantendo o volume: achatar sem alargar faz a geleia
      // parecer que encolhe, e não que treme.
      jelly.group.scale.set(1 - swing * 0.5, 1 + swing, 1 - swing * 0.5);
    }
  }

  /** Amortece quem estiver dentro de uma geleia. Vale para humano e rival. */
  collide(kart: Kart, dt: number): void {
    if (dt <= 0) return;
    const body = kart.body;
    body.getChassisPosition(_kartPosition);

    for (const jelly of this.jellies) {
      _delta.copy(_kartPosition).sub(jelly.center);
      // A altura pesa pouco: o kart é baixo e a geleia também, e exigir
      // sobreposição vertical exata faria o contato falhar em pista inclinada.
      _delta.y *= 0.4;

      const contact = jelly.radius + 0.75;
      const distance = _delta.length();
      if (distance >= contact) continue;

      jelly.shake = 1;

      // Perda de velocidade POR SEGUNDO, convertida para este passo. Aplicar a
      // fração direto por passo pararia o kart seco a 60 Hz — é a mesma
      // armadilha que a barreira documenta em `TRACK.barriers.slidePerSecond`.
      body.velocity.multiplyScalar(Math.pow(JELLY_BLOBS.slowPerSecond, dt));

      // Empurrãozinho para fora, para ninguém ficar preso dentro perdendo
      // velocidade sem conseguir sair.
      if (distance > 1e-4) _normal.copy(_delta).multiplyScalar(1 / distance);
      else _normal.set(1, 0, 0);
      _normal.y = 0;
      _normal.normalize();
      body.velocity.addScaledVector(_normal, JELLY_BLOBS.push);
    }
  }

  private createJelly(path: CircuitPath, spot: JellySpot, seed: number): Jelly {
    const index = path.indexAtFraction(spot.at);
    const sample = path.samples[index];
    const config = JELLY_BLOBS;
    const face = config.face;
    const color = config.colors[spot.color % config.colors.length];

    const group = new Group();
    group.name = 'jelly';

    const body = new MeshStandardMaterial({
      color,
      // Bem lisa e um tico emissiva: geleia é translúcida, e sem esse brilho
      // ela lê como pedra pintada.
      roughness: 0.1,
      metalness: 0,
      emissive: color,
      emissiveIntensity: 0.18,
    });
    const ink = new MeshStandardMaterial({ color: face.ink, roughness: 0.35, metalness: 0 });
    const cheek = new MeshStandardMaterial({
      color: face.cheek,
      roughness: 0.3,
      metalness: 0,
      emissive: face.cheek,
      emissiveIntensity: 0.2,
    });

    // Corpo: uma cúpula achatada, com a base assentada no chão.
    const dome = new Mesh(new SphereGeometry(spot.radius, 20, 14), body);
    dome.scale.set(1, 0.82, 1);
    dome.position.y = spot.radius * 0.72;
    dome.castShadow = true;
    dome.receiveShadow = true;
    group.add(dome);

    const skirt = new Mesh(new SphereGeometry(spot.radius * 1.05, 18, 8), body);
    skirt.scale.set(1, 0.3, 1);
    skirt.position.y = spot.radius * 0.26;
    skirt.castShadow = true;
    group.add(skirt);

    // O rosto olha para -Z, que é de onde os karts chegam.
    const faceZ = -spot.radius * 0.82;
    const scale = spot.radius;

    for (const side of [1, -1]) {
      const eye = new Mesh(new SphereGeometry(face.eyeRadius * scale, 10, 8), ink);
      eye.scale.z = 0.45;
      eye.position.set(side * face.eyeSpread * scale, spot.radius * 0.78, faceZ);
      group.add(eye);

      const blush = new Mesh(new SphereGeometry(face.eyeRadius * scale * 0.8, 10, 8), cheek);
      blush.scale.z = 0.35;
      blush.position.set(side * face.eyeSpread * scale * 1.75, spot.radius * 0.6, faceZ * 0.92);
      group.add(blush);
    }

    // Sorriso: meio toro com a abertura para cima. Toro já vive no plano XY,
    // então ele encara -Z sem precisar girar fora do próprio eixo.
    const mouth = new Mesh(
      new TorusGeometry(face.mouthRadius * scale, face.mouthRadius * scale * 0.3, 6, 14, Math.PI),
      ink,
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, spot.radius * 0.56, faceZ);
    group.add(mouth);

    const center = sample.position.clone().addScaledVector(sample.left, spot.lateral);
    center.y = path.surfaceHeight(index, spot.lateral);
    group.position.copy(center);
    group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);

    return {
      group,
      // O centro de colisão fica na barriga da geleia, não no pé dela.
      center: center.clone().setY(center.y + spot.radius * 0.6),
      radius: spot.radius,
      phase: seed * 1.7,
      shake: 0,
    };
  }
}
