import {
  CylinderGeometry, Group, MathUtils, Mesh, MeshStandardMaterial,
  Object3D, Quaternion, SphereGeometry, Vector3, type Scene,
} from 'three';
import { KART } from '../config/kart';
import type { Kart } from './kart';
import { loadRabbitModel, type RabbitCharacter } from './rabbitModels';

interface Joint { object: Object3D; rest: Quaternion }

export class KartView {
  readonly root = new Group();
  readonly ready: Promise<void>;
  private readonly wheelGroups: Object3D[] = [];
  private readonly renderPosition = new Vector3();
  private readonly renderOrientation = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly axisX = new Vector3(1, 0, 0);
  private readonly axisZ = new Vector3(0, 0, 1);
  private ears: Joint[] = [];
  private arms: Joint[] = [];
  private head?: Joint;
  private rabbit?: Object3D;
  private rabbitY = 0;
  private earAngle = 0;
  private earVelocity = 0;
  private previousSpeed = 0;
  private initialized = false;
  private phase = 0;
  private bounce = 0;
  private lean = 0;
  private armAngle = 0;
  private readonly taillights = new MeshStandardMaterial({
    color: 0xff426a, emissive: 0xff426a, emissiveIntensity: 0.5, roughness: 0.3,
  });
  private readonly exhaustGlow = new MeshStandardMaterial({
    color: 0xffc9dd, emissive: 0xffc9dd, emissiveIntensity: 0.2, roughness: 0.35,
  });
  private readonly exhaust = new Mesh(new CylinderGeometry(0.075, 0.095, 0.2, 12), this.exhaustGlow);

  constructor(private readonly kart: Kart, scene: Scene, readonly character: RabbitCharacter = 'Amora') {
    this.root.name = `RabbitKart_${character}`;
    scene.add(this.root);
    this.ready = loadRabbitModel(character).then((template) => {
      const model = template.clone(true);
      // Model axles are 1.10 m apart; the existing physics uses 1.32 m.
      model.scale.setScalar(1.2);
      model.position.y = KART.wheels.attachY - KART.suspension.restLength - 0.24;
      this.root.add(model);
      for (const wheel of kart.wheels) {
        const mesh = this.requirePart(model, `Wheel_${wheel.spec.name}`);
        const group = new Group();
        group.name = `Suspension_${wheel.spec.name}`;
        group.add(mesh);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        // Match collision tire radii without changing handling or suspension.
        mesh.scale.setScalar(wheel.spec.radius / (wheel.spec.isFront ? 0.20 : 0.26));
        this.wheelGroups.push(group);
        this.root.add(group);
      }
      const joint = (name: string): Joint => {
        const object = this.requirePart(model, name);
        return { object, rest: object.quaternion.clone() };
      };
      this.ears = [joint('Ear_L'), joint('Ear_R')];
      this.arms = [joint('Arm_L'), joint('Arm_R')];
      this.head = joint('Head');
      this.rabbit = this.requirePart(model, 'Rabbit');
      this.rabbitY = this.rabbit.position.y;
      for (const side of [-1, 1]) {
        const light = new Mesh(new SphereGeometry(0.055, 10, 8), this.taillights);
        light.position.set(side * 0.4, -0.23, -0.88);
        light.scale.set(1.4, 0.65, 0.5);
        this.root.add(light);
      }
      this.exhaust.rotation.x = Math.PI / 2;
      this.exhaust.position.set(0, -0.3, -0.91);
      this.root.add(this.exhaust);
      this.root.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.update(1, 0);
    });
  }

  private requirePart(model: Object3D, name: string): Object3D {
    const part = model.getObjectByName(name);
    if (!part) throw new Error(`${this.character}: pivo ${name} ausente no modelo 3D.`);
    return part;
  }

  update(alpha: number, frameDt = 0): void {
    this.kart.getRenderTransform(alpha, this.renderPosition, this.renderOrientation);
    this.root.position.copy(this.renderPosition);
    this.root.quaternion.copy(this.renderOrientation);
    for (let i = 0; i < this.wheelGroups.length; i++) {
      const group = this.wheelGroups[i];
      const wheel = this.kart.wheels[i];
      group.position.copy(wheel.spec.positionLocal);
      group.position.y -= KART.suspension.restLength - wheel.compression;
      group.rotation.set(0, wheel.steerAngle, 0);
      group.rotateX(wheel.spinAngle);
    }
    if (this.rabbit && frameDt > 0) this.animateDriver(Math.min(frameDt, 0.1));
    const telemetry = this.kart.telemetry;
    this.taillights.emissiveIntensity = telemetry.forwardSpeed > 1 && telemetry.driveForce <= 0 ? 2.6 : 0.5;
    const boost = this.kart.drift.boostTimeRemaining;
    this.exhaustGlow.emissiveIntensity = 0.2 + boost * 4.5;
    const bulge = 1 + boost * 0.35;
    this.exhaust.scale.set(bulge, 1, bulge);
  }

  private animateDriver(dt: number): void {
    const telemetry = this.kart.telemetry;
    const speed = telemetry.forwardSpeed;
    if (!this.initialized || telemetry.respawned) {
      this.previousSpeed = speed;
      this.earAngle = this.earVelocity = this.lean = this.armAngle = this.bounce = this.phase = 0;
      this.initialized = true;
    }
    const acceleration = MathUtils.clamp((speed - this.previousSpeed) / dt, -35, 35);
    this.previousSpeed = speed;
    const target = MathUtils.clamp(-acceleration * 0.018, -0.4, 0.4);
    for (let remaining = dt; remaining > 0;) {
      const step = Math.min(remaining, 1 / 120);
      this.earVelocity += ((target - this.earAngle) * 85 - this.earVelocity * 11) * step;
      this.earAngle += this.earVelocity * step;
      remaining -= step;
    }
    const steer = MathUtils.clamp(telemetry.steerAngleDeg / KART.steering.maxAngleDegrees, -1, 1);
    const mix = 1 - Math.exp(-10 * dt);
    this.lean = MathUtils.lerp(this.lean, -steer * MathUtils.clamp(speed / 8, -1, 1) * 0.22, mix);
    this.armAngle = MathUtils.lerp(this.armAngle, steer * 0.24, mix);
    this.phase = (this.phase + Math.abs(speed) * dt * 4) % (Math.PI * 2);
    this.bounce = MathUtils.lerp(this.bounce,
      telemetry.wheelsOnGround > 0 ? Math.min(Math.abs(speed) / 4, 1) * 0.012 : 0, mix);
    for (const ear of this.ears) this.pose(ear, this.axisX, this.earAngle);
    if (this.head) this.pose(this.head, this.axisZ, this.lean);
    this.arms.forEach((arm, i) => this.pose(arm, this.axisX, this.armAngle * (i === 0 ? 1 : -1)));
    this.rabbit!.position.y = this.rabbitY + Math.sin(this.phase) * this.bounce;
  }

  private pose(joint: Joint, axis: Vector3, angle: number): void {
    this.rotation.setFromAxisAngle(axis, angle);
    joint.object.quaternion.copy(joint.rest).multiply(this.rotation);
  }
}
