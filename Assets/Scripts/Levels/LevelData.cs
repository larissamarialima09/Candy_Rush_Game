using System.Collections.Generic;
using CodePop.Blocks;
using CodePop.Board;
using UnityEngine;

namespace CodePop.Levels
{
    /// <summary>Um doce posicionado em uma célula do grid.</summary>
    public struct CandyPlacement
    {
        public Vector2Int Cell;
        public CandyType Type;

        public CandyPlacement(Vector2Int cell, CandyType type)
        {
            Cell = cell;
            Type = type;
        }
    }

    /// <summary>
    /// Dados de uma fase já lida do arquivo de texto (resultado do LevelParser).
    /// Coordenadas: x cresce para a direita, y cresce para CIMA.
    /// A célula (0,0) é o canto inferior esquerdo do mapa.
    /// </summary>
    public class LevelData
    {
        public string Id;              // nome do arquivo, ex.: "level_1_1"
        public int Chapter;            // capítulo (1 a 4)
        public int Index;              // número da fase dentro do capítulo (1 a 5)

        public int Width;
        public int Height;
        public TileType[,] Tiles;      // Tiles[x, y]

        public Vector2Int RobotStart;
        public Direction RobotDirection;

        public readonly List<CandyPlacement> Candies = new List<CandyPlacement>();
        public readonly List<BlockType> AvailableBlocks = new List<BlockType>();

        /// <summary>Número ideal de blocos para ganhar 3 estrelas.</summary>
        public int IdealBlockCount;

        /// <summary>Outros campos do cabeçalho (para usos futuros, ex.: dica).</summary>
        public readonly Dictionary<string, string> Extra = new Dictionary<string, string>();

        public bool InBounds(Vector2Int cell) =>
            cell.x >= 0 && cell.y >= 0 && cell.x < Width && cell.y < Height;

        /// <summary>Tipo da célula; fora do mapa conta como vazio.</summary>
        public TileType GetTile(Vector2Int cell) => InBounds(cell) ? Tiles[cell.x, cell.y] : TileType.Empty;
    }
}
