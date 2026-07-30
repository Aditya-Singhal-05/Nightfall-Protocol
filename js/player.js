import * as THREE from 'three';
import { clamp, damp, resolveCollisions } from './utils.js';
import { playFootstep } from './audio.js';

const EYE_HEIGHT_STAND = 1.7;
const EYE_HEIGHT_CROUCH = 1.05;
const RADIUS = 0.35;
const GRAVITY = -22;
const JUMP_SPEED = 7.2;

export class Player {
  constructor(camera, domElement, level) {
    this.camera = camera;
    this.dom = domElement;
    this.level = level;

    this.position = new THREE.Vector3(0, 0, 30);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.height = EYE_HEIGHT_STAND;
    this.targetHeight = EYE_HEIGHT_STAND;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.aiming = false; // Initialized aim state
    this.locked = false;

    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.alive = true;

    this.bobTime = 0;
    this.bobAmount = 0;
    this.camShakeTime = 0;
    this.camShakeMag = 0;

    this.keys = {};
    this.mouseDelta = { x: 0, y: 0 };

    this._boundKeyDown = (e) => { this.keys[e.code] = true; };
    this._boundKeyUp = (e) => { this.keys[e.code] = false; };
    this._boundMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDelta.x += e.movementX || 0;
      this.mouseDelta.y += e.movementY || 0;
    };
    this._boundPointerLock = () => {
      this.locked = document.pointerLockElement === this.dom;
    };

    this._initListeners();
  }

  _initListeners() {
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('pointerlockchange', this._boundPointerLock);
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('pointerlockchange', this._boundPointerLock);
  }

  requestLock() { this.dom.requestPointerLock(); }
  exitLock() { document.exitPointerLock(); }

  takeDamage(amount, dirVec) {
    if (!this.alive) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.lastHitTime = performance.now();
    this.camShakeMag = Math.min(this.camShakeMag + amount * 0.015, 0.4);
    if (this.health <= 0) {
      this.alive = false;
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.height, this.position.z);
  }

  update(dt, colliders) {
    if (!this.alive) return;

    // ---- look ----
    const sensitivity = 0.0022 * (this.aiming ? 0.45 : 1);
    this.yaw -= this.mouseDelta.x * sensitivity;
    this.pitch -= this.mouseDelta.y * sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.mouseDelta.x = 0; 
    this.mouseDelta.y = 0;

    // ---- crouch / height ----
    this.crouching = !!this.keys['ControlLeft'] || !!this.keys['KeyC'];
    this.targetHeight = this.crouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    this.height = damp(this.height, this.targetHeight, 12, dt);

    // ---- movement input ----
    const forward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const moving = forward !== 0 || strafe !== 0;
    this.sprinting = !!this.keys['ShiftLeft'] && forward > 0 && !this.crouching && this.stamina > 1;

    if (this.sprinting) this.stamina = clamp(this.stamina - dt * 22, 0, 100);
    else this.stamina = clamp(this.stamina + dt * 12, 0, 100);

    let speed = this.crouching ? 2.0 : (this.sprinting ? 6.4 : 3.8);
    this.currentSpeed = moving ? speed : 0;

    const dir = new THREE.Vector3(strafe, 0, -forward);
    if (dir.lengthSq() > 0) dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;

    // ---- gravity / jump ----
    if (this.onGround && this.keys['Space']) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    if (!this.onGround) this.velocity.y += GRAVITY * dt;

    // ---- integrate Y first for cleaner grounding ----
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // ---- integrate X/Z and resolve colliders ----
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    if (colliders) {
      resolveCollisions(this.position, RADIUS, this.height, colliders);
    }

    // world bounds safety net
    this.position.x = clamp(this.position.x, -58, 58);
    this.position.z = clamp(this.position.z, -58, 58);

    // ---- footstep audio / bob ----
    if (moving && this.onGround) {
      const bobSpeed = this.sprinting ? 14 : (this.crouching ? 7 : 10);
      this.bobTime += dt * bobSpeed;
      this.bobAmount = damp(this.bobAmount, this.crouching ? 0.03 : 0.055, 10, dt);
      
      // Play footstep on both peak and trough (left and right step)
      const currentSign = Math.sign(Math.sin(this.bobTime));
      if (this._lastStepSign !== undefined && this._lastStepSign !== currentSign) {
        playFootstep(this.sprinting ? 0.22 : 0.13);
      }
      this._lastStepSign = currentSign;
    } else {
      this.bobAmount = damp(this.bobAmount, 0, 8, dt);
      this._lastStepSign = undefined;
    }

    // ---- camera shake decay ----
    this.camShakeMag = damp(this.camShakeMag, 0, 6, dt);
    this.camShakeTime += dt * 40;

    this._applyCamera();
  }

  _applyCamera() {
    const bobY = Math.sin(this.bobTime * 2) * this.bobAmount;
    const bobX = Math.sin(this.bobTime) * this.bobAmount * 0.5;
    const shakeX = (Math.sin(this.camShakeTime * 3.1) * this.camShakeMag * 0.6);
    const shakeY = (Math.cos(this.camShakeTime * 2.7) * this.camShakeMag * 0.6);

    this.camera.position.set(
      this.position.x + bobX + shakeX * 0.05,
      this.position.y + this.height + bobY + shakeY * 0.05,
      this.position.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + shakeX * 0.05;
    this.camera.rotation.x = this.pitch + shakeY * 0.05;
    this.camera.rotation.z = -bobX * 0.6;
  }
}
