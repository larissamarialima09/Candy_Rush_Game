using UnityEngine;

namespace CodePop.Robot
{
    /// <summary>Expressões do robô.</summary>
    public enum RobotExpression
    {
        Normal,   // parado / executando
        Happy,    // venceu a fase
        Thinking  // o programa não resolveu (feedback gentil, sem "derrota")
    }

    /// <summary>
    /// Sprites do robô. Para trocar a aparência, crie outro RobotSkin
    /// (clique direito > Create > Code Pop > Robot Skin) e arraste no RobotController.
    /// </summary>
    [CreateAssetMenu(fileName = "RobotSkin", menuName = "Code Pop/Robot Skin")]
    public class RobotSkin : ScriptableObject
    {
        [Header("Expressões")]
        public Sprite normal;
        public Sprite happy;
        public Sprite thinking;

        [Header("Indicador de direção (opcional)")]
        [Tooltip("Uma seta ou triângulo apontando para CIMA. Mostra para onde o robô está olhando.")]
        public Sprite directionArrow;

        public Sprite Get(RobotExpression expression)
        {
            switch (expression)
            {
                case RobotExpression.Happy: return happy != null ? happy : normal;
                case RobotExpression.Thinking: return thinking != null ? thinking : normal;
                default: return normal;
            }
        }
    }
}
