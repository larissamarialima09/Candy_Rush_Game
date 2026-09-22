import { COOP } from '../config/coop';

/**
 * Um retângulo de tela, em PIXELS CSS e com origem no canto superior esquerdo —
 * as coordenadas do DOM, não as do WebGL.
 *
 * A escolha é deliberada: o HUD é HTML e precisa destes números do jeito que
 * estão. Quem converte para a origem no canto inferior esquerdo é o renderer,
 * num lugar só (`applyViewport`), e não cada chamador.
 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Proporção largura/altura desta faixa. A câmera do jogador usa esta. */
  aspect: number;
}

/**
 * Corta a tela em `count` faixas.
 *
 * Existe uma única fonte de verdade para esse corte porque o HUD de HTML e o
 * viewport do WebGL PRECISAM coincidir ao pixel. Se cada um calculasse o
 * próprio retângulo, qualquer divergência de arredondamento apareceria como um
 * velocímetro invadindo a faixa do outro jogador.
 *
 * Os retângulos são arredondados e a última faixa recebe a sobra, de modo que a
 * soma das faixas seja exatamente a tela: com altura ímpar dividida por dois,
 * arredondar as duas metades para baixo deixaria uma linha de pixels sem
 * ninguém desenhando nela.
 */
export function computeViewports(count: number, width: number, height: number): Viewport[] {
  if (count <= 1) {
    return [{ x: 0, y: 0, width, height, aspect: safeAspect(width, height) }];
  }

  const vertical = COOP.split === 'vertical';
  const gap = COOP.dividerThickness;
  const total = vertical ? width : height;
  const usable = Math.max(count, total - gap * (count - 1));
  const band = Math.floor(usable / count);

  const viewports: Viewport[] = [];
  let cursor = 0;

  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const size = last ? total - cursor : band;

    const rect = vertical
      ? { x: cursor, y: 0, width: size, height }
      : { x: 0, y: cursor, width, height: size };

    viewports.push({ ...rect, aspect: safeAspect(rect.width, rect.height) });
    cursor += size + gap;
  }

  return viewports;
}

/**
 * Graus de campo de visão a somar nesta configuração de tela.
 *
 * A câmera perspectiva do three.js define o FOV na VERTICAL. Cortar a tela ao
 * meio na horizontal corta junto o quanto se enxerga à frente, e a corrida fica
 * claustrofóbica exatamente onde se precisa ver longe. O bônus devolve parte
 * disso.
 *
 * No corte vertical o problema não existe — a altura de cada faixa é a mesma da
 * tela cheia — então lá o bônus é zero.
 */
export function fovBonusFor(playerCount: number): number {
  if (playerCount <= 1 || COOP.split === 'vertical') return 0;
  return COOP.fovBonus;
}

function safeAspect(width: number, height: number): number {
  return height > 0 ? width / height : 1;
}
