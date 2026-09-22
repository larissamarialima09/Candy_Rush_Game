/**
 * Moedas de bala espalhadas pela pista.
 *
 * São o primeiro motivo do jogo para você escolher ONDE passar dentro da
 * pista, em vez de só passar rápido. Ficam alternando de lado para formarem
 * uma linha serpenteante — pegar todas custa um pouco de traçado, e é essa
 * troca que as torna interessantes.
 */
export const PICKUPS = {
  coins: {
    /** Uma moeda a cada N metros de pista. */
    spacing: 14,
    /** Altura acima do asfalto, em metros. */
    height: 0.85,
    /**
     * Deslocamento lateral máximo, como fração da meia-largura da pista.
     * Menor que 1 para as moedas nunca nascerem em cima da zebra.
     */
    lateralFraction: 0.55,
    /** Comprimento de onda do serpenteio, em moedas. */
    weaveLength: 7,
    /** Maiores do que pareceria certo: de dentro do kart elas ficam pequenas. */
    radius: 0.6,
    thickness: 0.16,
    /** Raio de coleta, em metros, medido do centro do kart. */
    pickupRadius: 1.7,
    /** Segundos até uma moeda coletada voltar. */
    respawnSeconds: 9,
    /** Voltas por segundo da moeda girando. */
    spinSpeed: 0.75,
    /** Amplitude do flutuar, em metros. */
    bobAmplitude: 0.14,
    bobSpeed: 1.6,
    color: 0xffd76a,
    emissive: 0xff9ec4,
    /** Intensidade do brilho emissivo. À noite é o que as faz saltar. */
    emissiveIntensity: 1.4,
  },
} as const;
