using System;

namespace CandyRush
{
    public enum GameStateName { Menu, Racing, Paused }

    /// <summary>
    /// Estado do jogo (core/gameState.ts): menu, corrida ou pausa. Pausa e menu
    /// congelam a física — é por isso que o passo fixo consulta `Simulates`
    /// antes de mexer em qualquer kart.
    /// </summary>
    public sealed class GameState
    {
        public GameStateName Name { get; private set; } = GameStateName.Menu;
        public event Action<GameStateName> Changed;

        public bool Simulates => Name == GameStateName.Racing;
        public bool IsRacing => Name == GameStateName.Racing;

        public void Set(GameStateName name)
        {
            if (Name == name) return;
            Name = name;
            Changed?.Invoke(name);
        }

        public void TogglePause()
        {
            if (Name == GameStateName.Racing) Set(GameStateName.Paused);
            else if (Name == GameStateName.Paused) Set(GameStateName.Racing);
        }
    }
}
