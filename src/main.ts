import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { measureSteerSign, RacerController } from './rivals/racerController';
import { ChaseCamera } from './camera/chaseCamera';
import { CENTERLINE, CIRCUIT } from './config/circuit';
import { CONTROLS, CONTROLS_COOP_P1, CONTROLS_COOP_P2 } from './config/controls';
import { COOP } from './config/coop';
import { KART } from './config/kart';
import { LIGHTING } from './config/lighting';
import { QUALITY } from './config/quality';
import { RACE } from './config/race';
import { TRACK } from './config/track';
import { RaceDirector, type Competitor } from './race/raceDirector';
import { FinishScreen, type SeriesStanding } from './ui/finishScreen';
import { checkWebGL, installErrorOverlay } from './core/errorOverlay';
import { GameLoop } from './core/gameLoop';
import { GameState } from './core/gameState';
import { Input } from './core/input';
import { degToRad } from './core/mathUtils';
import { computeViewports, fovBonusFor, type Viewport } from './core/splitScreen';
import { PlayerHud } from './ui/playerHud';
import { KartEffects } from './fx/kartEffects';
import { ParticleSystem } from './fx/particleSystem';
import { SkidMarks } from './fx/skidMarks';
import { createSky, HORIZON_COLOR } from './skyShader';
import { Audience } from './track/audience';
import { BarrierSystem } from './track/barriers';
import { CandyObstacles } from './track/candyObstacles';
import { CandySigns } from './track/candySigns';
import { JellyBlobs } from './track/jellyBlobs';
import { SpeedRamp } from './track/speedRamp';
import { CandyProps } from './track/candyProps';
import { CircuitPath } from './track/circuitPath';
import { CircuitScenery } from './track/circuitScenery';
import { CircuitSurface } from './track/circuitSurface';
import { Coins } from './track/coins';
import { FlatGroundView } from './track/flatGround';
import { LapTracker } from './track/lapTracker';
import { Terrain } from './track/terrain';
import { createMeadowTexture } from './track/meadowTexture';
import { TrackSurface } from './track/trackSurface';
import { DebugHud } from './ui/debugHud';
import { Screens } from './ui/screens';
import { Kart } from './vehicle/kart';
import { KartView, rivalPalette } from './vehicle/kartView';


class CandyMusic {
  private context: AudioContext | null = null;
  private step = 0;
  private playing = false;
  private readonly notes = [523.25, 659.25, 783.99, 1046.5, 880, 783.99, 659.25, 587.33] as const;
  private readonly bass = [261.63, 329.63, 392, 329.63] as const;

  start(): void {
    if (this.playing) return;
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) return;
    this.context ??= new AudioCtor();
    void this.context.resume();
    this.playing = true;
    this.schedule();
  }

  private schedule(): void {
    if (!this.playing || !this.context) return;
    const now = this.context.currentTime;
    this.playNote(this.notes[this.step % this.notes.length], now, 0.105, 'triangle', 0.05);
    if (this.step % 2 === 0) {
      this.playNote(this.bass[Math.floor(this.step / 2) % this.bass.length], now, 0.18, 'sine', 0.032);
    }
    this.step++;
    window.setTimeout(() => this.schedule(), 185);
  }

  private playNote(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }
}

const SERIES_HEATS = 2;

class RaceSeries {
  private readonly totals = new Map<
    string,
    { name: string; isPlayer: boolean; points: number; wins: number; lastPosition: number }
  >();
  heat = 1;

  constructor(private readonly heatCount: number) {}

  reset(competitors: readonly Competitor[]): void {
    this.heat = 1;
    this.totals.clear();
    for (const competitor of competitors) this.ensure(competitor);
  }

  record(competitors: readonly Competitor[]): readonly SeriesStanding[] {
    const ordered = [...competitors].sort((a, b) => a.position - b.position);
    for (let i = 0; i < ordered.length; i++) {
      const competitor = ordered[i];
      const total = this.ensure(competitor);
      total.points += ordered.length - i;
      total.wins += i === 0 ? 1 : 0;
      total.lastPosition = i + 1;
    }
    return this.standings();
  }

  advance(): void {
    this.heat = Math.min(this.heat + 1, this.heatCount);
  }

  get isComplete(): boolean {
    return this.heat >= this.heatCount;
  }

  private ensure(competitor: Competitor) {
    const existing = this.totals.get(competitor.name);
    if (existing) return existing;

    const entry = {
      name: competitor.name,
      isPlayer: competitor.isPlayer,
      points: 0,
      wins: 0,
      lastPosition: Number.MAX_SAFE_INTEGER,
    };
    this.totals.set(competitor.name, entry);
    return entry;
  }

  private standings(): readonly SeriesStanding[] {
    return [...this.totals.values()]
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.wins !== b.wins) return b.wins - a.wins;
        if (a.lastPosition !== b.lastPosition) return a.lastPosition - b.lastPosition;
        return a.name.localeCompare(b.name);
      })
      .map((entry, index) => ({
        name: entry.name,
        isPlayer: entry.isPlayer,
        position: index + 1,
        points: entry.points,
        wins: entry.wins,
      }));
  }
}
// Antes de qualquer outra coisa: se algo abaixo estourar, o erro tem que
// aparecer na tela. Um canvas que quebra na primeira linha Ã© indistinguÃ­vel de
// um servidor fora do ar.
installErrorOverlay();
if (!checkWebGL()) throw new Error('WebGL indisponÃ­vel');

const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas #viewport nao encontrado');

function applyCircuitVisualTuning(): void {
  (TRACK as unknown as { runoffWidth: number }).runoffWidth = 5.5;
  (QUALITY as unknown as { terrainCellSize: number }).terrainCellSize = Math.min(
    QUALITY.terrainCellSize,
    4,
  );

  const colors = CIRCUIT.colors as unknown as { runoff: number; grass: number };
  colors.runoff = 0xffd7e8;
  colors.grass = 0xc5e9a7;
}

function applyFlatGroundTexture(flatGround: FlatGroundView): void {
  flatGround.root.position.y = -0.34;

  const texture = createMeadowTexture();
  if (!texture) return;
  const repeat = QUALITY.horizonPlaneSize / 20;
  texture.repeat.set(repeat, repeat);

  flatGround.root.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
    child.material.color.set(0xc5e9a7);
    child.material.map = texture;
    child.material.roughness = 0.92;
    child.material.needsUpdate = true;
  });
}



function applyLightingTuning(): void {
  const hemisphere = LIGHTING.hemisphere as unknown as {
    skyColor: number;
    groundColor: number;
    intensity: number;
  };
  hemisphere.skyColor = 0xd8edff;
  hemisphere.groundColor = 0xffd9ef;
  hemisphere.intensity = 1.65;

  const sunConfig = LIGHTING.sun as unknown as { color: number; intensity: number };
  sunConfig.color = 0xfff4dc;
  sunConfig.intensity = 2.35;

  const rimConfig = LIGHTING.rim as unknown as { color: number; intensity: number };
  rimConfig.color = 0xbfdfff;
  rimConfig.intensity = 1.05;

  const lamp = LIGHTING.kartLamp as unknown as { color: number; intensity: number };
  lamp.color = 0xffb7dc;
  lamp.intensity = 4.6;

  const shadows = LIGHTING.shadows as unknown as { normalBias: number };
  shadows.normalBias = 0.055;

  (LIGHTING as unknown as { exposure: number }).exposure = 1.05;
}
function applyDrivingTuning(): void {
  const chassis = KART.chassis as unknown as {
    centerOfMass: { y: number; z: number };
    angularDamping: number;
  };
  chassis.centerOfMass.y = -0.24;
  chassis.centerOfMass.z = -0.12;
  chassis.angularDamping = 0.75;

  const tires = KART.tires as unknown as {
    frontGrip: number;
    rearGrip: number;
    longitudinalGrip: number;
    tireMassShare: number;
  };
  tires.frontGrip = 1.75;
  tires.rearGrip = 1.85;
  tires.longitudinalGrip = 2.25;
  tires.tireMassShare = 0.27;

  const steering = KART.steering as unknown as {
    maxAngleDegrees: number;
    highSpeedFactor: number;
    falloffSpeed: number;
    turnRate: number;
    returnRate: number;
  };
  steering.maxAngleDegrees = 30;
  steering.highSpeedFactor = 0.46;
  steering.falloffSpeed = 30;
  steering.turnRate = 7;
  steering.returnRate = 10;

  const handbrake = KART.handbrake as unknown as {
    rearGripMultiplier: number;
    rearBrakeForce: number;
  };
  handbrake.rearGripMultiplier = 0.62;
  handbrake.rearBrakeForce = 450;

  const engine = KART.engine as unknown as {
    maxDriveForce: number;
    powerCutoffSpeed: number;
  };
  engine.maxDriveForce = 1880;
  engine.powerCutoffSpeed = 35;

  const brakes = KART.brakes as unknown as {
    rollingResistance: number;
    engineBraking: number;
  };
  brakes.rollingResistance = 6;
  brakes.engineBraking = 7;

  const aero = KART.aero as unknown as {
    dragCoefficient: number;
    downforceCoefficient: number;
  };
  aero.dragCoefficient = 1.45;
  aero.downforceCoefficient = 2.35;
}
applyCircuitVisualTuning();
applyLightingTuning();
applyDrivingTuning();

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = LIGHTING.exposure;
renderer.shadowMap.enabled = LIGHTING.shadows.enabled;
renderer.shadowMap.type = PCFSoftShadowMap;

// Como `scene.background` Ã© uma cor, o three limpa a faixa sozinho no comeÃ§o de
// cada passada, respeitando a tesoura. O que ele NÃƒO limpa Ã© a folga entre as
// faixas, que nÃ£o pertence a nenhum viewport â€” por isso `renderScene` faz uma
// limpeza de tela cheia antes de tudo, e a cor do horizonte fica definida aqui
// para essa limpeza pintar cÃ©u, e nÃ£o uma tarja preta.
renderer.setClearColor(HORIZON_COLOR, 1);

const scene = new Scene();
scene.background = new Color(HORIZON_COLOR);
scene.fog = new Fog(HORIZON_COLOR, LIGHTING.fog.near, LIGHTING.fog.far);
createSky(scene);

// --- Luzes, todas derivadas do HDR (ver config/lighting.ts) ---
scene.add(
  new HemisphereLight(
    LIGHTING.hemisphere.skyColor,
    LIGHTING.hemisphere.groundColor,
    LIGHTING.hemisphere.intensity,
  ),
);

const sun = new DirectionalLight(LIGHTING.sun.color, LIGHTING.sun.intensity);
sun.castShadow = LIGHTING.shadows.enabled;
sun.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
sun.shadow.camera.near = LIGHTING.shadows.near;
sun.shadow.camera.far = LIGHTING.shadows.far;
sun.shadow.camera.left = -LIGHTING.shadows.radius;
sun.shadow.camera.right = LIGHTING.shadows.radius;
sun.shadow.camera.top = LIGHTING.shadows.radius;
sun.shadow.camera.bottom = -LIGHTING.shadows.radius;
sun.shadow.bias = LIGHTING.shadows.bias;
sun.shadow.normalBias = LIGHTING.shadows.normalBias;
scene.add(sun);
scene.add(sun.target);

const rim = new DirectionalLight(LIGHTING.rim.color, LIGHTING.rim.intensity);
scene.add(rim);
scene.add(rim.target);

/** Converte rumo e elevaÃ§Ã£o num deslocamento a partir do kart. */
function lightOffset(
  bearing: number,
  elevationDegrees: number,
  distance: number,
  out: Vector3,
): Vector3 {
  const elevation = degToRad(elevationDegrees);
  const horizontal = Math.cos(elevation) * distance;
  return out.set(
    Math.sin(bearing) * horizontal,
    Math.sin(elevation) * distance,
    Math.cos(bearing) * horizontal,
  );
}

const _sunOffset = lightOffset(
  LIGHTING.sun.bearingRadians,
  LIGHTING.sun.elevationDegrees,
  LIGHTING.sun.distance,
  new Vector3(),
);
const _rimOffset = lightOffset(
  LIGHTING.rim.bearingRadians,
  LIGHTING.rim.elevationDegrees,
  LIGHTING.rim.distance,
  new Vector3(),
);

// Lanterna presa ao kart: Ã  noite Ã© o que mantÃ©m o carrinho e o coelho
// legÃ­veis quando passam por trechos escuros da pista.
const kartLamp = new PointLight(
  LIGHTING.kartLamp.color,
  LIGHTING.kartLamp.intensity,
  LIGHTING.kartLamp.distance,
  LIGHTING.kartLamp.decay,
);
scene.add(kartLamp);

// --- A pista ---
// Uma Ãºnica spline gera tudo: a malha que se vÃª, a superfÃ­cie contra a qual as
// rodas fazem raycast, onde ficam os portais e onde ficam as barreiras.
const circuitPath = new CircuitPath(CENTERLINE, CIRCUIT.samples, CIRCUIT.curvatureWindow);
const trackSurface = new TrackSurface(circuitPath);

const flatGround = new FlatGroundView(scene);
applyFlatGroundTexture(flatGround);
new Terrain(circuitPath, scene);
new CircuitSurface(circuitPath, scene);
const scenery = new CircuitScenery(circuitPath, scene);
new CandyProps(circuitPath, scene);
// Placas de direção, bandeiras da largada e nuvens voadoras com arco-íris.
new CandySigns(circuitPath, scene);
const audience = new Audience(scenery.grandstandAnchor, scene);
const coins = new Coins(circuitPath, scene);

const candyObstacles = new CandyObstacles(circuitPath, scene);
// Rampa de turbo depois do donut, e as geleias na última curva. As duas valem
// igual para humanos e rivais — ver as chamadas no passo fixo, adiante.
const speedRamp = new SpeedRamp(circuitPath, scene);
const jellyBlobs = new JellyBlobs(circuitPath, scene);
const particles = new ParticleSystem(scene);
const skidMarks = new SkidMarks(scene);

/**
 * Um piloto humano e tudo que pertence sÃ³ a ele.
 *
 * Coop local Ã©, no fundo, transformar cada singular em plural. O que NÃƒO vira
 * plural Ã© igualmente importante: a pista, as moedas, os obstÃ¡culos e o
 * cronÃ´metro da corrida continuam Ãºnicos, porque os dois estÃ£o correndo no
 * mesmo mundo. Duplicar o mundo seria fazer dois jogos lado a lado.
 *
 * `barriers` Ã© por jogador por um motivo especÃ­fico: o sistema guarda o Ãºltimo
 * contato num Ãºnico objeto `contact`, e os efeitos de faÃ­sca leem esse objeto.
 * Com um sÃ³ compartilhado, a raspada de um piloto acenderia faÃ­sca no kart do
 * outro.
 */
interface Player {
  readonly index: number;
  readonly name: string;
  readonly kart: Kart;
  readonly view: KartView;
  readonly camera: ChaseCamera;
  readonly lapTracker: LapTracker;
  readonly barriers: BarrierSystem;
  readonly effects: KartEffects;
  readonly hud: PlayerHud;
  /** Trocado quando o modo muda: solo e coop usam mapas de tecla diferentes. */
  input: Input;
}

const players: Player[] = [];
/**
 * Os pilotos que estao correndo agora.
 *
 * E uma lista mantida, e nao calculada sob demanda, porque ela e lida a cada
 * passo de fisica. Precisa existir antes de setPlayerCount(1), que preenche a
 * vitrine inicial do menu.
 */
const activePlayers: Player[] = [];
const director = new RaceDirector(circuitPath);
const playersContainer = requireElement('players');

/**
 * Coloca um kart no grid: fileiras atrÃ¡s da linha, alternando os lados.
 *
 * A altura vem da PISTA, nunca de um nÃºmero fixo em config â€” com elevaÃ§Ã£o, um
 * valor fixo faz o kart nascer enterrado no asfalto ou caindo do cÃ©u.
 */
const _gridPosition = new Vector3();
function placeOnGrid(target: Kart, row: number): void {
  const startIndex = circuitPath.indexAtFraction(0);
  const spacingSamples = Math.round(
    RACE.grid.rowSpacing / (circuitPath.totalLength / circuitPath.count),
  );
  // Ãndice negativo dÃ¡ a volta: a fileira 1 fica ANTES da linha de largada.
  const index =
    (startIndex - row * spacingSamples + circuitPath.count * 4) % circuitPath.count;
  const lateral = (row % 2 === 0 ? 1 : -1) * RACE.grid.lateralOffset;

  circuitPath.pointAt(index, lateral, TRACK.offTrack.respawnHeight, _gridPosition);
  const sample = circuitPath.samples[index];
  target.respawnAt(_gridPosition, Math.atan2(sample.tangent.x, sample.tangent.z));
}

// --- AdversÃ¡rios ---
const steerSign = measureSteerSign(() => new Kart(), trackSurface);
const rivals: { kart: Kart; view: KartView; controller: RacerController }[] = [];

for (let i = 0; i < RACE.rivals.length; i++) {
  const profile = RACE.rivals[i];
  const rivalKart = new Kart();
  rivals.push({
    kart: rivalKart,
    view: new KartView(rivalKart, scene, rivalPalette(profile.body, profile.fur, profile.ear)),
    controller: new RacerController(circuitPath, profile, i * 1.7, steerSign),
  });
}

/** Recoloca todo mundo no grid e zera a corrida. */
function resetRace(): void {
  // Humanos ocupam as primeiras fileiras; os rivais vÃªm atrÃ¡s. Com dois
  // pilotos na tela isso importa: largar um humano no fundo do grid deixaria
  // metade da tela olhando para a traseira dos outros durante a primeira volta.
  for (let i = 0; i < players.length; i++) placeOnGrid(players[i].kart, i);
  for (let i = 0; i < rivals.length; i++) {
    placeOnGrid(rivals[i].kart, players.length + i);
  }
  director.reset();
  skidMarks.clear();
  coins.reset();
}

const state = new GameState();
const hud = new DebugHud();
const raceSeries = new RaceSeries(SERIES_HEATS);
const finishScreen = new FinishScreen(() => {
  finishScreen.hide();
  raceSeries.reset(director.competitors);
  resetRace();
  for (const player of players) player.camera.reset(player.kart);
  state.set('racing');
});

// --- Pilotos humanos: criar, configurar e ligar no diretor de corrida ---

/**
 * Cria um piloto humano e tudo que Ã© exclusivo dele.
 *
 * O piloto 1 mantÃ©m a paleta original do jogo; do segundo em diante a cor vem
 * de `COOP.players`. Essa cor Ã© a mesma da tarja no HUD, e Ã© isso que resolve o
 * problema mais concreto da tela dividida: achar o prÃ³prio carrinho no meio do
 * pelotÃ£o sem precisar ler nada.
 */
function createPlayer(index: number): Player {
  const kart = new Kart();
  const profile = COOP.players[index] ?? COOP.players[0];
  const view =
    index === 0
      ? new KartView(kart, scene)
      : new KartView(kart, scene, rivalPalette(profile.body, profile.fur, profile.ear));

  const lapTracker = new LapTracker(circuitPath);

  return {
    index,
    name: profile.label,
    kart,
    view,
    camera: new ChaseCamera(window.innerWidth / window.innerHeight),
    lapTracker,
    barriers: new BarrierSystem(circuitPath),
    effects: new KartEffects(kart, particles),
    hud: new PlayerHud(playersContainer, index, index + 1),
    input: new Input({ keys: CONTROLS }),
  };
}

/**
 * Escolhe de onde cada piloto tira o input, agora que o nÃºmero deles Ã©
 * conhecido.
 *
 * Duas decisÃµes valem a explicaÃ§Ã£o:
 *
 * - **Sozinho**, o jogador dirige no WASD e nas setas. No coop as setas passam
 *   a ser do piloto 2; sem essa troca uma tecla comandaria dois karts.
 * - **O primeiro controle plugado vai para o piloto 2**, nÃ£o para o 1. O caso
 *   comum de coop de sofÃ¡ Ã© uma pessoa no teclado e outra no controle, e quem
 *   pega o controle Ã© normalmente quem chegou depois. Com dois controles
 *   plugados cada um fica com o seu e o teclado vira reserva dos dois.
 */
function configureInputs(): void {
  const coop = players.length > 1;
  for (const player of players) {
    const keys = coop
      ? player.index === 0
        ? CONTROLS_COOP_P1
        : CONTROLS_COOP_P2
      : CONTROLS;

    player.input = new Input({
      keys,
      gamepadIndex: coop ? (player.index === 0 ? 1 : 0) : 0,
      // Os botÃµes de toque sÃ£o um conjunto sÃ³ no HTML, entÃ£o pertencem ao
      // primeiro piloto. Coop em tela de toque nÃ£o Ã© oferecido no menu.
      touch: player.index === 0,
    });
  }
}

/**
 * Monta (ou remonta) o pelotÃ£o para um dado nÃºmero de humanos.
 *
 * Os karts dos jogadores que saem nÃ£o sÃ£o destruÃ­dos, sÃ³ escondidos: recriar
 * malha e material a cada troca de modo Ã© trabalho jogado fora numa mÃ¡quina
 * apertada, e reaproveitar mantÃ©m o tempo de troca imperceptÃ­vel.
 */
function setPlayerCount(count: number): void {
  while (players.length < count) players.push(createPlayer(players.length));

  activePlayers.length = 0;
  for (let i = 0; i < count; i++) activePlayers.push(players[i]);

  for (const player of players) {
    const active = player.index < count;
    player.view.root.visible = active;
    player.hud.root.hidden = !active;
    // Inclusive o piloto 1, que nasceu no menu sem saber quantos seriam.
    player.hud.setPlayerCount(count);
  }

  configureInputs();

  // O diretor Ã© reconstruÃ­do do zero porque a ordem dos competidores define a
  // ordem do grid, e ela muda quando o segundo piloto entra ou sai.
  director.competitors.length = 0;
  for (let i = 0; i < count; i++) {
    director.add(count > 1 ? players[i].name : 'VocÃª', players[i].kart, true, players[i].lapTracker);
  }
  for (let i = 0; i < rivals.length; i++) {
    director.add(RACE.rivals[i].name, rivals[i].kart, false);
  }

  applyCoopBudget(count);
  layoutViewports();
  raceSeries.reset(director.competitors);
}

/**
 * Ajusta o orÃ§amento grÃ¡fico ao nÃºmero de jogadores.
 *
 * A cena Ã© rasterizada uma vez POR CÃ‚MERA, entÃ£o o segundo piloto dobra o custo
 * de desenho. Derrubar o pixel ratio Ã© o Ãºnico ajuste que devolve esse custo
 * inteiro sem mexer em nada que se note Ã  primeira vista â€” e Ã© reversÃ­vel, o
 * que importa porque a pessoa pode voltar para o modo solo.
 */
function applyCoopBudget(count: number): void {
  const coop = count > 1;
  const scale = coop ? COOP.pixelRatioScale : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio) * scale);

  const shadowSize = Math.round(QUALITY.shadowMapSize * (coop ? COOP.shadowMapScale : 1));
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    // O mapa jÃ¡ alocado precisa ser jogado fora para a resoluÃ§Ã£o nova valer.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  const radius = LIGHTING.shadows.radius * (coop ? COOP.shadowRadiusScale : 1);
  sun.shadow.camera.left = -radius;
  sun.shadow.camera.right = radius;
  sun.shadow.camera.top = radius;
  sun.shadow.camera.bottom = -radius;
  sun.shadow.camera.updateProjectionMatrix();
}

/**
 * Recalcula as faixas de tela e reparte HUD e cÃ¢meras entre elas.
 *
 * Chamado na troca de modo e a cada redimensionamento â€” inclusive quando o
 * celular gira, que Ã© o caso em que a proporÃ§Ã£o muda mais bruscamente.
 */
let viewports: Viewport[] = [];
function layoutViewports(): void {
  const count = Math.max(1, activePlayers.length);
  viewports = computeViewports(count, window.innerWidth, window.innerHeight);

  for (let i = 0; i < count; i++) {
    const player = players[i];
    const viewport = viewports[i];
    player.hud.setViewport(viewport);
    player.camera.setAspect(viewport.aspect);
    player.camera.setFovBonus(fovBonusFor(count));
  }
}

const screens = new Screens(state, (playerCount) => {
  setPlayerCount(playerCount);
  resetRace();
  for (const player of players) player.camera.reset(player.kart);
  state.set('racing');
});
void screens;

const music = new CandyMusic();
window.addEventListener('pointerdown', () => music.start(), { once: true });
window.addEventListener('keydown', () => music.start(), { once: true });

// Um piloto jÃ¡ existe durante o menu: Ã© o kart que a cÃ¢mera orbita na vitrine.
setPlayerCount(1);

// O grid sÃ³ pode ser montado depois que tudo existe, porque `resetRace`
// tambÃ©m limpa marcas de pneu e moedas.
resetRace();
for (const player of players) player.camera.reset(player.kart);

const _kartPosition = new Vector3();
const _lightFocus = new Vector3();
/** Karts que o resto do mundo precisa enxergar. Reaproveitado a cada passo. */
const _humanKarts: Kart[] = [];


/** Os karts dos pilotos ativos, na ordem dos jogadores. Rascunho reaproveitado. */
function activeKarts(): Kart[] {
  _humanKarts.length = 0;
  for (const player of activePlayers) _humanKarts.push(player.kart);
  return _humanKarts;
}

const loop = new GameLoop(
  (fixedDt) => {
    const active = activePlayers;

    // O input de TODOS Ã© amostrado antes de qualquer decisÃ£o, inclusive a de
    // pausar: a tecla de pausa do piloto 2 tem que funcionar mesmo com o jogo
    // jÃ¡ congelado, senÃ£o sÃ³ quem estÃ¡ no teclado do piloto 1 consegue sair da
    // pausa.
    for (const player of active) player.input.sample();
    state.update(fixedDt);

    // Pausa e menu congelam o mundo. Ã‰ o motivo de o estado existir: sem isso
    // a fÃ­sica continuaria rodando atrÃ¡s da tela de entrada.
    let pausePressed = false;
    for (const player of active) {
      if (player.input.state.pausePressed) pausePressed = true;
    }
    if (pausePressed && !finishScreen.isVisible) state.togglePause();
    if (!state.simulates) return;

    // Passo fixo: uma amostra de input por passo, nunca por frame.
    for (const player of active) {
      player.kart.update(fixedDt, player.input.state, trackSurface);
    }

    // AdversÃ¡rios: mesma fÃ­sica, mesmo tipo de input. Eles nÃ£o trapaceiam â€”
    // se sÃ£o rÃ¡pidos, Ã© porque a fÃ­sica deles permite.
    for (const rival of rivals) {
      rival.kart.update(fixedDt, rival.controller.update(fixedDt, rival.kart), trackSurface);
    }

    candyObstacles.update(fixedDt);
    for (const player of active) candyObstacles.collide(player.kart);
    for (const rival of rivals) candyObstacles.collide(rival.kart);

    // Rampa e geleia são REGRA DE JOGO (ganhar turbo, perder velocidade), então
    // andam no passo fixo junto com o resto: com deltaTime variável, quem tem
    // mais quadros por segundo sairia da geleia mais rápido que o vizinho.
    jellyBlobs.update(fixedDt);
    for (const player of active) {
      speedRamp.collide(player.kart);
      jellyBlobs.collide(player.kart, fixedDt);
    }
    for (const rival of rivals) {
      speedRamp.collide(rival.kart);
      jellyBlobs.collide(rival.kart, fixedDt);
    }

    // Barreiras depois da integraÃ§Ã£o: corrigem posiÃ§Ã£o e velocidade jÃ¡
    // calculadas, como uma resoluÃ§Ã£o de contato. Cada humano tem o prÃ³prio
    // sistema, para o registro de contato nÃ£o ser sobrescrito pelo vizinho.
    for (const rival of rivals) active[0].barriers.update(fixedDt, rival.kart);
    for (const player of active) {
      player.barriers.update(fixedDt, player.kart);
    }

    // Coleta Ã© regra de jogo, entÃ£o anda no passo fixo: com deltaTime
    // variÃ¡vel, quem tem mais quadros por segundo pegaria moedas que outro nÃ£o.
    coins.update(fixedDt, activeKarts());

    // O diretor mede o progresso e resolve as batidas entre karts DEPOIS de
    // todos terem andado, senÃ£o quem anda primeiro colidiria contra posiÃ§Ãµes
    // velhas dos outros.
    director.update(fixedDt);
    for (const player of active) {
      player.camera.update(fixedDt, player.kart, player.kart.telemetry.offTrack);
    }

    // A corrida sÃ³ acaba quando o ÃšLTIMO humano cruza a linha. Cortar para o
    // resultado assim que o primeiro chega roubaria do outro a volta que ele
    // ainda estava correndo.
    if (director.playersFinished && !finishScreen.isVisible) {
      finishScreen.show(director.competitors, director.playerPosition, director.winner);
      state.set('paused');
    }
  },
  (alpha, frameDt) => {
    const active = activePlayers;

    if (state.name === 'menu') {
      // Vitrine: a cÃ¢mera gira em volta do kart parado enquanto o menu estÃ¡
      // aberto. Sem isso o fundo do menu Ã© uma foto congelada.
      active[0].camera.showcase(frameDt, active[0].kart);
      candyObstacles.update(frameDt);
      jellyBlobs.update(frameDt);
      coins.update(frameDt, activeKarts());
    }

    for (const player of active) {
      player.view.update(alpha);
      player.camera.applyToRender(alpha);
    }
    for (const rival of rivals) rival.view.update(alpha);

    // A caixa de sombra e as luzes seguem o PONTO MÃ‰DIO entre os humanos.
    // GrudÃ¡-las no piloto 1 faria o kart do piloto 2 perder a sombra assim que
    // os dois se separassem â€” e um carrinho sem sombra parece flutuar.
    _lightFocus.set(0, 0, 0);
    for (const player of active) {
      player.kart.body.getChassisPosition(_kartPosition);
      _lightFocus.add(_kartPosition);
    }
    _lightFocus.divideScalar(active.length);

    sun.target.position.copy(_lightFocus);
    sun.position.copy(_lightFocus).add(_sunOffset);
    rim.target.position.copy(_lightFocus);
    rim.position.copy(_lightFocus).add(_rimOffset);

    // A lanterna, essa, continua presa ao piloto 1: Ã© uma luz pontual, e uma
    // por jogador seria uma luz dinÃ¢mica a mais em cada passada de sombra.
    active[0].kart.body.getChassisPosition(_kartPosition);
    kartLamp.position.copy(_kartPosition);
    kartLamp.position.y += LIGHTING.kartLamp.offset.y;

    // Efeitos sÃ£o visuais: rodam com deltaTime variÃ¡vel, e Ã© o certo aqui.
    if (state.isRacing) {
      for (const player of active) player.effects.update(frameDt, player.barriers.contact);
      // Uma malha de marcas sÃ³ para todos: o relÃ³gio e o desbotamento valem
      // para a malha inteira, entÃ£o ela recebe os karts de uma vez.
      skidMarks.update(frameDt, activeKarts());
    }
    particles.update(frameDt, active[0].camera.camera);
    audience.update(frameDt, _kartPosition, active[0].kart.telemetry.speed);
    scenery.castle.update(frameDt);

    for (const player of active) {
      player.hud.gauge.update(player.kart, frameDt);
      player.hud.raceHud.update(player.lapTracker, player.kart, frameDt);
      player.hud.raceHud.updateCoins(
        coins.collectedByPlayer[player.index] ?? 0,
        coins.justCollectedByPlayer[player.index] ?? false,
        frameDt,
      );
    }
    hud.update(active[0].kart, loop.fps, frameDt);

    renderScene(active);
  },
);

/**
 * Desenha a cena uma vez por jogador, cada um na sua faixa.
 *
 * O `scissor` Ã© o que confina cada passada Ã  sua faixa â€” sem ele a segunda
 * passada cobriria a primeira, e sÃ³ se veria o kart do Ãºltimo jogador.
 *
 * A limpeza de tela cheia no comeÃ§o existe para a FOLGA entre as faixas: o
 * three limpa cada faixa sozinho ao desenhar o fundo da cena, mas a faixa de
 * separaÃ§Ã£o nÃ£o pertence a nenhum viewport e ficaria com o lixo do quadro
 * anterior â€” um borrÃ£o do cenÃ¡rio passando, bem no meio da tela.
 */
function renderScene(active: readonly Player[]): void {
  const height = window.innerHeight;

  renderer.setScissorTest(false);
  renderer.clear();

  if (active.length === 1) {
    renderer.setViewport(0, 0, window.innerWidth, height);
    renderer.render(scene, active[0].camera.camera);
    return;
  }

  renderer.setScissorTest(true);
  for (let i = 0; i < active.length; i++) {
    const viewport = viewports[i];
    // O DOM conta a partir do topo e o WebGL a partir da base. A conversÃ£o
    // acontece sÃ³ aqui, num lugar, para o resto do jogo raciocinar em
    // coordenadas de tela.
    const bottom = height - (viewport.y + viewport.height);
    renderer.setViewport(viewport.x, bottom, viewport.width, viewport.height);
    renderer.setScissor(viewport.x, bottom, viewport.width, viewport.height);
    renderer.render(scene, active[i].camera.camera);
  }
  renderer.setScissorTest(false);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  layoutViewports();
});

loop.start();


function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} nao encontrado`);
  return element;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}




