using UnityEngine;

// Observação: usamos o namespace "CodePop.Board" (e não "Grid") para não
// confundir com a classe UnityEngine.Grid que já existe na Unity.
namespace CodePop.Board
{
    /// <summary>Tipo de cada célula do tabuleiro.</summary>
    public enum TileType
    {
        Empty, // espaço vazio (fora do tabuleiro), caractere ' ' no arquivo da fase
        Floor, // piso creme, caractere '.'
        Wall   // parede wafer lilás, caractere '#'
    }

    /// <summary>Tipos de doce. Cada um tem uma FORMA única (acessibilidade para daltonismo).</summary>
    public enum CandyType
    {
        Heart, // coração rosa, caractere 'H'
        Star,  // estrela amarela, caractere 'S'
        Drop   // gota azul, caractere 'G'
    }

    /// <summary>Direções em que o robô pode olhar. "Up" = para cima na tela.</summary>
    public enum Direction
    {
        Up,
        Right,
        Down,
        Left
    }

    /// <summary>Funções auxiliares para trabalhar com direções.</summary>
    public static class DirectionExtensions
    {
        /// <summary>Converte a direção em um deslocamento no grid (x, y).</summary>
        public static Vector2Int ToVector(this Direction d)
        {
            switch (d)
            {
                case Direction.Up: return Vector2Int.up;
                case Direction.Right: return Vector2Int.right;
                case Direction.Down: return Vector2Int.down;
                default: return Vector2Int.left;
            }
        }

        /// <summary>Gira 90° para a esquerda (anti-horário).</summary>
        public static Direction TurnLeft(this Direction d) => (Direction)(((int)d + 3) % 4);

        /// <summary>Gira 90° para a direita (horário).</summary>
        public static Direction TurnRight(this Direction d) => (Direction)(((int)d + 1) % 4);

        /// <summary>Ângulo Z para girar um sprite que, por padrão, aponta para CIMA.</summary>
        public static float ToAngle(this Direction d)
        {
            switch (d)
            {
                case Direction.Up: return 0f;
                case Direction.Right: return -90f;
                case Direction.Down: return 180f;
                default: return 90f;
            }
        }

        /// <summary>
        /// Lê uma direção escrita no arquivo da fase.
        /// Aceita: up/right/down/left, u/r/d/l, north/east/south/west e ^ > v &lt;.
        /// </summary>
        public static bool TryParse(string text, out Direction direction)
        {
            direction = Direction.Right;
            if (string.IsNullOrWhiteSpace(text)) return false;

            switch (text.Trim().ToLowerInvariant())
            {
                case "up": case "u": case "north": case "^":
                    direction = Direction.Up; return true;
                case "right": case "r": case "east": case ">":
                    direction = Direction.Right; return true;
                case "down": case "d": case "south": case "v":
                    direction = Direction.Down; return true;
                case "left": case "l": case "west": case "<":
                    direction = Direction.Left; return true;
                default:
                    return false;
            }
        }
    }

    /// <summary>
    /// Ordem de desenho (Sorting Order) de cada camada do tabuleiro.
    /// Números maiores são desenhados por cima.
    /// </summary>
    public static class SortingOrders
    {
        public const int Frame = -10;  // moldura atrás de tudo
        public const int Border = -5;  // peças de borda
        public const int Floor = 0;    // piso
        public const int Wall = 10;    // paredes (+ ajuste pela linha, para sobrepor corretamente)
        public const int Candy = 50;   // doces
        public const int Robot = 100;  // robô
    }
}
