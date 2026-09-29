using System;
using System.Collections.Generic;
using CodePop.Levels;
using UnityEngine;

namespace CodePop.Board
{
    /// <summary>
    /// Monta o tabuleiro na cena a partir de um LevelData e responde perguntas
    /// sobre ele: "essa casa é parede?", "tem doce aqui?", "onde fica essa casa no mundo?".
    /// O tabuleiro fica centralizado na posição deste GameObject.
    /// </summary>
    public class GridManager : MonoBehaviour
    {
        [Tooltip("Sprites do tabuleiro (ScriptableObject BoardTheme).")]
        [SerializeField] private BoardTheme theme;

        [Tooltip("Tamanho de cada casa em unidades do mundo.")]
        [SerializeField] private float cellSize = 1f;

        [Tooltip("Tamanho do doce em relação à casa (1 = casa inteira).")]
        [SerializeField, Range(0.3f, 1f)] private float candyFill = 0.7f;

        [Tooltip("Leve sobreposição do piso para não aparecer frestas entre as casas.")]
        [SerializeField, Range(1f, 1.1f)] private float floorOverlap = 1.02f;

        public LevelData Level { get; private set; }
        public float CellSize => cellSize;
        public int Width => Level != null ? Level.Width : 0;
        public int Height => Level != null ? Level.Height : 0;

        /// <summary>Área ocupada pelo tabuleiro (com moldura), usada para enquadrar a câmera.</summary>
        public Bounds WorldBounds { get; private set; }

        /// <summary>Quantos doces ainda faltam pegar.</summary>
        public int RemainingCandies => candies.Count;

        /// <summary>Disparado quando um doce é pego (casa, tipo).</summary>
        public event Action<Vector2Int, CandyType> CandyPicked;

        // Doces ainda no tabuleiro, por casa.
        private readonly Dictionary<Vector2Int, (CandyType type, GameObject obj)> candies =
            new Dictionary<Vector2Int, (CandyType, GameObject)>();

        private Transform tilesRoot;
        private Transform candiesRoot;

        // ------------------------------------------------------------------
        // Montagem
        // ------------------------------------------------------------------

        /// <summary>Apaga o tabuleiro anterior e monta um novo a partir da fase.</summary>
        public void Build(LevelData level)
        {
            if (theme == null)
            {
                Debug.LogError("[GridManager] Nenhum BoardTheme foi arrastado para o campo 'Theme' no Inspector.", this);
                return;
            }

            Clear();
            Level = level;

            tilesRoot = new GameObject("Tiles").transform;
            tilesRoot.SetParent(transform, false);
            candiesRoot = new GameObject("Candies").transform;
            candiesRoot.SetParent(transform, false);

            BuildTiles();
            BuildBorder();
            BuildFrame();
            SpawnCandies();
            WorldBounds = CalculateBounds();
        }

        /// <summary>Recoloca todos os doces da fase (usado ao reiniciar).</summary>
        public void SpawnCandies()
        {
            foreach (var entry in candies.Values)
                if (entry.obj != null) Destroy(entry.obj);
            candies.Clear();

            if (Level == null) return;

            foreach (CandyPlacement candy in Level.Candies)
            {
                SpriteRenderer sr = CreateSprite(
                    $"Candy_{candy.Type}_{candy.Cell.x}_{candy.Cell.y}",
                    theme.GetCandySprite(candy.Type),
                    CellToWorld(candy.Cell), candiesRoot, SortingOrders.Candy, candyFill);
                candies[candy.Cell] = (candy.Type, sr.gameObject);
            }
        }

        private void BuildTiles()
        {
            for (int x = 0; x < Level.Width; x++)
            {
                for (int y = 0; y < Level.Height; y++)
                {
                    TileType tile = Level.Tiles[x, y];
                    if (tile == TileType.Empty) continue;

                    Vector3 pos = CellToWorld(new Vector2Int(x, y));

                    // Piso vai embaixo de tudo (inclusive das paredes).
                    CreateSprite($"Floor_{x}_{y}", theme.floor, pos, tilesRoot, SortingOrders.Floor, floorOverlap);

                    if (tile == TileType.Wall)
                    {
                        // Linhas mais baixas desenham por cima, caso a parede "suba" para a casa de cima.
                        int order = SortingOrders.Wall + (Level.Height - y);
                        CreateSprite($"Wall_{x}_{y}", theme.wall, pos, tilesRoot, order, 1f);
                    }
                }
            }
        }

        /// <summary>Coloca as peças de borda no anel de casas em volta do grid.</summary>
        private void BuildBorder()
        {
            if (!theme.HasBorderPieces) return;

            int w = Level.Width, h = Level.Height;
            for (int x = 0; x < w; x++)
            {
                PlaceBorder(theme.borderTop, x, h);
                PlaceBorder(theme.borderBottom, x, -1);
            }
            for (int y = 0; y < h; y++)
            {
                PlaceBorder(theme.borderLeft, -1, y);
                PlaceBorder(theme.borderRight, w, y);
            }
            PlaceBorder(theme.cornerTopLeft, -1, h);
            PlaceBorder(theme.cornerTopRight, w, h);
            PlaceBorder(theme.cornerBottomLeft, -1, -1);
            PlaceBorder(theme.cornerBottomRight, w, -1);
        }

        private void PlaceBorder(Sprite sprite, int x, int y)
        {
            if (sprite == null) return;
            CreateSprite($"Border_{x}_{y}", sprite, CellToWorld(new Vector2Int(x, y)), tilesRoot, SortingOrders.Border, floorOverlap);
        }

        /// <summary>Estica a moldura atrás do grid.</summary>
        private void BuildFrame()
        {
            if (theme.frame == null) return;

            var go = new GameObject("Frame");
            go.transform.SetParent(tilesRoot, false);
            go.transform.position = transform.position;

            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = theme.frame;
            sr.sortingOrder = SortingOrders.Frame;

            Vector2 target = BoardSizeWithBorder() + Vector2.one * (theme.framePadding * cellSize * 2f);

            Vector4 border = theme.frame.border; // em pixels: (esquerda, baixo, direita, topo)
            if (border != Vector4.zero)
            {
                // Sprite com 9-slice: estica o meio e mantém os cantos bonitos.
                sr.drawMode = SpriteDrawMode.Sliced;

                // Escala a moldura para a espessura da borda ficar igual ao "framePadding",
                // assim o piso cobre exatamente o miolo, qualquer que seja o Pixels Per Unit.
                float borderUnits = (border.x + border.z) / 2f / theme.frame.pixelsPerUnit;
                float scale = borderUnits > 0f ? (theme.framePadding * cellSize) / borderUnits : 1f;
                go.transform.localScale = new Vector3(scale, scale, 1f);
                sr.size = target / scale;
            }
            else
            {
                // Sem 9-slice: apenas escala para o tamanho certo.
                Vector2 size = theme.frame.bounds.size;
                go.transform.localScale = new Vector3(target.x / size.x, target.y / size.y, 1f);
            }
        }

        /// <summary>Apaga tudo que foi criado pelo Build.</summary>
        public void Clear()
        {
            candies.Clear();
            if (tilesRoot != null) Destroy(tilesRoot.gameObject);
            if (candiesRoot != null) Destroy(candiesRoot.gameObject);
            tilesRoot = null;
            candiesRoot = null;
            Level = null;
        }

        // ------------------------------------------------------------------
        // Consultas (usadas pelo robô e pelo interpretador)
        // ------------------------------------------------------------------

        /// <summary>Converte uma casa do grid em posição no mundo (centro da casa).</summary>
        public Vector3 CellToWorld(Vector2Int cell)
        {
            float offsetX = (cell.x - (Width - 1) / 2f) * cellSize;
            float offsetY = (cell.y - (Height - 1) / 2f) * cellSize;
            return transform.position + new Vector3(offsetX, offsetY, 0f);
        }

        public bool InBounds(Vector2Int cell) => Level != null && Level.InBounds(cell);

        public bool IsWall(Vector2Int cell) => Level != null && Level.GetTile(cell) == TileType.Wall;

        /// <summary>O robô pode entrar nesta casa? (só piso dentro do mapa)</summary>
        public bool IsWalkable(Vector2Int cell) => Level != null && Level.GetTile(cell) == TileType.Floor;

        public bool HasCandy(Vector2Int cell) => candies.ContainsKey(cell);

        public bool TryGetCandy(Vector2Int cell, out CandyType type)
        {
            bool found = candies.TryGetValue(cell, out var entry);
            type = found ? entry.type : default;
            return found;
        }

        /// <summary>Remove o doce da casa (se houver) e avisa quem estiver ouvindo.</summary>
        public bool TryPickCandy(Vector2Int cell, out CandyType type)
        {
            if (!candies.TryGetValue(cell, out var entry))
            {
                type = default;
                return false;
            }

            type = entry.type;
            candies.Remove(cell);
            if (entry.obj != null) Destroy(entry.obj); // No Dia 2 trocamos por uma animação.
            CandyPicked?.Invoke(cell, type);
            return true;
        }

        /// <summary>Tamanho do grid (em unidades do mundo), contando o anel de borda se existir.</summary>
        private Vector2 BoardSizeWithBorder()
        {
            int ring = theme.HasBorderPieces ? 2 : 0;
            return new Vector2((Width + ring) * cellSize, (Height + ring) * cellSize);
        }

        private Bounds CalculateBounds()
        {
            Vector2 size = BoardSizeWithBorder();
            if (theme.frame != null) size += Vector2.one * (theme.framePadding * cellSize * 2f);
            return new Bounds(transform.position, new Vector3(size.x, size.y, 0f));
        }

        // ------------------------------------------------------------------
        // Utilitário
        // ------------------------------------------------------------------

        /// <summary>
        /// Cria um GameObject com SpriteRenderer e ajusta a escala para o sprite caber na casa,
        /// independentemente do "Pixels Per Unit" usado na importação.
        /// </summary>
        private SpriteRenderer CreateSprite(string objName, Sprite sprite, Vector3 position, Transform parent, int order, float fill)
        {
            var go = new GameObject(objName);
            go.transform.SetParent(parent, false);
            go.transform.position = position;

            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingOrder = order;

            if (sprite == null)
            {
                Debug.LogWarning($"[GridManager] Sprite faltando para '{objName}'. Confira o BoardTheme.", theme);
                return sr;
            }

            FitToCell(go.transform, sprite, cellSize * fill);
            return sr;
        }

        /// <summary>Escala o objeto para que o maior lado do sprite tenha o tamanho indicado.</summary>
        public static void FitToCell(Transform target, Sprite sprite, float size)
        {
            if (sprite == null) return;
            Vector2 bounds = sprite.bounds.size;
            float biggest = Mathf.Max(bounds.x, bounds.y);
            if (biggest <= 0f) return;
            target.localScale = Vector3.one * (size / biggest);
        }
    }
}
