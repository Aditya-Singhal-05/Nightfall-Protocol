import * as THREE from 'three';
import { clamp, damp, lineOfSight, randRange } from './utils.js';
import { makeCamoTexture, makeMetalTexture } from './textures.js';
import { playHit } from './audio.js';

let sharedCamoMat = null, sharedSkinMat = null, sharedGearMat = null;
function materials() {
  if (!sharedCamoMat) {
    sharedCamoMat = new THREE.MeshStandardMaterial({ map: makeCamoTexture(), roughness: 0.85, metalness: 0.05 });
    sharedSkinMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.9 });
    sharedGearMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#232620'), roughness: 0.6, metalness: 0.4 });
  }
  return { camo: sharedCamoMat, skin: sharedSkinMat, gear: sharedGearMat };
}

const STATE = { IDLE: 'idle', PATROL: 'patrol', ALERT: 'alert', ATTACK: 'attack', DEAD: 'dead' };

export class Enemy {
  constructor(scene, spawn, id) {
    this.scene = scene;
    this.id = id;
    this.health = 60;
    this.maxHealth = 60;
    this.state = STATE.PATROL;
    this.patrol = spawn.patrol && spawn.patrol.length ? spawn.patrol : [spawn.pos.clone()];
    this.patrolIndex = 0;
    this.sniper = !!spawn.sniper;
    this.position = spawn.pos.clone();
    this.yaw = spawn.yaw || 0;
    this.alertTimer = 0;
    this.fireTimer = randRange(0.3, 1.2);
    this.deathTimer = 0;
    this.alive = true;
    this.legPhase = 0;
    this.priority = !this.sniper;

    this._buildModel();
    this.group.position.copy(this.position);
  }

  _buildModel() {
    const { camo, skin, gear } = materials();
    const g = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), camo);
    torso.position.y = 1.15;
    torso.castShadow = true; torso.receiveShadow = true;
    g.add(torso);
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    this.head = head;

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), gear);
    helmet.position.y = 1.68;
    helmet.castShadow = true;
    g.add(helmet);

    const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.15);
    const armL = new THREE.Mesh(armGeo, camo); armL.position.set(-0.33, 1.18, 0.05); armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, camo); armR.position.set(0.33, 1.18, 0.05); armR.castShadow = true;
    g.add(armL, armR);
    this.armL = armL; this.armR = armR;

    const legGeo = new THREE.BoxGeometry(0.17, 0.62, 0.19);
    const legL = new THREE.Mesh(legGeo, gear); legL.position.set(-0.13, 0.55, 0); legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, gear); legR.position.set(0.13, 0.55, 0); legR.castShadow = true;
    g.add(legL, legR);
    this.legL = legL; this.legR = legR;

    // weapon
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), gear);
    gun.position.set(0.4, 1.2, -0.1);
    gun.castShadow = true;
    g.add(gun);
    this.gun = gun;

    // health bar sprite (billboard using canvas)
    this.healthBarGroup = this._makeHealthBar();
    this.healthBarGroup.position.y = 2.0;
    g.add(this.healthBarGroup);

    this.scene.add(g);
    this.group = g;
  }

  _makeHealthBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.08), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.06), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    fill.position.z = 0.001;
    g.add(bg, fill);
    g.visible = false;
    this._hpFill = fill;
    return g;
  }

  takeDamage(amount, hitPos) {
    if (!this.alive) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.healthBarGroup.visible = true;
    this._hpFill.scale.x = this.health / this.maxHealth;
    this._hpFill.position.x = -(1 - this.health / this.maxHealth) * 0.29;
    playHit();
    if (this.health <= 0) this.die();
    else this.state = STATE.ALERT;
  }

  die() {
    this.alive = false;
    this.state = STATE.DEAD;
    this.deathTimer = 0;
    this.healthBarGroup.visible = false;
  }

  distanceToPlayer(playerPos) {
    return this.position.distanceTo(playerPos);
  }

  update(dt, playerPos, playerAlive, colliders, onShootPlayer, camera) {
    if (this.state === STATE.DEAD) {
      this.deathTimer += dt;
      const fall = clamp(this.deathTimer / 0.5, 0, 1);
      this.group.rotation.z = -fall * Math.PI * 0.5;
      this.group.position.y = this.position.y - fall * 0.15;
      return;
    }
    if (!playerAlive) { this.state = STATE.PATROL; }

    const dist = this.distanceToPlayer(playerPos);
    const sightRange = this.sniper ? 60 : 26;
    const canSee = playerAlive && lineOfSight(
      { x: this.position.x, y: this.position.y + 1.5, z: this.position.z },
      { x: playerPos.x, y: playerPos.y + 1.4, z: playerPos.z },
      colliders, sightRange
    );

    if (canSee) {
      this.alertTimer = 1.2;
      this.state = dist < (this.sniper ? 55 : 20) ? STATE.ATTACK : STATE.ALERT;
    } else {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0 && this.state !== STATE.PATROL) this.state = STATE.PATROL;
    }

    // face target
    let moveDir = null;
    if (this.state === STATE.ATTACK || this.state === STATE.ALERT) {
      const dx = playerPos.x - this.position.x, dz = playerPos.z - this.position.z;
      const targetYaw = Math.atan2(dx, dz);
      this.yaw = dampAngle(this.yaw, targetYaw, 6, dt);

      if (this.state === STATE.ALERT && dist > (this.sniper ? 40 : 12)) {
        moveDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      }
      if (this.state === STATE.ATTACK && !this.sniper && dist < 5) {
        // back off a little to keep firing range
        moveDir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      }
    } else {
      // patrol toward current waypoint
      const target = this.patrol[this.patrolIndex];
      const dx = target.x - this.position.x, dz = target.z - this.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.6) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      } else if (!this.sniper) {
        const targetYaw = Math.atan2(dx, dz);
        this.yaw = dampAngle(this.yaw, targetYaw, 3, dt);
        moveDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      }
    }

    const speed = this.state === STATE.ALERT ? 3.2 : 1.4;
    if (moveDir) {
      this.position.x += moveDir.x * speed * dt;
      this.position.z += moveDir.z * speed * dt;
      this.legPhase += dt * speed * 3;
    } else {
      this.legPhase = damp(this.legPhase, this.legPhase, 1, dt);
    }

    // shooting
    if (this.state === STATE.ATTACK) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.sniper ? randRange(1.6, 2.4) : randRange(0.5, 1.0);
        onShootPlayer(this, dist);
      }
    }

    // apply transform
    this.group.position.set(this.position.x, this.position.y, this.position.z);
    this.group.rotation.y = this.yaw;
    const walkSwing = moveDir ? Math.sin(this.legPhase) * 0.5 : 0;
    this.legL.rotation.x = walkSwing;
    this.legR.rotation.x = -walkSwing;
    this.armL.rotation.x = -walkSwing * 0.6;

    // billboard health bar
    if (camera) this.healthBarGroup.quaternion.copy(camera.quaternion);
  }
}

function dampAngle(current, target, lambda, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export { STATE };
