using UnityEngine;

namespace CodePop.Board
{
    /// <summary>
    /// Ajusta a câmera ortográfica para o tabuleiro caber na tela em modo retrato,
    /// respeitando a safe area do iPhone (notch / Dynamic Island / barra inferior)
    /// e deixando espaço livre em cima (objetivo da fase) e embaixo (blocos e programa).
    /// Coloque este script na Main Camera.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class BoardCameraFitter : MonoBehaviour
    {
        [Tooltip("Fração da safe area reservada no TOPO para a interface (objetivo da fase, botões).")]
        [SerializeField, Range(0f, 0.5f)] private float topReserved = 0.15f;

        [Tooltip("Fração da safe area reservada EMBAIXO para a paleta de blocos e o programa.")]
        [SerializeField, Range(0f, 0.7f)] private float bottomReserved = 0.42f;

        [Tooltip("Margem extra ao redor do tabuleiro, em unidades do mundo.")]
        [SerializeField] private float padding = 0.25f;

        private Camera cam;
        private Bounds target;
        private bool hasTarget;
        private Vector2Int lastScreenSize;
        private Rect lastSafeArea;

        private void Awake()
        {
            cam = GetComponent<Camera>();
            cam.orthographic = true;
        }

        /// <summary>Enquadra a área informada (normalmente GridManager.WorldBounds).</summary>
        public void Fit(Bounds bounds)
        {
            target = bounds;
            hasTarget = true;
            Apply();
        }

        private void LateUpdate()
        {
            // Reajusta se a tela mudar (ex.: trocar o tamanho do Game view no Editor).
            if (!hasTarget) return;
            var screenSize = new Vector2Int(Screen.width, Screen.height);
            if (screenSize != lastScreenSize || Screen.safeArea != lastSafeArea) Apply();
        }

        private void Apply()
        {
            if (cam == null) cam = GetComponent<Camera>();

            lastScreenSize = new Vector2Int(Screen.width, Screen.height);
            lastSafeArea = Screen.safeArea;

            float sw = Mathf.Max(1, Screen.width);
            float sh = Mathf.Max(1, Screen.height);
            Rect safe = Screen.safeArea;

            // Região disponível em coordenadas de viewport (0 a 1).
            float xMin = safe.xMin / sw;
            float xMax = safe.xMax / sw;
            float safeBottom = safe.yMin / sh;
            float safeTop = safe.yMax / sh;
            float safeHeight = safeTop - safeBottom;
            float yMin = safeBottom + safeHeight * bottomReserved;
            float yMax = safeTop - safeHeight * topReserved;

            float regionW = Mathf.Max(0.05f, xMax - xMin);
            float regionH = Mathf.Max(0.05f, yMax - yMin);

            float neededW = target.size.x + padding * 2f;
            float neededH = target.size.y + padding * 2f;

            // Largura visível = 2 * size * aspect; altura visível = 2 * size.
            float sizeForWidth = neededW / (2f * cam.aspect * regionW);
            float sizeForHeight = neededH / (2f * regionH);
            float size = Mathf.Max(sizeForWidth, sizeForHeight, 0.5f);
            cam.orthographicSize = size;

            // Move a câmera para o centro do tabuleiro cair no centro da região livre.
            float centerX = (xMin + xMax) / 2f;
            float centerY = (yMin + yMax) / 2f;
            Vector3 pos = cam.transform.position;
            pos.x = target.center.x - (centerX - 0.5f) * 2f * size * cam.aspect;
            pos.y = target.center.y - (centerY - 0.5f) * 2f * size;
            cam.transform.position = pos;
        }
    }
}
