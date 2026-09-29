using System.Collections;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Logo animado do Candy Rush para a tela inicial (Unity UI).
///
/// Camadas (sprites entregues junto):
///   - CandyRush_LogoBase.png  -> logo sem a cabeça do pirulito
///   - CandyRush_Pirulito.png  -> cabeça do pirulito (círculo, para girar)
///
/// Animações:
///   1. Entrada "pop" com mola (cresce, passa do tamanho e volta).
///   2. Pirulito girando sem parar.
///   3. Logo "respirando" (pulso de escala) e flutuando de leve.
///   4. Toque/clique no logo dá um "boing" e acelera o pirulito.
///
/// Uso: crie um objeto dentro de um Canvas, adicione este componente e
/// arraste os dois sprites nos campos. O script monta as camadas sozinho.
/// Para mudar o tamanho, altere o campo "largura".
///
/// As duas camadas são geradas a partir do Logo.png existente pelo menu
/// CandyRush > Bake Logo Sprites (ver BakeCandyRushLogo.cs); o GameUI monta
/// este componente em código na tela inicial, então os campos abaixo ficam
/// públicos para serem preenchidos antes do Awake (veja GameUI.BuildLogoOverlay).
/// </summary>
[RequireComponent(typeof(RectTransform))]
public class LogoCandyRush : MonoBehaviour
{
    [Header("Sprites")]
    public Sprite logoBase;
    public Sprite cabecaPirulito;

    [Header("Tamanho na tela")]
    public float largura = 900f;

    [Header("Pirulito")]
    [SerializeField] float velocidadeGiro = 120f;        // graus por segundo
    [SerializeField] bool sentidoHorario = true;

    [Header("Respirar / flutuar")]
    [SerializeField] float pulsoEscala = 0.025f;
    [SerializeField] float velocidadePulso = 2f;
    [SerializeField] float alturaFlutuar = 8f;

    [Header("Entrada")]
    [SerializeField] bool animarEntrada = true;
    [SerializeField] float duracaoEntrada = 0.8f;

    // Medidas da imagem original (1536 x 1024) em pixels.
    // Centro e raios da cabeça do pirulito dentro do logo.
    const float LarguraOriginal = 1536f, AlturaOriginal = 1024f;
    const float PirulitoX = 776f, PirulitoY = 203f;       // a partir do canto superior esquerdo
    const float PirulitoRaioX = 142f, PirulitoRaioY = 108f;

    RectTransform raiz, conteudo, pirulito;
    float escalaExtra = 1f;   // usado pela entrada e pelo "boing"
    float giroExtra = 0f;     // acelera o pirulito ao tocar
    float tempo;

    void Awake()
    {
        raiz = (RectTransform)transform;
        Montar();
    }

    void OnEnable()
    {
        if (animarEntrada) StartCoroutine(Entrada());
    }

    void Montar()
    {
        float escala = largura / LarguraOriginal;
        raiz.sizeDelta = new Vector2(LarguraOriginal, AlturaOriginal) * escala;

        // Conteúdo: é ele que pulsa e flutua, para não mexer no layout do Canvas.
        conteudo = NovoRect("Conteudo", raiz);
        conteudo.anchorMin = Vector2.zero;
        conteudo.anchorMax = Vector2.one;
        conteudo.sizeDelta = Vector2.zero;

        // A cabeça fica ATRÁS da base (a base tem um buraco onde ela estava).
        // Âncora achatada: o sprite é um círculo girando dentro de uma
        // âncora com escala Y menor, recriando o formato oval original.
        var ancora = NovoRect("PirulitoAncora", conteudo);
        ancora.anchorMin = ancora.anchorMax = new Vector2(PirulitoX / LarguraOriginal, 1f - PirulitoY / AlturaOriginal);
        ancora.anchoredPosition = Vector2.zero;
        ancora.sizeDelta = Vector2.one * PirulitoRaioX * 2f * escala;
        ancora.localScale = new Vector3(1f, PirulitoRaioY / PirulitoRaioX, 1f);

        pirulito = NovoRect("Pirulito", ancora);
        pirulito.anchorMin = Vector2.zero;
        pirulito.anchorMax = Vector2.one;
        pirulito.sizeDelta = Vector2.zero;
        var imgPirulito = pirulito.gameObject.AddComponent<Image>();
        imgPirulito.sprite = cabecaPirulito;
        imgPirulito.raycastTarget = false;

        var baseRect = NovoRect("LogoBase", conteudo);
        baseRect.anchorMin = Vector2.zero;
        baseRect.anchorMax = Vector2.one;
        baseRect.sizeDelta = Vector2.zero;
        var imgBase = baseRect.gameObject.AddComponent<Image>();
        imgBase.sprite = logoBase;
        imgBase.alphaHitTestMinimumThreshold = 0f;

        // Toque no logo
        var botao = baseRect.gameObject.AddComponent<Button>();
        botao.transition = Selectable.Transition.None;
        botao.onClick.AddListener(Boing);
    }

    void Update()
    {
        float dt = Time.unscaledDeltaTime;   // funciona mesmo com o jogo pausado
        tempo += dt;

        // Pirulito
        giroExtra = Mathf.Lerp(giroExtra, 0f, dt * 1.5f);
        float sentido = sentidoHorario ? -1f : 1f;
        pirulito.Rotate(0f, 0f, sentido * (velocidadeGiro + giroExtra) * dt);

        // Respirar + flutuar
        float pulso = 1f + Mathf.Sin(tempo * velocidadePulso) * pulsoEscala;
        conteudo.localScale = Vector3.one * pulso * escalaExtra;
        conteudo.anchoredPosition = new Vector2(0f, Mathf.Sin(tempo * velocidadePulso * 0.5f) * alturaFlutuar);
    }

    IEnumerator Entrada()
    {
        float t = 0f;
        while (t < duracaoEntrada)
        {
            t += Time.unscaledDeltaTime;
            escalaExtra = Mola(Mathf.Clamp01(t / duracaoEntrada));
            yield return null;
        }
        escalaExtra = 1f;
    }

    public void Boing()
    {
        giroExtra = 720f;
        StopCoroutine(nameof(AnimBoing));
        StartCoroutine(nameof(AnimBoing));
    }

    IEnumerator AnimBoing()
    {
        const float dur = 0.45f;
        float t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float p = t / dur;
            // amassa e volta com oscilação amortecida
            escalaExtra = 1f + Mathf.Sin(p * Mathf.PI * 3f) * 0.08f * (1f - p);
            yield return null;
        }
        escalaExtra = 1f;
    }

    // Easing "elastic out": 0 -> passa de 1 -> assenta em 1
    static float Mola(float x)
    {
        if (x <= 0f) return 0f;
        if (x >= 1f) return 1f;
        const float c4 = (2f * Mathf.PI) / 3f;
        return Mathf.Pow(2f, -10f * x) * Mathf.Sin((x * 10f - 0.75f) * c4) + 1f;
    }

    static RectTransform NovoRect(string nome, Transform pai)
    {
        var go = new GameObject(nome, typeof(RectTransform));
        var rt = (RectTransform)go.transform;
        rt.SetParent(pai, false);
        return rt;
    }
}
