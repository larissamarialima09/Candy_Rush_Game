using System;
using System.Collections.Generic;
using CodePop.Blocks;
using CodePop.Board;
using UnityEngine;

namespace CodePop.Levels
{
    /// <summary>Erro de leitura de uma fase, com mensagem explicando o problema.</summary>
    public class LevelParseException : Exception
    {
        public LevelParseException(string message) : base(message) { }
    }

    /// <summary>
    /// Converte o texto de uma fase (Assets/Resources/Levels/*.txt) em LevelData.
    ///
    /// FORMATO DO ARQUIVO:
    ///   // linhas começando com "//" são comentários
    ///   chapter: 1                  (capítulo)
    ///   index: 1                    (número da fase no capítulo)
    ///   dir: right                  (direção inicial do robô: up, right, down, left)
    ///   blocks: walk, pick          (blocos disponíveis, separados por vírgula)
    ///   ideal: 4                    (número ideal de blocos para 3 estrelas)
    ///   map:                        (depois desta linha vem o desenho do mapa)
    ///   #######
    ///   #R..H.#
    ///   #######
    ///
    /// LEGENDA DO MAPA:
    ///   R = robô (em cima de um piso)   . = piso   # = parede wafer
    ///   H = doce coração   S = doce estrela   G = doce gota
    ///   (espaço) = vazio, fora do tabuleiro
    /// </summary>
    public static class LevelParser
    {
        public static LevelData Parse(string levelId, string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                throw new LevelParseException($"A fase '{levelId}' está vazia.");

            var headers = new Dictionary<string, string>();
            var mapRows = new List<string>();
            bool inMap = false;

            string[] lines = text.Replace("\r", "").Split('\n');
            for (int i = 0; i < lines.Length; i++)
            {
                string raw = lines[i];

                if (raw.Trim().StartsWith("//")) continue; // comentário

                if (!inMap)
                {
                    string line = raw.Trim();
                    if (line.Length == 0) continue;

                    int colon = line.IndexOf(':');
                    if (colon < 0)
                        throw new LevelParseException(
                            $"Fase '{levelId}', linha {i + 1}: esperado 'chave: valor' ou 'map:', mas veio \"{line}\".");

                    string key = line.Substring(0, colon).Trim().ToLowerInvariant();
                    string value = line.Substring(colon + 1).Trim();

                    if (key == "map") { inMap = true; continue; }
                    headers[key] = value;
                }
                else
                {
                    // No mapa, espaços têm significado (vazio), então só tiramos os do final.
                    mapRows.Add(raw.TrimEnd());
                }
            }

            // Remove linhas vazias no começo e no fim do mapa.
            while (mapRows.Count > 0 && mapRows[0].Length == 0) mapRows.RemoveAt(0);
            while (mapRows.Count > 0 && mapRows[mapRows.Count - 1].Length == 0) mapRows.RemoveAt(mapRows.Count - 1);

            if (mapRows.Count == 0)
                throw new LevelParseException($"Fase '{levelId}': faltou a seção 'map:' com o desenho do tabuleiro.");

            var level = new LevelData { Id = levelId };
            ReadHeaders(level, headers);
            ReadMap(level, mapRows);
            return level;
        }

        private static void ReadHeaders(LevelData level, Dictionary<string, string> headers)
        {
            level.Chapter = ReadInt(level.Id, headers, "chapter", required: false, fallback: 0);
            level.Index = ReadInt(level.Id, headers, "index", required: false, fallback: 0);
            level.IdealBlockCount = ReadInt(level.Id, headers, "ideal", required: true, fallback: 0);
            if (level.IdealBlockCount <= 0)
                throw new LevelParseException($"Fase '{level.Id}': 'ideal' precisa ser maior que zero.");

            if (!headers.TryGetValue("dir", out string dirText) || !DirectionExtensions.TryParse(dirText, out level.RobotDirection))
                throw new LevelParseException($"Fase '{level.Id}': 'dir' ausente ou inválida (use up, right, down ou left).");

            if (!headers.TryGetValue("blocks", out string blocksText) || string.IsNullOrWhiteSpace(blocksText))
                throw new LevelParseException($"Fase '{level.Id}': faltou a linha 'blocks:' com os blocos disponíveis.");

            foreach (string part in blocksText.Split(','))
            {
                if (!BlockTypeParser.TryParse(part, out BlockType block))
                    throw new LevelParseException(
                        $"Fase '{level.Id}': bloco desconhecido \"{part.Trim()}\". Use: walk, turnleft, turnright, pick, repeat, if, function.");
                if (!level.AvailableBlocks.Contains(block)) level.AvailableBlocks.Add(block);
            }

            // Guarda os outros campos para usos futuros.
            foreach (var pair in headers)
            {
                switch (pair.Key)
                {
                    case "chapter": case "index": case "ideal": case "dir": case "blocks": break;
                    default: level.Extra[pair.Key] = pair.Value; break;
                }
            }
        }

        private static int ReadInt(string levelId, Dictionary<string, string> headers, string key, bool required, int fallback)
        {
            if (!headers.TryGetValue(key, out string text))
            {
                if (required) throw new LevelParseException($"Fase '{levelId}': faltou a linha '{key}:'.");
                return fallback;
            }
            if (!int.TryParse(text, out int value))
                throw new LevelParseException($"Fase '{levelId}': '{key}' deveria ser um número, mas veio \"{text}\".");
            return value;
        }

        private static void ReadMap(LevelData level, List<string> rows)
        {
            level.Height = rows.Count;
            level.Width = 0;
            foreach (string row in rows) level.Width = Mathf.Max(level.Width, row.Length);
            level.Tiles = new TileType[level.Width, level.Height];

            int robotCount = 0;

            for (int rowIndex = 0; rowIndex < rows.Count; rowIndex++)
            {
                string row = rows[rowIndex];
                // A primeira linha do texto é o TOPO do tabuleiro (maior y).
                int y = level.Height - 1 - rowIndex;

                for (int x = 0; x < level.Width; x++)
                {
                    // Linhas mais curtas são completadas com "vazio".
                    char c = x < row.Length ? row[x] : ' ';
                    var cell = new Vector2Int(x, y);

                    switch (c)
                    {
                        case ' ': level.Tiles[x, y] = TileType.Empty; break;
                        case '.': level.Tiles[x, y] = TileType.Floor; break;
                        case '#': level.Tiles[x, y] = TileType.Wall; break;
                        case 'R':
                            level.Tiles[x, y] = TileType.Floor;
                            level.RobotStart = cell;
                            robotCount++;
                            break;
                        case 'H': AddCandy(level, cell, CandyType.Heart); break;
                        case 'S': AddCandy(level, cell, CandyType.Star); break;
                        case 'G': AddCandy(level, cell, CandyType.Drop); break;
                        default:
                            throw new LevelParseException(
                                $"Fase '{level.Id}': caractere '{c}' desconhecido no mapa (linha {rowIndex + 1} do mapa, coluna {x + 1}).");
                    }
                }
            }

            if (robotCount != 1)
                throw new LevelParseException($"Fase '{level.Id}': o mapa precisa ter exatamente 1 'R' (robô), mas tem {robotCount}.");
            if (level.Candies.Count == 0)
                throw new LevelParseException($"Fase '{level.Id}': o mapa precisa ter pelo menos 1 doce (H, S ou G).");
        }

        private static void AddCandy(LevelData level, Vector2Int cell, CandyType type)
        {
            level.Tiles[cell.x, cell.y] = TileType.Floor; // doce sempre fica sobre um piso
            level.Candies.Add(new CandyPlacement(cell, type));
        }
    }
}
