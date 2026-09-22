import { RACE } from '../config/race';
import type { Competitor } from '../race/raceDirector';

export interface SeriesStanding {
  readonly name: string;
  readonly isPlayer: boolean;
  readonly position: number;
  readonly points: number;
  readonly wins: number;
}

/**
 * Tela de fim de corrida: troféu, colocação e o pelotão inteiro.
 *
 * O troféu é um SVG desenhado à mão no HTML — escala em qualquer tela, não
 * pesa nada e não depende de arquivo de imagem, o que importa num jogo que é
 * entregue como um único `.html`.
 *
 * Quem não venceu vê o mesmo troféu parado e sem cor. Mostrar troféu dourado
 * pulando para quem chegou em quarto seria estranho; esconder tudo seria
 * mesquinho. O troféu apagado diz "quase" sem precisar de texto.
 */
export class FinishScreen {
  private readonly screen: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly standings: HTMLElement;
  private visible = false;

  constructor(onRestart: () => void) {
    this.screen = requireElement('finish-screen');
    this.title = requireElement('finish-title');
    this.detail = requireElement('finish-detail');
    this.standings = requireElement('finish-standings');
    requireElement('restart-button').addEventListener('click', onRestart);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(
    competitors: readonly Competitor[],
    playerPosition: number,
    winner: Competitor | null,
    series?: readonly SeriesStanding[],
    seriesHeats = 1,
  ): void {
    if (this.visible) return;
    this.visible = true;

    const ordered = [...competitors].sort((a, b) => a.position - b.position);
    const champion =
      series?.find((competitor) => competitor.position === 1) ??
      winner ??
      ordered.find((competitor) => competitor.position === 1) ??
      null;

    // Com dois pilotos humanos a segunda pessoa do singular deixa de servir:
    // "Você terminou em 3º" não diz nada para quem está dividindo a tela. O
    // texto passa a ser nominal, e "você" volta a aparecer só no modo solo.
    const rows = series ?? ordered;
    const humans = rows.filter((competitor) => competitor.isPlayer);
    const coop = humans.length > 1;

    const won = champion?.isPlayer ?? playerPosition === 1;
    const winnerName = champion ? (champion.isPlayer && !coop ? 'Você' : champion.name) : 'Vencedor';
    const playerSeriesPosition = series?.find((competitor) => competitor.isPlayer)?.position;

    this.screen.classList.toggle('perdeu', !won);
    this.title.textContent =
      won && !coop ? 'VOCÊ VENCEU!' : `${winnerName.toUpperCase()} VENCEU!`;

    this.detail.textContent = coop
      ? coopDetail(humans, champion, winnerName, series ? seriesHeats : 0)
      : series
        ? won
          ? `${seriesHeats} corridas completas. Você levou o campeonato!`
          : `Você terminou o campeonato em ${ordinal(playerSeriesPosition ?? playerPosition)}. ${winnerName} levou o troféu.`
        : won
          ? `${RACE.laps} voltas, primeiro lugar. O troféu é seu!`
          : `Você terminou em ${ordinal(playerPosition)}. ${winnerName} levou o troféu desta vez.`;

    this.standings.innerHTML = '';
    for (const competitor of rows) {
      const row = document.createElement('div');
      row.className =
        `linha${competitor.isPlayer ? ' eu' : ''}${competitor === champion ? ' vencedor' : ''}`;

      const position = document.createElement('span');
      position.className = 'pos';
      position.textContent = `${competitor.position}º`;

      const name = document.createElement('span');
      name.className = 'nome';
      const displayName =
        competitor.isPlayer && !coop ? `${competitor.name} (você)` : competitor.name;
      name.textContent = competitor === champion ? `Troféu - ${displayName}` : displayName;

      const time = document.createElement('span');
      time.className = 'tempo';
      time.textContent = 'points' in competitor
        ? `${competitor.points} pts`
        : competitor.finished
          ? formatTime(competitor.finishTime)
          : '—';

      row.append(position, name, time);
      this.standings.appendChild(row);
    }

    this.screen.classList.add('visible');
    requireElement('restart-button').focus();
  }

  hide(): void {
    this.visible = false;
    this.screen.classList.remove('visible');
  }
}

/**
 * O texto do coop.
 *
 * Aqui a informação que importa não é "em que lugar o pelotão terminou", e sim
 * **quem dos dois ganhou de quem** — é essa a conversa que acontece no sofá
 * depois da corrida. Então o duelo entre os humanos vem primeiro na frase, e o
 * pelotão só é mencionado se um piloto de verdade tiver levado o troféu.
 */
function coopDetail(
  humans: readonly { name: string; position: number }[],
  champion: { isPlayer: boolean; name: string } | null,
  winnerName: string,
  seriesHeats: number,
): string {
  const ranked = [...humans].sort((a, b) => a.position - b.position);
  const placings = ranked
    .map((human) => `${human.name} em ${ordinal(human.position)}`)
    .join(', ');

  const prefix = seriesHeats > 0 ? `${seriesHeats} corridas completas. ` : '';

  // Empate de colocação não existe (o diretor ordena por metro percorrido),
  // mas com um humano só na lista a frase de duelo não faria sentido.
  if (ranked.length < 2) return `${prefix}${placings}.`;

  const duel = `${ranked[0].name} levou a melhor sobre ${ranked[1].name}`;
  return champion?.isPlayer
    ? `${prefix}${duel}. ${placings}.`
    : `${prefix}${duel}, mas ${winnerName} levou o troféu. ${placings}.`;
}

function ordinal(position: number): string {
  return `${position}º`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado`);
  return element;
}
