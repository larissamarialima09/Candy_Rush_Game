import {
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Group,
  type Scene,
} from 'three';
import { CIRCUIT } from '../config/circuit';
import { QUALITY } from '../config/quality';
import { createGroundTexture } from '../fx/proceduralTextures';

/**
 * O chão fora do circuito: um plano gigante de "campo de marshmallow" com uma
 * textura de bolinhas que se repete.
 *
 * A textura não é enfeite. Fora do asfalto o cenário é esparso, e sem nenhum
 * padrão no chão não existe referência de velocidade — o kart parece parado.
 * As bolinhas passando resolvem isso sem custo nenhum.
 *
 * A física continua sendo o plano infinito em y = 0. Aqui é só o visual.
 */
const GROUND_VISUAL = {
  planeSize: QUALITY.horizonPlaneSize,
  /** Tamanho, em metros, de um ladrilho da textura. */
  tileMeters: 24,
} as const;

export class FlatGroundView {
  readonly root = new Group();

  constructor(scene: Scene) {
    this.root.name = 'flat-ground';
    const texture = createGroundTexture();
    if (texture) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      const repeat = GROUND_VISUAL.planeSize / GROUND_VISUAL.tileMeters;
      texture.repeat.set(repeat, repeat);
    }

    const plane = new Mesh(
      new PlaneGeometry(GROUND_VISUAL.planeSize, GROUND_VISUAL.planeSize),
      new MeshStandardMaterial({
        color: CIRCUIT.colors.grass,
        roughness: 0.9,
        metalness: 0,
        ...(texture ? { map: texture } : {}),
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    // Um fio abaixo de y=0 para não brigar com o escape no z-buffer.
    plane.position.y = -0.01;
    plane.receiveShadow = true;

    this.root.add(plane);
    scene.add(this.root);
  }
}
