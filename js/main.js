import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { Level } from './level.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { Enemy } from './enemies.js';
import { MissionManager, STAGE } from './objectives.js';
import { HUD } from './hud.js';
import { rayBoxDistance, clamp, lerp } from './utils.js';
import { unlockAudio } from './audio.js';

// ---------------- renderer / scene / camera ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
const baseFov = 72, aimFov = 46;
scene.add(camera);

// ---------------- post-processing ----------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.82);
composer.addPass(bloom);

const vignetteShader = {
  uniforms: { tDiffuse: { value: null }, offset: { value: 1.15 }, darkness: { value: 1.1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = clamp(1.0 - dot(uv, uv) * darkness, 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vig, texel.a);
    }`
};
const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);
composer.addPass(new OutputPass());

// ---------------- world ----------------
const level = new Level(scene);
const hud = new HUD();
const player = new Player(camera, canvas, level);
const weapon = new Weapon(camera, scene);
const mission = new MissionManager(level, hud);

const enemies = [];
let priorityCount = 0;
level.spawnPoints.forEach((sp, i) => {
  const e = new Enemy(scene, sp, i);
  if (e.priority && priorityCount < 2) { priorityCount++; }
  else e.priority = false;
  enemies.push(e);
});
mission.setPriorityTotal(priorityCount);

// ---------------- interaction state ----------------
let started = false;
let paused = false;
let interactHeld = false;
let firing = false;

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-bar-fill');

// Asset Loading Simulation
let loadPct = 0;
const loadInterval = setInterval(() => {
  loadPct = Math.min(100, loadPct + Math.random() * 30 + 10);
  loadingFill.style.width = loadPct + '%';
  if (loadPct >= 100) {
    clearInterval(loadInterval);
    loadingScreen.classList.add('hidden');
  }
}, 120);

// Safe deploy/start function for Desktop & Mobile
function launchGame() {
  unlockAudio();
  started = true;
  paused = false;
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');

  // Request pointer lock only on supported devices (Desktop)
  if ('requestPointerLock' in document.body && player.requestLock) {
    player.requestLock();
  }
}

document.getElementById('start-btn').addEventListener('click', launchGame);
document.getElementById('start-btn').addEventListener('touchstart', launchGame, { passive: true });
document.getElementById('resume-btn').addEventListener('click', launchGame);
document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    started = true; paused = false;
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
  } else if (started && !mission.done && 'requestPointerLock' in document.body) {
    paused = true;
    pauseScreen.classList.remove('hidden');
  }
});

// Desktop Controls
window.addEventListener('mousedown', (e) => {
  if (!player.locked && 'requestPointerLock' in document.body) return;
  if (e.button === 0) { firing = true; }
  if (e.button === 2) { weapon.aiming = true; player.aiming = true; }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) { weapon.aiming = false; player.aiming = false; }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') weapon.reload();
  if (e.code === 'KeyE') interactHeld = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') interactHeld = false;
});

// ---------------- Mobile Touch Controls (FIXED) ----------------
let mainTouchLookId = null;
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  if (!started) return;

  for (let touch of e.changedTouches) {
    // Ignore touches on UI elements or left half of screen (Joystick side)
    if (touch.clientX < window.innerWidth / 2) continue;

    // Track finger on the right side for aiming & shooting
    if (mainTouchLookId === null) {
      mainTouchLookId = touch.identifier;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      if (e.touches.length === 1) {
        firing = true;
      } else if (e.touches.length >= 2) {
        weapon.aiming = true;
        player.aiming = true;
      }
    }
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!started) return;

  for (let touch of e.changedTouches) {
    if (touch.identifier === mainTouchLookId) {
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // Drag to look around
      camera.rotation.y -= deltaX * 0.005;
      camera.rotation.x -= deltaY * 0.005;
      camera.rotation.x = clamp(camera.rotation.x, -Math.PI / 2.5, Math.PI / 2.5);

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  for (let touch of e.changedTouches) {
    if (touch.identifier === mainTouchLookId) {
      mainTouchLookId = null;
      firing = false;
      weapon.aiming = false;
      player.aiming = false;
    }
  }
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- hitscan ----------------
function performHitscan(shot) {
  const dir = shot.dir;
  const origin = shot.origin;
  let bestT = shot.range;
  let hit = null;

  for (const b of level.colliders) {
    const t = rayBoxDistance(origin, dir, b);
    if (t < bestT) { bestT = t; hit = { type: 'wall', t }; }
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const targets = [
      { c: new THREE.Vector3(enemy.position.x, enemy.position.y + 1.15, enemy.position.z), r: 0.32, mult: 1.0 },
      { c: new THREE.Vector3(enemy.position.x, enemy.position.y + 1.62, enemy.position.z), r: 0.18, mult: 2.2 },
    ];
    for (const target of targets) {
      const toCenter = new THREE.Vector3().subVectors(target.c, origin);
      const t = toCenter.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const dist = closest.distanceTo(target.c);
      if (dist <= target.r) {
        bestT = t;
        hit = { type: 'enemy', t, enemy, mult: target.mult, point: closest };
      }
    }
  }

  return hit;
}

function tryFire() {
  if (!firing || !player.alive) return;
  const originQuat = camera.getWorldQuaternion(new THREE.Quaternion());
  const originPos = camera.getWorldPosition(new THREE.Vector3());
  const moving = player.currentSpeed > 0.1;
  const shot = weapon.fire(originQuat, originPos, moving);
  if (!shot) {
    if (weapon.ammoInMag === 0 && !weapon.reloading) weapon.reload();
    return;
  }
  const hit = performHitscan(shot);
  const endPoint = hit ? shot.origin.clone().addScaledVector(shot.dir, hit.t) : shot.origin.clone().addScaledVector(shot.dir, shot.range);
  weapon.spawnTracer(shot.origin, endPoint);

  if (hit && hit.type === 'enemy') {
    const dmg = shot.damage * hit.mult;
    hit.enemy.takeDamage(dmg, hit.point);
    hud.showHitmarker();
    weapon.spawnImpact(hit.point, new THREE.Vector3(0, 1, 0), 0xff5555);
    if (!hit.enemy.alive) {
      hud.addKillfeed(hit.enemy.priority ? 'TARGET NEUTRALIZED' : 'HOSTILE DOWN');
      mission.registerKill(hit.enemy.priority);
    }
  } else if (hit && hit.type === 'wall') {
    weapon.spawnImpact(endPoint, new THREE.Vector3(0, 1, 0), 0xffcf5c);
  }
}

// ---------------- enemy fires at player ----------------
function enemyShoot(enemy, dist) {
  const falloff = clamp(1 - dist / 45, 0.1, 1);
  const hitChance = (enemy.sniper ? 0.55 : 0.32) * falloff;
  if (Math.random() < hitChance) {
    const dmg = enemy.sniper ? randRangeLocal(18, 32) : randRangeLocal(6, 14);
    player.takeDamage(dmg);
    hud.flashDamage();
  }
  const flashPos = enemy.position.clone(); flashPos.y += 1.2;
  const light = new THREE.PointLight(0xffaa55, 4, 5, 2);
  light.position.copy(flashPos);
  scene.add(light);
  setTimeout(() => scene.remove(light), 60);
}
function randRangeLocal(a, b) { return a + Math.random() * (b - a); }

// ---------------- reinforcements ----------------
let reinforcementsSpawned = false;
function spawnReinforcements() {
  if (reinforcementsSpawned) return;
  reinforcementsSpawned = true;
  level.reinforcementPoints.forEach((pos, i) => {
    setTimeout(() => {
      const e = new Enemy(scene, { pos: pos.clone(), yaw: 0, patrol: [pos.clone()] }, 100 + i);
      e.priority = false;
      e.state = 'alert';
      enemies.push(e);
      hud.addKillfeed('REINFORCEMENTS INBOUND');
    }, i * 1400);
  });
}

// ---------------- end screen ----------------
function showEndScreen() {
  if (document.exitPointerLock) document.exitPointerLock();
  const title = document.getElementById('end-title');
  const subtitle = document.getElementById('end-subtitle');
  if (mission.result === 'win') {
    title.textContent = 'MISSION COMPLETE';
    title.style.color = '#6effa0';
    subtitle.textContent = `Extraction successful — ${mission.kills} hostiles eliminated.`;
  } else {
    title.textContent = 'MISSION FAILED';
    title.style.color = '#ff5555';
    subtitle.textContent = mission.result === 'lose_timer'
      ? 'Extraction window missed. Compound overrun.'
      : 'You were eliminated in the field.';
  }
  endScreen.classList.remove('hidden');
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!started || paused || mission.done) {
    renderer.render(scene, camera);
    return;
  }
  elapsed += dt;

  player.update(dt, level.colliders);
  if (!player.alive) mission.playerDied();

  weapon.update(dt, player.currentSpeed > 0.1);
  camera.fov = lerp(camera.fov, weapon.aiming ? aimFov : baseFov, 1 - Math.pow(0.001, dt));
  camera.updateProjectionMatrix();

  tryFire();

  const playerPos = player.position;
  enemies.forEach(e => e.update(dt, playerPos, player.alive, level.colliders, enemyShoot, camera));

  level.update(dt, elapsed);

  if (mission.stage === STAGE.EXTRACT) spawnReinforcements();
  mission.update(dt, playerPos, interactHeld);

  hud.setHealth(player.health, player.maxHealth);
  hud.setAmmo(weapon.ammoInMag, weapon.ammoReserve, weapon.reloading);
  hud.setStamina(player.stamina, player.sprinting);
  hud.setSpread(weapon.aiming ? 0.1 : (player.currentSpeed > 0.1 ? 0.7 : 0.25));

  if (mission.done && !endScreen._shown) {
    endScreen._shown = true;
    setTimeout(showEndScreen, 700);
  }

  composer.render();
}

animate();
