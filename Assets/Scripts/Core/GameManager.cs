using UnityEngine;

namespace CodePop.Core
{
    /// <summary>
    /// Objeto único que sobrevive à troca de cenas e guarda o estado global do jogo
    /// (por enquanto, só qual fase foi escolhida). Nos próximos dias ele vai
    /// conectar salvamento, configurações e fluxo de telas.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        /// <summary>Fase escolhida no mapa de fases (ex.: "level_1_3"). Vazio = usar a fase de teste.</summary>
        public string SelectedLevelId { get; set; }

        // Garante que o Instance comece vazio mesmo com "Enter Play Mode Options" ligado no Editor.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics() => Instance = null;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject); // já existe um GameManager vindo de outra cena
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            // iPhones rodam a 30 FPS por padrão; 60 deixa as animações mais suaves.
            Application.targetFrameRate = 60;
        }
    }
}
