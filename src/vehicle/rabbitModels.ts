import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import amora from '../../Assets/Models/RabbitKarts/RabbitKart_Amora.glb';
import nuvem from '../../Assets/Models/RabbitKarts/RabbitKart_Nuvem.glb';
import caramelo from '../../Assets/Models/RabbitKarts/RabbitKart_Caramelo.glb';
import violeta from '../../Assets/Models/RabbitKarts/RabbitKart_Violeta.glb';

export type RabbitCharacter = 'Amora' | 'Nuvem' | 'Caramelo' | 'Violeta';
const urls: Record<RabbitCharacter, string> = { Amora: amora, Nuvem: nuvem, Caramelo: caramelo, Violeta: violeta };
const cache = new Map<RabbitCharacter, Promise<Group>>();

export function loadRabbitModel(character: RabbitCharacter): Promise<Group> {
  let pending = cache.get(character);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(urls[character]);
      if (!response.ok) throw new Error(`Falha ao carregar ${character}: HTTP ${response.status}`);
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      return gltf.scene;
    })();
    cache.set(character, pending);
  }
  return pending;
}
