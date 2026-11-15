// The DOM HUD: crosshair, hitmarker, damage direction, health/armour,
// ammo, weapon, grenades, timer, score, round, money, killfeed, banner,
// plant/defuse progress, buy menu, scope overlay, start overlay. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Round-based tactical FPS. Ember attacks, Ashfall defends the sites. Plant the spike, or eliminate the enemy team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoEl = $('ammo');
  const weaponName = $('weapon-name');
  const grenadeEl = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armourFill = $('armour-fill');
  const armourNum = $('armour-num');
  const timerEl = $('timer');
  const scoreEmber = $('score-ember');
  const scoreAsh = $('score-ash');
  const roundEl = $('round-label');
  const moneyEl = $('money');
  const killfeedEl = $('killfeed');
  const bannerEl = $('banner');
  const bannerText = $('banner-text');
  const bannerSub = $('banner-sub');
  const channelEl = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const dmgDir = $('damage-dir');
  const buyEl = $('buy-menu');
  const scopeEl = $('scope');
  const fadeEl = $('fade');
  let hitTimer = 0;
  let bannerTimer = 0;
  let dmgTimer = 0;
  const last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, max) {
      const pct = Math.max(0, Math.round((hp / max) * 100));
      if (last.hp !== pct) {
        last.hp = pct;
        healthFill.style.width = `${pct}%`;
        healthNum.textContent = String(Math.ceil(hp));
        healthFill.classList.toggle('low', pct < 30);
      }
    },
    setArmour(value) {
      const pct = Math.max(0, Math.min(100, Math.round(value)));
      if (last.armour !== pct) {
        last.armour = pct;
        armourFill.style.width = `${pct}%`;
        armourNum.textContent = String(pct);
      }
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      setText(weaponName, 'weapon', name);
    },
    setGrenades(n) {
      setText(grenadeEl, 'grenades', n > 0 ? `◉ ${n}` : '○ 0');
    },
    setTimer(seconds, spikeLive) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('spike', !!spikeLive);
    },
    setScore(ember, ashfall) {
      setText(scoreEmber, 'se', String(ember));
      setText(scoreAsh, 'sa', String(ashfall));
    },
    setRound(round, maxRounds) {
      setText(roundEl, 'round', `ROUND ${round} / ${maxRounds}`);
    },
    setMoney(money) {
      setText(moneyEl, 'money', `$${money}`);
    },
    setCrosshairSpread(spreadPx) {
      crosshair.style.setProperty('--gap', `${spreadPx}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angleDeg) {
      dmgDir.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
      dmgDir.classList.add('on');
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => dmgDir.classList.remove('on'), 600);
    },
    killfeed(killer, victim, head, killerTeam) {
      const line = document.createElement('div');
      line.className = `kf-line ${killerTeam || ''}`;
      const hs = head ? ' <span class="kf-hs">HEADSHOT</span>' : '';
      line.innerHTML = `<b>${killer}</b> → ${victim}${hs}`;
      killfeedEl.prepend(line);
      while (killfeedEl.children.length > 5) killfeedEl.removeChild(killfeedEl.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    banner(text, sub, ms = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub || '';
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    clearBanner() {
      clearTimeout(bannerTimer);
      bannerEl.classList.remove('on');
    },
    setChannel(label, progress) {
      if (!label) {
        channelEl.classList.add('hidden');
        return;
      }
      channelEl.classList.remove('hidden');
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    showBuy(money, owned) {
      buyEl.classList.remove('hidden');
      const items = buyEl.querySelectorAll('[data-buy]');
      for (const item of items) {
        const price = Number(item.dataset.price || 0);
        const id = item.dataset.buy;
        item.classList.toggle('cant', money < price);
        item.classList.toggle('owned', !!owned.has(id));
        const cost = item.querySelector('.buy-cost');
        if (cost) cost.textContent = price === 0 ? 'FREE' : `$${price}`;
      }
    },
    hideBuy() {
      buyEl.classList.add('hidden');
    },
    setScope(on) {
      scopeEl.classList.toggle('on', !!on);
      crosshair.classList.toggle('hidden', !!on);
    },
    fade() {
      fadeEl.classList.add('on');
      setTimeout(() => fadeEl.classList.remove('on'), 600);
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? `${text.copy} ${extra || ''}` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
