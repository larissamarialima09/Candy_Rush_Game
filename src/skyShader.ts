import {
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
} from 'three';

export const HORIZON_COLOR = 0xffe6f4;

export function createSky(scene: Scene): Group {
  const root = new Group();
  root.name = 'sky';

  const material = new ShaderMaterial({
    side: BackSide,
    fog: false,
    toneMapped: false,
    depthWrite: false,
    uniforms: {
      topColor: { value: new Color(0x7fc9ff) },
      midColor: { value: new Color(0xc8dcff) },
      horizonColor: { value: new Color(HORIZON_COLOR) },
      moonColor: { value: new Color(0xffffff) },
      candyGlow: { value: new Color(0xff8fc8) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDirection;

      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 moonColor;
      uniform vec3 candyGlow;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float starField(vec3 dir) {
        vec2 uv = vec2(
          atan(dir.z, dir.x) * 0.15915494 + 0.5,
          asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5
        );
        vec2 grid = floor(uv * vec2(280.0, 120.0));
        float rnd = hash(grid);
        float star = smoothstep(0.986, 1.0, rnd);
        float twinkle = 0.45 + 0.55 * hash(grid + 17.0);
        return star * twinkle * smoothstep(-0.05, 0.45, dir.y);
      }

      void main() {
        vec3 dir = normalize(vWorldDirection);
        float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 sky = mix(horizonColor, midColor, smoothstep(0.04, 0.46, height));
        sky = mix(sky, topColor, smoothstep(0.42, 0.95, height));

        float horizonGlow = exp(-pow((height - 0.18) * 6.5, 2.0));
        sky += candyGlow * horizonGlow * 0.10;

        vec3 moonDir = normalize(vec3(-0.38, 0.52, -0.72));
        float moonDisk = smoothstep(0.9986, 0.9995, dot(dir, moonDir));
        float moonHalo = pow(max(dot(dir, moonDir), 0.0), 42.0);
        sky += moonColor * moonDisk * 0.55;
        sky += moonColor * moonHalo * 0.10;

        float stars = starField(dir);
        sky += vec3(1.0, 0.64, 0.86) * stars * 0.16;

        float vignette = smoothstep(-0.25, 0.85, dir.y);
        sky *= mix(0.98, 1.05, vignette);

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const sky = new Mesh(new SphereGeometry(900, 48, 28), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  root.add(sky);
  scene.add(root);
  return root;
}

