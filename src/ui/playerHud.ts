import { COOP } from '../config/coop';
import type { Viewport } from '../core/splitScreen';
import { DriftGauge } from './driftGauge';
import { RaceHud } from './raceHud';

/**
 * O HUD de um jogador: o bloco de HTML, o medidor de drift e o placar de
 * voltas, todos presos à faixa de tela desse jogador.
 *
 * O markup vem de um `<template>` no `index.html` e é clonado uma vez por
 * jogador. Escrever o HUD duas vezes à mão no HTML significaria manter duas
 * cópias em sincronia para sempre; gerá-lo inteiro em JavaScript jogaria fora o
 * CSS que já existe. Clonar um template resolve os dois.
 *
 * Cada bloco é posicionado em pixels absolutos a partir do MESMO retângulo que
 * o renderer usa para o viewport WebGL. É isso que garante que o velocímetro do
 * jogador 1 nunca apareça flutuando dentro da imagem do jogador 2.
 */
export class PlayerHud {
  readonly root: HTMLElement;
  readonly raceHud: RaceHud;
  readonly gauge: DriftGauge;

  private readonly tag: HTMLElement;

  constructor(container: HTMLElement, index: number, playerCount: number) {
    this.root = instantiateTemplate();
    container.appendChild(this.root);

    const profile = COOP.players[index] ?? COOP.players[0];
    this.tag = requireChild(this.root, '.player-tag');
    this.tag.textContent = profile.label;
    this.tag.style.setProperty('--tint', profile.tint);
    this.root.style.setProperty('--tint-soft', `${profile.tint}66`);

    this.setPlayerCount(playerCount);

    this.raceHud = new RaceHud(this.root);
    this.gauge = new DriftGauge(this.root);
  }

  /**
   * Reage à entrada ou à saída do segundo piloto.
   *
   * Precisa valer para TODOS os HUDs, e não só para o que acabou de nascer: o
   * bloco do piloto 1 é criado ainda no menu, quando o modo é desconhecido, e
   * se não fosse reavaliado continuaria em tamanho de tela cheia e sem tarja
   * depois que a tela se dividisse.
   */
  setPlayerCount(playerCount: number): void {
    const coop = playerCount > 1;
    // Sozinho na tela, a tarja "P1" é ruído: não há com quem confundir.
    this.tag.hidden = !coop;
    this.root.classList.toggle('split', coop);
    this.root.style.setProperty('--hud-scale', coop ? String(COOP.hudScale) : '1');
  }

  /** Encaixa o bloco exatamente sobre a faixa de tela deste jogador. */
  setViewport(viewport: Viewport): void {
    const style = this.root.style;
    style.left = `${viewport.x}px`;
    style.top = `${viewport.y}px`;
    style.width = `${viewport.width}px`;
    style.height = `${viewport.height}px`;
  }

  dispose(): void {
    this.root.remove();
  }
}

function instantiateTemplate(): HTMLElement {
  const template = document.getElementById('player-view-template');
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error('Template #player-view-template não encontrado');
  }

  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>('.player-view');
  if (!root) throw new Error('Template do HUD não contém .player-view');
  return root;
}

function requireChild(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado no HUD`);
  return element;
}
