import { Box3, Mesh, Scene, Vector3 } from 'three';
import { Kart } from '../src/vehicle/kart';
import { KartView } from '../src/vehicle/kartView';
import type { RabbitCharacter } from '../src/vehicle/rabbitModels';

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const scene = new Scene();
for (const character of ['Amora', 'Nuvem', 'Caramelo', 'Violeta'] as RabbitCharacter[]) {
  const kart = new Kart();
  const view = new KartView(kart, scene, character);
  await view.ready;
  check(!!view.root.getObjectByName('Kart_Body'), `${character}: carroceria ausente`);
  let meshes = 0;
  view.root.traverse(object => { if (object instanceof Mesh) meshes++; });
  check(meshes > 25, `${character}: modelo incompleto`);
  for (const wheel of kart.wheels) {
    const mesh = view.root.getObjectByName(`Wheel_${wheel.spec.name}`)!;
    const size = new Box3().setFromObject(mesh).getSize(new Vector3());
    check(Math.abs(size.y - wheel.spec.radius * 2) < 0.0001, `${character}: raio incorreto`);
    const pivot = mesh.parent!;
    check(pivot.parent === view.root, `${character}: roda fora da suspensao`);
    wheel.spinAngle = 1.4;
    wheel.steerAngle = wheel.spec.steered ? 0.2 : 0;
    view.update(1, 0);
    check(Math.abs(pivot.quaternion.x) > 0.1, `${character}: roda nao girou`);
  }
  const ear = view.root.getObjectByName('Ear_L')!;
  const head = view.root.getObjectByName('Head')!;
  const arm = view.root.getObjectByName('Arm_L')!;
  const rest = ear.quaternion.clone();
  kart.telemetry.respawned = false;
  view.update(1, 1 / 60);
  kart.telemetry.wheelsOnGround = 4;
  kart.telemetry.steerAngleDeg = 20;
  for (let frame = 1; frame <= 60; frame++) {
    kart.telemetry.forwardSpeed = frame / 6;
    view.update(1, 1 / 60);
  }
  check(rest.angleTo(ear.quaternion) > 0.05, `${character}: orelha nao respondeu a aceleracao`);
  check(Math.abs(head.quaternion.z) > 0.01, `${character}: cabeca nao inclinou`);
  check(Math.abs(arm.quaternion.x + 0.173648) > 0.01, `${character}: braco nao acompanhou volante`);
  const paused = ear.quaternion.clone();
  view.update(1, 0);
  check(paused.angleTo(ear.quaternion) < 0.000001, `${character}: animacao avancou em pausa`);
  for (let frame = 0; frame < 300; frame++) view.update(1, 1 / 60);
  check(rest.angleTo(ear.quaternion) < 0.001, `${character}: mola nao estabilizou`);
  console.log(`${character}: ${meshes} malhas; raios, suspensao, giro, orelhas, curvas e pausa OK`);
}

const first = new KartView(new Kart(), scene, 'Amora');
const second = new KartView(new Kart(), scene, 'Amora');
await Promise.all([first.ready, second.ready]);
const firstEar = first.root.getObjectByName('Ear_L')!;
const secondEar = second.root.getObjectByName('Ear_L')!;
const original = secondEar.quaternion.clone();
firstEar.rotateX(0.4);
check(original.angleTo(secondEar.quaternion) < 0.000001, 'Instancias compartilham transformacoes');
console.log('Instancias independentes: OK');
