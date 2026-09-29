using UnityEngine;

namespace CandyRush
{
    /// <summary>Uma faixa de tela, em pixels, origem no canto superior esquerdo (core/splitScreen.ts).</summary>
    public struct Viewport
    {
        public float X, Y, Width, Height, Aspect;
    }

    /// <summary>
    /// Corta a tela em `count` faixas para o coop local. Fonte única de verdade
    /// para o corte: o HUD desenhado em OnGUI e o `Camera.rect` de cada jogador
    /// usam o MESMO retângulo, senão um velocímetro pode invadir a faixa do
    /// outro jogador por causa de arredondamento divergente.
    /// </summary>
    public static class SplitScreen
    {
        public static Viewport[] ComputeViewports(int count, float width, float height)
        {
            if (count <= 1)
            {
                return new[] { new Viewport { X = 0, Y = 0, Width = width, Height = height, Aspect = SafeAspect(width, height) } };
            }

            bool vertical = CoopConfig.SplitVertical;
            float gap = CoopConfig.DividerThickness;
            float total = vertical ? width : height;
            float usable = Mathf.Max(count, total - gap * (count - 1));
            float band = Mathf.Floor(usable / count);

            var viewports = new Viewport[count];
            float cursor = 0;
            for (int i = 0; i < count; i++)
            {
                bool last = i == count - 1;
                float size = last ? total - cursor : band;

                var v = vertical
                    ? new Viewport { X = cursor, Y = 0, Width = size, Height = height }
                    : new Viewport { X = 0, Y = cursor, Width = width, Height = size };
                v.Aspect = SafeAspect(v.Width, v.Height);
                viewports[i] = v;
                cursor += size + gap;
            }
            return viewports;
        }

        /// <summary>
        /// Bônus de FOV vertical para o corte horizontal, que rouba a distância
        /// enxergada à frente — o corte vertical não perde altura, então não
        /// precisa de bônus.
        /// </summary>
        public static float FovBonusFor(int playerCount)
        {
            if (playerCount <= 1 || CoopConfig.SplitVertical) return 0;
            return CoopConfig.FovBonus;
        }

        static float SafeAspect(float width, float height) => height > 0 ? width / height : 1;
    }
}
