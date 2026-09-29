using CodePop.Board;
using UnityEngine;

namespace CodePop.Robot
{
    /// <summary>
    /// Controla o robozinho: posição no grid, direção e expressão.
    /// O jogador NUNCA controla o robô diretamente: quem chama estes métodos é o
    /// interpretador do programa (Dia 2).
    ///
    /// Estrutura esperada na cena:
    ///   Robot (este script)
    ///     ├─ Body  (SpriteRenderer do robô)
    ///     └─ Arrow (SpriteRenderer da seta de direção, opcional)
    /// </summary>
    public class RobotController : MonoBehaviour
    {
        [SerializeField] private RobotSkin skin;

        [Tooltip("SpriteRenderer do corpo do robô (objeto filho 'Body').")]
        [SerializeField] private SpriteRenderer body;

        [Tooltip("SpriteRenderer da seta de direção (objeto filho 'Arrow'). Opcional.")]
        [SerializeField] private SpriteRenderer directionArrow;

        [Tooltip("Tamanho do robô em relação à casa (1 = casa inteira).")]
        [SerializeField, Range(0.4f, 1.2f)] private float bodyFill = 0.9f;

        [Tooltip("Tamanho da seta em relação à casa.")]
        [SerializeField, Range(0.1f, 0.6f)] private float arrowFill = 0.25f;

        [Tooltip("Distância da seta até o centro do robô, em casas.")]
        [SerializeField, Range(0f, 0.6f)] private float arrowDistance = 0.45f;

        [Tooltip("Espelhar o robô quando ele olha para a esquerda.")]
        [SerializeField] private bool flipWhenFacingLeft = true;

        public Vector2Int Cell { get; private set; }
        public Direction Facing { get; private set; }
        public RobotExpression Expression { get; private set; }

        /// <summary>Casa logo à frente do robô.</summary>
        public Vector2Int CellAhead => Cell + Facing.ToVector();

        private GridManager grid;

        /// <summary>Coloca o robô numa casa, olhando para uma direção, com expressão normal.</summary>
        public void Place(GridManager gridManager, Vector2Int cell, Direction facing)
        {
            grid = gridManager;
            Cell = cell;
            transform.position = grid.CellToWorld(cell);

            if (body != null)
            {
                body.sortingOrder = SortingOrders.Robot;
                GridManager.FitToCell(body.transform, skin != null ? skin.normal : body.sprite, grid.CellSize * bodyFill);
            }
            if (directionArrow != null)
            {
                directionArrow.sortingOrder = SortingOrders.Robot + 1;
                if (skin != null && skin.directionArrow != null) directionArrow.sprite = skin.directionArrow;
                GridManager.FitToCell(directionArrow.transform, directionArrow.sprite, grid.CellSize * arrowFill);
            }

            SetFacing(facing);
            SetExpression(RobotExpression.Normal);
        }

        /// <summary>Muda a direção do robô (sem animação por enquanto).</summary>
        public void SetFacing(Direction facing)
        {
            Facing = facing;

            if (body != null && flipWhenFacingLeft)
                body.flipX = facing == Direction.Left;

            if (directionArrow != null)
            {
                float cell = grid != null ? grid.CellSize : 1f;
                Vector2 offset = (Vector2)facing.ToVector() * (arrowDistance * cell);
                directionArrow.transform.localPosition = offset;
                directionArrow.transform.localRotation = Quaternion.Euler(0f, 0f, facing.ToAngle());
            }
        }

        /// <summary>Troca a expressão (normal, feliz, pensativo).</summary>
        public void SetExpression(RobotExpression expression)
        {
            Expression = expression;
            if (body != null && skin != null)
                body.sprite = skin.Get(expression);
        }
    }
}
