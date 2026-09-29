using UnityEngine;

namespace CodePop.Board
{
    /// <summary>
    /// Conjunto de sprites do tabuleiro. Para trocar a arte, basta criar outro
    /// BoardTheme (clique direito > Create > Code Pop > Board Theme) e arrastar
    /// os novos sprites, sem mexer no código.
    /// Campos marcados como "opcional" podem ficar vazios.
    /// </summary>
    [CreateAssetMenu(fileName = "BoardTheme", menuName = "Code Pop/Board Theme")]
    public class BoardTheme : ScriptableObject
    {
        [Header("Piso e parede")]
        public Sprite floor;
        public Sprite wall;

        [Header("Doces (cada um com forma diferente)")]
        public Sprite candyHeart;
        public Sprite candyStar;
        public Sprite candyDrop;

        [Header("Moldura com cobertura rosa (opcional)")]
        [Tooltip("Sprite da moldura. Se tiver bordas 9-slice definidas no Sprite Editor, estica sem deformar os cantos.")]
        public Sprite frame;
        [Tooltip("Espessura da moldura, em casas. Com 9-slice, a borda do sprite é ajustada para ter essa espessura.")]
        public float framePadding = 0.55f;

        [Header("Peças de borda ao redor do grid (opcionais)")]
        public Sprite borderTop;
        public Sprite borderBottom;
        public Sprite borderLeft;
        public Sprite borderRight;
        public Sprite cornerTopLeft;
        public Sprite cornerTopRight;
        public Sprite cornerBottomLeft;
        public Sprite cornerBottomRight;

        public bool HasBorderPieces =>
            borderTop || borderBottom || borderLeft || borderRight ||
            cornerTopLeft || cornerTopRight || cornerBottomLeft || cornerBottomRight;

        public Sprite GetCandySprite(CandyType type)
        {
            switch (type)
            {
                case CandyType.Heart: return candyHeart;
                case CandyType.Star: return candyStar;
                default: return candyDrop;
            }
        }
    }
}
