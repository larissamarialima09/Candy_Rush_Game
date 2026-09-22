import { Vector3 } from 'three';
import { TRACK } from '../config/track';
import { clamp } from '../core/mathUtils';
import type { Kart } from '../vehicle/kart';
import type { CircuitPath } from './circuitPath';

const _position = new Vector3();
const _normal = new Vector3();
const _normalVelocity = new Vector3();
const _tangentVelocity = new Vector3();
const _forward = new Vector3();
const _wallDirection = new Vector3();

const LOCAL_FORWARD = new Vector3(0, 0, 1);

/** O que aconteceu no contato deste passo, para os efeitos usarem. */
export interface BarrierContact {
  /** True se houve contato neste passo. */
  touching: boolean;
  /** Ponto do mundo onde o kart raspou. */
  readonly point: Vector3;
  /** Velocidade com que o kart entrou na barreira, em m/s. */
  impactSpeed: number;
  /** Velocidade ao longo da barreira, em m/s. Alta = raspão longo. */
  slideSpeed: number;
}

/**
 * Barreiras laterais com resposta que RASPA em vez de travar.
 *
 * As barreiras seguem a spline, então não é preciso testar geometria: basta o
 * deslocamento lateral do kart em relação ao eixo. Se ele passa do limite, o
 * kart é empurrado de volta, a componente de velocidade CONTRA o muro é
 * quase toda absorvida e a componente AO LONGO do muro é preservada.
 *
 * Essa distinção é o efeito inteiro. Absorver as duas componentes faz o kart
 * grudar e a corrida acabar ali; preservar a longitudinal faz ele deslizar
 * junto do muro, perder um pouco e seguir — que é como bater de raspão parece
 * em qualquer jogo de corrida decente.
 */
export class BarrierSystem {
  readonly contact: BarrierContact = {
    touching: false,
    point: new Vector3(),
    impactSpeed: 0,
    slideSpeed: 0,
  };

  constructor(private readonly path: CircuitPath) {}

  /** Um passo fixo, depois da integração do kart. */
  update(dt: number, kart: Kart): void {
    this.contact.touching = false;
    this.contact.impactSpeed = 0;
    this.contact.slideSpeed = 0;

    const body = kart.body;
    body.getChassisPosition(_position);

    const index = this.path.nearestSampleIndex(_position.x, _position.z);
    const sample = this.path.samples[index];
    const lateral = this.path.lateralOffset(index, _position.x, _position.z);

    const config = TRACK.barriers;
    const limit = sample.halfWidth + config.offsetFromEdge - config.kartRadius;
    const penetration = Math.abs(lateral) - limit;
    if (penetration <= 0) return;

    // Normal do muro, apontando PARA DENTRO da pista.
    const side = Math.sign(lateral) || 1;
    _normal.copy(sample.left).multiplyScalar(-side);

    // Correção de posição: tira o kart de dentro do muro sem teletransporte.
    _position.addScaledVector(_normal, penetration);
    body.position.addScaledVector(_normal, penetration);

    const approaching = body.velocity.dot(_normal);
    if (approaching < 0) {
      // Decompõe a velocidade: normal (contra o muro) e tangencial (ao longo).
      _normalVelocity.copy(_normal).multiplyScalar(approaching);
      _tangentVelocity.copy(body.velocity).sub(_normalVelocity);

      // O atrito do raspão é uma taxa POR SEGUNDO, convertida para este passo.
      // Aplicá-lo cru por passo faria a perda depender da taxa de física.
      body.velocity
        .copy(_tangentVelocity)
        .multiplyScalar(Math.pow(config.slidePerSecond, dt))
        .addScaledVector(_normalVelocity, -config.restitution);

      this.contact.impactSpeed = -approaching;
      this.contact.slideSpeed = _tangentVelocity.length();
    } else {
      this.contact.slideSpeed = body.velocity.length();
    }

    // Alinhar o kart com o muro. Sem isso ele fica arando de través, o que
    // trava de fato mesmo com a velocidade longitudinal preservada.
    body.directionToWorld(LOCAL_FORWARD, _forward);
    _forward.y = 0;
    if (_forward.lengthSq() > 1e-6) {
      _forward.normalize();
      _wallDirection.copy(sample.tangent).setY(0).normalize();
      // O muro serve nos dois sentidos: escolhe o que o kart está seguindo.
      if (_forward.dot(_wallDirection) < 0) _wallDirection.negate();

      // Ângulo com sinal entre a frente do kart e o muro. Positivo = o muro
      // está à esquerda do nariz, e guinada positiva vira para a esquerda.
      const cross = _forward.z * _wallDirection.x - _forward.x * _wallDirection.z;
      const angle = Math.atan2(cross, _forward.dot(_wallDirection));

      // Converge para a taxa de guinada que endireita o kart, em vez de SOMAR
      // guinada a cada passo. Somando, o contato vira uma bomba de rotação: o
      // kart entra em pião contra o muro, o deslizamento explode e o arrasto
      // lateral come toda a velocidade — a barreira parecia travar o kart.
      const desiredYawRate = angle * config.alignment;
      body.angularVelocity.y +=
        (desiredYawRate - body.angularVelocity.y) * clamp(config.alignment * dt, 0, 1);
    }

    this.contact.touching = true;
    this.contact.point.copy(_position).addScaledVector(_normal, -TRACK.barriers.kartRadius);
    this.contact.point.y = this.path.surfaceHeight(index, lateral) + 0.3;
  }
}
