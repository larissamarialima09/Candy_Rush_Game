using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;

/// <summary>
/// Botão "de bala": pulsa parado, cresce ao passar o mouse,
/// dá um "pop" ao tocar e só então dispara o evento.
/// A escala nunca fica abaixo de 1, para cobrir a arte do fundo.
///
/// Usado pelos botões do MenuCandyRush no Canvas da tela inicial.
/// </summary>
public class BotaoDoce : MonoBehaviour,
    IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler, IPointerClickHandler
{
    public float pulso = 0.03f;
    public float velocidadePulso = 2.4f;
    public float fase;
    public float escalaHover = 1.07f;
    public float escalaPressionado = 1.12f;
    public UnityEvent aoClicar = new UnityEvent();

    [HideInInspector] public float escalaEntrada = 1f; // controlada pela intro do menu

    float alvo = 1f, atual = 1f, velocidade;
    bool pressionado, dentro;

    void OnDisable() { pressionado = dentro = false; atual = alvo = 1f; velocidade = 0f; }

    void Update()
    {
        float t = Time.unscaledTime * velocidadePulso + fase;
        float idle = 1f + (0.5f + 0.5f * Mathf.Sin(t)) * pulso;

        alvo = pressionado ? escalaPressionado : dentro ? escalaHover : idle;
        // mola simples: dá um leve "quique"
        atual = Mathf.SmoothDamp(atual, alvo, ref velocidade, 0.08f, Mathf.Infinity, Time.unscaledDeltaTime);
        transform.localScale = Vector3.one * Mathf.Max(1f, atual) * escalaEntrada;
    }

    public void OnPointerEnter(PointerEventData e) => dentro = true;
    public void OnPointerExit(PointerEventData e) { dentro = false; pressionado = false; }
    public void OnPointerDown(PointerEventData e) => pressionado = true;
    public void OnPointerUp(PointerEventData e) => pressionado = false;

    public void OnPointerClick(PointerEventData e)
    {
        if (e.button != PointerEventData.InputButton.Left) return;
        velocidade = 6f; // empurrão extra para o "pop"
        aoClicar.Invoke();
    }
}
