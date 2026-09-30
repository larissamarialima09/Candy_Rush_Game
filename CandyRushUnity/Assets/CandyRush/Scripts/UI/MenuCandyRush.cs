using System.Collections;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

/// <summary>
/// Tela inicial animada do Candy Rush (Unity UI).
///
/// A arte original vira o fundo, e por cima entram recortes com bordas
/// suaves (logo, coelho no kart, botões) que se animam sem nunca mostrar
/// "buracos": eles só crescem a partir do tamanho original.
///
/// Animações:
///  - Entrada: tela clareia do branco e os botões "pulam" um por um.
///  - Câmera: zoom lento de vai-e-vem no cenário (efeito Ken Burns).
///  - Logo respirando + pirulito girando.
///  - Coelho: motor tremendo e fumacinha saindo do kart.
///  - Botões: pulso, hover, "pop" ao tocar e brilho passando no JOGAR.
///  - Estrelinhas piscando pelo céu.
///  - JOGAR: chuva de confete, fade branco e dispara "aoJogar".
///
/// Uso: crie um Canvas (Screen Space - Overlay), adicione um objeto vazio
/// dentro dele, coloque este componente e arraste os sprites da pasta.
/// Precisa de um EventSystem na cena (a Unity cria junto com o Canvas).
/// </summary>
public partial class MenuCandyRush : MonoBehaviour
{
    [Header("Sprites")]
    public Sprite fundo;
    public Sprite logo;
    public Sprite pirulitoGiro;
    public Sprite pirulitoMascara;
    public Sprite coelhoKart;
    public Sprite botaoJogar;
    public Sprite botaoConfig;
    public Sprite botaoNome;
    public Sprite brilho;
    public Sprite fumaca;

    [Header("Eventos")]
    public UnityEvent aoJogar = new UnityEvent();
    public UnityEvent aoConfigurar = new UnityEvent();

    [Header("Ajustes")]
    public float velocidadePirulito = 90f;
    public float zoomCamera = 0.035f;
    public float duracaoZoom = 14f;
    public int estrelasSimultaneas = 6;

    // Tamanho da arte original e caixas (x0, y0, x1, y1) a partir do canto superior esquerdo.
    static readonly Vector2 Ref = new Vector2(1870f, 841f);
    static readonly Vector4 CaixaLogo     = new Vector4(520, 25, 1320, 395);
    static readonly Vector4 CaixaKart     = new Vector4(200, 270, 575, 775);
    static readonly Vector4 CaixaJogar    = new Vector4(668, 403, 1194, 550);
    static readonly Vector4 CaixaConfig   = new Vector4(716, 565, 1144, 662);
    static readonly Vector4 CaixaNome     = new Vector4(706, 694, 1162, 760);
    static readonly Vector4 CaixaPirulito = new Vector4(852, 39, 1000, 163);  // dentro da tela
    static readonly Vector2 SaidaFumaca   = new Vector2(232, 700);
    static readonly Vector4 AreaEstrelas  = new Vector4(100, 20, 1800, 420);

    static readonly Color[] CoresConfete =
    {
        new Color(1f, 0.42f, 0.7f), new Color(1f, 0.83f, 0.25f), new Color(0.6f, 0.45f, 0.95f),
        new Color(0.4f, 0.82f, 1f), new Color(0.55f, 0.92f, 0.6f), Color.white,
    };

    RectTransform palco, logoRt, pirulitoRt, kartRt, brilhoBotao, efeitos;
    BotaoDoce bJogar, bConfig, bNome;
    Image veu;
    bool saindo;

    void Awake() { PrepararAssets(); Montar(); CompletarInterface(); }
    void OnEnable() { saindo = false; StartCoroutine(Entrada()); }
    void OnDisable() { StopAllCoroutines(); if (efeitos != null) foreach (Transform child in efeitos) Destroy(child.gameObject); }

    // ============================ Montagem ============================

    void Montar()
    {
        var raiz = (RectTransform)transform;
        Esticar(raiz);

        // O palco preenche a tela sem distorcer (corta sobras, como "cover").
        palco = NovoRect("Palco", raiz);
        palco.sizeDelta = Ref;
        var fit = palco.gameObject.AddComponent<AspectRatioFitter>();
        fit.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
        fit.aspectRatio = Ref.x / Ref.y;

        fundoRt = NovaImagem("Fundo", raiz, fundo, Vector4.zero, false).rectTransform;
        Esticar(fundoRt);
        var backgroundFit = fundoRt.gameObject.AddComponent<AspectRatioFitter>();
        backgroundFit.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;
        backgroundFit.aspectRatio = fundo.rect.width / fundo.rect.height;
        fundoRt.SetAsFirstSibling();

        // Logo + pirulito (máscara fixa, conteúdo girando lá dentro)
        logoRt = NovaImagem("Logo", palco, logo, CaixaLogo, false).rectTransform;
        var mascara = NovaImagem("PirulitoMascara", logoRt, pirulitoMascara,
                                 Relativa(CaixaPirulito, CaixaLogo), false);
        mascara.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var achatado = NovoRect("PirulitoAchatado", mascara.rectTransform);
        Esticar(achatado);
        float w = CaixaPirulito.z - CaixaPirulito.x, h = CaixaPirulito.w - CaixaPirulito.y;
        achatado.anchorMin = achatado.anchorMax = new Vector2(0.5f, 0.5f);
        achatado.sizeDelta = new Vector2(w, w);
        achatado.localScale = new Vector3(1f, h / w, 1f);
        pirulitoRt = NovaImagem("PirulitoGiro", achatado, pirulitoGiro, Vector4.zero, false).rectTransform;
        Esticar(pirulitoRt);

        // Coelho no kart: pivô nas rodas para o tremido do motor
        kartRt = NovaImagem("CoelhoKart", palco, coelhoKart, CaixaKart, false).rectTransform;
        MudarPivo(kartRt, new Vector2(0.5f, 0.05f));

        // Botões
        bJogar = NovoBotao("BotaoJogar", botaoJogar, CaixaJogar, 0f, OnJogar);
        bConfig = NovoBotao("BotaoConfig", botaoConfig, CaixaConfig, 1.3f, () => { if (!saindo) aoConfigurar.Invoke(); });
        bNome = NovoBotao("PlacaNome", botaoNome, CaixaNome, 2.6f, null);
        bNome.pulso = 0.015f;

        // Brilho que atravessa o JOGAR (recortado pelo formato do botão)
        bJogar.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        brilhoBotao = NovoRect("Brilho", bJogar.transform);
        var imgBrilho = brilhoBotao.gameObject.AddComponent<Image>();
        imgBrilho.color = new Color(1f, 1f, 1f, 0.35f);
        imgBrilho.raycastTarget = false;
        brilhoBotao.sizeDelta = new Vector2(60f, 260f);
        brilhoBotao.localRotation = Quaternion.Euler(0, 0, -20f);

        efeitos = NovoRect("Efeitos", palco);
        Esticar(efeitos);

        // Véu branco para entrada e saída
        veu = NovaImagem("Veu", raiz, null, Vector4.zero, false);
        Esticar(veu.rectTransform);
        veu.color = Color.white;
    }

    BotaoDoce NovoBotao(string nome, Sprite s, Vector4 caixa, float fase, UnityAction acao)
    {
        var img = NovaImagem(nome, palco, s, caixa, true);
        // Clique só na parte visível do botão (exige Read/Write ligado na textura)
        if (s != null && s.texture.isReadable) img.alphaHitTestMinimumThreshold = 0.5f;
        var b = img.gameObject.AddComponent<BotaoDoce>();
        b.fase = fase;
        if (acao != null) b.aoClicar.AddListener(acao);
        return b;
    }

    // ============================ Animação ============================

    void Update()
    {
        float t = Time.unscaledTime, dt = Time.unscaledDeltaTime;

        // Ken Burns: zoom de vai-e-vem, sempre >= 1 para não mostrar bordas
        float z = 0.5f - 0.5f * Mathf.Cos(t * Mathf.PI * 2f / duracaoZoom);
        fundoRt.localScale = Vector3.one * (1f + z * zoomCamera);

        // Logo respirando
        logoRt.localScale = Vector3.one * (1f + (0.5f + 0.5f * Mathf.Sin(t * 1.8f)) * 0.02f);

        // Pirulito
        pirulitoRt.Rotate(0, 0, -velocidadePirulito * dt);

        // Motor do kart: tremido rápido + balanço lento
        float motor = Mathf.Abs(Mathf.Sin(t * 38f)) * 0.006f + (0.5f + 0.5f * Mathf.Sin(t * 3f)) * 0.01f;
        kartRt.localScale = new Vector3(1f + motor * 0.5f, 1f + motor, 1f);

        // Brilho do botão: passa a cada 3 segundos
        float ciclo = (t % 3f) / 3f;
        float largura = ((RectTransform)bJogar.transform).rect.width;
        brilhoBotao.anchoredPosition = new Vector2(Mathf.Lerp(-largura * 0.7f, largura * 0.7f, ciclo * 2.2f), 0f);
    }

    IEnumerator Entrada()
    {
        bJogar.escalaEntrada = bConfig.escalaEntrada = bNome.escalaEntrada = 1.3f;
        StartCoroutine(LoopFumaca());
        StartCoroutine(LoopEstrelas());

        yield return Fade(1f, 0f, 0.6f);
        yield return Pular(bJogar);
        yield return Pular(bConfig);
        yield return Pular(bNome);
    }

    IEnumerator Pular(BotaoDoce b)
    {
        float d = 0.35f, t = 0f;
        while (t < d)
        {
            t += Time.unscaledDeltaTime;
            float p = Mathf.Clamp01(t / d);
            b.escalaEntrada = 1f + 0.3f * (1f - p) * Mathf.Cos(p * Mathf.PI * 2.5f) * (1f - p);
            yield return null;
        }
        b.escalaEntrada = 1f;
    }

    IEnumerator Fade(float de, float para, float dur)
    {
        veu.raycastTarget = true;
        float t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            veu.color = new Color(1, 1, 1, Mathf.Lerp(de, para, t / dur));
            yield return null;
        }
        veu.color = new Color(1, 1, 1, para);
        veu.raycastTarget = para > 0.01f;
    }

    // ============================ Efeitos ============================

    IEnumerator LoopFumaca()
    {
        while (true)
        {
            StartCoroutine(Fumaca());
            yield return new WaitForSecondsRealtime(Random.Range(0.18f, 0.35f));
        }
    }

    IEnumerator Fumaca()
    {
        var img = NovaImagem("Fumaca", efeitos, fumaca, Vector4.zero, false);
        var rt = img.rectTransform;
        rt.SetSiblingIndex(0);
        rt.anchorMin = rt.anchorMax = PontoRef(SaidaFumaca);
        Vector2 dir = new Vector2(Random.Range(-60f, -30f), Random.Range(20f, 45f));
        float dur = Random.Range(0.9f, 1.4f), t = 0f, tam = Random.Range(18f, 28f);
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float p = t / dur;
            rt.anchoredPosition = dir * p;
            rt.sizeDelta = Vector2.one * tam * (1f + p * 1.8f);
            img.color = new Color(1f, 0.95f, 0.98f, 0.55f * (1f - p));
            yield return null;
        }
        Destroy(img.gameObject);
    }

    IEnumerator LoopEstrelas()
    {
        while (true)
        {
            if (efeitos.childCount < estrelasSimultaneas + 20) StartCoroutine(Estrela());
            yield return new WaitForSecondsRealtime(Random.Range(0.25f, 0.6f));
        }
    }

    IEnumerator Estrela()
    {
        var img = NovaImagem("Estrela", efeitos, brilho, Vector4.zero, false);
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = PontoRef(new Vector2(
            Random.Range(AreaEstrelas.x, AreaEstrelas.z), Random.Range(AreaEstrelas.y, AreaEstrelas.w)));
        float tam = Random.Range(14f, 30f), dur = Random.Range(0.8f, 1.4f), t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float s = Mathf.Sin(Mathf.Clamp01(t / dur) * Mathf.PI);
            rt.sizeDelta = Vector2.one * tam * s;
            rt.localRotation = Quaternion.Euler(0, 0, t * 90f);
            img.color = new Color(1, 1, 1, s);
            yield return null;
        }
        Destroy(img.gameObject);
    }

    void OnJogar()
    {
        if (saindo) return;
        saindo = true;
        veu.raycastTarget = true;
        StartCoroutine(Saida());
    }

    IEnumerator Saida()
    {
        Vector2 origem = PontoRef(new Vector2((CaixaJogar.x + CaixaJogar.z) / 2f, (CaixaJogar.y + CaixaJogar.w) / 2f));
        for (int i = 0; i < 70; i++) StartCoroutine(Confete(origem));
        // A velocidade original é preservada ao voltar ao menu.
        yield return new WaitForSecondsRealtime(0.7f);
        yield return Fade(0f, 1f, 0.45f);
        aoJogar.Invoke();
    }

    IEnumerator Confete(Vector2 ancora)
    {
        var img = NovaImagem("Confete", efeitos, null, Vector4.zero, false);
        img.color = CoresConfete[Random.Range(0, CoresConfete.Length)];
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = ancora;
        rt.sizeDelta = new Vector2(Random.Range(8f, 14f), Random.Range(14f, 22f));
        Vector2 vel = new Vector2(Random.Range(-700f, 700f), Random.Range(350f, 950f));
        float giro = Random.Range(-720f, 720f), t = 0f;
        Vector2 pos = Vector2.zero;
        while (t < 1.6f)
        {
            float dt = Time.unscaledDeltaTime;
            t += dt;
            vel += new Vector2(-vel.x * 1.5f * dt, -1400f * dt);
            pos += vel * dt;
            rt.anchoredPosition = pos;
            rt.localRotation = Quaternion.Euler(0, 0, giro * t);
            rt.localScale = new Vector3(Mathf.Cos(t * 12f), 1f, 1f); // "vira" no ar
            yield return null;
        }
        Destroy(img.gameObject);
    }

    // ============================ Utilitários ============================

    static Vector2 PontoRef(Vector2 p) => new Vector2(p.x / Ref.x, 1f - p.y / Ref.y);

    static Vector4 Relativa(Vector4 filho, Vector4 pai) =>
        new Vector4(filho.x - pai.x, filho.y - pai.y, filho.z - pai.x, filho.w - pai.y);

    Image NovaImagem(string nome, RectTransform pai, Sprite s, Vector4 caixa, bool clicavel)
    {
        var rt = NovoRect(nome, pai);
        var img = rt.gameObject.AddComponent<Image>();
        img.sprite = s;
        img.raycastTarget = clicavel;
        if (caixa != Vector4.zero)
        {
            // Caixa em pixels da arte, relativa ao retângulo do pai
            Vector2 tamPai = pai == palco ? Ref : pai.rect.size;
            if (pai == logoRt) tamPai = new Vector2(CaixaLogo.z - CaixaLogo.x, CaixaLogo.w - CaixaLogo.y);
            rt.anchorMin = new Vector2(caixa.x / tamPai.x, 1f - caixa.w / tamPai.y);
            rt.anchorMax = new Vector2(caixa.z / tamPai.x, 1f - caixa.y / tamPai.y);
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }
        return img;
    }

    static RectTransform NovoRect(string nome, Transform pai)
    {
        var go = new GameObject(nome, typeof(RectTransform));
        var rt = (RectTransform)go.transform;
        rt.SetParent(pai, false);
        return rt;
    }

    static void Esticar(RectTransform rt)
    {
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = rt.offsetMax = Vector2.zero;
    }

    static void MudarPivo(RectTransform rt, Vector2 pivo)
    {
        // Com âncoras esticadas e offsets zerados, trocar o pivô não move o retângulo.
        rt.pivot = pivo;
    }
}
