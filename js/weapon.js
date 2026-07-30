import * as THREE from 'three';
import { damp, randRange } from './utils.js';
import { makeMetalTexture, makeCamoTexture } from './textures.js';
import { playGunshot, playReload } from './audio.js';

export class Weapon {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this.magSize = 30;
    this.ammoInMag = 30;
    this.ammoReserve = 90;
    this.fireRate = 0.095; // seconds between shots
    this.damage = 24;
    this.spreadBase = 0.012;
    this.spreadMoving = 0.045;
    this.range = 120;

    this.cooldown = 0;
    this.reloading = false;
    this.reloadTime = 1.7;
    this.reloadTimer = 0;

    this.aiming = false;
    this.aimAmount = 0;
    this.recoilKick = 0;
    this.recoilRot = new THREE.Vector2();
    this.swayOffset = new THREE.Vector2();
    this.bobPhase = 0;

    this._buildModel();

    this.tracers = [];
    this.impactParticles = [];
    this.muzzleLight = new THREE.PointLight(0xffd27a, 0, 6, 2);
    this.gunGroup.add(this.muzzleLight);
    this.muzzleLight.position.set(0, 0, -0.9);
  }

  _buildModel() {
    const metalTex = makeMetalTexture('#2b2d2b');
    const gripTex = makeCamoTexture();
    const metalMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.4, metalness: 0.8 });
    const gripMat = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.9, metalness: 0.05 });

    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), metalMat);
    body.position.set(0, -0.01, -0.25);
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.72);
    group.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.09), gripMat);
    mag.position.set(0, -0.19, -0.18);
    mag.rotation.x = 0.25;
    group.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.28), gripMat);
    stock.position.set(0, -0.02, 0.14);
    group.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.07), gripMat);
    grip.position.set(0, -0.14, 0.02);
    grip.rotation.x = -0.3;
    group.add(grip);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.14), metalMat);
    sight.position.set(0, 0.075, -0.2);
    group.add(sight);

    group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    this.gunGroup = group;
    this.restPosition = new THREE.Vector3(0.26, -0.22, -0.5);
    this.aimPosition = new THREE.Vector3(0, -0.09, -0.32);
    group.position.copy(this.restPosition);
    this.camera.add(group);
  }

  reload() {
    if (this.reloading || this.ammoInMag === this.magSize || this.ammoReserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
    playReload();
  }

  canFire() {
    return !this.reloading && this.cooldown <= 0 && this.ammoInMag > 0;
  }

  fire(originQuat, originPos, moving) {
    if (!this.canFire()) return null;
    this.ammoInMag--;
    this.cooldown = this.fireRate;
    this.recoilKick = Math.min(this.recoilKick + 1, 3);
    this.recoilRot.x += randRange(0.01, 0.022);
    this.recoilRot.y += randRange(-0.008, 0.008);
    playGunshot(this.aiming ? 0.35 : 0.5);
    this.muzzleLight.intensity = 6;

    const spread = (this.aiming ? this.spreadBase * 0.35 : this.spreadBase) + (moving ? this.spreadMoving : 0);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(originQuat);
    dir.x += randRange(-spread, spread);
    dir.y += randRange(-spread, spread);
    dir.normalize();

    this._spawnMuzzleFlash();
    return { origin: originPos.clone(), dir, damage: this.damage, range: this.range };
  }

  spawnTracer(origin, hitPoint) {
    const dist = origin.distanceTo(hitPoint);
    const geo = new THREE.CylinderGeometry(0.01, 0.01, dist, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin).lerp(hitPoint, 0.5);
    mesh.lookAt(hitPoint);
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.06 });
  }

  spawnImpact(point, normal, colorHex = 0xffcf5c) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(randRange(-1, 1), randRange(0.3, 1.6), randRange(-1, 1))
        .add(normal.clone().multiplyScalar(1.5));
      this.impactParticles.push({ mesh, vel, life: randRange(0.3, 0.6) });
    }
    // small spark flash
    const flashLight = new THREE.PointLight(colorHex, 3, 3, 2);
    flashLight.position.copy(point);
    this.scene.add(flashLight);
    this.impactParticles.push({ mesh: flashLight, vel: new THREE.Vector3(), life: 0.05, isLight: true });
  }

  _spawnMuzzleFlash() {
    // handled via muzzleLight intensity decay in update
  }

  update(dt, moving) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzleLight.intensity = damp(this.muzzleLight.intensity, 0, 18, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.magSize - this.ammoInMag;
        const take = Math.min(needed, this.ammoReserve);
        this.ammoInMag += take;
        this.ammoReserve -= take;
        this.reloading = false;
      }
    }

    this.aimAmount = damp(this.aimAmount, this.aiming ? 1 : 0, 11, dt);
    this.recoilKick = damp(this.recoilKick, 0, 9, dt);
    this.recoilRot.x = damp(this.recoilRot.x, 0, 7, dt);
    this.recoilRot.y = damp(this.recoilRot.y, 0, 7, dt);

    // sway + bob
    this.bobPhase += dt * (moving ? (this.aiming ? 6 : 9) : 1.4);
    const swayX = Math.sin(this.bobPhase) * (moving ? 0.012 : 0.003) * (1 - this.aimAmount * 0.7);
    const swayY = Math.abs(Math.cos(this.bobPhase)) * (moving ? 0.01 : 0.002) * (1 - this.aimAmount * 0.7);

    const targetPos = this.restPosition.clone().lerp(this.aimPosition, this.aimAmount);
    targetPos.x += swayX;
    targetPos.y += swayY - this.recoilKick * 0.01;
    targetPos.z += this.recoilKick * 0.02;

    this.gunGroup.position.x = damp(this.gunGroup.position.x, targetPos.x, 16, dt);
    this.gunGroup.position.y = damp(this.gunGroup.position.y, targetPos.y, 16, dt);
    this.gunGroup.position.z = damp(this.gunGroup.position.z, targetPos.z, 16, dt);
    this.gunGroup.rotation.x = damp(this.gunGroup.rotation.x, -this.recoilRot.x + swayY * 0.4, 10, dt);
    this.gunGroup.rotation.y = damp(this.gunGroup.rotation.y, this.recoilRot.y + swayX * 0.4, 10, dt);

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.life / 0.06) * 0.85;
      if (tr.life <= 0) { this.scene.remove(tr.mesh); this.tracers.splice(i, 1); }
    }
    // impact particles
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const p = this.impactParticles[i];
      p.life -= dt;
      if (p.isLight) {
        p.mesh.intensity = Math.max(0, p.life / 0.05) * 3;
      } else {
        p.vel.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.material.opacity = Math.max(0, p.life / 0.6);
        p.mesh.material.transparent = true;
      }
      if (p.life <= 0) { this.scene.remove(p.mesh); this.impactParticles.splice(i, 1); }
    }
  }

  get recoilPitchKick() { return this.recoilKick * 0.006; }
}
