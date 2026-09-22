import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Texturas desenhadas em canvas na hora de subir a página.
 *
 * Todas retornam `null` fora do navegador. O banco de provas (`npm run sim`)
 * constrói o circuito inteiro no Node para caçar NaN e malha vazia, e lá não
 * existe `document`. Os materiais caem para cor lisa nesse caso.
 */
function canvas(size: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element.getContext('2d');
}

function finish(
  context: CanvasRenderingContext2D,
  repeatX: number,
  repeatY: number,
): Texture {
  const texture = new CanvasTexture(context.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Asfalto de bala: base rosa com confete pastel espalhado.
 * O confete não é enfeite — são os pontos de referência que passam voando sob
 * o kart e dizem, sem HUD nenhum, o quão rápido você está.
 */
export function createCandyTrackTexture(
  baseColor = '#f0679f',
  confetti = ['#ffffff', '#ffd7e8', '#ffc0dd'],
): Texture | null {
  const context = canvas(512);
  if (!context) return null;

  context.fillStyle = baseColor;
  context.fillRect(0, 0, 512, 512);

  // Granulado sutil, para a pista não ficar um plástico chapado.
  for (let i = 0; i < 5200; i++) {
    const alpha = 0.03 + Math.random() * 0.05;
    context.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(190,110,150,${alpha})`;
    context.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  // Confete discreto e da mesma família de cor da pista. Antes eram bolinhas
  // de todas as cores do arco-íris, o que virava ruído e roubava a leitura do
  // traçado. Na referência a pista é limpa; o colorido está em volta dela.
  for (let i = 0; i < 46; i++) {
    context.beginPath();
    context.fillStyle = confetti[i % confetti.length];
    context.globalAlpha = 0.4;
    const radius = 2.5 + Math.random() * 4;
    context.arc(Math.random() * 512, Math.random() * 512, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  return finish(context, 1, 1);
}

/**
 * Mapa de normais do asfalto de bala: confetes em ALTO-RELEVO.
 *
 * O confete já existia na textura de cor, mas cor não pega luz — de noite,
 * com uma luz rasante, um adesivo pintado e um confete de verdade são a mesma
 * coisa. Este mapa dá relevo a eles, e é o que faz a pista brilhar de forma
 * diferente conforme o kart passa.
 *
 * O relevo é calculado por Sobel sobre um campo de altura desenhado no mesmo
 * canvas, então os confetes ficam exatamente onde a textura de cor os pôs.
 */
export function createCandyNormalMap(): Texture | null {
  const context = canvas(512);
  if (!context) return null;

  // 1. Campo de altura em tons de cinza.
  context.fillStyle = '#808080';
  context.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 3 + Math.random() * 5;
    // Gradiente radial = domo suave, não um disco de bordas duras.
    const bump = context.createRadialGradient(x, y, 0, x, y, radius);
    bump.addColorStop(0, '#ffffff');
    bump.addColorStop(1, '#808080');
    context.fillStyle = bump;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // Granulado fino, para o asfalto não parecer plástico liso entre os confetes.
  const grain = context.getImageData(0, 0, 512, 512);
  for (let i = 0; i < grain.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 14;
    grain.data[i] += noise;
    grain.data[i + 1] += noise;
    grain.data[i + 2] += noise;
  }
  context.putImageData(grain, 0, 0);

  // 2. Sobel sobre a altura -> normal tangente.
  const height = context.getImageData(0, 0, 512, 512).data;
  const normals = context.createImageData(512, 512);
  const at = (x: number, y: number) =>
    height[(((y + 512) % 512) * 512 + ((x + 512) % 512)) * 4] / 255;

  /** Força do relevo. Alto demais e a pista vira lixa. */
  const strength = 2.4;

  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);

      // Normal = normalizar(-dx, -dy, 1/força), remapeada para 0..255.
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);

      const offset = (y * 512 + x) * 4;
      normals.data[offset] = ((nx / length) * 0.5 + 0.5) * 255;
      normals.data[offset + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      normals.data[offset + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      normals.data[offset + 3] = 255;
    }
  }
  context.putImageData(normals, 0, 0);

  const texture = finish(context, 1, 1);
  // Mapa de normais é dado, não cor: não pode passar pela conversão sRGB.
  texture.colorSpace = NoColorSpace;
  return texture;
}

/**
 * Espiral de pirulito. Desenhada como uma linha grossa em espiral de
 * Arquimedes: o raio cresce junto com o ângulo, que é o que dá o rodopio
 * regular. Cada volta alterna de cor.
 */
export function createSwirlTexture(
  colors = ['#ff5c96', '#ffffff', '#ffd24d', '#63d0e8'],
): Texture | null {
  const context = canvas(256);
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 256);

  const center = 128;
  const turns = 4.5;
  const maxRadius = 122;
  context.lineWidth = maxRadius / turns / 1.6;
  context.lineCap = 'round';

  for (let band = 0; band < colors.length; band++) {
    context.strokeStyle = colors[band];
    context.beginPath();
    let started = false;
    // Uma faixa por cor, deslocada meia volta da anterior.
    for (let t = 0; t <= turns * Math.PI * 2; t += 0.05) {
      const radius = (t / (turns * Math.PI * 2)) * maxRadius;
      const angle = t + (band / colors.length) * Math.PI * 2;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }

  // Bordinha branca: o disco fica com cara de bala embrulhada.
  context.strokeStyle = '#ffffff';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(center, center, maxRadius + 2, 0, Math.PI * 2);
  context.stroke();

  return finish(context, 1, 1);
}

/** Listra diagonal de bala, para as barreiras e os postes. */
export function createStripeTexture(
  colorA = '#ff8fb1',
  colorB = '#fff4f7',
): Texture | null {
  const context = canvas(128);
  if (!context) return null;

  context.fillStyle = colorB;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = colorA;
  context.lineWidth = 26;
  context.lineCap = 'butt';
  for (let x = -128; x < 256; x += 52) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 128, 128);
    context.stroke();
  }

  return finish(context, 1, 1);
}

/**
 * Bandeira quadriculada, para as bandeiras de chegada do pórtico de largada.
 *
 * `squares` conta os quadrados por LADO. Poucos quadrados graúdos leem melhor
 * de longe do que muitos pequenos, que viram um cinza chapado assim que a
 * bandeira fica do tamanho de alguns pixels na tela.
 */
export function createCheckerTexture(
  squares = 4,
  colorA = '#1d1d26',
  colorB = '#ffffff',
): Texture | null {
  const context = canvas(128);
  if (!context) return null;

  const cell = 128 / squares;
  for (let row = 0; row < squares; row++) {
    for (let column = 0; column < squares; column++) {
      context.fillStyle = (row + column) % 2 === 0 ? colorA : colorB;
      context.fillRect(column * cell, row * cell, cell, cell);
    }
  }

  return finish(context, 1, 1);
}

/**
 * Placa de letreiro: moldura de glacê, fundo rosa, bolinhas de confeito na
 * borda e o texto branco com contorno escuro — o contorno é o que mantém a
 * palavra legível de longe, contra o céu claro.
 *
 * Proporção 4:1. O plano que recebe a textura precisa ter a mesma proporção,
 * senão as letras saem esticadas.
 */
export function createSignTexture(
  text: string,
  background = '#ff5c95',
  ink = '#ffffff',
): Texture | null {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas');
  element.width = 1024;
  element.height = 256;
  const context = element.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#fff6fa';
  context.beginPath();
  context.roundRect(6, 6, 1012, 244, 72);
  context.fill();

  context.fillStyle = background;
  context.beginPath();
  context.roundRect(28, 28, 968, 200, 54);
  context.fill();

  const sprinkles = ['#ffffff', '#ffd94f', '#86d6f5', '#8fe3b4', '#c6a4f4'];
  for (let i = 0; i < 26; i++) {
    const x = 70 + (i / 25) * 884;
    context.fillStyle = sprinkles[i % sprinkles.length];
    for (const y of [46, 210]) {
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  let size = 132;
  const font = (px: number) =>
    `900 ${px}px "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", sans-serif`;
  context.font = font(size);
  while (context.measureText(text).width > 840 && size > 40) {
    size -= 4;
    context.font = font(size);
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 16;
  context.strokeStyle = '#b8245f';
  context.strokeText(text, 512, 132);
  context.fillStyle = ink;
  context.fillText(text, 512, 132);

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Chão de marshmallow: bolinhas pastel suaves sobre fundo claro.
 * Serve de referência de velocidade fora do asfalto, onde o cenário é esparso.
 */
export function createGroundTexture(): Texture | null {
  const context = canvas(256);
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 256);

  // Faixas de corte de grama, bem apagadas. Dão referência de velocidade fora
  // da pista sem virarem um padrão que rouba a atenção.
  context.fillStyle = 'rgba(228, 246, 234, 0.55)';
  for (let y = 0; y < 256; y += 64) context.fillRect(0, y, 256, 32);

  // Confeitos minúsculos. Os borrões grandes de antes viravam manchas
  // irregulares no terreno inteiro — a textura precisa ser fina para o olho
  // lê-la como superfície, e não como sujeira.
  const sprinkles = ['#d9f0e2', '#ffe6ef', '#e6ecff', '#fff3d6'];
  for (let i = 0; i < 260; i++) {
    context.globalAlpha = 0.5 + Math.random() * 0.4;
    context.fillStyle = sprinkles[i % sprinkles.length];
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const size = 1.2 + Math.random() * 2.4;
    context.beginPath();
    context.ellipse(x, y, size, size * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  return finish(context, 1, 1);
}

/**
 * Céu de mundo de doces: equiretangular, com gradiente, algodão-doce e um
 * arco-íris de bala.
 *
 * Substitui o panorama HDR que estava sendo usado. O arquivo enviado era um
 * `rooftop_night_4k` — um terraço à noite — e o que aparecia acima da cabeça
 * era a laje do prédio. Nenhum ajuste de exposição conserta isso: o conteúdo
 * da foto simplesmente não é céu, e muito menos céu de mundo de doces.
 *
 * Equiretangular quer dizer que a largura dá a volta no horizonte e a altura
 * vai do zênite (topo) ao nadir (baixo). Por isso as nuvens são achatadas
 * conforme sobem: perto do topo, cada pixel cobre muito menos céu.
 */
export function createCandySkyTexture(): Texture | null {
  const width = 1024;
  const height = 512;
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d')!;
  if (!context) return null;

  // Gradiente vertical: azul-algodão no alto, lavanda no meio, pêssego no
  // horizonte. O horizonte claro é o que faz a névoa casar com o céu.
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0.0, '#7fc7f5');
  gradient.addColorStop(0.28, '#a9d8f7');
  gradient.addColorStop(0.46, '#d3c4f2');
  gradient.addColorStop(0.58, '#ffc9de');
  gradient.addColorStop(0.68, '#ffe0d0');
  gradient.addColorStop(0.78, '#fff1e4');
  gradient.addColorStop(1.0, '#ffe8f0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  /** Um borrão macio de algodão-doce, feito de círculos sobrepostos. */
  function puff(x: number, y: number, radius: number, color: string, alpha: number): void {
    context.save();
    context.globalAlpha = alpha;
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const cx = x + Math.cos(angle) * radius * 0.55;
      const cy = y + Math.sin(angle) * radius * 0.24;
      const r = radius * (0.5 + Math.random() * 0.42);
      const blob = context.createRadialGradient(cx, cy, 0, cx, cy, r);
      blob.addColorStop(0, color);
      blob.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = blob;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // Arco-íris de bala, baixo no horizonte e bem apagado: presente sem roubar
  // a cena. Fica de um lado só, como um arco-íris de verdade.
  const bowX = width * 0.62;
  const bowY = height * 0.72;
  const bands = ['#ff9ec4', '#ffc79e', '#fff0a0', '#a9e3d0', '#9fd4f2', '#c9b6f5'];
  context.save();
  context.globalAlpha = 0.22;
  context.lineWidth = 9;
  for (let i = 0; i < bands.length; i++) {
    context.strokeStyle = bands[i];
    context.beginPath();
    context.ellipse(bowX, bowY, 190 - i * 9, 120 - i * 6, 0, Math.PI, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  // Nuvens: mais achatadas e mais claras quanto mais alto, porque o
  // equiretangular estica tudo perto do zênite.
  for (let i = 0; i < 42; i++) {
    const x = Math.random() * width;
    const v = 0.12 + Math.random() * 0.5;
    const y = v * height;
    const radius = 28 + Math.random() * 62 * (1 - v * 0.5);
    const tint = v < 0.35 ? '#ffffff' : v < 0.5 ? '#fff3fa' : '#ffd9e8';
    puff(x, y, radius, tint, 0.5 + Math.random() * 0.35);
  }

  // Confeitos brilhando no alto, onde o céu é mais escuro.
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height * 0.34;
    context.fillStyle = ['#ffffff', '#ffe9f4', '#e8f6ff'][i % 3];
    context.globalAlpha = 0.35 + Math.random() * 0.5;
    context.beginPath();
    context.arc(x, y, 0.8 + Math.random() * 1.6, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
