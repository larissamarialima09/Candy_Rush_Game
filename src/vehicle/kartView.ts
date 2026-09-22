import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  type Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KART } from '../config/kart';
import type { Kart } from './kart';

/**
 * Aparência do kart: carrinho de brinquedo rosa brilhante com um coelho
 * dirigindo, no estilo do guia enviado.
 *
 * Nenhuma decisão de jogo mora aqui — é só desenho. Mas duas coisas aqui são
 * lidas do estado do kart a cada quadro, e as duas importam à noite: as
 * lanternas acendem no freio e o escapamento brilha no turbo. Num cenário
 * noturno é isso que dá leitura do que o carrinho está fazendo.
 *
 * As rodas são filhas do chassi e usam a compressão da suspensão calculada
 * pela física, então dá para VER a mola trabalhando.
 */
/** Cores de um kart. Cada piloto tem as suas. */
export interface KartPalette {
  body: number;
  bodyDark: number;
  trim: number;
  seat: number;
  emblem: number;
  tire: number;
  hub: number;
  fur: number;
  earInner: number;
  nose: number;
  eye: number;
  blush: number;
  headlight: number;
  taillight: number;
  exhaust: number;
}

/** O kart do jogador: coelho rosa. */
export const PLAYER_PALETTE: KartPalette = {
  body: 0xff8fbe,
  bodyDark: 0xef6ba4,
  trim: 0xfff4f8,
  seat: 0x8f6bd6,
  emblem: 0xffd76a,
  tire: 0x4a3a44,
  hub: 0xffe3ee,
  fur: 0xfff8fb,
  earInner: 0xffb3cd,
  nose: 0xff8fb1,
  eye: 0x3b2430,
  blush: 0xff9ec4,
  headlight: 0xfff6d8,
  taillight: 0xff4f7d,
  exhaust: 0xffc9dd,
};

/**
 * Monta a paleta de um adversário a partir de duas cores.
 * O resto (pneu, olho, farol) fica igual de propósito: são os detalhes que
 * fazem os karts parecerem da mesma família de brinquedo.
 */
export function rivalPalette(body: number, fur: number, ear: number): KartPalette {
  return {
    ...PLAYER_PALETTE,
    body,
    bodyDark: darken(body, 0.82),
    hub: lighten(body, 0.55),
    fur,
    earInner: ear,
    nose: ear,
    blush: ear,
  };
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lighten(color: number, amount: number): number {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * amount);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * amount);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * amount);
  return (r << 16) | (g << 8) | b;
}

function candy(color: number, roughness = 0.22): MeshStandardMaterial {
  // Roughness baixa e nada de metal: é o "glossy candy" do guia de estilo.
  return new MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function glow(color: number, intensity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0,
  });
}

export class KartView {
  readonly root = new Group();
  private readonly wheelGroups: Object3D[] = [];
  private readonly renderPosition = new Vector3();
  private readonly renderOrientation = new Quaternion();

  /** Peças cuja emissão muda com o estado do kart. */
  private readonly taillights: MeshStandardMaterial;
  private readonly exhaustGlow: MeshStandardMaterial;
  private readonly exhaust: Mesh;

  constructor(
    private readonly kart: Kart,
    scene: Scene,
    private readonly palette: KartPalette = PLAYER_PALETTE,
  ) {
    const size = KART.chassis.size;

    // --- Carroceria ---
    const body = new Mesh(
      new RoundedBoxGeometry(size.x * 0.94, size.y * 0.8, size.z * 0.9, 5, 0.18),
      candy(this.palette.body),
    );
    body.position.y = -0.04;
    this.root.add(body);

    // Faixa creme na barra: divide a silhueta e deixa o carrinho menos bloco.
    const skirt = new Mesh(
      new RoundedBoxGeometry(size.x * 0.98, 0.16, size.z * 0.86, 4, 0.07),
      candy(this.palette.trim),
    );
    skirt.position.y = -size.y * 0.36;
    this.root.add(skirt);

    // Capô inclinado, para o coelho aparecer por cima.
    const hood = new Mesh(
      new RoundedBoxGeometry(size.x * 0.78, 0.15, size.z * 0.36, 4, 0.07),
      candy(this.palette.bodyDark),
    );
    hood.position.set(0, size.y * 0.4, size.z * 0.27);
    hood.rotation.x = -0.1;
    this.root.add(hood);

    // Para-choque: o "sorriso" do carrinho.
    const bumper = new Mesh(
      new CapsuleGeometry(0.11, size.x * 0.72, 3, 10),
      candy(this.palette.trim),
    );
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, -0.14, size.z * 0.48);
    this.root.add(bumper);

    // Emblema de coração: duas esferas e um losango achatado.
    const heart = new Group();
    for (const side of [-1, 1]) {
      const lobe = new Mesh(new SphereGeometry(0.075, 12, 10), glow(this.palette.emblem, 0.55));
      lobe.position.set(side * 0.055, 0.02, 0);
      lobe.scale.set(1, 0.8, 0.6);
      heart.add(lobe);
    }
    const tip = new Mesh(new SphereGeometry(0.075, 12, 10), glow(this.palette.emblem, 0.55));
    tip.scale.set(1.35, 1.1, 0.6);
    tip.position.y = -0.07;
    heart.add(tip);
    heart.position.set(0, size.y * 0.5, size.z * 0.27);
    heart.rotation.x = -0.1;
    this.root.add(heart);

    // --- Faróis e lanternas ---
    for (const side of [-1, 1]) {
      const lamp = new Mesh(new SphereGeometry(0.1, 12, 10), glow(this.palette.headlight, 2.4));
      lamp.scale.set(1, 0.8, 0.7);
      lamp.position.set(side * size.x * 0.3, -0.02, size.z * 0.46);
      this.root.add(lamp);
    }

    this.taillights = glow(this.palette.taillight, 0.5);
    for (const side of [-1, 1]) {
      const lamp = new Mesh(new SphereGeometry(0.075, 10, 8), this.taillights);
      lamp.scale.set(1.4, 0.7, 0.5);
      lamp.position.set(side * size.x * 0.28, 0.04, -size.z * 0.46);
      this.root.add(lamp);
    }

    // --- Aerofólio ---
    const wing = new Mesh(
      new RoundedBoxGeometry(size.x * 0.9, 0.07, 0.26, 3, 0.03),
      candy(this.palette.bodyDark),
    );
    wing.position.set(0, size.y * 0.62, -size.z * 0.46);
    this.root.add(wing);
    for (const side of [-1, 1]) {
      const strut = new Mesh(
        new RoundedBoxGeometry(0.07, 0.24, 0.09, 2, 0.03),
        candy(this.palette.trim),
      );
      strut.position.set(side * size.x * 0.3, size.y * 0.5, -size.z * 0.46);
      this.root.add(strut);
    }

    // --- Escapamento (brilha no turbo) ---
    this.exhaustGlow = glow(this.palette.exhaust, 0.2);
    this.exhaust = new Mesh(new CylinderGeometry(0.09, 0.11, 0.22, 12), this.exhaustGlow);
    this.exhaust.rotation.x = Math.PI / 2;
    this.exhaust.position.set(0, -0.08, -size.z * 0.5);
    this.root.add(this.exhaust);

    // --- Cockpit ---
    const seat = new Mesh(
      new RoundedBoxGeometry(size.x * 0.5, 0.34, 0.18, 3, 0.07),
      candy(this.palette.seat, 0.6),
    );
    seat.position.set(0, size.y * 0.42, -size.z * 0.24);
    this.root.add(seat);

    const wheelRim = new Mesh(new TorusGeometry(0.13, 0.028, 8, 16), candy(this.palette.trim));
    wheelRim.position.set(0, size.y * 0.5, size.z * 0.1);
    wheelRim.rotation.x = -0.5;
    this.root.add(wheelRim);

    this.root.add(this.buildBunny(size.y * 0.36, -size.z * 0.06));

    // --- Rodas ---
    for (const wheel of this.kart.wheels) {
      const group = new Group();

      const tire = new Mesh(
        new CylinderGeometry(wheel.spec.radius, wheel.spec.radius, KART.wheels.width, 20),
        candy(this.palette.tire, 0.75),
      );
      // O cilindro nasce com o eixo em Y; girar em Z coloca o eixo em X.
      tire.rotation.z = Math.PI / 2;
      group.add(tire);

      const hub = new Mesh(
        new CylinderGeometry(
          wheel.spec.radius * 0.52,
          wheel.spec.radius * 0.52,
          KART.wheels.width * 1.08,
          16,
        ),
        candy(this.palette.hub, 0.25),
      );
      hub.rotation.z = Math.PI / 2;
      group.add(hub);

      // Três raios de bala: dão referência de rotação, que um cilindro liso
      // não dá — sem eles é impossível ver a roda girando.
      for (let i = 0; i < 3; i++) {
        const spoke = new Mesh(
          new RoundedBoxGeometry(KART.wheels.width * 1.12, 0.05, wheel.spec.radius * 0.9, 2, 0.02),
          candy(this.palette.body, 0.3),
        );
        spoke.rotation.x = (i / 3) * Math.PI;
        group.add(spoke);
      }

      this.wheelGroups.push(group);
      this.root.add(group);
    }

    this.root.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    scene.add(this.root);
  }

  /** O piloto coelho: cabeça, focinho, olhos, bochechas, orelhas e bracinhos. */
  private buildBunny(y: number, z: number): Group {
    const driver = new Group();
    driver.position.set(0, y, z);

    const fur = candy(this.palette.fur, 0.55);

    const torso = new Mesh(new SphereGeometry(0.21, 16, 12), fur);
    torso.scale.set(1, 0.9, 0.85);
    torso.position.y = 0.1;
    driver.add(torso);

    const head = new Mesh(new SphereGeometry(0.28, 18, 14), fur);
    head.position.y = 0.42;
    driver.add(head);

    const snout = new Mesh(new SphereGeometry(0.15, 14, 10), fur);
    snout.scale.set(1.1, 0.85, 0.9);
    snout.position.set(0, 0.36, 0.19);
    driver.add(snout);

    const nose = new Mesh(new SphereGeometry(0.038, 10, 8), candy(this.palette.nose, 0.35));
    nose.scale.set(1.3, 0.9, 1);
    nose.position.set(0, 0.39, 0.32);
    driver.add(nose);

    for (const side of [-1, 1]) {
      // Olho: esfera escura com um brilhinho branco. O brilho é o que faz o
      // olho parecer vivo em vez de um botão preto.
      const eye = new Mesh(new SphereGeometry(0.052, 12, 10), candy(this.palette.eye, 0.15));
      eye.position.set(side * 0.11, 0.46, 0.24);
      driver.add(eye);

      const spark = new Mesh(new SphereGeometry(0.019, 8, 6), glow(0xffffff, 0.8));
      spark.position.set(side * 0.125, 0.485, 0.275);
      driver.add(spark);

      const blush = new Mesh(new SphereGeometry(0.045, 10, 8), candy(this.palette.blush, 0.5));
      blush.scale.set(1.3, 0.7, 0.5);
      blush.position.set(side * 0.2, 0.38, 0.19);
      driver.add(blush);

      // Orelha: cápsula clara com um miolo rosa por dentro.
      const ear = new Mesh(new CapsuleGeometry(0.072, 0.32, 3, 10), fur);
      ear.position.set(side * 0.12, 0.76, -0.02);
      ear.rotation.z = side * 0.2;
      ear.rotation.x = -0.16;
      driver.add(ear);

      const inner = new Mesh(new CapsuleGeometry(0.04, 0.24, 3, 8), candy(this.palette.earInner, 0.5));
      inner.position.set(side * 0.128, 0.77, 0.03);
      inner.rotation.z = side * 0.2;
      inner.rotation.x = -0.16;
      driver.add(inner);

      // Bracinho esticado até o volante.
      const arm = new Mesh(new CapsuleGeometry(0.05, 0.2, 3, 8), fur);
      arm.position.set(side * 0.17, 0.16, 0.13);
      arm.rotation.x = 1.1;
      arm.rotation.z = side * -0.4;
      driver.add(arm);

      const paw = new Mesh(new SphereGeometry(0.06, 10, 8), fur);
      paw.position.set(side * 0.1, 0.17, 0.25);
      driver.add(paw);
    }

    return driver;
  }

  /** `alpha` vem do acumulador do loop: 0 = último passo, 1 = próximo. */
  update(alpha: number): void {
    this.kart.getRenderTransform(alpha, this.renderPosition, this.renderOrientation);
    this.root.position.copy(this.renderPosition);
    this.root.quaternion.copy(this.renderOrientation);

    const restLength = KART.suspension.restLength;
    for (let i = 0; i < this.wheelGroups.length; i++) {
      const group = this.wheelGroups[i];
      const wheel = this.kart.wheels[i];
      const spec = wheel.spec;

      // Tudo em espaço local do chassi: a mola só move a roda em -Y local.
      group.position.set(
        spec.positionLocal.x,
        spec.positionLocal.y - (restLength - wheel.compression),
        spec.positionLocal.z,
      );

      group.rotation.set(0, 0, 0);
      group.rotateY(wheel.steerAngle);
      group.rotateX(wheel.spinAngle);
    }

    this.updateLights();
  }

  /** Lanternas no freio, escapamento no turbo. */
  private updateLights(): void {
    const telemetry = this.kart.telemetry;
    const braking = telemetry.forwardSpeed > 1 && telemetry.driveForce <= 0;
    this.taillights.emissiveIntensity = braking ? 2.6 : 0.5;

    const boost = this.kart.drift.boostTimeRemaining;
    this.exhaustGlow.emissiveIntensity = 0.2 + boost * 4.5;
    // O escapamento incha um pouco no turbo: exagero de desenho animado, mas
    // é o que faz o boost parecer que sai de algum lugar.
    const bulge = 1 + boost * 0.35;
    this.exhaust.scale.set(bulge, 1, bulge);
  }
}
