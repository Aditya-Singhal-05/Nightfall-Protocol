export class HUD {
  constructor() {
    this.healthFill = document.getElementById('health-bar-fill');
    this.ammoCurrent = document.getElementById('ammo-current');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.reloadPrompt = document.getElementById('reload-prompt');
    this.objectiveText = document.getElementById('objective-text');
    this.missionTimer = document.getElementById('mission-timer');
    this.hitmarker = document.getElementById('hitmarker');
    this.damageFlash = document.getElementById('damage-flash');
    this.killfeed = document.getElementById('killfeed');
    this.staminaBg = document.getElementById('stamina-bar-bg');
    this.staminaFill = document.getElementById('stamina-bar-fill');
    this.interactPrompt = document.getElementById('interact-prompt');
    this.crosshair = document.getElementById('crosshair');
    this._hitTimeout = null;
    this._flashTimeout = null;
  }

  setHealth(hp, maxHp) {
    const pct = Math.max(0, hp / maxHp) * 100;
    this.healthFill.style.width = pct + '%';
    this.healthFill.classList.toggle('low', pct < 30);
  }

  setAmmo(inMag, reserve, reloading) {
    this.ammoCurrent.textContent = inMag;
    this.ammoReserve.textContent = reserve;
    this.reloadPrompt.classList.toggle('show', reloading);
  }

  setObjective(text) {
    this.objectiveText.textContent = text;
  }

  setTimer(seconds) {
    if (seconds === null) { this.missionTimer.classList.remove('show'); return; }
    this.missionTimer.classList.add('show');
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.missionTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  showHitmarker() {
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
  }

  flashDamage() {
    this.damageFlash.classList.add('active');
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => this.damageFlash.classList.remove('active'), 220);
  }

  addKillfeed(text) {
    const el = document.createElement('div');
    el.className = 'kf-entry';
    el.textContent = text;
    this.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  setStamina(pct, sprinting) {
    this.staminaBg.classList.toggle('show', pct < 99.5);
    this.staminaFill.style.width = pct + '%';
  }

  setInteractPrompt(text, progress) {
    this.interactPrompt.classList.add('show');
    this.interactPrompt.innerHTML = text + `<div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, progress * 100)}%"></div></div>`;
  }

  clearInteractPrompt() {
    this.interactPrompt.classList.remove('show');
  }

  setSpread(amount) {
    // amount 0..1
    const px = 9 + amount * 16;
    document.querySelectorAll('.ch-top, .ch-bottom, .ch-left, .ch-right').forEach(el => {});
    document.querySelector('.ch-top').style.transform = `translateY(${-px}px)`;
    document.querySelector('.ch-bottom').style.transform = `translateY(${px}px)`;
    document.querySelector('.ch-left').style.transform = `translateX(${-px}px)`;
    document.querySelector('.ch-right').style.transform = `translateX(${px}px)`;
  }
}
