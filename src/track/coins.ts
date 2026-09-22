import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import { PICKUPS } from '../config/pickups';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath } from './circuitPath';

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const _axisY = new Vector3(0, 1, 0);
/** Uma posição por piloto, crescida sob demanda. Rascunho: nada é alocado no
 *  passo fixo depois do primeiro quadro. */
const _kartPositions: Vector3[] = [];
const HIDDEN = new Vector3(0, 0, 0);

/** Uma moeda no mundo. */
interface Coin {
  readonly position: Vector3;
  /** Fase do flutuar, para elas não subirem e descerem todas juntas. */
  readonly phase: number;
  /** Segundos até reaparecer. Zero = está no ar, disponível. */
  cooldown: number;
}

/**
 * Moedas de bala espalhadas ao longo da pista, em linha serpenteante.
 *
 * Desenhadas numa única InstancedMesh: 37 moedas são 37 matrizes atualizadas
 * por quadro, não 37 objetos na cena. A coleta é distância ao quadrado contra
 * a posição do kart, e cada moeda tem cooldown próprio em vez de sumir de vez
 * — assim uma segunda volta continua valendo a pena.
 */
export class Coins {
  readonly root = new Group();
  private readonly mesh: InstancedMesh;
  private readonly coins: Coin[] = [];
  private clock = 0;

  /**
   * Quantas cada piloto coletou, indexado pela ordem em que os karts são
   * passados para `update`. No coop cada um tem o próprio saco de moedas: uma
   * contagem compartilhada faria os dois verem o mesmo número subir e tiraria
   * qualquer motivo para disputar a moeda.
   */
  readonly collectedByPlayer: number[] = [];
  /** True no quadro em que aquele piloto pegou alguma coisa. */
  readonly justCollectedByPlayer: boolean[] = [];
  /** Posição da última moeda coletada, para os efeitos. */
  readonly lastPickup = new Vector3();

  /** Total do primeiro piloto. Atalho para o modo de um jogador só. */
  get collected(): number {
    return this.collectedByPlayer[0] ?? 0;
  }

  /** True se qualquer piloto pegou uma moeda neste passo. */
  get justCollected(): boolean {
    return this.justCollectedByPlayer.some(Boolean);
  }

  constructor(path: CircuitPath, scene: Scene) {
    this.root.name = 'coins';
    const config = PICKUPS.coins;
    let nextDistance = 0;
    let index = 0;

    for (let i = 0; i < path.count; i++) {
      const sample = path.samples[i];
      if (sample.distance < nextDistance) continue;
      nextDistance = sample.distance + config.spacing;

      // Serpenteia entre os dois lados da pista.
      const weave = Math.sin((index / config.weaveLength) * Math.PI * 2);
      const lateral = weave * sample.halfWidth * config.lateralFraction;

      const position = new Vector3();
      path.pointAt(i, lateral, config.height, position);

      this.coins.push({ position, phase: index * 0.7, cooldown: 0 });
      index++;
    }

    // O cilindro nasce com o eixo em Y; deitá-lo em X deixa a moeda de pé,
    // com a face voltada para quem chega.
    const geometry = new CylinderGeometry(
      config.radius,
      config.radius,
      config.thickness,
      18,
    );
    geometry.rotateX(Math.PI / 2);

    this.mesh = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({
        color: config.color,
        emissive: config.emissive,
        emissiveIntensity: config.emissiveIntensity,
        roughness: 0.25,
        metalness: 0.1,
      }),
      this.coins.length,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.root.add(this.mesh);
    scene.add(this.root);
  }

  get total(): number {
    return this.coins.length;
  }

  /**
   * Passo fixo: gira, flutua e testa a coleta.
   * Roda no passo fixo porque a coleta é regra de jogo — com deltaTime
   * variável, quem tem mais quadros por segundo pegaria moedas que outro não
   * pegaria.
   */
  update(dt: number, karts: readonly Kart[]): void {
    const config = PICKUPS.coins;
    this.clock += dt;

    // As posições de todos os karts são colhidas ANTES do laço das moedas.
    // Fazer o contrário — um laço de moedas por kart — daria vantagem a quem
    // fosse testado primeiro: ele pegaria a moeda e ela já estaria em cooldown
    // quando chegasse a vez do outro, mesmo se os dois a tocassem no mesmo
    // passo. Assim o empate é resolvido por distância, que é justo.
    for (let p = 0; p < karts.length; p++) {
      this.collectedByPlayer[p] ??= 0;
      this.justCollectedByPlayer[p] = false;
      karts[p].body.getChassisPosition(_kartPositions[p] ??= new Vector3());
    }

    const radiusSquared = config.pickupRadius * config.pickupRadius;
    const spin = this.clock * config.spinSpeed * Math.PI * 2;

    for (let i = 0; i < this.coins.length; i++) {
      const coin = this.coins[i];

      if (coin.cooldown > 0) {
        coin.cooldown -= dt;
        if (coin.cooldown > 0) {
          // Escondida: escala zero é mais barato que remover da malha.
          _matrix.compose(coin.position, _quaternion, HIDDEN);
          this.mesh.setMatrixAt(i, _matrix);
          continue;
        }
      }

      // Quem estiver mais perto leva, entre os que estão dentro do raio.
      let taker = -1;
      let bestDistance = radiusSquared;
      for (let p = 0; p < karts.length; p++) {
        const kartPosition = _kartPositions[p];
        const dx = coin.position.x - kartPosition.x;
        const dy = coin.position.y - kartPosition.y;
        const dz = coin.position.z - kartPosition.z;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          taker = p;
        }
      }

      if (taker >= 0) {
        coin.cooldown = config.respawnSeconds;
        this.collectedByPlayer[taker]++;
        this.justCollectedByPlayer[taker] = true;
        this.lastPickup.copy(coin.position);
        _matrix.compose(coin.position, _quaternion, HIDDEN);
        this.mesh.setMatrixAt(i, _matrix);
        continue;
      }

      _position.copy(coin.position);
      _position.y += Math.sin(this.clock * config.bobSpeed + coin.phase) * config.bobAmplitude;
      _quaternion.setFromAxisAngle(_axisY, spin + coin.phase);
      _scale.setScalar(1);
      _matrix.compose(_position, _quaternion, _scale);
      this.mesh.setMatrixAt(i, _matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    this.collectedByPlayer.fill(0);
    this.justCollectedByPlayer.fill(false);
    for (const coin of this.coins) coin.cooldown = 0;
  }
}
