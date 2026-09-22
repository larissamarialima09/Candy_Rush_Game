import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

export function createMeadowTexture(): Texture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const base = context.createLinearGradient(0, 0, 512, 512);
  base.addColorStop(0, '#d7f5be');
  base.addColorStop(0.48, '#bfe596');
  base.addColorStop(1, '#e9f8d4');
  context.fillStyle = base;
  context.fillRect(0, 0, 512, 512);

  context.globalAlpha = 0.35;
  for (let y = -96; y < 608; y += 64) {
    context.fillStyle = y % 128 === 0 ? '#cceead' : '#eefad9';
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(512, y + 84);
    context.lineTo(512, y + 118);
    context.lineTo(0, y + 34);
    context.closePath();
    context.fill();
  }

  for (let i = 0; i < 4200; i++) {
    const alpha = 0.05 + Math.random() * 0.08;
    context.fillStyle = Math.random() > 0.5
      ? `rgba(74, 137, 69, ${alpha})`
      : `rgba(255, 255, 245, ${alpha})`;
    context.fillRect(Math.random() * 512, Math.random() * 512, 1.4, 1.4);
  }

  context.lineCap = 'round';
  for (let i = 0; i < 360; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const length = 4 + Math.random() * 8;
    const angle = -0.7 + Math.random() * 0.35;
    context.strokeStyle = Math.random() > 0.45 ? '#95cf73' : '#ecfad5';
    context.globalAlpha = 0.32 + Math.random() * 0.22;
    context.lineWidth = 1 + Math.random() * 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }

  const flowerColors = ['#fff3a8', '#ffc7dd', '#d6c4ff', '#ffffff'];
  for (let i = 0; i < 58; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 1.5 + Math.random() * 2.3;
    context.fillStyle = flowerColors[i % flowerColors.length];
    context.globalAlpha = 0.6;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}