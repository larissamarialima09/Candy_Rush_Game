import type { MeshStandardMaterial } from 'three';

/**
 * "Cobertura de bala" para um material padrão: um degradê de cor pela altura
 * no mundo e um brilho de borda que acende conforme a superfície se vira de
 * lado para a câmera. É o que dá cara de doce laqueado sem textura nenhuma.
 *
 * Compartilhado entre o cenário do circuito e o castelo.
 */
export function addCandyCoat<T extends MeshStandardMaterial>(
  material: T,
  topTint: number,
  bottomTint: number,
  rimPower: number,
): T {
  const top = glslColor(topTint);
  const bottom = glslColor(bottomTint);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCandyWorldPosition;
varying vec3 vCandyWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vCandyWorldPosition = worldPosition.xyz;
vCandyWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCandyWorldPosition;
varying vec3 vCandyWorldNormal;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float candyHeight = clamp((vCandyWorldPosition.y + 1.5) / 12.0, 0.0, 1.0);
vec3 candyTint = mix(vec3(${bottom}), vec3(${top}), candyHeight);
vec3 candyView = normalize(cameraPosition - vCandyWorldPosition);
float candyRim = pow(1.0 - max(0.0, dot(normalize(vCandyWorldNormal), candyView)), 2.0);
outgoingLight = mix(outgoingLight, outgoingLight * candyTint, 0.18);
outgoingLight += candyRim * vec3(${top}) * ${rimPower.toFixed(3)};
#include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `candy-coat-${topTint}-${bottomTint}-${rimPower}`;
  return material;
}

function glslColor(hex: number): string {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return `${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}`;
}
