import * as THREE from 'three';
import { makeBox } from './utils.js';
import {
  makeConcreteTexture, makeMetalTexture, makeCamoTexture,
  makeGroundTexture, makeEmissiveStripTexture, makeStarfieldTexture
} from './textures.js';

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];      // AABB list for player/enemy collision
    this.spawnPoints = [];    // enemy spawn transforms {pos, yaw, patrol}
    this.reinforcementPoints = [];
    this.markers = {};        // named trigger positions
    this.decals = [];
    this.buildSky();
    this.buildLighting();
    this.buildGround();
    this.buildPerimeter();
    this.buildContainerYard();
    this.buildWatchtower();
    this.buildTargetBuilding();
    this.buildEvac();
    this.buildProps();
  }

  addCollider(box, opts = {}) {
    box.isCover = opts.isCover !== false;
    this.colliders.push(box);
    return box;
  }

  addMesh(geo, mat, x, y, z, ry = 0, castShadow = true, receiveShadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    this.scene.add(m);
    return m;
  }

  buildSky() {
    const tex = makeStarfieldTexture();
    const geo = new THREE.SphereGeometry(400, 32, 32);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    this.scene.add(new THREE.Mesh(geo, mat));
    this.scene.fog = new THREE.FogExp2(0x0a1210, 0.016);
  }

  buildLighting() {
    // Cold moonlight
    const moon = new THREE.DirectionalLight(0x8fa8ff, 0.65);
    moon.position.set(-40, 60, -30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -70; moon.shadow.camera.right = 70;
    moon.shadow.camera.top = 70; moon.shadow.camera.bottom = -70;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 180;
    moon.shadow.bias = -0.0015;
    this.scene.add(moon);
    this.moon = moon;

    const ambient = new THREE.HemisphereLight(0x33415a, 0x0a0c08, 0.55);
    this.scene.add(ambient);

    // compound floodlights
    this.floodlights = [];
    const addFlood = (x, z, targetX, targetZ) => {
      const spot = new THREE.SpotLight(0xfff0c8, 8, 55, Math.PI / 6, 0.4, 1.4);
      spot.position.set(x, 9, z);
      spot.target.position.set(targetX, 0, targetZ);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.002;
      this.scene.add(spot); this.scene.add(spot.target);
      this.floodlights.push(spot);
    };
    addFlood(-20, -20, 0, 0);
    addFlood(20, -20, 0, 0);
    addFlood(0, 22, 0, 6);

    // alarm lights (toggled by objectives.js)
    this.alarmLights = [];
    [[-14, 2.8, -10], [14, 2.8, -10], [0, 2.8, 12]].forEach(([x, y, z]) => {
      const l = new THREE.PointLight(0xff2222, 0, 14, 2);
      l.position.set(x, y, z);
      this.scene.add(l);
      this.alarmLights.push(l);
    });
  }

  setAlarm(active) {
    this.alarmActive = active;
  }

  updateAlarm(t) {
    if (!this.alarmLights) return;
    const on = this.alarmActive && (Math.sin(t * 8) > 0);
    this.alarmLights.forEach(l => { l.intensity = on ? 6 : 0; });
  }

  buildGround() {
    const groundTex = makeGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.02 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // paved courtyard patch
    const concreteTex = makeConcreteTexture();
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.85 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  buildWall(cx, cz, length, height, thickness, ry, mat) {
    const geo = new THREE.BoxGeometry(length, height, thickness);
    this.addMesh(geo, mat, cx, height / 2, cz, ry);
    const halfL = length / 2, halfT = thickness / 2;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const sx = Math.abs(cos) * length + Math.abs(sin) * thickness;
    const sz = Math.abs(sin) * length + Math.abs(cos) * thickness;
    this.addCollider(makeBox(cx, height / 2, cz, sx, height, sz));
  }

  buildPerimeter() {
    const mat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(), roughness: 0.9 });
    const H = 5, T = 1;
    const D = 55;
    // four walls with gate gap on +Z (entrance)
    this.buildWall(0, -D, D * 2, H, T, 0, mat);        // back
    this.buildWall(-D, 0, D * 2, H, T, Math.PI / 2, mat); // left
    this.buildWall(D, 0, D * 2, H, T, Math.PI / 2, mat);  // right
    this.buildWall(-D * 0.62, D, D * 0.75, H, T, 0, mat); // front-left segment
    this.buildWall(D * 0.62, D, D * 0.75, H, T, 0, mat);  // front-right segment (gate gap in middle)

    // gate pillars
    const pillarMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#3a3f36'), roughness: 0.6, metalness: 0.5 });
    [-6, 6].forEach(x => {
      this.addMesh(new THREE.BoxGeometry(1.2, 6, 1.2), pillarMat, x, 3, D);
      this.addCollider(makeBox(x, 3, D, 1.2, 6, 1.2));
    });

    this.markers.entrance = new THREE.Vector3(0, 0, D - 6);
  }

  buildContainerYard() {
    const metalColors = ['#5a3a2c', '#2c4a5a', '#5a4a2c', '#3a5a3a'];
    const containerMat = metalColors.map(c => new THREE.MeshStandardMaterial({ map: makeMetalTexture(c), roughness: 0.65, metalness: 0.55 }));
    const layout = [
      [-14, -6, 0], [-14, -6, 6.4], [-6, -14, Math.PI / 2],
      [10, -10, 0.3], [16, 4, Math.PI / 2.3], [-4, 12, 0.15],
      [6, 16, -0.4],
    ];
    layout.forEach(([x, z, ry], i) => {
      const geo = new THREE.BoxGeometry(6, 2.6, 2.4);
      const mesh = this.addMesh(geo, containerMat[i % containerMat.length], x, 1.3, z, ry);
      this.addCollider(makeBox(x, 1.3, z, 6 * Math.abs(Math.cos(ry)) + 2.4 * Math.abs(Math.sin(ry)), 2.6, 6 * Math.abs(Math.sin(ry)) + 2.4 * Math.abs(Math.cos(ry))));
    });

    this.spawnPoints.push(
      { pos: new THREE.Vector3(-14, 0, 2), yaw: 0, patrol: [new THREE.Vector3(-14, 0, 2), new THREE.Vector3(-8, 0, -4), new THREE.Vector3(-16, 0, -8)] },
      { pos: new THREE.Vector3(10, 0, -4), yaw: Math.PI, patrol: [new THREE.Vector3(10, 0, -4), new THREE.Vector3(4, 0, -8), new THREE.Vector3(14, 0, -10)] },
      { pos: new THREE.Vector3(6, 0, 10), yaw: Math.PI, patrol: [new THREE.Vector3(6, 0, 10), new THREE.Vector3(0, 0, 14), new THREE.Vector3(-4, 0, 8)] },
    );
    this.reinforcementPoints.push(
      new THREE.Vector3(-18, 0, -18), new THREE.Vector3(18, 0, -18), new THREE.Vector3(0, 0, 18)
    );
  }

  buildWatchtower() {
    const mat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#454a42'), roughness: 0.6, metalness: 0.4 });
    const x = -18, z = -18;
    [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([dx, dz]) => {
      this.addMesh(new THREE.CylinderGeometry(0.22, 0.22, 8, 8), mat, x + dx, 4, z + dz);
      this.addCollider(makeBox(x + dx, 4, z + dz, 0.5, 8, 0.5));
    });
    this.addMesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), mat, x, 8, z);
    const platformCollider = this.addCollider(makeBox(x, 8, z, 4.4, 0.3, 4.4));
    platformCollider.isCover = false;
    this.addMesh(new THREE.BoxGeometry(4.6, 1.8, 0.15), mat, x, 9, z - 2.2);
    this.addMesh(new THREE.BoxGeometry(4.6, 1.8, 0.15), mat, x, 9, z + 2.2);
    this.addMesh(new THREE.BoxGeometry(0.15, 1.8, 4.6), mat, x - 2.2, 9, z);
    this.spawnPoints.push({ pos: new THREE.Vector3(x, 8.3, z), yaw: 0, patrol: [new THREE.Vector3(x, 8.3, z)], sniper: true });
  }

  buildTargetBuilding() {
    const wallMat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(), roughness: 0.88 });
    const stripTex = makeEmissiveStripTexture('#6effa0');
    const x = 0, z = 0, w = 14, d = 10, h = 5;

    // 4 walls with a doorway gap on south side
    this.buildWall(x, z - d / 2, w, h, 0.4, 0, wallMat);
    this.buildWall(x - w / 2, z, d, h, 0.4, Math.PI / 2, wallMat);
    this.buildWall(x + w / 2, z, d, h, 0.4, Math.PI / 2, wallMat);
    this.buildWall(x - w * 0.28, z + d / 2, w * 0.42, h, 0.4, 0, wallMat);
    this.buildWall(x + w * 0.28, z + d / 2, w * 0.42, h, 0.4, 0, wallMat);

    // roof
    this.addMesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), wallMat, x, h + 0.2, z);

    // emissive window strips
    const stripMat = new THREE.MeshBasicMaterial({ map: stripTex });
    [-1, 1].forEach(side => {
      const strip = this.addMesh(new THREE.PlaneGeometry(w - 2, 0.6), stripMat, x, 2.4, z + side * (d / 2 - 0.05), 0, false, false);
      strip.rotation.x = 0;
    });

    // server / charge target
    const serverMat = new THREE.MeshStandardMaterial({ color: 0x1a1e1a, roughness: 0.4, metalness: 0.7, emissive: 0x1f6b3a, emissiveIntensity: 0.6 });
    const server = this.addMesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), serverMat, x, 1.1, z - 3);
    const glow = new THREE.PointLight(0x6effa0, 1.4, 6, 2);
    glow.position.set(x, 2, z - 3);
    this.scene.add(glow);
    this.addCollider(makeBox(x, 1.1, z - 3, 1.6, 2.2, 1.6));
    this.markers.charge = new THREE.Vector3(x, 0, z - 3);
    this.chargeServer = server;
    this.chargeGlow = glow;

    // interior light
    const lamp = new THREE.PointLight(0xfff3d0, 1.2, 14, 2);
    lamp.position.set(x, h - 0.6, z);
    this.scene.add(lamp);

    this.spawnPoints.push(
      { pos: new THREE.Vector3(x - 3, 0, z + 2), yaw: Math.PI, patrol: [new THREE.Vector3(x - 3, 0, z + 2), new THREE.Vector3(x + 2, 0, z - 2)] }
    );
  }

  buildEvac() {
    const mat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(), roughness: 0.9 });
    const x = 0, z = 24;
    const pad = this.addMesh(new THREE.CylinderGeometry(5, 5, 0.15, 24), mat, x, 0.08, z, 0, false, true);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.9, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.1, z);
    this.scene.add(ring);
    this.evacRing = ring;
    const beacon = new THREE.PointLight(0xffcf5c, 0, 12, 2);
    beacon.position.set(x, 3, z);
    this.scene.add(beacon);
    this.evacBeacon = beacon;
    this.markers.evac = new THREE.Vector3(x, 0, z);
  }

  buildProps() {
    // scattered crates for cover / visual detail
    const crateMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#5c4326'), roughness: 0.75, metalness: 0.2 });
    const crates = [
      [-8, 6, 0], [-7.2, 6, 0], [8, -2, 0.4], [3, 8, 0], [-2, -6, 0.6], [14, 12, 0.2],
    ];
    crates.forEach(([x, z, ry]) => {
      this.addMesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat, x, 0.55, z, ry);
      this.addCollider(makeBox(x, 0.55, z, 1.1, 1.1, 1.1));
    });

    // barrels
    const barrelMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#3a2c1a'), roughness: 0.6, metalness: 0.5 });
    const barrels = [[-10, -2], [9, 2], [-2, 9], [12, -6]];
    barrels.forEach(([x, z]) => {
      this.addMesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), barrelMat, x, 0.55, z);
      this.addCollider(makeBox(x, 0.55, z, 0.9, 1.1, 0.9));
    });

    // sandbag-ish low walls near entrance for cover
    const sandMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture('#4a4536'), roughness: 0.95 });
    [[-4, 30, 0], [4, 30, 0]].forEach(([x, z, ry]) => {
      this.addMesh(new THREE.BoxGeometry(3, 0.9, 0.8), sandMat, x, 0.45, z, ry);
      this.addCollider(makeBox(x, 0.45, z, 3, 0.9, 0.8));
    });
  }

  update(dt, t) {
    this.updateAlarm(t);
    if (this.chargeGlow) this.chargeGlow.intensity = 1.2 + Math.sin(t * 3) * 0.3;
    if (this.evacBeacon) {
      const active = this.evacActive ? 1 : 0;
      this.evacBeacon.intensity = active * (2 + Math.sin(t * 5) * 1);
      this.evacRing.material.opacity = active;
    }
  }
}
