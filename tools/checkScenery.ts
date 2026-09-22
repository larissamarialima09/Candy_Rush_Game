/**
 * Verificação do CENÁRIO, rodando no Node, sem navegador.
 *
 * Responde "onde as coisas foram parar de verdade?". Por isso MONTA a cena e
 * mede o grafo resultante, em vez de repetir aqui as contas de
 * `circuitScenery`: uma verificação que refaz a mesma fórmula do código
 * verificado concorda com ele até quando os dois estão errados.
 *
 * Duas regras de medição, que explicam o formato do arquivo:
 *
 * 1. O relatório é por CONJUNTO NOMEADO, não por peça solta. Peça a peça o
 *    ruído domina: cúpula de vidro, sinos, canos e copas de árvore são altos
 *    de propósito.
 * 2. `InstancedMesh` é medida INSTÂNCIA POR INSTÂNCIA. A caixa envolvente de um
 *    cluster inteiro — todas as barreiras da volta, todas as árvores do mapa —
 *    tem centro no meio do circuito e não diz nada sobre onde cada cópia está.
 *
 *   npx esbuild tools/checkScenery.ts --bundle --format=esm --platform=node \
 *     --outfile=node_modules/.cache/checkScenery.mjs && node node_modules/.cache/checkScenery.mjs
 */
import {
  Box3,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  Scene,
  Vector3,
} from 'three';
import { CANDY_FACTORY } from '../src/config/candyFactory';
import { CENTERLINE, CIRCUIT } from '../src/config/circuit';
import { QUALITY } from '../src/config/quality';
import { DONUT_TUNNEL } from '../src/config/donutTunnel';
import { TRACK } from '../src/config/track';
import { JELLY_BLOBS, SPEED_RAMP, type JellySpot } from '../src/config/trackFeatures';
import { candyFactoryPlacement } from '../src/track/candyFactory';
import { CircuitPath } from '../src/track/circuitPath';
import { CircuitScenery } from '../src/track/circuitScenery';
import { CircuitSurface } from '../src/track/circuitSurface';
import { CandySigns } from '../src/track/candySigns';
import { JellyBlobs } from '../src/track/jellyBlobs';
import { SpeedRamp } from '../src/track/speedRamp';

const path = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
const scene = new Scene();
const scenery = new CircuitScenery(path, scene);
const surface = new CircuitSurface(path, scene);
const speedRamp = new SpeedRamp(path, scene);
const jellyBlobs = new JellyBlobs(path, scene);
const candySigns = new CandySigns(path, scene);
scenery.root.updateMatrixWorld(true);
candySigns.root.updateMatrixWorld(true);
surface.root.updateMatrixWorld(true);
speedRamp.root.updateMatrixWorld(true);
jellyBlobs.root.updateMatrixWorld(true);

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label} — ${detail}`);
}

/** Distância horizontal até o eixo da pista, que é a medida-mestra daqui. */
function toTrack(x: number, z: number): number {
  return path.distanceToCenterline(x, z);
}

/**
 * Folga de um ponto até onde o kart consegue chegar, medida contra a barreira
 * DAQUELE trecho do traçado.
 *
 * A largura tem que vir da amostra mais próxima, não da reta de largada: o
 * circuito volta sobre si mesmo em vários pontos, e o canto de uma construção
 * pode estar perto de outro trecho da pista, com outra largura e outra
 * barreira.
 */
function clearanceAt(x: number, z: number): { slack: number; reach: number; distance: number } {
  const nearest = path.samples[path.nearestSampleIndex(x, z)];
  const reach = nearest.halfWidth + TRACK.barriers.offsetFromEdge - TRACK.barriers.kartRadius;
  const distance = toTrack(x, z);
  return { slack: distance - reach, reach, distance };
}

/**
 * Nenhuma peça de uma construção pode ocupar a faixa por onde o kart passa.
 *
 * Mede VÉRTICES de verdade, e não a caixa envolvente: as construções ficam
 * giradas com o rumo da pista, e numa peça girada a caixa alinhada aos eixos do
 * mundo é maior que a peça — testar os cantos dela reprova pontos onde não há
 * material nenhum. Só conta o que está na altura de um kart; o que passa por
 * cima, passa por cima.
 */
function checkCorridor(group: Object3D, label: string, floor: number): void {
  let worst = { slack: Infinity, reach: 0, distance: 0, x: 0, y: 0, z: 0 };
  const point = new Vector3();

  group.traverse((object) => {
    if (!(object as { isMesh?: boolean }).isMesh) return;
    const mesh = object as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;

    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);

      // A faixa do kart é uma BANDA: do chão até a altura de um kart. O que
      // passa por cima não atrapalha, e o que está enterrado também não — o
      // donut, por exemplo, mergulha a metade de baixo no chão, catorze metros
      // abaixo do asfalto, onde kart nenhum chega.
      if (point.y > floor + 3) continue;
      if (point.y < floor - 0.5) continue;

      const clearance = clearanceAt(point.x, point.z);
      if (clearance.slack < worst.slack) {
        worst = { ...clearance, x: point.x, y: point.y, z: point.z };
      }
    }
  });

  check(
    `${label}: nada na faixa por onde o kart passa`,
    worst.slack >= 0,
    `ponto mais crítico em (${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}), y=${worst.y.toFixed(1)}: ` +
      `${worst.distance.toFixed(2)} m do eixo contra ${worst.reach.toFixed(2)} m de alcance ` +
      `(folga ${worst.slack.toFixed(2)} m)`,
  );
}

console.log('\n=== Máquina de doces ===');
const placement = candyFactoryPlacement(path);
const factoryDistance = toTrack(placement.base.x, placement.base.z);
console.log(
  `base em (${placement.base.x.toFixed(1)}, ${placement.base.z.toFixed(1)}), ` +
    `rumo ${((placement.heading * 180) / Math.PI).toFixed(0)}°, ` +
    `giro ${((placement.angle * 180) / Math.PI).toFixed(0)}°`,
);
check(
  'tablado fora da pista',
  factoryDistance > 20,
  `${factoryDistance.toFixed(1)} m do eixo (precisa de mais que 20)`,
);

// O +Z local da máquina tem que APONTAR para a pista: é para lá que a calha
// despeja as balas. Andar um metro nessa direção tem que APROXIMAR do eixo.
const cosine = Math.cos(placement.angle);
const sine = Math.sin(placement.angle);
check(
  'frente da máquina virada para a pista',
  toTrack(placement.base.x + sine, placement.base.z + cosine) < factoryDistance,
  `um metro à frente dá ${toTrack(placement.base.x + sine, placement.base.z + cosine).toFixed(2)} m ` +
    `contra ${factoryDistance.toFixed(2)} m`,
);

for (const mountain of CANDY_FACTORY.mountains) {
  const x = placement.base.x + mountain.x * cosine + mountain.z * sine;
  const z = placement.base.z - mountain.x * sine + mountain.z * cosine;
  const distance = toTrack(x, z);
  check(
    `montanha de ${mountain.height} m longe do asfalto`,
    distance > mountain.radius + 14,
    `centro a ${distance.toFixed(1)} m do eixo, raio ${mountain.radius} m`,
  );
}

console.log('\n=== Arquibancadas: todas de frente para a pista ===');
// Este é O teste do defeito relatado. Cada arquibancada guardou em `userData` o
// sinal do X local em que os degraus sobem; andar nessa direção tem que
// AFASTAR do eixo da pista. Se aproximar, ela está de costas.
const stands: Object3D[] = [];
scenery.root.traverse((object) => {
  if (object.name === 'grandstand') stands.push(object);
});
// O número não é fixado num literal de propósito: quantas arquibancadas
// existem é decisão de `addArenaGrandstands`, e travar isso aqui só faz o banco
// de provas reprovar sempre que o cenário ganha uma a mais — foi o que acabou
// de acontecer quando as duas de vitrine viraram quatro ao lado da pista.
check(
  'há arquibancadas suficientes ao redor do circuito',
  stands.length >= 4,
  `${stands.length} encontrada(s)`,
);

const worldPosition = new Vector3();
for (let i = 0; i < stands.length; i++) {
  const stand = stands[i];
  const sign = stand.userData.awaySign as number;
  stand.getWorldPosition(worldPosition);
  const axisX = Math.cos(stand.rotation.y) * sign;
  const axisZ = -Math.sin(stand.rotation.y) * sign;

  const here = toTrack(worldPosition.x, worldPosition.z);
  const upTheSteps = toTrack(worldPosition.x + axisX * 6, worldPosition.z + axisZ * 6);
  check(
    `arquibancada ${i + 1} com os degraus subindo para longe do asfalto`,
    upTheSteps > here,
    `da base a ${here.toFixed(1)} m para ${upTheSteps.toFixed(1)} m do eixo`,
  );
}

console.log('\n=== Apoio no chão, por conjunto ===');

/** Ancestral nomeado mais próximo — é assim que a peça vira "construção". */
function ownerOf(object: Object3D): string {
  let current: Object3D | null = object;
  while (current) {
    if (current.name) return current.name;
    current = current.parent;
  }
  return '(sem nome)';
}

interface Support {
  /** Ponto mais baixo de qualquer peça do conjunto. */
  bottom: number;
  /** Altura do chão logo abaixo dessa peça. */
  ground: number;
}

const support = new Map<string, Support>();
const intruders = new Map<string, number>();
/** Um ponto de exemplo por infrator, para localizar o problema no mapa. */
const intruderSpot = new Map<string, { x: number; z: number }>();
const box = new Box3();
const center = new Vector3();
const instanceMatrix = new Matrix4();
const instancePoint = new Vector3();

/** Uma peça em cima do asfalto é cenário invadindo a pista. */
function noteIfOverTrack(owner: string, x: number, y: number, z: number): void {
  const ground = path.terrainHeight(x, z);
  const halfWidth = path.samples[path.nearestSampleIndex(x, z)].halfWidth;
  if (toTrack(x, z) < halfWidth + 1.5 && y < ground + 5) {
    intruders.set(owner, (intruders.get(owner) ?? 0) + 1);
    if (!intruderSpot.has(owner)) intruderSpot.set(owner, { x, z });
  }
}

scenery.root.traverse((object) => {
  const owner = ownerOf(object);

  if ((object as { isInstancedMesh?: boolean }).isInstancedMesh) {
    const instanced = object as InstancedMesh;
    for (let i = 0; i < instanced.count; i++) {
      instanced.getMatrixAt(i, instanceMatrix);
      instancePoint.setFromMatrixPosition(instanceMatrix).applyMatrix4(instanced.matrixWorld);
      noteIfOverTrack(owner, instancePoint.x, instancePoint.y, instancePoint.z);
    }
    return;
  }

  if (!(object as { isMesh?: boolean }).isMesh) return;
  box.setFromObject(object);
  if (!isFinite(box.min.y)) return;
  box.getCenter(center);

  const ground = path.terrainHeight(center.x, center.z);
  const seen = support.get(owner);
  if (!seen || box.min.y - ground < seen.bottom - seen.ground) {
    support.set(owner, { bottom: box.min.y, ground });
  }

  noteIfOverTrack(owner, center.x, box.min.y, center.z);
});

for (const [owner, data] of [...support].sort(
  (a, b) => b[1].bottom - b[1].ground - (a[1].bottom - a[1].ground),
)) {
  const gap = data.bottom - data.ground;
  console.log(`  ${gap >= 0 ? '+' : ''}${gap.toFixed(2)} m  ${owner}`);
}

// Só as construções que a usuária apontou. Valor negativo quer dizer enterrado,
// que é seguro; o que não pode é folga POSITIVA, que é o vão visível entre a
// construção e a grama.
for (const owner of ['grandstand', 'candy-factory', 'cotton-mountain']) {
  const data = support.get(owner);
  if (!data) {
    check(`conjunto "${owner}" existe na cena`, false, 'não encontrado');
    continue;
  }
  const gap = data.bottom - data.ground;
  check(`"${owner}" encosta na grama`, gap <= 0.3, `peça mais baixa a ${gap.toFixed(2)} m do chão`);
}

console.log('\n=== Peças sobre o asfalto ===');
if (intruders.size === 0) console.log('  nenhuma');
for (const [owner, count] of intruders) {
  const spot = intruderSpot.get(owner);
  const fraction = spot
    ? path.samples[path.nearestSampleIndex(spot.x, spot.z)].distance / path.totalLength
    : 0;
  console.log(
    `  ${count}\t${owner}` +
      (spot
        ? `  ex.: (${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}), perto da fração ${fraction.toFixed(3)} da volta`
        : ''),
  );
}
// O Doce Castelo tem um TÚNEL: a pista passa por dentro dele, então peças dele
// sobre o asfalto são o projeto, não um defeito. Qualquer outro conjunto ali é.
// Construções que a pista ATRAVESSA de propósito: o túnel do castelo e o
// buraco do donut. Para elas, estar sobre o asfalto é o projeto, não um
// defeito — e a pergunta que de fato importa ("dá para bater nisso?") quem
// responde é o `checkCorridor`, que mede vértices de verdade na altura do kart.
const TUNNELS = ['candy-castle', 'donut-tunnel', 'donut-dough', 'donut-icing', 'donut-sprinkles'];
for (const [owner, count] of intruders) {
  check(
    `"${owner}" não invade a pista`,
    TUNNELS.includes(owner),
    `${count} peça(s) sobre o asfalto`,
  );
}

console.log('\n=== Portal "CANDY RUSH" da largada ===');
const gate = surface.root.getObjectByName('start-gantry');
if (!gate) {
  check('o portal existe na cena', false, 'grupo "start-gantry" não encontrado');
} else {
  // O portal NÃO tem colisão. Quem limita o kart é a barreira de bala, então o
  // ponto mais para dentro que ele alcança é a borda do asfalto, mais o
  // afastamento da barreira, menos o raio do kart. Peça do portal ao alcance
  // disso seria atravessada pelo kart na frente da câmera.
  const startSample = path.samples[0];

  let worst = { slack: Infinity, reach: 0, distance: 0, x: 0, y: 0, z: 0 };
  let spansTrack = false;

  // VÉRTICES de verdade, e não os cantos da caixa envolvente.
  //
  // O pórtico fica girado uns doze graus, porque a tangente da pista na linha
  // de largada não é exatamente +Z — a última curva chega torta. Numa peça
  // girada, a caixa alinhada aos eixos do mundo é maior que a peça, e os cantos
  // dela ficam no vazio — medir por ali reprova pontos onde não há material.
  const vertex = new Vector3();
  gate.traverse((object) => {
    if (!(object as { isMesh?: boolean }).isMesh) return;
    const mesh = object as Mesh;

    box.setFromObject(mesh);
    if (isFinite(box.min.y) && box.min.y > startSample.position.y + 3) {
      if (box.min.x < startSample.position.x && box.max.x > startSample.position.x) {
        spansTrack = true;
      }
    }

    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);

      // Acima da altura de um kart a peça passa por cima e não atrapalha: é o
      // caso do arco, do letreiro, do semáforo e das bandeiras.
      if (vertex.y > startSample.position.y + 3) continue;

      const clearance = clearanceAt(vertex.x, vertex.z);
      if (clearance.slack < worst.slack) {
        worst = { ...clearance, x: vertex.x, y: vertex.y, z: vertex.z };
      }
    }
  });

  check(
    'nenhuma peça baixa do portal ao alcance do kart',
    worst.slack >= 0,
    `canto mais crítico em (${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}), base y=${worst.y.toFixed(1)}: ` +
      `${worst.distance.toFixed(2)} m do eixo contra ${worst.reach.toFixed(2)} m de alcance ` +
      `(folga ${worst.slack.toFixed(2)} m)`,
  );
  check(
    'o portal passa por cima da pista',
    spansTrack,
    spansTrack ? 'o arco cruza o eixo da pista' : 'nada acima de 3 m cruza o eixo',
  );

  // As estrelas não apareciam no preview. Olhar a imagem não distingue "está no
  // lugar errado" de "a geometria saiu vazia", então aqui se pergunta as duas
  // coisas de uma vez: quantas existem, onde estão e que tamanho têm de fato.
  const stars: Object3D[] = [];
  gate.traverse((object) => {
    if (object.name === 'gate-star') stars.push(object);
  });
  check('as duas estrelas existem', stars.length === 2, `${stars.length} encontrada(s)`);

  for (const star of stars) {
    box.setFromObject(star);
    box.getCenter(center);
    const size = box.getSize(new Vector3());
    console.log(
      `       estrela em (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})` +
        `, caixa ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`,
    );
    check(
      'a estrela tem geometria com tamanho',
      size.x > 0.5 && size.y > 0.5,
      `caixa de ${size.x.toFixed(2)} x ${size.y.toFixed(2)} m`,
    );
  }
}

console.log('\n=== Túnel de Donut ===');
const donut = scenery.root.getObjectByName('donut-tunnel');
if (!donut) {
  check('o túnel de donut existe', false, 'grupo "donut-tunnel" não encontrado');
} else {
  const donutFloor = donut.position.y;
  console.log(
    `donut em (${donut.position.x.toFixed(1)}, ${donut.position.z.toFixed(1)}), ` +
      `piso y=${donutFloor.toFixed(2)}`,
  );

  // A massa do donut mergulha no chão dos dois lados da estrada. O que não pode
  // é ela fechar a passagem por onde o kart corre.
  checkCorridor(donut, 'donut', donutFloor);

  for (const part of ['donut-dough', 'donut-icing', 'donut-sprinkles']) {
    const piece = donut.getObjectByName(part);
    if (!piece) {
      check(`"${part}" existe`, false, 'não encontrado');
      continue;
    }
    box.setFromObject(piece);
    const size = box.getSize(new Vector3());
    check(
      `"${part}" tem geometria com tamanho`,
      size.x > 1 && size.y > 1,
      `caixa ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} m`,
    );
  }
}

console.log('\n=== Rampa de aceleração e geleias ===');
{
  const ramp = SPEED_RAMP;
  const rampSample = path.samples[path.indexAtFraction(ramp.at)];
  check(
    'a rampa cabe dentro do asfalto',
    ramp.halfWidth <= rampSample.halfWidth - 0.5,
    `meia-largura ${ramp.halfWidth} m contra ${rampSample.halfWidth.toFixed(1)} m de pista`,
  );
  check(
    'a rampa vem DEPOIS do túnel de donut',
    ramp.at > DONUT_TUNNEL.at,
    `rampa em ${ramp.at}, donut em ${DONUT_TUNNEL.at}`,
  );

  // A pergunta que decide se o trecho é jogável: sobra linha limpa entre as
  // geleias? Enfileiradas na mesma altura da pista elas virariam um pedágio —
  // todo mundo perde a mesma velocidade e a manobra deixa de existir.
  const byRow = new Map<number, JellySpot[]>();
  for (const spot of JELLY_BLOBS.spots) {
    const row = Math.round(spot.at * 1000);
    const bucket = byRow.get(row);
    if (bucket) bucket.push(spot);
    else byRow.set(row, [spot]);
  }

  for (const [row, spots] of [...byRow].sort((a, b) => a[0] - b[0])) {
    const sample = path.samples[path.indexAtFraction(row / 1000)];
    const half = sample.halfWidth;
    const needed = TRACK.barriers.kartRadius * 2 + 0.4;

    // Varre a largura da pista e mede o maior vão livre entre as geleias.
    let widest = 0;
    let run = 0;
    for (let lateral = -half; lateral <= half; lateral += 0.05) {
      const blocked = spots.some(
        (spot) => Math.abs(lateral - spot.lateral) < spot.radius + TRACK.barriers.kartRadius,
      );
      run = blocked ? 0 : run + 0.05;
      widest = Math.max(widest, run);
    }

    check(
      `geleias em ${(row / 1000).toFixed(3)} deixam linha limpa`,
      widest >= needed,
      `maior vão ${widest.toFixed(2)} m, precisa de ${needed.toFixed(2)} m`,
    );
  }

  for (const spot of JELLY_BLOBS.spots) {
    const sample = path.samples[path.indexAtFraction(spot.at)];
    check(
      `geleia em ${spot.at} está sobre o asfalto`,
      Math.abs(spot.lateral) + spot.radius <= sample.halfWidth,
      `lateral ${spot.lateral} m + raio ${spot.radius} m contra ${sample.halfWidth.toFixed(1)} m`,
    );
  }

  // Tudo acima confere NÚMERO DE CONFIG, que é o desenho. Isto aqui confere que
  // as peças existem mesmo na cena — conferir só o número passa mesmo quando a
  // peça não chegou a ser construída.
  box.setFromObject(speedRamp.root);
  const rampSize = box.getSize(new Vector3());
  check(
    'a rampa existe como malha na cena',
    speedRamp.root.children.length > 0 && rampSize.x > 1 && rampSize.z > 1,
    `${speedRamp.root.children.length} peça(s), caixa ` +
      `${rampSize.x.toFixed(1)} x ${rampSize.y.toFixed(1)} x ${rampSize.z.toFixed(1)} m`,
  );

  check(
    'a rampa ocupa só uma parte da largura da pista',
    SPEED_RAMP.halfWidth / rampSample.halfWidth <= 0.45,
    `${((SPEED_RAMP.halfWidth / rampSample.halfWidth) * 100).toFixed(0)}% de cada lado do eixo`,
  );

  // O TESTE DO "FORA DO PISO".
  //
  // Cada vértice do tapete é comparado com a altura da superfície NAQUELE
  // deslocamento lateral — que é onde a inclinação da curva entra. Uma laje
  // rígida reprova aqui na hora: uma borda fica acima da pista e a outra
  // afunda. Só entram os vértices rentes ao chão; os postes são altos por
  // projeto e ficam de fora.
  const rampVertex = new Vector3();
  let worstLift = 0;
  let sampled = 0;

  speedRamp.root.traverse((object) => {
    if (!(object as { isMesh?: boolean }).isMesh) return;
    const mesh = object as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;

    for (let i = 0; i < positions.count; i++) {
      rampVertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const nearest = path.nearestSampleIndex(rampVertex.x, rampVertex.z);

      // A altura é comparada com as amostras VIZINHAS, ficando a menor
      // diferença. A fita é construída sobre uma amostra escolhida, e aqui o
      // verificador REDESCOBRE a amostra a partir da posição do vértice — numa
      // curva inclinada as duas nem sempre são a mesma. Como a inclinação muda
      // a altura da superfície em quase trinta centímetros de uma borda à outra
      // da pista, medir só contra a amostra redescoberta mede esse desencontro,
      // e não a folga da fita. Uma laje de verdade solta do chão continua
      // reprovando: ela estaria longe da superfície em TODAS as vizinhas.
      let lift = Infinity;
      for (let step = -2; step <= 2; step++) {
        const index = (nearest + step + path.count) % path.count;
        const lateral = path.lateralOffset(index, rampVertex.x, rampVertex.z);
        const candidate = rampVertex.y - path.surfaceHeight(index, lateral);
        if (Math.abs(candidate) < Math.abs(lift)) lift = candidate;
      }

      if (lift > 0.6) continue;
      sampled++;
      worstLift = Math.max(worstLift, Math.abs(lift));
    }
  });

  check(
    'a rampa assenta no piso da pista',
    sampled > 0 && worstLift <= 0.3,
    `maior distância do piso ${worstLift.toFixed(3)} m em ${sampled} vértices`,
  );

  let built = 0;
  jellyBlobs.root.traverse((object) => {
    if (object.name === 'jelly') built++;
  });
  check(
    'todas as geleias existem como malha na cena',
    built === JELLY_BLOBS.spots.length,
    `${built} de ${JELLY_BLOBS.spots.length}`,
  );

  // E que cada uma caiu mesmo em cima do asfalto, medindo a posição de MUNDO da
  // peça, e não o número declarado no config.
  jellyBlobs.root.traverse((object) => {
    if (object.name !== 'jelly') return;
    object.getWorldPosition(center);
    const index = path.nearestSampleIndex(center.x, center.z);
    const lateral = Math.abs(path.lateralOffset(index, center.x, center.z));
    check(
      'geleia assentada dentro da pista',
      lateral <= path.samples[index].halfWidth,
      `${lateral.toFixed(2)} m do eixo contra ${path.samples[index].halfWidth.toFixed(1)} m`,
    );
  });
}

console.log('\n=== Árvores de doce e balões ===');
{
  // Contagem por NOME das instâncias: config conferido não prova que a peça foi
  // construída, e a vista de cima não distingue uma árvore de uma colina de
  // gumdrop.
  const built = new Map<string, number>();
  scenery.root.traverse((object) => {
    if (!(object as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if (!object.name) return;
    const instanced = object as InstancedMesh;
    built.set(object.name, (built.get(object.name) ?? 0) + instanced.count);
  });

  let plantedTotal = 0;
  for (const variety of CIRCUIT.trees.varieties) {
    const planted = built.get(`tree-${variety.kind}`) ?? 0;
    plantedTotal += planted;
    check(`árvore "${variety.kind}" foi plantada`, planted > 0, `${planted} instância(s)`);
  }
  check(
    'o total de árvores bate com o orçamento gráfico',
    plantedTotal === QUALITY.treeCount,
    `${plantedTotal} de ${QUALITY.treeCount}`,
  );

  const balloons = built.get('balloon') ?? 0;
  check(
    'balões espalhados pelo céu',
    balloons === QUALITY.balloonCount,
    `${balloons} de ${QUALITY.balloonCount}`,
  );
}

console.log('\n=== Auditoria de contato com o chão ===');
{
  /**
   * Varre TUDO — malhas soltas e cada instância de cada InstancedMesh — e mede
   * o ponto mais baixo da peça contra a altura da grama embaixo dela.
   *
   * Duas perguntas diferentes, e é por isso que se guarda mínimo E máximo:
   *
   * - `min` responde "este CONJUNTO encosta no chão em algum lugar?". Serve
   *   para construções (castelo, arquibancada, fábrica), onde basta a base
   *   tocar; as torres podem e devem estar no alto.
   * - `max` responde "alguma CÓPIA desta peça ficou no ar?". Serve para o
   *   cenário espalhado (árvores, doces, colinas), onde cada exemplar é
   *   independente e todos precisam estar plantados.
   *
   * Instância é medida pelos oito cantos da caixa da geometria levados para o
   * mundo, e não pela origem dela: metade das geometrias deste projeto é
   * construída deslocada para cima, então a origem não diz onde está o pé.
   */
  interface Contact {
    min: number;
    max: number;
    minAt: { x: number; z: number };
    maxAt: { x: number; z: number };
  }

  const contacts = new Map<string, Contact>();
  const corner = new Vector3();
  const instanceWorld = new Matrix4();

  function note(owner: string, lowest: number, x: number, z: number): void {
    const gap = lowest - path.terrainHeight(x, z);
    const seen = contacts.get(owner);
    if (!seen) {
      contacts.set(owner, { min: gap, max: gap, minAt: { x, z }, maxAt: { x, z } });
      return;
    }
    if (gap < seen.min) {
      seen.min = gap;
      seen.minAt = { x, z };
    }
    if (gap > seen.max) {
      seen.max = gap;
      seen.maxAt = { x, z };
    }
  }

  for (const root of [
    scenery.root,
    surface.root,
    speedRamp.root,
    jellyBlobs.root,
    candySigns.root,
  ]) {
    root.traverse((object) => {
      const owner = ownerOf(object);

      if ((object as { isInstancedMesh?: boolean }).isInstancedMesh) {
        const instanced = object as InstancedMesh;
        const geometry = instanced.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        if (!bounds) return;

        for (let i = 0; i < instanced.count; i++) {
          instanced.getMatrixAt(i, instanceWorld);
          instanceWorld.premultiply(instanced.matrixWorld);

          let lowest = Infinity;
          let centerX = 0;
          let centerZ = 0;
          for (let c = 0; c < 8; c++) {
            corner
              .set(
                c & 1 ? bounds.max.x : bounds.min.x,
                c & 2 ? bounds.max.y : bounds.min.y,
                c & 4 ? bounds.max.z : bounds.min.z,
              )
              .applyMatrix4(instanceWorld);
            if (corner.y < lowest) lowest = corner.y;
            centerX += corner.x / 8;
            centerZ += corner.z / 8;
          }
          note(owner, lowest, centerX, centerZ);
        }
        return;
      }

      if (!(object as { isMesh?: boolean }).isMesh) return;
      box.setFromObject(object);
      if (!isFinite(box.min.y)) return;
      box.getCenter(center);
      note(owner, box.min.y, center.x, center.z);
    });
  }

  /**
   * Conjuntos que NÃO precisam tocar a grama, com o motivo escrito.
   *
   * Esta lista é para ser lida com desconfiança: cada linha é uma permissão
   * para algo flutuar, e a graça da auditoria é justamente pegar o que flutua.
   * Só entra aqui o que está preso a OUTRA peça (copa no palito, estrela no
   * arco) ou o que é céu por projeto.
   */
  const AIRBORNE = new Map<string, string>([
    ['cloud', 'nuvem de marshmallow: é fundo de céu'],
    ['balloon', 'balão de ar quente'],
    ['gate-star', 'estrela presa ao arco do portal'],
    ['gate-flag', 'bandeira no alto do mastro'],
    ['tree-sorvete', 'copa, apoiada no palito'],
    ['tree-algodao', 'copa, apoiada no palito'],
    ['tree-pirulito', 'copa, apoiada no palito'],
    ['tree-cupcake', 'copa, apoiada no palito'],
    ['donut-sprinkles', 'granulado grudado no donut'],
  ]);

  const ranked = [...contacts].sort((a, b) => b[1].max - a[1].max);
  console.log('conjunto: menor folga / MAIOR folga até a grama (positivo = no ar)');
  for (const [owner, data] of ranked) {
    console.log(
      `  ${data.min >= 0 ? '+' : ''}${data.min.toFixed(2)} / ` +
        `${data.max >= 0 ? '+' : ''}${data.max.toFixed(2)} m  ${owner}` +
        `  pior em (${data.maxAt.x.toFixed(0)}, ${data.maxAt.z.toFixed(0)})`,
    );
  }

  console.log('');
  for (const [owner, data] of ranked) {
    const excuse = AIRBORNE.get(owner);
    if (excuse) {
      console.log(`  --   "${owner}" dispensado: ${excuse}`);
      continue;
    }
    if (owner === '(sem nome)') {
      // Sobram aqui as peças presas a outras (cesta e cordas do balão, disco do
      // pirulito, plateia, forminha do cupcake) e os doces espalhados. Ainda
      // não dá para cobrar contato delas sem nome próprio.
      console.log(`  --   "(sem nome)" ainda é um balde misto; falta nomear as peças presas`);
      continue;
    }
    check(
      `"${owner}" encosta no chão`,
      data.min <= 0.35,
      `menor folga ${data.min.toFixed(2)} m` +
        (data.min > 0.35 ? ` em (${data.minAt.x.toFixed(0)}, ${data.minAt.z.toFixed(0)})` : ''),
    );
  }
}

console.log(`\n${failures === 0 ? 'TUDO OK' : `${failures} FALHA(S)`}\n`);
// Sem `process` aqui: o projeto não tem `@types/node` instalado, e uma exceção
// já faz o Node sair com código diferente de zero — que é tudo o que um banco
// de provas precisa para reprovar.
if (failures > 0) throw new Error(`${failures} verificação(ões) de cenário falharam`);
