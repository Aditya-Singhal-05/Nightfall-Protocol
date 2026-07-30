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
    this.aiming = false;
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

    // Mobile Control States
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touchMove = { x: 0, y: 0 }; // Virtual Joystick (-1 to 1)
    this.touchLookId = null;
    this.lastTouchLook = { x: 0, y: 0 };
    this.mobileJump = false;

    this._bindListeners();
    this._initListeners();

    if (this.isMobile) {
      this._createMobileUI();
    }
  }

  _bindListeners() {
    this._boundKeyDown = (e) => { this.keys[e.code] = true; };
    this._boundKeyUp = (e) => { this.keys[e.code] = false; };
    this._boundMouseMove = (e) => {
      if (!this.locked && !this.isMobile) return;
      this.mouseDelta.x += e.movementX || 0;
      this.mouseDelta.y += e.movementY || 0;
    };
    this._boundPointerLock = () => {
      this.locked = document.pointerLockElement === this.dom;
    };
  }

  _initListeners() {
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('pointerlockchange', this._boundPointerLock);
  }

  // --- Mobile Touch Controls Setup ---
  _createMobileUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; user-select: none; z-index: 9999;
    `;

    // Left Joystick Area
    const joyBase = document.createElement('div');
    joyBase.style.cssText = `
      position: absolute; bottom: 40px; left: 40px; width: 120px; height: 120px;
      border-radius: 50%; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3);
      pointer-events: auto; touch-action: none;
    `;

    const joyStick = document.createElement('div');
    joyStick.style.cssText = `
      position: absolute; top: 35px; left: 35px; width: 50px; height: 50px;
      border-radius: 50%; background: rgba(255,255,255,0.5); pointer-events: none;
    `;
    joyBase.appendChild(joyStick);

    // Joystick Touch Handling
    let joyTouchId = null;
    let joyCenter = { x: 0, y: 0 };

    joyBase.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      joyTouchId = touch.identifier;
      const rect = joyBase.getBoundingClientRect();
      joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    joyBase.addEventListener('touchmove', (e) => {
      for (let touch of e.changedTouches) {
        if (touch.identifier === joyTouchId) {
          const dx = touch.clientX - joyCenter.x;
          const dy = touch.clientY - joyCenter.y;
          const dist = Math.min(Math.hypot(dx, dy), 50);
          const angle = Math.atan2(dy, dx);

          const stickX = Math.cos(angle) * dist;
          const stickY = Math.sin(angle) * dist;
          joyStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

          this.touchMove.x = stickX / 50;
          this.touchMove.y = -stickY / 50; // Invert Y for forward/back
        }
      }
    });

    const resetJoy = (e) => {
      for (let touch of e.changedTouches) {
        if (touch.identifier === joyTouchId) {
          joyTouchId = null;
          joyStick.style.transform = `translate(0px, 0px)`;
          this.touchMove = { x: 0, y: 0 };
        }
      }
    };
    joyBase.addEventListener('touchend', resetJoy);
    joyBase.addEventListener('touchcancel', resetJoy);

    // Right Side Touch Screen Look Area
    const lookArea = document.createElement('div');
    lookArea.style.cssText = `
      position: absolute; top: 0; right: 0; width: 50%; height: 100%;
      pointer-events: auto; touch-action: none;
    `;

    lookArea.addEventListener('touchstart', (e) => {
      if (this.touchLookId !== null) return;
      const touch = e.changedTouches[0];
      this.touchLookId = touch.identifier;
      this.lastTouchLook = { x: touch.clientX, y: touch.clientY };
    });

    lookArea.addEventListener('touchmove', (e) => {
      for (let touch of e.changedTouches) {
        if (touch.identifier === this.touchLookId) {
          const dx = touch.clientX - this.lastTouchLook.x;
          const dy = touch.clientY - this.lastTouchLook.y;

          this.mouseDelta.x += dx * 1.5;
          this.mouseDelta.y += dy * 1.5;

          this.lastTouchLook = { x: touch.clientX, y: touch.clientY };
        }
      }
    });

    const resetLook = (e) => {
      for (let touch of e.changedTouches) {
        if (touch.identifier === this.touchLookId) {
          this.touchLookId = null;
        }
      }
    };
    lookArea.addEventListener('touchend', resetLook);
    lookArea.addEventListener('touchcancel', resetLook);

    // Helper Action Buttons (Jump, Crouch, Sprint)
    const createBtn = (text, bottom, right, onClick) => {
      const btn = document.createElement('div');
      btn.innerText = text;
      btn.style.cssText = `
        position: absolute; bottom: ${bottom}px; right: ${right}px;
        width: 60px; height: 60px; border-radius: 50%;
        background: rgba(255,255,255,0.25); border: 2px solid #fff;
        color: #fff; font-family: sans-serif; font-weight: bold; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
        pointer-events: auto; touch-action: none;
      `;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); onClick(true); });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); onClick(false); });
      return btn;
    };

    const jumpBtn = createBtn('JUMP', 40, 40, (val) => { this.mobileJump = val; });
    const crouchBtn = createBtn('CROUCH', 40, 115, (val) => { this.keys['ControlLeft'] = val; });
    const sprintBtn = createBtn('RUN', 115, 40, (val) => { this.keys['ShiftLeft'] = val; });

    this.uiContainer.appendChild(joyBase);
    this.uiContainer.appendChild(lookArea);
    this.uiContainer.appendChild(jumpBtn);
    this.uiContainer.appendChild(crouchBtn);
    this.uiContainer.appendChild(sprintBtn);

    document.body.appendChild(this.uiContainer);
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('pointerlockchange', this._boundPointerLock);

    if (this.uiContainer) {
      this.uiContainer.remove();
    }
  }

  requestLock() { 
    if (!this.isMobile) this.dom.requestPointerLock(); 
  }
  exitLock() { 
    if (!this.isMobile) document.exitPointerLock(); 
  }

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

    // ---- movement input (Keyboard OR Virtual Joystick) ----
    let forward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    let strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    if (this.isMobile) {
      forward = this.touchMove.y;
      strafe = this.touchMove.x;
    }

    const moving = forward !== 0 || strafe !== 0;
    this.sprinting = !!this.keys['ShiftLeft'] && forward > 0 && !this.crouching && this.stamina > 1;

    if (this.sprinting) this.stamina = clamp(this.stamina - dt * 22, 0, 100);
    else this.stamina = clamp(this.stamina + dt * 12, 0, 100);

    let speed = this.crouching ? 2.0 : (this.sprinting ? 6.4 : 3.8);
    this.currentSpeed = moving ? speed : 0;

    const dir = new THREE.Vector3(strafe, 0, -forward);
    if (dir.lengthSq() > 1) dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;

    // ---- gravity / jump ----
    const wantsJump = this.keys['Space'] || this.mobileJump;
    if (this.onGround && wantsJump) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    if (!this.onGround) this.velocity.y += GRAVITY * dt;

    // ---- integrate Y ----
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
