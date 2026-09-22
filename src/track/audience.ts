import {
  BufferGeometry,
  CapsuleGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CIRCUIT } from '../config/circuit';
import { createRandom } from '../core/mathUtils';
import { clamp } from '../core/mathUtils';
import type { GrandstandAnchor } from './circuitScenery';

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const _axisY = new Vector3(0, 1, 0);

/** Configuração da plateia. Fica aqui porque é só dela. */
const AUDIENCE = {
  /** Bichinhos por degrau da arquibancada. */
  perRow: 14,
  /** Espaçamento lateral entre eles, em metros. */
  spacing: 2.2,
  /** Altura do bichinho sentado, em metros. */
  scale: 0.62,
  /** Altura do pulinho parado, em metros. */
  idleBob: 0.045,
  /** Altura do pulinho comemorando. */
  cheerBob: 0.34,
  /** Pulos por segundo, parado e comemorando. */
  idleSpeed: 1.1,
  cheerSpeed: 4.2,
  /** Distância (m) do kart em que a plateia começa a animar. */
  exciteRadius: 55,
  /** Velocidade com que a empolgação sobe e desce, por segundo. */
  exciteRate: 2.5,
} as const;

/**
 * A plateia de bichinhos fofos assistindo à corrida.
 *
 * Um bichinho é uma única geometria (corpo, cabeça e duas orelhas fundidas),
 * instanciada por cor. Fundir antes de instanciar importa: sem isso cada
 * bichinho seriam quatro instâncias separadas para posicionar em sincronia, e
 * animar 400 matrizes por quadro em vez de 100.
 *
 * Eles pulam mais alto quando o kart passa perto e mais alto ainda quando ele
 * está rápido. É a reação mais barata que existe e transforma a arquibancada
 * de cenário em público.
 */
export class Audience {
  readonly root = new Group();
  private readonly meshes: InstancedMesh[] = [];
  private readonly homes: Vector3[][] = [];
  private readonly phases: number[][] = [];

  /** 0 = parada, 1 = em festa. Suavizada. */
  private excitement = 0;
  private clock = 0;
  /** Rotação em Y que deixa o bichinho de frente para a pista. */
  private readonly facing: number;

  constructor(anchor: GrandstandAnchor, scene: Scene) {
    this.root.name = 'audience';
    const random = createRandom(CIRCUIT.randomSeed + 77);
    const pastels = CIRCUIT.colors.pastels;
    const grandstand = CIRCUIT.grandstand;

    // Depois da rotação de rumo, X local aponta para a esquerda da pista e Z
    // local para a frente — a mesma convenção que a arquibancada usa.
    // `anchor.side` é o sinal do X LOCAL que sobe os degraus para LONGE do
    // asfalto, já resolvido pela arquibancada; a plateia só o obedece.
    const cosine = Math.cos(anchor.heading);
    const sine = Math.sin(anchor.heading);

    // De frente para a pista, e não para o lado. O bichinho olha para o +Z
    // dele; a pista está no sentido oposto ao que os degraus sobem, que é
    // `-side` no X local. Resolvendo os dois casos, dá este quarto de volta.
    this.facing = anchor.heading - anchor.side * (Math.PI / 2);

    const geometry = buildCritterGeometry();
    const homesByColor: Vector3[][] = pastels.map(() => []);
    const phasesByColor: number[][] = pastels.map(() => []);

    for (let row = 0; row < grandstand.rows; row++) {
      // Sentam em cima do degrau, um pouco atrás da quina.
      const localX = anchor.side * (row * grandstand.rowDepth + grandstand.rowDepth * 0.25);
      const localY = grandstand.rowHeight * (row + 1);

      for (let seat = 0; seat < AUDIENCE.perRow; seat++) {
        const localZ = (seat - (AUDIENCE.perRow - 1) / 2) * AUDIENCE.spacing;

        // Rotação em torno de Y: X local vira (cos, -sin), Z local vira (sin, cos).
        const world = new Vector3(
          anchor.position.x + localX * cosine + localZ * sine,
          anchor.position.y + localY,
          anchor.position.z - localX * sine + localZ * cosine,
        );

        const color = Math.floor(random() * pastels.length);
        homesByColor[color].push(world);
        phasesByColor[color].push(random() * Math.PI * 2);
      }
    }

    for (let i = 0; i < pastels.length; i++) {
      if (homesByColor[i].length === 0) continue;
      const mesh = new InstancedMesh(
        geometry,
        new MeshStandardMaterial({
          color: pastels[i],
          roughness: 0.5,
          metalness: 0,
          // Um tiquinho de emissivo: à noite a arquibancada sumiria de todo.
          emissive: pastels[i],
          emissiveIntensity: 0.12,
        }),
        homesByColor[i].length,
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      this.meshes.push(mesh);
      this.homes.push(homesByColor[i]);
      this.phases.push(phasesByColor[i]);
      this.root.add(mesh);
    }
    scene.add(this.root);
  }

  get count(): number {
    return this.homes.reduce((total, list) => total + list.length, 0);
  }

  /**
   * Animação. Roda no render, com deltaTime variável — é puro visual, não
   * altera nada do jogo.
   */
  update(dt: number, kartPosition: Vector3, kartSpeed: number): void {
    this.clock += dt;

    // Empolgação: perto e rápido. Longe, a arquibancada volta a cochilar.
    let target = 0;
    if (this.homes.length > 0) {
      const reference = this.homes[0][0];
      const distance = Math.hypot(
        reference.x - kartPosition.x,
        reference.z - kartPosition.z,
      );
      const proximity = clamp(1 - distance / AUDIENCE.exciteRadius, 0, 1);
      const pace = clamp(kartSpeed / 18, 0, 1);
      target = proximity * (0.35 + pace * 0.65);
    }
    this.excitement += (target - this.excitement) * Math.min(1, AUDIENCE.exciteRate * dt);

    const amplitude = AUDIENCE.idleBob + (AUDIENCE.cheerBob - AUDIENCE.idleBob) * this.excitement;
    const speed = AUDIENCE.idleSpeed + (AUDIENCE.cheerSpeed - AUDIENCE.idleSpeed) * this.excitement;
    const phaseClock = this.clock * speed * Math.PI * 2;

    for (let m = 0; m < this.meshes.length; m++) {
      const mesh = this.meshes[m];
      const homes = this.homes[m];
      const phases = this.phases[m];

      for (let i = 0; i < homes.length; i++) {
        const bounce = Math.abs(Math.sin(phaseClock * 0.5 + phases[i]));
        _position.copy(homes[i]);
        _position.y += bounce * amplitude;

        // Uma inclinadinha no pulo, EM CIMA da pose de frente para a pista: o
        // corpo rígido subindo e descendo parece um elevador; girando um fio,
        // parece bicho.
        _quaternion.setFromAxisAngle(
          _axisY,
          this.facing + Math.sin(phaseClock * 0.25 + phases[i]) * 0.25,
        );
        _scale.setScalar(AUDIENCE.scale);
        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/**
 * Um bichinho fofo em uma geometria só: corpo, cabeça e duas orelhas.
 * Contagem de segmentos baixa de propósito — a plateia é vista de longe e são
 * uma centena deles.
 */
function buildCritterGeometry(): BufferGeometry {
  const body = new SphereGeometry(0.5, 10, 8);
  body.scale(1, 0.9, 0.9);
  body.translate(0, 0.45, 0);

  const head = new SphereGeometry(0.36, 10, 8);
  head.translate(0, 1.05, 0.04);

  const earLeft = new CapsuleGeometry(0.1, 0.34, 2, 6);
  earLeft.translate(-0.16, 1.5, -0.02);
  const earRight = earLeft.clone();
  earRight.translate(0.32, 0, 0);

  const merged = mergeGeometries([body, head, earLeft, earRight], false);
  body.dispose();
  head.dispose();
  earLeft.dispose();
  earRight.dispose();

  if (!merged) throw new Error('Falha ao fundir a geometria do bichinho');
  merged.computeVertexNormals();
  return merged;
}
