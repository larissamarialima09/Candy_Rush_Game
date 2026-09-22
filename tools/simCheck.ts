/**
 * Banco de provas da fisica, fora do navegador: `npm run sim`.
 *
 * Roda o kart em passo fixo sem render e imprime os numeros que definem o
 * feel — aceleracao por segundo, distancia de frenagem, raio de curva no
 * limite, cargas por roda. Serve para duas coisas:
 *
 *  1. Pegar instabilidade numerica que a tela esconde. Foi assim que apareceu
 *     uma oscilacao de rolagem na frequencia do passo que tirava duas rodas do
 *     chao em passos alternados: na tela parecia so "meio sem forca".
 *  2. Comparar antes/depois quando voce mexe no tuning.
 *
 * As colunas `cargas` devem ser simetricas esquerda/direita em linha reta.
 * Se nao forem, tem oscilacao — releia o comentario de `damperBump`.
 */
import {
  type BufferGeometry,
  Euler,
  type InstancedMesh,
  type Mesh,
  Scene,
  Vector3,
} from 'three';
import { ChaseCamera } from '../src/camera/chaseCamera';
import { CAMERA } from '../src/config/camera';
import { CENTERLINE, CIRCUIT } from '../src/config/circuit';
import { CONTROLS_COOP_P1, CONTROLS_COOP_P2 } from '../src/config/controls';
import { COOP } from '../src/config/coop';
import { computeViewports, fovBonusFor } from '../src/core/splitScreen';
import { PHYSICS } from '../src/config/physics';
import { SURFACES, TRACK } from '../src/config/track';
import { measureSteerSign, RacerController } from '../src/rivals/racerController';
import { RACE } from '../src/config/race';
import { RaceDirector } from '../src/race/raceDirector';
import { Audience } from '../src/track/audience';
import { BarrierSystem } from '../src/track/barriers';
import { Coins } from '../src/track/coins';
import { SkidMarks } from '../src/fx/skidMarks';
import { LapTracker } from '../src/track/lapTracker';
import { TrackSurface } from '../src/track/trackSurface';
import { CircuitPath } from '../src/track/circuitPath';
import { CircuitScenery } from '../src/track/circuitScenery';
import { CircuitSurface } from '../src/track/circuitSurface';
import type { InputState } from '../src/core/input';
import { FlatGround } from '../src/physics/ground';
import { Kart } from '../src/vehicle/kart';

const dt = PHYSICS.fixedTimeStep;
const ground = new FlatGround(0);

function makeInput(partial: Partial<InputState> = {}): InputState {
  return {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    respawnPressed: false,
    pausePressed: false,
    ...partial,
  };
}

function run(kart: Kart, input: InputState, seconds: number): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) kart.update(dt, input, ground);
}

const _up = new Vector3();
const _euler = new Euler();

function attitude(kart: Kart): { roll: number; pitch: number } {
  _euler.setFromQuaternion(kart.body.orientation, 'YXZ');
  _up.set(0, 1, 0).applyQuaternion(kart.body.orientation);
  return { roll: (_euler.z * 180) / Math.PI, pitch: (_euler.x * 180) / Math.PI };
}

const list = (kart: Kart, f: (w: Kart['wheels'][number]) => string) =>
  kart.wheels.map(f).join(' ');

const kart = new Kart();
run(kart, makeInput(), 1.5);
console.log(
  'repouso: chassi y=%s  cargas=[%s]  compressoes=[%s]',
  (kart.body.position.y + 0.2).toFixed(3),
  list(kart, (w) => w.suspensionForce.toFixed(0)),
  list(kart, (w) => w.compression.toFixed(3)),
);

// --- Aceleracao ---
const full = makeInput({ throttle: 1 });
for (let s = 1; s <= 10; s++) {
  run(kart, full, 1);
  const a = attitude(kart);
  console.log(
    '  acel %ds  %s km/h  rol %s  arf %s  chao %d  cargas=[%s]',
    s,
    (kart.telemetry.speed * 3.6).toFixed(1),
    a.roll.toFixed(2),
    a.pitch.toFixed(2),
    kart.telemetry.wheelsOnGround,
    list(kart, (w) => w.suspensionForce.toFixed(0)),
  );
}

// --- Frenagem da maxima ---
const brake = makeInput({ brake: 1 });
const speed0 = kart.telemetry.forwardSpeed;
let brakeTime = 0;
while (kart.telemetry.forwardSpeed > 0.5 && brakeTime < 10) {
  kart.update(dt, brake, ground);
  brakeTime += dt;
}
console.log(
  'freio: %s km/h -> 0 em %ss (%s m/s2)',
  (speed0 * 3.6).toFixed(0),
  brakeTime.toFixed(2),
  (speed0 / brakeTime).toFixed(1),
);

// --- Curva estabilizada a fundo ---
kart.respawn();
run(kart, makeInput(), 1);
const turn = makeInput({ throttle: 1, steer: 1 });
for (let i = 0; i < 6 / dt; i++) {
  kart.update(dt, turn, ground);
  if (i % 60 === 0) {
    console.log(
      '  curva %ss  %s km/h  desliza %s  rol %s  chao %d',
      (i * dt).toFixed(1),
      (kart.telemetry.speed * 3.6).toFixed(1),
      kart.telemetry.slipAngleDeg.toFixed(1),
      attitude(kart).roll.toFixed(1),
      kart.telemetry.wheelsOnGround,
    );
  }
}
const yaw = kart.body.angularVelocity.y;
console.log(
  'curva estabilizada: %s km/h  raio ~%sm  desliza %s',
  (kart.telemetry.speed * 3.6).toFixed(1),
  Math.abs(yaw) > 0.01 ? (kart.telemetry.speed / Math.abs(yaw)).toFixed(1) : 'inf',
  kart.telemetry.slipAngleDeg.toFixed(1),
);

// --- Freio de mao a fundo ---
const drift = makeInput({ throttle: 1, steer: 1, handbrake: true });
for (let i = 0; i < 2 / dt; i++) {
  kart.update(dt, drift, ground);
  if (i % 30 === 0) {
    console.log(
      '  mao %ss  %s km/h  desliza %s  rol %s',
      (i * dt).toFixed(1),
      (kart.telemetry.speed * 3.6).toFixed(1),
      kart.telemetry.slipAngleDeg.toFixed(1),
      attitude(kart).roll.toFixed(1),
    );
  }
}

// --- Re ---
kart.respawn();
run(kart, makeInput(), 1);
run(kart, makeInput({ brake: 1 }), 4);
console.log('re: %s m/s (esperado negativo)', kart.telemetry.forwardSpeed.toFixed(2));

// --- Circuito (cenario da Fase 2) ---
{
  const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
  const count = path.count;

  // Distancia minima entre partes NAO vizinhas do tracado. Se ficar abaixo da
  // largura da pista mais o escape, o circuito se cruza e o asfalto se
  // sobrepoe. Foi desenhado a mao, entao vale conferir.
  let minGap = Infinity;
  let minGapAt = 0;
  const ignore = Math.round(count * 0.1);
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      // Separacao CIRCULAR: i=0 e j=count-1 sao vizinhos, nao partes opostas.
      const sep = Math.min(j - i, count - (j - i));
      if (sep < ignore) continue;
      const d = path.samples[i].position.distanceTo(path.samples[j].position);
      if (d < minGap) {
        minGap = d;
        minGapAt = i;
      }
    }
  }

  let maxCurvature = 0;
  let corners = 0;
  const radii: number[] = [];
  for (const sample of path.samples) {
    maxCurvature = Math.max(maxCurvature, Math.abs(sample.curvature));
    if (Math.abs(sample.curvature) >= CIRCUIT.kerb.minCurvature) corners++;
    if (Math.abs(sample.curvature) > 1e-5) radii.push(1 / Math.abs(sample.curvature));
  }
  // Onde estao as curvas mais fechadas, para saber que ponto do tracado mexer.
  const tight = path.samples
    .filter((s) => Math.abs(s.curvature) > 1e-5)
    .map((s) => ({ radius: 1 / Math.abs(s.curvature), s }))
    .sort((a, b) => a.radius - b.radius)
    .slice(0, 6);
  console.log('  curvas mais fechadas:');
  for (const t of tight) {
    console.log(
      '    raio %sm em (%s, %s), s=%sm',
      t.radius.toFixed(1),
      t.s.position.x.toFixed(0),
      t.s.position.z.toFixed(0),
      t.s.distance.toFixed(0),
    );
  }
  radii.sort((a, b) => a - b);

  const widest = Math.max(...path.samples.map((s) => s.halfWidth));
  const needed = widest * 2 + TRACK.runoffWidth * 2;
  console.log(
    'circuito: volta %sm  folga minima %sm (precisa > %sm) perto de s=%sm',
    path.totalLength.toFixed(0),
    minGap.toFixed(1),
    needed.toFixed(1),
    path.samples[minGapAt].distance.toFixed(0),
  );
  console.log(
    '  raio minimo %sm  %s%% da volta em curva (com zebra)',
    (1 / maxCurvature).toFixed(1),
    ((corners / count) * 100).toFixed(0),
  );
  console.log(minGap > needed ? '  OK: tracado nao se cruza' : '  ATENCAO: tracado apertado');
}

// --- Fase 3: drift x linha limpa ---
//
// O criterio de aprovacao da fase e este: encadear curvas em drift precisa ser
// MAIS RAPIDO do que fazer a linha limpa. Se nao for, o balanceamento esta
// errado.
//
// Comparar "quem gira 90 graus primeiro" nao serve: quem roda em piao ganha.
// Entao as duas estrategias percorrem O MESMO TRACADO GEOMETRICO — um arco de
// raio fixo seguido de uma reta — dirigido pelo mesmo piloto de perseguicao
// pura. A unica diferenca e que a estrategia "drift" puxa o freio de mao na
// entrada. Mesmo caminho, mesma distancia: o que sobra e o TEMPO.

/** Direcao de guinada produzida por steer=+1. Descoberta, nao assumida. */
function probeSteerSign(): number {
  const k = new Kart();
  const input = makeInput({ throttle: 1, steer: 1 });
  let yaw = 0;
  for (let i = 0; i < 2 / dt; i++) {
    k.update(dt, input, ground);
    yaw += k.body.angularVelocity.y * dt;
  }
  return Math.sign(yaw) || 1;
}

const _fwd = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();

/** Perseguicao pura: comando de volante para apontar o kart a um alvo. */
function steerToward(k: Kart, target: Vector3, gain: number, yawSign: number): number {
  _fwd.set(0, 0, 1).applyQuaternion(k.body.orientation).setY(0).normalize();
  _pos.copy(k.body.position).setY(0);
  _dir.copy(target).setY(0).sub(_pos);
  if (_dir.lengthSq() < 1e-6) return 0;
  _dir.normalize();
  // Angulo com sinal entre a frente do kart e a direcao do alvo.
  const cross = _fwd.z * _dir.x - _fwd.x * _dir.z;
  const angle = Math.atan2(cross, _fwd.dot(_dir));
  return Math.max(-1, Math.min(1, yawSign * gain * angle));
}

{
  const ENTRY_SPEED = 20;
  const RADIUS = 22;
  const ARC = Math.PI / 2;
  const STRAIGHT = 70;
  const LOOKAHEAD = 7;
  const GAIN = 2.2;
  const yawSign = probeSteerSign();

  function lap(useHandbrake: boolean) {
    const k = new Kart();
    const straight = makeInput({ throttle: 1 });
    while (k.telemetry.forwardSpeed < ENTRY_SPEED) k.update(dt, straight, ground);

    // Circulo tangente a posicao atual, do lado para o qual steer=+1 vira.
    _fwd.set(0, 0, 1).applyQuaternion(k.body.orientation).setY(0).normalize();
    const perp = new Vector3(0, 1, 0).cross(_fwd).multiplyScalar(yawSign);
    const center = k.body.position.clone().setY(0).addScaledVector(perp, RADIUS);
    const startAngle = Math.atan2(
      k.body.position.x - center.x,
      k.body.position.z - center.z,
    );

    const target = new Vector3();
    const advance = LOOKAHEAD / RADIUS;
    let swept = 0;
    let time = 0;
    let bestLevel = 0;
    let minSpeed = Infinity;
    let maxSlip = 0;
    let pathError = 0;
    let samples = 0;

    // --- Arco ---
    while (swept < ARC && time < 12) {
      const radial = Math.atan2(
        k.body.position.x - center.x,
        k.body.position.z - center.z,
      );
      swept = normalizeAngle((radial - startAngle) * yawSign);
      const aim = startAngle + (swept + advance) * yawSign;
      target.set(
        center.x + Math.sin(aim) * RADIUS,
        0,
        center.z + Math.cos(aim) * RADIUS,
      );

      const handbrake = useHandbrake && time < 0.55;
      const steer = steerToward(k, target, GAIN, yawSign);
      k.update(dt, makeInput({ throttle: 1, steer, handbrake }), ground);

      time += dt;
      bestLevel = Math.max(bestLevel, k.drift.level, k.drift.boostLevel);
      minSpeed = Math.min(minSpeed, k.telemetry.speed);
      maxSlip = Math.max(maxSlip, Math.abs(k.telemetry.slipAngleDeg));
      pathError += Math.abs(
        Math.hypot(k.body.position.x - center.x, k.body.position.z - center.z) - RADIUS,
      );
      samples++;
    }

    const arcTime = time;

    // --- Reta de saida: e aqui que o boost paga o que custou ---
    _fwd.set(0, 0, 1).applyQuaternion(k.body.orientation).setY(0).normalize();
    const exitPoint = k.body.position.clone().setY(0);
    const exitDir = _fwd.clone();
    let travelled = 0;

    while (travelled < STRAIGHT && time < 25) {
      target.copy(exitPoint).addScaledVector(exitDir, travelled + LOOKAHEAD * 2);
      const steer = steerToward(k, target, GAIN, yawSign);
      k.update(dt, makeInput({ throttle: 1, steer }), ground);
      travelled = k.body.position.clone().setY(0).sub(exitPoint).dot(exitDir);
      time += dt;
      bestLevel = Math.max(bestLevel, k.drift.boostLevel);
    }

    return {
      arcTime,
      totalTime: time,
      exitSpeed: k.telemetry.speed,
      minSpeed,
      bestLevel,
      maxSlip,
      pathError: pathError / Math.max(1, samples),
    };
  }

  const limpa = lap(false);
  const drift = lap(true);

  console.log(
    'drift x linha limpa (arco de %sm + reta de %sm, entrada a %s m/s):',
    RADIUS,
    STRAIGHT,
    ENTRY_SPEED,
  );
  for (const [name, r] of [
    ['limpa', limpa],
    ['drift', drift],
  ] as const) {
    console.log(
      '  %s  arco %ss  total %ss  minima %s  saida %s km/h  desliza %s  nivel %d  erro %sm',
      name.padEnd(5),
      r.arcTime.toFixed(2),
      r.totalTime.toFixed(2),
      (r.minSpeed * 3.6).toFixed(0),
      (r.exitSpeed * 3.6).toFixed(0),
      r.maxSlip.toFixed(0),
      r.bestLevel,
      r.pathError.toFixed(1),
    );
  }

  const gain = limpa.totalTime - drift.totalTime;
  console.log(
    gain > 0.02
      ? `  OK: o drift ganha ${gain.toFixed(2)}s no mesmo tracado (nivel ${drift.bestLevel})`
      : `  ATENCAO: o drift PERDE ${(-gain).toFixed(2)}s — balanceamento errado`,
  );
}

// --- Boost por nivel: quanto cada nivel realmente entrega ---
{
  console.log('boost a partir da velocidade de cruzeiro:');
  const cruise = makeInput({ throttle: 1 });
  for (const level of [1, 2, 3] as const) {
    const k = new Kart();
    for (let i = 0; i < 14 / dt; i++) k.update(dt, cruise, ground);
    const before = k.telemetry.speed;

    k.drift.triggerBoost(level);
    let peak = before;
    for (let i = 0; i < 5 / dt; i++) {
      k.update(dt, cruise, ground);
      peak = Math.max(peak, k.telemetry.speed);
    }
    console.log(
      '  nivel %d: %s -> %s km/h (+%s%%)',
      level,
      (before * 3.6).toFixed(0),
      (peak * 3.6).toFixed(0),
      (((peak - before) / before) * 100).toFixed(0),
    );
  }
}

// --- Fase 4: a pista como sistema ---
//
// Um piloto simples percorre o circuito de verdade para exercitar tudo junto:
// superficie com elevacao e inclinacao, materiais, checkpoints, voltas e
// barreiras. E scaffolding de teste, nao codigo de jogo — a IA de verdade e
// Fase 6.
{
  const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
  const surface = new TrackSurface(path);
  const yawSign = probeSteerSign();

  // --- Materiais ---
  const mid = path.indexAtFraction(0.5);
  const halfWidth = path.samples[mid].halfWidth;
  const probes: [string, number][] = [
    ['eixo', 0],
    ['borda', halfWidth - 0.2],
    ['escape', halfWidth + 2],
    ['fora', halfWidth + TRACK.runoffWidth + 3],
  ];
  console.log('superficies (fracao 0.5 da volta, meia-largura %sm):', halfWidth.toFixed(1));
  for (const [name, lateral] of probes) {
    const kind = path.surfaceAt(mid, lateral);
    const material = SURFACES[kind];
    console.log(
      '  %s lateral %sm -> %s  grip %s  vmax %s  %s',
      name.padEnd(7),
      lateral.toFixed(1).padStart(5),
      kind.padEnd(8),
      material.grip.toFixed(2),
      material.maxSpeed.toFixed(2),
      material.offTrack ? 'FORA' : 'na pista',
    );
  }

  // --- Elevacao e inclinacao ---
  let minY = Infinity;
  let maxY = -Infinity;
  let maxBank = 0;
  let minHalf = Infinity;
  let maxHalf = 0;
  for (const sample of path.samples) {
    minY = Math.min(minY, sample.position.y);
    maxY = Math.max(maxY, sample.position.y);
    maxBank = Math.max(maxBank, Math.abs((sample.bank * 180) / Math.PI));
    minHalf = Math.min(minHalf, sample.halfWidth);
    maxHalf = Math.max(maxHalf, sample.halfWidth);
  }
  console.log(
    'relevo: elevacao de %sm a %sm  inclinacao max %s graus  largura de %sm a %sm',
    minY.toFixed(1),
    maxY.toFixed(1),
    maxBank.toFixed(1),
    (minHalf * 2).toFixed(1),
    (maxHalf * 2).toFixed(1),
  );

  // O kart tem que assentar SOBRE a pista em qualquer ponto, inclusive nas
  // partes altas e inclinadas. Se a fisica e a malha discordassem, aqui daria
  // erro de metros.
  let worstRest = 0;
  for (const fraction of [0, 0.17, 0.31, 0.46, 0.6, 0.75, 0.88]) {
    const index = path.indexAtFraction(fraction);
    const sample = path.samples[index];
    const k = new Kart();
    const spawn = sample.position.clone();
    spawn.y += 1.2;
    k.respawnAt(spawn, Math.atan2(sample.tangent.x, sample.tangent.z));
    for (let i = 0; i < 2 / dt; i++) k.update(dt, makeInput(), surface);

    const expected = path.surfaceHeight(index, path.lateralOffset(index, k.body.position.x, k.body.position.z));
    // 0.593 e a altura de repouso do chassi medida na Fase 1.
    const error = Math.abs(k.body.position.y + 0.2 - (expected + 0.593));
    worstRest = Math.max(worstRest, error);
  }
  console.log(
    worstRest < 0.12
      ? `  OK: o kart assenta na superficie em toda a volta (erro max ${worstRest.toFixed(3)}m)`
      : `  ATENCAO: fisica e malha discordam em ${worstRest.toFixed(2)}m`,
  );

  // --- Volta completa com piloto de perseguicao ---
  const kart = new Kart();
  const tracker = new LapTracker(path);
  tracker.placeAtStart(kart);
  const barriers = new BarrierSystem(path);
  const target = new Vector3();
  const LOOKAHEAD_SAMPLES = 11;

  let time = 0;
  let touchedBarrier = 0;
  let rescued = 0;
  let offTrackSteps = 0;

  while (tracker.lap < 2 && time < 200) {
    const index = path.nearestSampleIndex(kart.body.position.x, kart.body.position.z);
    const aheadIndex = (index + LOOKAHEAD_SAMPLES) % path.count;
    path.pointAt(aheadIndex, 0, 0, target);

    // Velocidade alvo pela curvatura a frente: v = raiz(aceleracao * raio).
    const curvature = Math.abs(path.samples[(index + 22) % path.count].curvature);
    const radius = curvature > 1e-4 ? 1 / curvature : 1000;
    const targetSpeed = Math.min(30, Math.sqrt(22 * radius));
    const speed = kart.telemetry.speed;

    kart.update(
      dt,
      makeInput({
        throttle: speed < targetSpeed ? 1 : 0,
        brake: speed > targetSpeed * 1.1 ? 1 : 0,
        steer: steerToward(kart, target, 2.0, yawSign),
      }),
      surface,
    );
    barriers.update(dt, kart);
    tracker.update(dt, kart);

    if (barriers.contact.touching) touchedBarrier++;
    if (tracker.justRescued) rescued++;
    if (kart.telemetry.offTrack) offTrackSteps++;
    time += dt;
  }

  console.log(
    'volta completa: %d voltas em %ss  melhor %ss  fora da pista %s%%  barreira %s%%  resgates %d',
    tracker.lap,
    time.toFixed(1),
    Number.isFinite(tracker.bestLapTime) ? tracker.bestLapTime.toFixed(2) : '--',
    ((offTrackSteps * dt * 100) / time).toFixed(1),
    ((touchedBarrier * dt * 100) / time).toFixed(1),
    rescued,
  );
  console.log(
    tracker.lap >= 2
      ? '  OK: checkpoints em sequencia fecharam voltas'
      : '  ATENCAO: a volta nao fechou — checkpoints ou traçado',
  );

  // --- Barreira: tem que RASPAR, nao travar ---
  //
  // O kart ganha velocidade seguindo a pista, e so entao e jogado contra o
  // muro. Comparar a velocidade ANTES de virar nao serviria: parte da perda
  // seria da curva, nao da barreira. A medida certa e a velocidade no PRIMEIRO
  // CONTATO contra a velocidade depois de raspar por um tempo.
  {
    const k = new Kart();
    new LapTracker(path).placeAtStart(k);
    const b = new BarrierSystem(path);
    const aim = new Vector3();

    for (let i = 0; i < 7 / dt; i++) {
      const index = path.nearestSampleIndex(k.body.position.x, k.body.position.z);
      path.pointAt((index + 11) % path.count, 0, 0, aim);
      k.update(dt, makeInput({ throttle: 1, steer: steerToward(k, aim, 2, yawSign) }), surface);
      b.update(dt, k);
    }

    // Deriva SUAVE ate o muro. Esterco forte a 80 km/h faz o kart rodar antes
    // de encostar, e ai o que se mede e o rodopio, nao a barreira. Raspao e
    // por definicao um contato em angulo raso.
    let speedAtContact = 0;
    let steps = 0;
    while (speedAtContact === 0 && steps < 6 / dt) {
      k.update(dt, makeInput({ throttle: 1, steer: 0.1 * yawSign }), surface);
      b.update(dt, k);
      if (b.contact.touching) speedAtContact = k.telemetry.speed;
      steps++;
    }

    let contactSteps = 0;
    let maxSlide = 0;
    let minSpeed = Infinity;
    for (let i = 0; i < 1.8 / dt; i++) {
      // Segura contra o muro: e o pior caso, raspao continuo.
      k.update(dt, makeInput({ throttle: 1, steer: 0.08 * yawSign }), surface);
      b.update(dt, k);
      if (b.contact.touching) contactSteps++;
      maxSlide = Math.max(maxSlide, b.contact.slideSpeed);
      minSpeed = Math.min(minSpeed, k.telemetry.speed);
    }

    const finalSpeed = k.telemetry.speed;
    // "Raspa em vez de travar" tem dois sinais: o kart nunca para no muro, e
    // ele volta a acelerar ainda encostado. Comparar so com a velocidade de
    // chegada mediria tambem a perda da area de escape, que e outra coisa.
    const neverStopped = minSpeed * 3.6 > 15;
    const recovering = finalSpeed > minSpeed * 1.15;

    console.log(
      'barreira: contato a %s km/h, minima %s km/h, saiu a %s km/h  (contato em %s%% do tempo)',
      (speedAtContact * 3.6).toFixed(0),
      (minSpeed * 3.6).toFixed(0),
      (finalSpeed * 3.6).toFixed(0),
      ((contactSteps * dt * 100) / 1.8).toFixed(0),
    );
    console.log(
      speedAtContact === 0
        ? '  ATENCAO: nao encostou na barreira — teste inconclusivo'
        : neverStopped && recovering
          ? '  OK: raspa e volta a acelerar, nao trava'
          : `  ATENCAO: a barreira ${neverStopped ? 'nao deixa recuperar' : 'travou o kart'}`,
    );
  }

  // --- Fora da pista: tem que reposicionar ---
  {
    const k = new Kart();
    const t = new LapTracker(path);
    const start = path.samples[0];
    // Nasce bem fora do asfalto, na grama.
    const spawn = start.position
      .clone()
      .addScaledVector(start.left, start.halfWidth + TRACK.runoffWidth + 6);
    spawn.y += 0.8;
    k.respawnAt(spawn, Math.atan2(start.tangent.x, start.tangent.z));

    let rescueTime = -1;
    let elapsed = 0;
    let offSteps = 0;
    // Sem acelerador: o kart fica parado na grama. Acelerando, ele podia voltar
    // sozinho para a pista e o teste media outra coisa.
    for (let i = 0; i < 8 / dt; i++) {
      k.update(dt, makeInput(), surface);
      t.update(dt, k);
      elapsed += dt;
      if (k.telemetry.offTrack) offSteps++;
      if (t.justRescued && rescueTime < 0) rescueTime = elapsed;
    }
    console.log(
      '  (fora da pista em %s%% do tempo, material %s, cronometro %ss)',
      ((offSteps * dt * 100) / elapsed).toFixed(0),
      k.telemetry.surface,
      t.offTrackTimer.toFixed(2),
    );
    console.log(
      rescueTime > 0
        ? `  OK: resgate fora da pista em ${rescueTime.toFixed(1)}s (limite ${TRACK.offTrack.graceSeconds}s)`
        : '  ATENCAO: o kart ficou fora da pista sem ser resgatado',
    );
  }
}

// --- Adversarios de IA ---
//
// O risco real da IA nao e ser lenta: e rodar numa curva e ficar girando no
// lugar para sempre, ou sair da pista e nao voltar. Este teste roda os tres
// pilotos por um minuto e cobra volta completa de cada um.
{
  const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
  const surface = new TrackSurface(path);
  const tracker = new LapTracker(path);
  const director = new RaceDirector(path, [tracker]);
  const steerSign = measureSteerSign(() => new Kart(), surface);

  const pilots = RACE.rivals.map((profile, i) => {
    const k = new Kart();
    tracker.placeAtStart(k);
    // Espalha o grid para nao nascerem todos em cima uns dos outros.
    k.body.position.x += (i - 1) * 2.4;
    director.add(profile.name, k, false);
    return { profile, kart: k, controller: new RacerController(path, profile, i * 1.7, steerSign) };
  });

  let time = 0;
  const offTrackSteps = pilots.map(() => 0);
  while (time < 90) {
    for (let i = 0; i < pilots.length; i++) {
      const pilot = pilots[i];
      pilot.kart.update(dt, pilot.controller.update(dt, pilot.kart), surface);
      if (pilot.kart.telemetry.offTrack) offTrackSteps[i]++;
    }
    director.update(dt);
    time += dt;
  }

  console.log('IA depois de 90s:');
  let todosDeramVolta = true;
  for (let i = 0; i < pilots.length; i++) {
    const competitor = director.competitors[i];
    const voltas = competitor.progress / path.totalLength;
    const foraPct = (offTrackSteps[i] * dt * 100) / time;
    if (voltas < 1) todosDeramVolta = false;
    console.log(
      '  %s  %s voltas  %s km/h  fora da pista %s%%',
      pilots[i].profile.name.padEnd(5),
      voltas.toFixed(2),
      (pilots[i].kart.telemetry.speed * 3.6).toFixed(0).padStart(3),
      foraPct.toFixed(1),
    );
  }
  console.log(
    todosDeramVolta
      ? '  OK: todos os pilotos completaram pelo menos uma volta'
      : '  ATENCAO: algum piloto travou ou saiu da pista sem voltar',
  );
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}

// --- Geometria do cenario ---
// Constroi o circuito de verdade fora do navegador. Nao valida aparencia, mas
// pega o que quebraria calado: malha vazia, NaN em vertice, cena sem objeto.
{
  const scene = new Scene();
  const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
  const surface = new TrackSurface(path);
  new CircuitSurface(path, scene);
  const scenery = new CircuitScenery(path, scene);

  // Componentes animados: nao basta construir, tem que RODAR alguns quadros.
  // Um NaN numa matriz de instancia so aparece depois do primeiro update, e o
  // sintoma no navegador e o objeto sumir sem erro nenhum no console.
  const audience = new Audience(scenery.grandstandAnchor, scene);
  const coins = new Coins(path, scene);
  const skid = new SkidMarks(scene);
  const animated = new Kart();
  const focus = new Vector3();

  for (let i = 0; i < 90; i++) {
    animated.update(dt, makeInput({ throttle: 1, steer: 0.6, handbrake: i > 30 }), surface);
    animated.body.getChassisPosition(focus);
    audience.update(dt, focus, animated.telemetry.speed);
    coins.update(dt, [animated]);
    skid.update(dt, [animated]);
  }

  console.log(
    'animados: %d bichinhos na plateia, %d moedas (%d coletadas no teste)',
    audience.count,
    coins.total,
    coins.collected,
  );

  let meshes = 0;
  let instances = 0;
  let triangles = 0;
  let badVertices = 0;
  let emptyGeometries = 0;

  scene.traverse((object) => {
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
    if (!geometry || !geometry.getAttribute) return;
    const position = geometry.getAttribute('position');
    if (!position) return;

    const instanceCount = (object as InstancedMesh).isInstancedMesh
      ? (object as InstancedMesh).count
      : 1;
    if ((object as InstancedMesh).isInstancedMesh) instances += instanceCount;
    else meshes++;

    if (position.count === 0) emptyGeometries++;
    triangles += (position.count / 3) * instanceCount;

    const array = position.array as ArrayLike<number>;
    for (let i = 0; i < array.length; i++) {
      if (!Number.isFinite(array[i])) {
        badVertices++;
        break;
      }
    }
  });

  console.log(
    'cenario: %d malhas + %d instancias, ~%d triangulos',
    meshes,
    instances,
    Math.round(triangles),
  );
  console.log(
    badVertices === 0 && emptyGeometries === 0
      ? '  OK: geometria valida'
      : `  ATENCAO: ${badVertices} geometrias com NaN, ${emptyGeometries} vazias`,
  );
}

// --- Camera ---
{
  const cam = new ChaseCamera(16 / 9);
  const k = new Kart();
  const step = (i: InputState, seconds: number) => {
    const steps = Math.round(seconds / dt);
    for (let n = 0; n < steps; n++) {
      // Mesma ordem do loop de verdade: camera antes da fisica.
      cam.update(dt, k);
      k.update(dt, i, ground);
    }
  };

  const chassis = new Vector3();
  const report = (tag: string) => {
    cam.applyToRender(1);
    k.body.getChassisPosition(chassis);
    const flat = cam.camera.position.clone().setY(chassis.y);
    // Inclinacao REAL: quanto o vetor "direita" da camera sai da horizontal.
    // Medir pelo vetor "cima" nao serve, porque ele tambem inclina com a
    // arfagem (a camera olha para baixo, entao o "cima" ja nasce torto).
    const right = new Vector3(1, 0, 0).applyQuaternion(cam.camera.quaternion);
    const rollDeg = (Math.asin(Math.max(-1, Math.min(1, right.y))) * 180) / Math.PI;
    // Decompoe o offset da camera no referencial do kart, para separar
    // "atras" de "de lado" — a distancia sozinha esconde desalinhamento.
    const fwd = new Vector3(0, 0, 1).applyQuaternion(k.body.orientation).setY(0).normalize();
    const side = new Vector3(0, 1, 0).cross(fwd);
    const offset = cam.camera.position.clone().sub(chassis).setY(0);
    const esperado = 6.2 + Math.max(-1, Math.min(1.1, cam.accelerationSignal * 0.075));
    console.log(
      '  %s atras=%sm (esperado %s)  lado=%sm  altura=%sm  inclinacao=%s  acel=%s',
      tag.padEnd(14),
      (-offset.dot(fwd)).toFixed(2),
      esperado.toFixed(2),
      offset.dot(side).toFixed(2),
      (cam.camera.position.y - chassis.y).toFixed(2),
      rollDeg.toFixed(2),
      cam.accelerationSignal.toFixed(2),
    );
    return { roll: rollDeg, distance: flat.distanceTo(chassis) };
  };

  step(makeInput(), 1);
  console.log('camera:');
  const parado = report('parado');
  step(makeInput({ throttle: 1 }), 1);
  const acelerando = report('acelerando');
  step(makeInput({ throttle: 1 }), 14);
  const cruzeiro = report('cruzeiro');

  // Kart congelado: a mola tem que convergir EXATAMENTE para a ancora.
  // Se aqui der 6.20 e no cruzeiro der outra coisa, o desvio e dinamico.
  for (let n = 0; n < 400; n++) cam.update(dt, k);
  report('kart parado');
  step(makeInput({ brake: 1 }), 0.6);
  const freando = report('freando');

  k.respawn();
  step(makeInput({ throttle: 1, steer: 1 }), 4);
  const curva = report('em curva');

  // Respawn tem que cortar a suavizacao: sem isso a camera varre o mapa.
  k.update(dt, makeInput({ respawnPressed: true }), ground);
  cam.update(dt, k);
  k.update(dt, makeInput(), ground);
  const depoisRespawn = report('pos-respawn');

  console.log(
    '  recuo acelerando %s  aproximacao freando %s',
    (acelerando.distance - parado.distance).toFixed(2),
    (freando.distance - parado.distance).toFixed(2),
  );
  console.log(
    acelerando.distance > parado.distance && freando.distance < parado.distance
      ? '  OK: recua acelerando e aproxima freando'
      : '  ATENCAO: modulacao por aceleracao invertida',
  );
  // Em velocidade constante a camera tem que voltar exatamente para a
  // distancia de repouso. Qualquer desvio aqui e atraso permanente da mola,
  // que cresce com a velocidade e atropela a modulacao por aceleracao.
  const cruiseError = Math.abs(cruzeiro.distance - CAMERA.offset.distance);
  console.log(
    cruiseError < 0.1
      ? '  OK: sem atraso permanente em velocidade constante'
      : `  ATENCAO: atraso permanente de ${cruiseError.toFixed(2)}m em velocidade constante`,
  );
  const rollMagnitude = Math.abs(curva.roll);
  console.log(
    Math.abs(parado.roll) > 0.1
      ? `  ATENCAO: camera inclinada ${parado.roll.toFixed(2)} graus com o kart parado`
      : '  OK: sem inclinacao com o kart parado',
  );
  console.log(
    rollMagnitude >= 2.5 && rollMagnitude <= 6.2
      ? `  OK: inclinacao em curva ${curva.roll.toFixed(1)} graus (alvo 3 a 6)`
      : `  ATENCAO: inclinacao em curva ${curva.roll.toFixed(1)} graus fora do alvo 3 a 6`,
  );
  console.log(
    Math.abs(depoisRespawn.distance - parado.distance) < 0.5
      ? '  OK: respawn corta a suavizacao'
      : '  ATENCAO: respawn nao cortou a suavizacao',
  );
}

// --- Coop local: corte de tela e mapas de tecla ---
// O corte de tela nao envolve fisica, mas erra de um jeito que so aparece em
// resolucoes especificas: com altura impar, arredondar as duas metades para
// baixo deixa uma linha de pixels que nenhum viewport desenha, e ela fica com o
// lixo do quadro anterior. Por isso os tamanhos testados abaixo incluem numeros
// impares de proposito.
{
  console.log('coop local:');

  for (const [largura, altura] of [
    [1920, 1080],
    [1366, 768],
    [1365, 767],
    [800, 601],
  ]) {
    const cheia = computeViewports(1, largura, altura);
    const dividida = computeViewports(2, largura, altura);
    const folga = COOP.dividerThickness;
    const somaAltura = dividida[0].height + folga + dividida[1].height;
    const separadas = dividida[1].y >= dividida[0].y + dividida[0].height;

    const cobreTudo =
      cheia.length === 1 && cheia[0].width === largura && cheia[0].height === altura;

    console.log(
      cobreTudo && somaAltura === altura && separadas
        ? `  OK: ${largura}x${altura} divide em ${dividida[0].height} + ${folga} + ${dividida[1].height}`
        : `  FALHOU: ${largura}x${altura} soma ${somaAltura} de ${altura}, faixas separadas=${separadas}`,
    );
  }

  // Uma tecla que pertence aos dois pilotos comandaria dois karts ao mesmo
  // tempo. A pausa e a unica excecao legitima: ela nao dirige nada.
  const teclasP1 = new Set<string>(Object.values(CONTROLS_COOP_P1).flat());
  const compartilhadas = Object.values(CONTROLS_COOP_P2)
    .flat()
    .filter((tecla) => teclasP1.has(tecla) && tecla !== 'Escape');

  console.log(
    compartilhadas.length === 0
      ? '  OK: os dois pilotos nao dividem teclas de direcao'
      : `  FALHOU: teclas em comum entre os pilotos: ${compartilhadas.join(', ')}`,
  );

  console.log(
    fovBonusFor(1) === 0 && fovBonusFor(2) === COOP.fovBonus
      ? `  OK: tela dividida devolve ${COOP.fovBonus} graus de campo de visao`
      : '  FALHOU: bonus de campo de visao errado na tela dividida',
  );
}

// --- Sanidade numerica ---
const values = [
  kart.body.position.x,
  kart.body.position.y,
  kart.body.position.z,
  kart.body.velocity.length(),
  kart.body.angularVelocity.length(),
];
console.log(values.every(Number.isFinite) ? 'OK: sem NaN' : 'FALHOU: NaN na simulacao');
