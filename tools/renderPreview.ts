/**
 * Rasterizador por software: gera imagens do jogo SEM navegador e SEM WebGL.
 * `npm run preview`
 *
 * Serve para inspecionar a cena sem depender do navegador: malha invisível por
 * enrolamento invertido, objeto no lugar errado, pista flutuando sobre o
 * terreno. Um DOM simulado não resolve isso — ele finge ter um canvas, mas não
 * tem placa de vídeo atrás.
 *
 * A cena é montada em Node exatamente como no jogo, e os triângulos são
 * projetados e pintados na mão, com z-buffer e sombreamento plano.
 *
 * MOSTRA: posição, escala, orientação, enrolamento e cor de material.
 * NÃO MOSTRA: texturas, sombras, transparência, emissão e névoa — fora do
 * navegador esses recursos não existem. Geometria certa aqui não garante tela
 * bonita no jogo, mas o que estiver grosseiramente errado aparece.
 */
import {
  Camera,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import { writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';
import { CENTERLINE, CIRCUIT } from '../src/config/circuit';
import { DONUT_TUNNEL } from '../src/config/donutTunnel';
import { JELLY_BLOBS, SPEED_RAMP } from '../src/config/trackFeatures';
import { LIGHTING } from '../src/config/lighting';
import { degToRad } from '../src/core/mathUtils';
import { Audience } from '../src/track/audience';
import { candyFactoryPlacement } from '../src/track/candyFactory';
import { CandyProps } from '../src/track/candyProps';
import { CandySigns } from '../src/track/candySigns';
import { JellyBlobs } from '../src/track/jellyBlobs';
import { SpeedRamp } from '../src/track/speedRamp';
import { CircuitPath } from '../src/track/circuitPath';
import { CircuitScenery } from '../src/track/circuitScenery';
import { CircuitSurface } from '../src/track/circuitSurface';
import { Coins } from '../src/track/coins';
import { LapTracker } from '../src/track/lapTracker';
import { Terrain } from '../src/track/terrain';
import { TrackSurface } from '../src/track/trackSurface';
import { Kart } from '../src/vehicle/kart';
import { KartView } from '../src/vehicle/kartView';

const WIDTH = 900;
const HEIGHT = 506;

// --- Monta a cena igual ao jogo ---
const scene = new Scene();
const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
const surface = new TrackSurface(path);

new Terrain(path, scene);
new CircuitSurface(path, scene);
const scenery = new CircuitScenery(path, scene);
new CandyProps(path, scene);
const audience = new Audience(scenery.grandstandAnchor, scene);
const coins = new Coins(path, scene);
// A rampa, as geleias e as placas vivem no `main`, não no cenário. Precisam ser
// construídas aqui também, senão as fotos saem com a pista vazia.
new SpeedRamp(path, scene);
new CandySigns(path, scene);
const jellyBlobs = new JellyBlobs(path, scene);
jellyBlobs.update(0.35);

const kart = new Kart();
const kartView = new KartView(kart, scene);
kartView.root.name = 'kart';
new LapTracker(path).placeAtStart(kart);

// Roda alguns segundos para o kart assentar na suspensão e ganhar velocidade:
// uma foto do kart caindo do céu não diz nada sobre o jogo.
const dt = 1 / 60;
const focus = new Vector3();
// Pilotagem LIMPA de propósito. Com freio de mão o kart aparece capotado e meio
// enterrado no terreno, o que parece bug de malha e é só a pose. Um preview
// serve para julgar a cena, então o kart tem que estar na pista, apoiado nas
// quatro rodas e apontado para a frente.
const _aim = new Vector3();
const _forwardProbe = new Vector3();

/**
 * Que sentido de guinada o comando `steer = +1` produz.
 *
 * MEDIDO, não deduzido. A convenção depende de como a direção da roda, o
 * produto vetorial e o eixo do mundo se combinam, e com o sinal trocado o
 * piloto briga consigo mesmo e o kart não sai do lugar — é mais barato rodar
 * dois segundos de simulação e olhar.
 */
const STEER_SIGN = (() => {
  const probe = new Kart();
  let yaw = 0;
  for (let i = 0; i < 120; i++) {
    probe.update(
      dt,
      { throttle: 1, brake: 0, steer: 1, handbrake: false, respawnPressed: false, pausePressed: false },
      surface,
    );
    yaw += probe.body.angularVelocity.y * dt;
  }
  return Math.sign(yaw) || 1;
})();

/** Perseguição pura: mantém o kart no eixo da pista durante a "sessão de fotos". */
function steerAlongTrack(): number {
  const index = path.nearestSampleIndex(kart.body.position.x, kart.body.position.z);
  path.pointAt((index + 12) % path.count, 0, 0, _aim);
  _forwardProbe.set(0, 0, 1).applyQuaternion(kart.body.orientation).setY(0).normalize();
  const dx = _aim.x - kart.body.position.x;
  const dz = _aim.z - kart.body.position.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 0;
  const cross = _forwardProbe.z * (dx / length) - _forwardProbe.x * (dz / length);
  const dot = _forwardProbe.x * (dx / length) + _forwardProbe.z * (dz / length);
  return Math.max(-1, Math.min(1, STEER_SIGN * Math.atan2(cross, dot) * 2));
}

for (let i = 0; i < 190; i++) {
  kart.update(dt, {
    throttle: 1,
    brake: 0,
    steer: steerAlongTrack(),
    handbrake: false,
    respawnPressed: false,
    pausePressed: false,
  }, surface);
  kart.body.getChassisPosition(focus);
  coins.update(dt, [kart]);
  audience.update(dt, focus, kart.telemetry.speed);
}
kartView.update(1);
kart.body.getChassisPosition(focus);

console.log(
  `kart a ${(kart.telemetry.speed * 3.6).toFixed(0)} km/h, deslizando ${kart.telemetry.slipAngleDeg.toFixed(0)}°, ` +
    `em (${focus.x.toFixed(1)}, ${focus.y.toFixed(1)}, ${focus.z.toFixed(1)})`,
);

// --- Luz: a mesma direção que o jogo usa ---
const keyElevation = degToRad(LIGHTING.sun.elevationDegrees);
const lightDirection = new Vector3(
  Math.sin(LIGHTING.sun.bearingRadians) * Math.cos(keyElevation),
  Math.sin(keyElevation),
  Math.cos(LIGHTING.sun.bearingRadians) * Math.cos(keyElevation),
).normalize();

// --- Câmeras ---
interface Shot {
  name: string;
  file: string;
  camera: Camera;
}

function chaseShot(): Camera {
  const camera = new PerspectiveCamera(72, WIDTH / HEIGHT, 0.1, 900);
  const forward = new Vector3(0, 0, 1).applyQuaternion(kart.body.orientation);
  forward.y = 0;
  forward.normalize();
  camera.position.copy(focus).addScaledVector(forward, -6.2);
  camera.position.y += 2.4;
  camera.lookAt(focus.x + forward.x * 5, focus.y + 0.95, focus.z + forward.z * 5);
  camera.updateMatrixWorld(true);
  return camera;
}

function closeUpShot(): Camera {
  const camera = new PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 900);
  camera.position.set(focus.x + 3.4, focus.y + 1.5, focus.z + 2.6);
  camera.lookAt(focus.x, focus.y + 0.45, focus.z);
  camera.updateMatrixWorld(true);
  return camera;
}

function aerialShot(): Camera {
  const camera = new PerspectiveCamera(55, WIDTH / HEIGHT, 1, 2000);
  camera.position.set(-40, 210, -40);
  camera.lookAt(-40, 0, 45);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * A máquina de doces vista de quem passa na pista, com as montanhas de
 * algodão-doce atrás dela.
 *
 * A câmera é DERIVADA da colocação da máquina, não escrita à mão: o +Z local
 * dela aponta para a pista, então é de lá que a foto sai. Se a máquina mudar de
 * lugar em `config/candyFactory.ts`, a foto acompanha sozinha.
 */
function candyFactoryShot(): Camera {
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.5, 1200);
  const placement = candyFactoryPlacement(path);
  const towardTrack = new Vector3(Math.sin(placement.angle), 0, Math.cos(placement.angle));
  const ground = path.terrainHeight(placement.base.x, placement.base.z);

  camera.position.copy(placement.base).addScaledVector(towardTrack, 34);
  camera.position.y = ground + 16;
  camera.lookAt(placement.base.x, ground + 8, placement.base.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * O portal "CANDY RUSH" visto do grid, que é o enquadramento da referência.
 *
 * A câmera recua pelo sentido de corrida a partir da linha de largada, em vez
 * de usar coordenadas escritas à mão: assim ela continua certa mesmo que o
 * traçado mude de lugar.
 */
function startGateShot(): Camera {
  const camera = new PerspectiveCamera(58, WIDTH / HEIGHT, 0.5, 900);
  const sample = path.samples[0];
  const forward = new Vector3(sample.tangent.x, 0, sample.tangent.z).normalize();

  camera.position.copy(sample.position).addScaledVector(forward, -19);
  camera.position.y = sample.position.y + 4.0;
  camera.lookAt(sample.position.x, sample.position.y + 8.5, sample.position.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Só o alto do portal, enquadrado de perto.
 *
 * É uma foto de CONFERÊNCIA, não de divulgação: de longe não dá para dizer se
 * as estrelas e as bandeiras ficaram visíveis ou enterradas dentro do tubo do
 * arco, e essa é justamente a pergunta que o rasterizador consegue responder.
 */
function startGateTopShot(): Camera {
  const camera = new PerspectiveCamera(45, WIDTH / HEIGHT, 0.5, 900);
  const sample = path.samples[0];
  const forward = new Vector3(sample.tangent.x, 0, sample.tangent.z).normalize();

  camera.position.copy(sample.position).addScaledVector(forward, -17);
  camera.position.y = sample.position.y + 8;
  camera.lookAt(sample.position.x, sample.position.y + 12.5, sample.position.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/** O túnel de donut, de frente, como quem chega nele pela pista. */
function donutShot(): Camera {
  const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 0.5, 900);
  const sample = path.samples[path.indexAtFraction(DONUT_TUNNEL.at)];
  const forward = new Vector3(sample.tangent.x, 0, sample.tangent.z).normalize();

  camera.position.copy(sample.position).addScaledVector(forward, -34);
  camera.position.y = sample.position.y + 5;
  camera.lookAt(sample.position.x, sample.position.y + 9, sample.position.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Uma câmera na pista, olhando para a frente a partir de um ponto da volta.
 * Serve para conferir qualquer coisa plantada NO asfalto — rampa, geleias — do
 * ponto de vista de quem chega nela dirigindo.
 */
function trackViewShot(at: number, back: number, height: number, aim: number): Camera {
  const camera = new PerspectiveCamera(58, WIDTH / HEIGHT, 0.4, 900);
  const sample = path.samples[path.indexAtFraction(at)];
  const forward = new Vector3(sample.tangent.x, 0, sample.tangent.z).normalize();

  camera.position.copy(sample.position).addScaledVector(forward, -back);
  camera.position.y = sample.position.y + height;
  camera.lookAt(
    sample.position.x + forward.x * 4,
    sample.position.y + aim,
    sample.position.z + forward.z * 4,
  );
  camera.updateMatrixWorld(true);
  return camera;
}

const shots: Shot[] = [
  { name: 'tunel de donut', file: 'preview-donut.png', camera: donutShot() },
  {
    name: 'rampa de aceleracao',
    file: 'preview-rampa.png',
    camera: trackViewShot(SPEED_RAMP.at, 16, 3.2, 1.2),
  },
  {
    name: 'geleias na ultima curva',
    file: 'preview-geleias.png',
    camera: trackViewShot(JELLY_BLOBS.spots[0].at, 13, 2.6, 0.9),
  },
  { name: 'atras do kart (o que o jogador vê)', file: 'preview-jogo.png', camera: chaseShot() },
  { name: 'kart de perto', file: 'preview-kart.png', camera: closeUpShot() },
  { name: 'circuito de cima', file: 'preview-circuito.png', camera: aerialShot() },
  {
    name: 'máquina de doces e as montanhas',
    file: 'preview-maquina.png',
    camera: candyFactoryShot(),
  },
  { name: 'portal da largada', file: 'preview-largada.png', camera: startGateShot() },
  { name: 'topo do portal (conferência)', file: 'preview-portal-topo.png', camera: startGateTopShot() },
];

// --- Coleta de triângulos ---
interface Triangle {
  readonly a: Vector3;
  readonly b: Vector3;
  readonly c: Vector3;
  readonly color: Color;
  /** De qual objeto veio, para o diagnóstico saber quem sumiu. */
  readonly source: string;
}

const triangles: Triangle[] = [];
const _matrix = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

scene.updateMatrixWorld(true);

/**
 * O céu (esfera de 900 m) e o plano de horizonte (2,5 km) são fundo: dois
 * triângulos gigantes cada um, que num rasterizador simples como este cobrem
 * a cena inteira. No navegador eles ficam para trás porque têm textura e
 * ordem de render próprias; aqui é mais honesto simplesmente não desenhá-los.
 */
function isBackground(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.name === 'sky' || current.name === 'flat-ground') return true;
    current = current.parent;
  }
  return false;
}

/** Nome do ancestral mais próximo que tenha nome, para agrupar no relatório. */
function sourceName(object: Object3D): string {
  let current: Object3D | null = object;
  while (current) {
    if (current.name) return current.name;
    current = current.parent;
  }
  return '(sem nome)';
}

/** `ONLY=kart npm run preview` desenha só aquele objeto. Para isolar sumiços. */
declare const process: { env: Record<string, string | undefined> };
const ONLY = process.env.ONLY;

scene.traverse((object) => {
  const mesh = object as Mesh;
  if (!mesh.isMesh) return;
  if (isBackground(mesh)) return;
  if (ONLY && sourceName(mesh) !== ONLY) return;

  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position');
  if (!position) return;

  const material = mesh.material as MeshStandardMaterial;
  const baseColor = new Color(0xffffff);
  if (material && material.color) baseColor.copy(material.color);
  // A emissão entra como piso de luz: sem isso, faróis e moedas ficam pretos.
  const emissive = material?.emissive
    ? material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 1)
    : new Color(0, 0, 0);

  const vertexColors = material?.vertexColors ? geometry.getAttribute('color') : null;
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;

  const instanced = mesh as InstancedMesh;
  const instanceCount = instanced.isInstancedMesh ? instanced.count : 1;

  for (let instance = 0; instance < instanceCount; instance++) {
    if (instanced.isInstancedMesh) {
      instanced.getMatrixAt(instance, _matrix);
      _matrix.premultiply(mesh.matrixWorld);
    } else {
      _matrix.copy(mesh.matrixWorld);
    }

    for (let t = 0; t < triangleCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      _a.fromBufferAttribute(position, i0).applyMatrix4(_matrix);
      _b.fromBufferAttribute(position, i1).applyMatrix4(_matrix);
      _c.fromBufferAttribute(position, i2).applyMatrix4(_matrix);

      const color = baseColor.clone();
      if (vertexColors) {
        color.setRGB(
          vertexColors.getX(i0),
          vertexColors.getY(i0),
          vertexColors.getZ(i0),
        );
      }
      color.add(emissive);

      triangles.push({
        a: _a.clone(),
        b: _b.clone(),
        c: _c.clone(),
        color,
        source: sourceName(mesh),
      });
    }
  }
});

console.log(`${triangles.length} triângulos coletados da cena`);

// --- Rasterização ---
/**
 * Tonemap ACES aproximado mais gama, igual ao que o jogo faz no navegador.
 *
 * Sem ele o preview mente: as intensidades de luz do three são altas de
 * propósito porque o tonemap comprime a faixa depois. Elevar ao quadrado e
 * cortar em 1 deixa o chão inteiro branco estourado, o que parece um bug de
 * iluminação que não existe.
 */
function encode(value: number): number {
  const x = Math.max(0, value * LIGHTING.exposure);
  const mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  const clamped = Math.min(1, Math.max(0, mapped));
  const gamma =
    clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(gamma * 255);
}

const HORIZON = new Color(0x1a1430);
const ambient = new Color(LIGHTING.hemisphere.skyColor).multiplyScalar(
  LIGHTING.hemisphere.intensity * 0.5,
);
const keyColor = new Color(LIGHTING.sun.color).multiplyScalar(LIGHTING.sun.intensity * 0.5);

function render(camera: Camera, file: string): void {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);

  // Fundo: um gradiente simples do horizonte, para o céu não sair preto.
  for (let y = 0; y < HEIGHT; y++) {
    const t = y / HEIGHT;
    const r = Math.round((0.10 + t * 0.22) * 255);
    const g = Math.round((0.08 + t * 0.14) * 255);
    const b = Math.round((0.19 + t * 0.16) * 255);
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
  }
  void HORIZON;

  const projection = camera.projectionMatrix;
  const view = camera.matrixWorldInverse;

  const viewA = new Vector3();
  const viewB = new Vector3();
  const viewC = new Vector3();
  const edge1 = new Vector3();
  const edge2 = new Vector3();
  const normal = new Vector3();
  const shade = new Color();

  /** Plano próximo, em metros. Nada mais perto que isto pode ser projetado. */
  const NEAR = 0.25;

  /**
   * Recorta um triângulo contra o plano próximo, em espaço de câmera.
   *
   * REJEITAR o triângulo inteiro quando um vértice está perto demais não
   * serve: as células do terreno têm 6 metros, e uma única célula descartada
   * na frente da câmera abre um buraco enorme no chão, com o kart pairando
   * sobre o vazio. Recortando, sobra a parte visível do triângulo.
   *
   * Devolve um polígono de 0, 3 ou 4 vértices (Sutherland-Hodgman num plano só).
   */
  function clipNear(polygon: Vector3[]): Vector3[] {
    const output: Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      // "Dentro" = à frente do plano próximo. Em espaço de câmera, olhamos
      // para -Z, então profundidade = -z.
      const currentIn = -current.z >= NEAR;
      const nextIn = -next.z >= NEAR;

      if (currentIn) output.push(current.clone());
      if (currentIn !== nextIn) {
        const t = (-current.z - NEAR) / (-current.z - -next.z);
        output.push(current.clone().lerp(next, t));
      }
    }
    return output;
  }

  const projected = new Vector3();

  /** Rasteriza um triângulo já em espaço de câmera. */
  function raster(
    va: Vector3,
    vb: Vector3,
    vc: Vector3,
    red: number,
    green: number,
    blue: number,
  ): boolean {
    // Profundidade em METROS. O `z` normalizado da projeção não serve para
    // z-buffer aqui: com plano próximo em 0,25 m e distante em 900 m, tudo
    // além de uns 20 m cai na mesma casa decimal e o teste de profundidade
    // vira sorteio, enchendo a imagem de lajes gigantes.
    const da = -va.z;
    let db2 = -vb.z;
    let dc2 = -vc.z;

    projected.copy(va).applyMatrix4(projection);
    const ax = (projected.x * 0.5 + 0.5) * WIDTH;
    const ay = (1 - (projected.y * 0.5 + 0.5)) * HEIGHT;
    projected.copy(vb).applyMatrix4(projection);
    let bx = (projected.x * 0.5 + 0.5) * WIDTH;
    let by = (1 - (projected.y * 0.5 + 0.5)) * HEIGHT;
    projected.copy(vc).applyMatrix4(projection);
    let cx = (projected.x * 0.5 + 0.5) * WIDTH;
    let cy = (1 - (projected.y * 0.5 + 0.5)) * HEIGHT;

    let area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

    // O eixo Y da tela aponta para BAIXO, ao contrário do espaço normalizado.
    // Essa inversão troca o sinal da área, então um triângulo virado para a
    // câmera dá área NEGATIVA aqui. Descartar as positivas é o que mantém a
    // imagem sendo um teste de enrolamento: uma fita enrolada ao contrário
    // some daqui do mesmo jeito que sumiria no navegador.
    if (area >= 0) return false;

    // Reordena para o preenchimento poder assumir área positiva.
    area = -area;
    let swap = bx;
    bx = cx;
    cx = swap;
    swap = by;
    by = cy;
    cy = swap;
    swap = db2;
    db2 = dc2;
    dc2 = swap;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) return false;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
        const w1 = (cx - bx) * (py - by) - (px - bx) * (cy - by);
        const w2 = (ax - cx) * (py - cy) - (px - cx) * (ay - cy);
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        // Perspectiva correta: o que varia linearmente na tela é o INVERSO da
        // profundidade, não a profundidade. Interpolar a distância direto
        // entorta o z-buffer em triângulos muito inclinados, como o chão.
        const alpha = w1 / area;
        const beta = w2 / area;
        const gamma = w0 / area;
        const z = 1 / (alpha / da + beta / db2 + gamma / dc2);

        const slot = y * WIDTH + x;
        if (z >= depth[slot]) continue;
        depth[slot] = z;

        const offset = slot * 3;
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
      }
    }
    return true;
  }

  let drawn = 0;
  /** Quantos triângulos cada objeto conseguiu pintar. */
  const bySource = new Map<string, number>();
  const seen = new Map<string, number>();

  for (const triangle of triangles) {
    seen.set(triangle.source, (seen.get(triangle.source) ?? 0) + 1);
    // Sombreamento plano: uma normal por triângulo, luz difusa mais ambiente.
    // Calculado no espaço do MUNDO, antes de qualquer recorte — a iluminação
    // não muda quando o triângulo é fatiado pelo plano da câmera.
    edge1.copy(triangle.b).sub(triangle.a);
    edge2.copy(triangle.c).sub(triangle.a);
    normal.crossVectors(edge1, edge2).normalize();
    const lambert = Math.max(0, normal.dot(lightDirection));

    shade.copy(triangle.color).multiply(ambient);
    shade.r += triangle.color.r * keyColor.r * lambert;
    shade.g += triangle.color.g * keyColor.g * lambert;
    shade.b += triangle.color.b * keyColor.b * lambert;

    const red = encode(shade.r);
    const green = encode(shade.g);
    const blue = encode(shade.b);

    viewA.copy(triangle.a).applyMatrix4(view);
    viewB.copy(triangle.b).applyMatrix4(view);
    viewC.copy(triangle.c).applyMatrix4(view);

    const hit = (ok: boolean) => {
      if (!ok) return;
      drawn++;
      bySource.set(triangle.source, (bySource.get(triangle.source) ?? 0) + 1);
    };

    // Caminho rápido: inteiramente à frente do plano próximo, sem recorte.
    if (-viewA.z >= NEAR && -viewB.z >= NEAR && -viewC.z >= NEAR) {
      hit(raster(viewA, viewB, viewC, red, green, blue));
      continue;
    }

    const polygon = clipNear([viewA, viewB, viewC]);
    if (polygon.length < 3) continue;
    // Leque a partir do primeiro vértice: o recorte devolve no máximo quatro.
    for (let i = 2; i < polygon.length; i++) {
      hit(raster(polygon[0], polygon[i - 1], polygon[i], red, green, blue));
    }
  }

  const relatorio = [...seen.entries()]
    .map(([nome, total]) => `${nome} ${bySource.get(nome) ?? 0}/${total}`)
    .join('  ');
  console.log(`    pintados/coletados por objeto: ${relatorio}`);

  writeFileSync(file, encodePng(WIDTH, HEIGHT, pixels));
  console.log(`  ${file}: ${drawn} triângulos visíveis`);
}

for (const shot of shots) {
  console.log(`renderizando "${shot.name}"...`);
  render(shot.camera, shot.file);
}

console.log('pronto.');
