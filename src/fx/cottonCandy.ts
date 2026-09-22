import { LatheGeometry, MeshStandardMaterial, Vector2 } from 'three';

/**
 * Algodão-doce de verdade: fibra, relevo e açúcar contra a luz.
 *
 * Uma montanha de algodão-doce feita de esferas lisas parece plástico, por um
 * motivo simples: algodão-doce não tem SUPERFÍCIE, tem fiapo. O que o olho
 * reconhece são mechas finas de açúcar puxadas na vertical, tufos macios de
 * escalas diferentes empilhados, e a borda acendendo quando a luz atravessa o
 * fio. Nada disso cabe numa textura de canvas repetida — repetição em objeto
 * grande vira padrão visível, e padrão visível mata a ilusão de macio.
 *
 * Então é shader. Três camadas de ruído fbm, todas derivadas da MESMA função,
 * em escalas diferentes:
 *
 *   1. no vértice, para o contorno: empurra a malha ao longo da normal e
 *      transforma um cone liso em tufo irregular. É o que se vê contra o céu.
 *   2. no fragmento, para o relevo: a INCLINAÇÃO do ruído vira perturbação da
 *      normal, então a luz quebra em mil sombrinhas e a superfície fica felpuda
 *      sem custar um único triângulo a mais.
 *   3. no fragmento, para a cor: um ruído esticado na vertical desenha as
 *      mechas, e um ruído largo mistura as duas cores em rodamoinho, como
 *      algodão rosa e azul enrolados no mesmo palito.
 *
 * Por cima disso, um brilho de contorno (fresnel) e cintilas de açúcar.
 *
 * O ruído é amostrado em coordenadas de MUNDO. Duas consequências, as duas
 * desejadas aqui: cada montanha ganha de graça um padrão diferente, porque
 * está num lugar diferente; e o padrão fica preso ao mundo, não ao objeto.
 * Isso só valeria para algo parado — num objeto que se move a fibra escorrega
 * pela superfície. Montanha não anda, então serve.
 *
 * Custo: nenhuma textura, nenhum alvo de render, nenhum uniforme extra. As
 * constantes são coladas no GLSL na hora de compilar. Importa nesta máquina.
 */

export interface CottonCandyOptions {
  /** Cor dominante do tufo. */
  base: number;
  /** Segunda cor, que aparece nos rodamoinhos. */
  swirl: number;
  /** Cor do brilho de contorno — o açúcar aceso contra a luz. */
  rim: number;
  /**
   * Tamanho do tufo grande, em metros. É a escala que dá o formato irregular:
   * valores altos = poucos tufos gordos, valores baixos = espuma miúda.
   */
  puffMeters?: number;
  /** Largura da mecha fina, em metros. Menor = fibra mais penteada. */
  fiberMeters?: number;
  /** Quanto o vértice é empurrado ao longo da normal, em metros. */
  relief?: number;
  /** Força do felpudo por pixel. Acima de ~1.5 vira areia, não açúcar. */
  fuzz?: number;
  /** Força do brilho de contorno. */
  rimStrength?: number;
}

/**
 * Ruído de valor em 3D com interpolação suave, e o fbm de quatro oitavas
 * construído em cima dele. É o único gerador do arquivo: contorno, relevo e
 * cor saem todos daqui, o que mantém as três camadas coerentes entre si.
 */
const NOISE_GLSL = `
float ccHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float ccNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(ccHash(i + vec3(0.0, 0.0, 0.0)), ccHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(ccHash(i + vec3(0.0, 1.0, 0.0)), ccHash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y),
    mix(
      mix(ccHash(i + vec3(0.0, 0.0, 1.0)), ccHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(ccHash(i + vec3(0.0, 1.0, 1.0)), ccHash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y),
    f.z);
}

float ccFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * ccNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;

/**
 * Material de algodão-doce.
 *
 * A cor do material é forçada em branco e a cor real é aplicada dentro do
 * shader. É proposital: assim existe UM lugar só que decide a cor de cada
 * pixel (o rodamoinho), em vez de a cor do material e a do shader se
 * multiplicarem e escurecerem o tufo sem ninguém entender por quê.
 */
export function createCottonCandyMaterial(options: CottonCandyOptions): MeshStandardMaterial {
  const puffMeters = options.puffMeters ?? 7.0;
  const fiberMeters = options.fiberMeters ?? 0.85;
  const relief = options.relief ?? 0.85;
  const fuzz = options.fuzz ?? 0.85;
  const rimStrength = options.rimStrength ?? 0.5;

  // O ruído é indexado por FREQUÊNCIA (1/metro), mas quem ajusta pensa em
  // tamanho de tufo. A conversão fica aqui, uma vez, e não espalhada no GLSL.
  const puffFrequency = 1 / Math.max(0.05, puffMeters);
  const fiberFrequency = 1 / Math.max(0.02, fiberMeters);

  const material = new MeshStandardMaterial({
    color: 0xffffff,
    // Açúcar fiado é o oposto de laqueado: espalha a luz em vez de refleti-la.
    roughness: 0.95,
    metalness: 0,
    emissive: options.base,
    emissiveIntensity: 0.06,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${NOISE_GLSL}
varying vec3 vCcWorld;
varying vec3 vCcWorldNormal;`,
      )
      // O empurrão acontece ANTES de a posição virar coordenada de tela, e usa
      // a posição de objeto como semente para o tufo não escorregar se o grupo
      // inteiro for reposicionado durante a montagem do cenário.
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float ccLift = (ccFbm(position * ${puffFrequency.toFixed(5)}) - 0.5) * ${relief.toFixed(4)};
transformed += objectNormal * ccLift;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vCcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vCcWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${NOISE_GLSL}
varying vec3 vCcWorld;
varying vec3 vCcWorldNormal;`,
      )
      // Felpudo: a inclinação do ruído vira desvio da normal. O gradiente sai
      // em espaço de MUNDO, e `normal` aqui está em espaço de VISTA — sem
      // passar um pelo outro com a viewMatrix, a luz do felpudo apontaria para
      // um lado enquanto a montanha aponta para outro.
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
{
  vec3 ccP = vCcWorld * ${fiberFrequency.toFixed(5)};
  float ccCenter = ccFbm(ccP);
  vec3 ccGradient = vec3(
    ccFbm(ccP + vec3(0.35, 0.0, 0.0)) - ccCenter,
    ccFbm(ccP + vec3(0.0, 0.35, 0.0)) - ccCenter,
    ccFbm(ccP + vec3(0.0, 0.0, 0.35)) - ccCenter);
  vec3 ccGradientView = (viewMatrix * vec4(ccGradient, 0.0)).xyz;
  normal = normalize(normal - ccGradientView * ${(fuzz * 6.0).toFixed(4)});
}`,
      )
      // Cor: rodamoinho largo entre as duas cores, e por cima dele as mechas,
      // que são o MESMO ruído com a coordenada achatada na vertical — achatar
      // o eixo Y faz cada tufo de ruído virar um fio puxado para cima.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float ccSwirl = ccFbm(vCcWorld * ${(puffFrequency * 0.85).toFixed(5)});
  vec3 ccTint = mix(
    vec3(${glslColor(options.base)}),
    vec3(${glslColor(options.swirl)}),
    smoothstep(0.34, 0.70, ccSwirl));

  vec3 ccFiberCoord = vCcWorld * ${fiberFrequency.toFixed(5)};
  ccFiberCoord.y *= 0.22;
  float ccFiber = ccFbm(ccFiberCoord);
  ccTint *= 0.88 + 0.30 * smoothstep(0.30, 0.82, ccFiber);

  diffuseColor.rgb *= ccTint;
}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `{
  // Fresnel: o açúcar é meio translúcido, então a borda acende quando a
  // superfície se vira de lado para a câmera. É o que separa um tufo macio
  // de uma pedra pintada de rosa.
  vec3 ccView = normalize(cameraPosition - vCcWorld);
  float ccRim = pow(1.0 - clamp(dot(normalize(vCcWorldNormal), ccView), 0.0, 1.0), 2.2);
  outgoingLight += ccRim * vec3(${glslColor(options.rim)}) * ${rimStrength.toFixed(4)};

  // Cristais de açúcar: pontinhos isolados de ruído bem fino.
  float ccSparkle = ccNoise(vCcWorld * 19.0);
  outgoingLight += smoothstep(0.88, 0.99, ccSparkle) * vec3(1.0, 0.97, 0.99) * 0.28;
}
#include <dithering_fragment>`,
      );
  };

  // Sem isto o Three reaproveita o programa já compilado de OUTRO algodão-doce
  // e as duas montanhas saem com a mesma cor, porque as cores estão coladas no
  // texto do shader em vez de virem por uniforme.
  material.customProgramCacheKey = () =>
    `cotton-${options.base}-${options.swirl}-${options.rim}-${puffMeters}-${fiberMeters}-${relief}-${fuzz}-${rimStrength}`;

  return material;
}

/**
 * Perfil de um pico de algodão-doce, torneado em torno do eixo Y.
 *
 * Um cone comum não serve: algodão-doce enrolado no palito é gordo embaixo,
 * quase reto no meio e arredonda no topo, sem ponta. O perfil abaixo é essa
 * silhueta, e o relevo do shader se encarrega de quebrar a regularidade.
 *
 * Fica sem tampa embaixo de propósito — a base encosta no chão, e uma tampa
 * que ninguém vê ainda assim custaria triângulos e sombra.
 */
export function createCottonPeakGeometry(
  radius: number,
  height: number,
  radialSegments = 40,
): LatheGeometry {
  /** Pares (fração da altura, fração do raio), da base ao topo. */
  const profile: readonly (readonly [number, number])[] = [
    [0.0, 1.0],
    [0.08, 0.99],
    [0.18, 0.95],
    [0.3, 0.88],
    [0.42, 0.79],
    [0.54, 0.69],
    [0.65, 0.58],
    [0.75, 0.47],
    [0.83, 0.37],
    [0.9, 0.27],
    [0.95, 0.18],
    [0.98, 0.1],
    [1.0, 0.0],
  ];

  // Cada trecho do perfil vira três pontos. Mais vértices na vertical dão ao
  // deslocamento do shader onde se apoiar: com o perfil cru, o empurrão só
  // teria treze anéis para trabalhar e o tufo sairia facetado.
  const points: Vector2[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [fromY, fromR] = profile[i];
    const [toY, toR] = profile[i + 1];
    for (let step = 0; step < 3; step++) {
      const k = step / 3;
      points.push(
        new Vector2(
          (fromR + (toR - fromR) * k) * radius,
          (fromY + (toY - fromY) * k) * height,
        ),
      );
    }
  }
  points.push(new Vector2(0, height));

  return new LatheGeometry(points, radialSegments);
}

function glslColor(hex: number): string {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return `${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}`;
}
