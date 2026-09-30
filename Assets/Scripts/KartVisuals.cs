using System;
using UnityEngine;

[DisallowMultipleComponent]
public sealed class KartVisuals : MonoBehaviour
{
    public enum Personagem { Nuvem, Amora, Caramelo, Violeta }

    [Serializable]
    public sealed class Aparencia
    {
        public Personagem personagem;
        public Material[] materiais;
    }

    [Header("Entrada")]
    public Rigidbody kartRigidbody;
    public bool inverterGiro;
    [SerializeField] private Personagem personagem;
    public Aparencia[] aparencias = new Aparencia[0];

    [Header("Animacao")]
    [Range(0f, 60f)] public float anguloEsterco = 28f;
    [Min(0.01f)] public float suavidade = 10f;
    [Min(0f)] public float molaOrelhas = 80f;
    [Min(0f)] public float amortecimentoOrelhas = 12f;
    [Min(0f)] public float respostaAceleracao = 0.8f;
    [Min(0f)] public float amplitudeQuique = 0.012f;
    [Min(0.001f)] public float raioFL = 0.20f;
    [Min(0.001f)] public float raioFR = 0.20f;
    [Min(0.001f)] public float raioRL = 0.26f;
    [Min(0.001f)] public float raioRR = 0.26f;

    private readonly string[] nomes = {
        "Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR",
        "Steer_FL", "Steer_FR", "Ear_L", "Ear_R", "Head", "Arm_L", "Arm_R", "Rabbit"
    };
    private Transform[] partes;
    private Quaternion[] rotacoes;
    private Vector3 posicaoCorpo;
    private Renderer[] renderizadores;
    private Material[][] materiaisOriginais;
    private readonly float[] giros = new float[4];
    private float velocidadeEntrada, volanteEntrada, velocidadeAnterior;
    private float volanteSuave, inclinacaoCabeca, fase, quique;
    private float orelha, velocidadeOrelha;
    private bool primeiraAmostra = true;

    private void Awake()
    {
        Inicializar();
        AplicarPersonagem(personagem);
    }

    private void Inicializar()
    {
        if (partes != null) return;
        partes = new Transform[nomes.Length];
        rotacoes = new Quaternion[nomes.Length];
        foreach (Transform filho in GetComponentsInChildren<Transform>(true))
        {
            int i = Array.IndexOf(nomes, filho.name);
            if (i < 0) continue;
            partes[i] = filho;
            rotacoes[i] = filho.localRotation;
        }
        if (partes[11] != null) posicaoCorpo = partes[11].localPosition;
        renderizadores = GetComponentsInChildren<Renderer>(true);
        materiaisOriginais = new Material[renderizadores.Length][];
        for (int i = 0; i < renderizadores.Length; i++)
            materiaisOriginais[i] = renderizadores[i].sharedMaterials;
    }

    // Velocidade em metros/segundo, com sinal; volante entre -1 e 1.
    // Com Rigidbody atribuido, SetInput continua fornecendo o volante.
    public void SetInput(float velocidade, float volante)
    {
        velocidadeEntrada = Finito(velocidade) ? velocidade : 0f;
        volanteEntrada = Finito(volante) ? Mathf.Clamp(volante, -1f, 1f) : 0f;
    }

    public void AplicarPersonagem(Personagem novoPersonagem)
    {
        Inicializar();
        Aparencia aparencia = Array.Find(aparencias, a => a != null && a.personagem == novoPersonagem);
        if (aparencia == null || aparencia.materiais == null || aparencia.materiais.Length == 0)
        {
            Debug.LogWarning("KartVisuals: gere o prefab pelo menu Tools/Rabbit Kart/Criar prefab para configurar as aparencias.", this);
            return;
        }
        personagem = novoPersonagem;
        for (int i = 0; i < renderizadores.Length; i++)
        {
            Material[] materiais = (Material[])materiaisOriginais[i].Clone();
            for (int j = 0; j < materiais.Length; j++)
            {
                if (materiais[j] == null) continue;
                string papel = PapelMaterial(materiais[j].name);
                Material substituto = Array.Find(aparencia.materiais,
                    m => m != null && PapelMaterial(m.name) == papel);
                if (substituto != null) materiais[j] = substituto;
            }
            renderizadores[i].sharedMaterials = materiais;
        }
    }

    private static string PapelMaterial(string nome)
    {
        nome = nome.Replace(" (Instance)", "");
        int separador = nome.IndexOf('_');
        return separador < 0 ? nome : nome.Substring(separador + 1);
    }

    private static bool Finito(float valor) => !float.IsNaN(valor) && !float.IsInfinity(valor);

    private void LateUpdate()
    {
        float dt = Time.deltaTime;
        if (dt <= 0f) return;
        float velocidade = velocidadeEntrada;
        if (kartRigidbody != null)
        {
#if UNITY_6000_0_OR_NEWER
            Vector3 movimento = kartRigidbody.linearVelocity;
#else
            Vector3 movimento = kartRigidbody.velocity;
#endif
            velocidade = Vector3.Dot(movimento, transform.forward);
        }
        float aceleracao = primeiraAmostra ? 0f : (velocidade - velocidadeAnterior) / dt;
        primeiraAmostra = false;
        velocidadeAnterior = velocidade;
        float mistura = 1f - Mathf.Exp(-Mathf.Max(0.01f, suavidade) * dt);
        volanteSuave = Mathf.Lerp(volanteSuave, volanteEntrada, mistura);
        for (int i = 0; i < 4; i++)
        {
            if (partes[i] == null) continue;
            float raio = i == 0 ? raioFL : i == 1 ? raioFR : i == 2 ? raioRL : raioRR;
            float escala = Mathf.Abs(partes[i].lossyScale.y);
            float graus = velocidade * dt / Mathf.Max(0.001f, raio * escala) * Mathf.Rad2Deg;
            giros[i] = Mathf.Repeat(giros[i] + graus * (inverterGiro ? -1f : 1f), 360f);
            Girar(i, giros[i], 0f, 0f);
        }
        Girar(4, 0f, volanteSuave * anguloEsterco, 0f);
        Girar(5, 0f, volanteSuave * anguloEsterco, 0f);

        // Passos curtos mantem a mola estavel mesmo com quedas de frame.
        float restante = Mathf.Min(dt, 0.1f);
        float alvo = Mathf.Clamp(-aceleracao * respostaAceleracao, -25f, 25f);
        while (restante > 0f)
        {
            float passo = Mathf.Min(restante, 1f / 120f);
            velocidadeOrelha += ((alvo - orelha) * Mathf.Clamp(molaOrelhas, 0f, 500f)
                - velocidadeOrelha * Mathf.Clamp(amortecimentoOrelhas, 0f, 60f)) * passo;
            orelha = Mathf.Clamp(orelha + velocidadeOrelha * passo, -35f, 35f);
            restante -= passo;
        }
        Girar(6, orelha, 0f, 0f);
        Girar(7, orelha, 0f, 0f);
        inclinacaoCabeca = Mathf.Lerp(inclinacaoCabeca,
            -volanteSuave * Mathf.Clamp(velocidade / 8f, -1f, 1f) * 12f, mistura);
        Girar(8, 0f, 0f, inclinacaoCabeca);
        Girar(9, volanteSuave * 12f, 0f, -volanteSuave * 8f);
        Girar(10, -volanteSuave * 12f, 0f, -volanteSuave * 8f);
        fase = Mathf.Repeat(fase + Mathf.Abs(velocidade) * dt * 4f, Mathf.PI * 2f);
        quique = Mathf.Lerp(quique, amplitudeQuique * Mathf.Clamp01(Mathf.Abs(velocidade) / 3f), mistura);
        if (partes[11] != null)
            partes[11].localPosition = posicaoCorpo + Vector3.up * (Mathf.Sin(fase) * quique);
    }

    private void Girar(int indice, float x, float y, float z)
    {
        if (partes[indice] != null)
            partes[indice].localRotation = rotacoes[indice] * Quaternion.Euler(x, y, z);
    }

    private void OnDisable()
    {
        if (partes == null) return;
        for (int i = 0; i < partes.Length; i++)
            if (partes[i] != null) partes[i].localRotation = rotacoes[i];
        if (partes[11] != null) partes[11].localPosition = posicaoCorpo;
        Array.Clear(giros, 0, giros.Length);
        orelha = velocidadeOrelha = volanteSuave = inclinacaoCabeca = fase = quique = 0f;
        primeiraAmostra = true;
    }
}
