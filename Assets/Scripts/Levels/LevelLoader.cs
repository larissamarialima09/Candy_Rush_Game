using System;
using CodePop.Board;
using CodePop.Core;
using CodePop.Robot;
using UnityEngine;

namespace CodePop.Levels
{
    /// <summary>
    /// Lê um arquivo de fase em Assets/Resources/Levels, monta o tabuleiro
    /// (GridManager), posiciona o robô e enquadra a câmera.
    /// </summary>
    public class LevelLoader : MonoBehaviour
    {
        /// <summary>Pasta dentro de "Resources" onde ficam os arquivos .txt das fases.</summary>
        public const string LevelsFolder = "Levels";

        [SerializeField] private GridManager gridManager;
        [SerializeField] private RobotController robot;

        [Tooltip("Opcional: script na Main Camera que enquadra o tabuleiro.")]
        [SerializeField] private BoardCameraFitter cameraFitter;

        [Tooltip("Fase carregada quando você dá Play direto nesta cena (sem passar pelo mapa de fases).")]
        [SerializeField] private string debugLevelId = "level_1_1";

        public LevelData CurrentLevel { get; private set; }

        /// <summary>Disparado depois que a fase foi montada com sucesso.</summary>
        public event Action<LevelData> LevelLoaded;

        private void Start()
        {
            string id = debugLevelId;
            if (GameManager.Instance != null && !string.IsNullOrEmpty(GameManager.Instance.SelectedLevelId))
                id = GameManager.Instance.SelectedLevelId;

            LoadLevel(id);
        }

        /// <summary>Lê o arquivo da fase e devolve os dados (sem montar nada na cena).</summary>
        public static LevelData ReadLevel(string levelId)
        {
            TextAsset file = Resources.Load<TextAsset>($"{LevelsFolder}/{levelId}");
            if (file == null)
                throw new LevelParseException(
                    $"Arquivo da fase não encontrado: Assets/Resources/{LevelsFolder}/{levelId}.txt");
            return LevelParser.Parse(levelId, file.text);
        }

        /// <summary>Carrega e monta a fase. Retorna false (e mostra o erro no Console) se algo der errado.</summary>
        public bool LoadLevel(string levelId)
        {
            LevelData level;
            try
            {
                level = ReadLevel(levelId);
            }
            catch (LevelParseException e)
            {
                Debug.LogError($"[LevelLoader] {e.Message}", this);
                return false;
            }

            if (gridManager == null || robot == null)
            {
                Debug.LogError("[LevelLoader] Arraste o GridManager e o RobotController nos campos do Inspector.", this);
                return false;
            }

            CurrentLevel = level;
            gridManager.Build(level);
            robot.Place(gridManager, level.RobotStart, level.RobotDirection);
            if (cameraFitter != null) cameraFitter.Fit(gridManager.WorldBounds);

            Debug.Log($"[LevelLoader] Fase '{level.Id}' carregada: {level.Width}x{level.Height}, " +
                      $"{level.Candies.Count} doce(s), blocos: {string.Join(", ", level.AvailableBlocks)}, ideal: {level.IdealBlockCount}.");

            LevelLoaded?.Invoke(level);
            return true;
        }

        /// <summary>Recarrega a fase atual. Útil para testar: edite o .txt e use o menu ⋮ do componente.</summary>
        [ContextMenu("Recarregar fase")]
        public void Reload()
        {
            if (!Application.isPlaying)
            {
                Debug.LogWarning("[LevelLoader] Dê Play antes de recarregar a fase.");
                return;
            }
            LoadLevel(CurrentLevel != null ? CurrentLevel.Id : debugLevelId);
        }
    }
}
