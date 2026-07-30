import { playAlarm, playBeep, playExplosion } from './audio.js';

const STAGE = {
  INFILTRATE: 0,
  ELIMINATE: 1,
  PLANT: 2,
  EXTRACT: 3,
  COMPLETE: 4,
  FAILED: 5,
};

export class MissionManager {
  constructor(level, hud) {
    this.level = level;
    this.hud = hud;
    this.stage = STAGE.INFILTRATE;
    this.extractTimer = 0;
    this.extractDuration = 75;
    this.plantHoldTime = 3.0;
    this.plantProgress = 0;
    this.alarmTriggered = false;
    this.kills = 0;
    this.priorityKills = 0;
    this.priorityTotal = 0;
    this.done = false;
    this.result = null; // 'win' | 'lose'
    this._updateText();
  }

  setPriorityTotal(n) { this.priorityTotal = n; }

  registerKill(isPriority) {
    this.kills++;
    if (isPriority) this.priorityKills++;
  }

  _updateText() {
    let text = '';
    switch (this.stage) {
      case STAGE.INFILTRATE: text = 'Infiltrate the Blackgate compound'; break;
      case STAGE.ELIMINATE: text = `Eliminate hostile squad leaders (${this.priorityKills}/${this.priorityTotal})`; break;
      case STAGE.PLANT: text = 'Plant the charge on the server [HOLD E]'; break;
      case STAGE.EXTRACT: text = 'Extract before reinforcements arrive'; break;
      case STAGE.COMPLETE: text = 'Mission Complete'; break;
      case STAGE.FAILED: text = 'Mission Failed'; break;
    }
    this.hud.setObjective(text);
  }

  update(dt, playerPos, interactHeld) {
    if (this.done) return;

    if (this.stage === STAGE.INFILTRATE) {
      const entrance = this.level.markers.entrance;
      if (playerPos.distanceTo(entrance) < 8) {
        this.stage = STAGE.ELIMINATE;
        playBeep(700, 0.2);
        this._updateText();
      }
    } else if (this.stage === STAGE.ELIMINATE) {
      if (this.priorityKills >= this.priorityTotal) {
        this.stage = STAGE.PLANT;
        playBeep(900, 0.22);
        this._updateText();
      } else {
        this._updateText();
      }
    } else if (this.stage === STAGE.PLANT) {
      const chargePos = this.level.markers.charge;
      const near = playerPos.distanceTo(chargePos) < 2.6;
      if (near && interactHeld) {
        this.plantProgress += dt;
        this.hud.setInteractPrompt('PLANTING CHARGE', this.plantProgress / this.plantHoldTime);
        if (this.plantProgress >= this.plantHoldTime) {
          this._triggerAlarm();
          this.stage = STAGE.EXTRACT;
          this.extractTimer = this.extractDuration;
          this._updateText();
          this.hud.clearInteractPrompt();
        }
      } else {
        if (near) this.hud.setInteractPrompt('HOLD E TO PLANT CHARGE', this.plantProgress / this.plantHoldTime);
        else this.hud.clearInteractPrompt();
        this.plantProgress = Math.max(0, this.plantProgress - dt * 2);
      }
    } else if (this.stage === STAGE.EXTRACT) {
      this.extractTimer -= dt;
      this.level.evacActive = true;
      this.hud.setTimer(Math.max(0, this.extractTimer));
      const evac = this.level.markers.evac;
      if (playerPos.distanceTo(evac) < 5) {
        this.stage = STAGE.COMPLETE;
        this.done = true;
        this.result = 'win';
        this.hud.setTimer(null);
        this._updateText();
      } else if (this.extractTimer <= 0) {
        this._explodeCompound();
        this.stage = STAGE.FAILED;
        this.done = true;
        this.result = 'lose_timer';
        this.hud.setTimer(null);
        this._updateText();
      }
    }
  }

  playerDied() {
    if (this.done) return;
    this.done = true;
    this.result = 'lose_health';
    this.stage = STAGE.FAILED;
    this._updateText();
  }

  _triggerAlarm() {
    if (this.alarmTriggered) return;
    this.alarmTriggered = true;
    this.level.setAlarm(true);
    playAlarm();
    setTimeout(() => playAlarm(), 900);
  }

  _explodeCompound() {
    playExplosion();
  }
}

export { STAGE };
