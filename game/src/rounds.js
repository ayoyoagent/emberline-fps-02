// EMBERLINE round + spike state machine. Pure logic: no THREE, no DOM, no
// Math.random — so it is unit-testable in Node (tests/test-rounds.mjs).
//
// buy (15s) -> live (100s) -> end (5s banner) -> next buy ...
//   elimination -> round ends, winner = surviving team
//   time out (no spike) -> Ashfall (defenders) win
//   spike planted -> 45s timer, time-out no longer applies
//     detonation -> Ember wins
//     defuse complete -> Ashfall wins
//   7th round win -> match ends (draw impossible: 13th round decides)

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const SPIKE_TIME = 45;
export const END_TIME = 5;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const START_MONEY = 800;
export const WIN_ROUNDS = 7;
export const MAX_ROUNDS = 13;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STEP = 500;
export const MAX_LOSS_STEPS = 2;
export const OBJECTIVE_REWARD = 300;

export const WEAPON_PRICES = {
  pistol: 0,
  smg: 1500,
  rifle: 2700,
  sniper: 4750,
  grenade: 300,
  armor: 650,
};

export function createMatch() {
  const state = {
    phase: 'buy', // buy | live | end | over
    round: 1,
    timeLeft: BUY_TIME,
    score: { ember: 0, ashfall: 0 },
    money: START_MONEY,
    losses: 0, // consecutive losses, for the loss-bonus ladder
    roundWinner: null,
    roundReason: null, // elimination | time | detonation | defuse
    winner: null, // match winner once decided
    spike: 'none', // none | planted | defused | detonated
    spikeTimeLeft: 0,
    carrier: 'player', // who carries the spike this round
  };

  function lossReward() {
    const steps = Math.min(state.losses, MAX_LOSS_STEPS);
    return LOSS_REWARD + steps * LOSS_STEP;
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return false;
    state.phase = 'end';
    state.timeLeft = END_TIME;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    if (winner === 'ember') {
      state.money += WIN_REWARD;
      state.losses = 0;
    } else {
      state.money += lossReward();
      state.losses += 1;
    }
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.winner = winner;
      state.phase = 'over';
    }
    return true;
  }

  function nextRound() {
    if (state.phase !== 'end' && state.phase !== 'over') return false;
    if (state.winner) return false;
    state.round += 1;
    state.phase = 'buy';
    state.timeLeft = BUY_TIME;
    state.roundWinner = null;
    state.roundReason = null;
    state.spike = 'none';
    state.spikeTimeLeft = 0;
    state.carrier = state.round % 2 === 1 ? 'player' : 'kestrel';
    return true;
  }

  // dt seconds pass. alive = { ember, ashfall } headcounts; spikePlanted
  // reports whether the spike is currently planted (timer immunity).
  function step(dt, alive, spikePlanted) {
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.phase = 'live';
        state.timeLeft = ROUND_TIME;
      }
      return;
    }
    if (state.phase !== 'live') return;
    if (spikePlanted && state.spike === 'none') {
      state.spike = 'planted';
      state.spikeTimeLeft = SPIKE_TIME;
    }
    if (state.spike === 'planted') {
      state.spikeTimeLeft -= dt;
      if (state.spikeTimeLeft <= 0) {
        state.spike = 'detonated';
        endRound('ember', 'detonation');
        return;
      }
    } else {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        endRound('ashfall', 'time');
        return;
      }
    }
    if (alive.ember <= 0 && alive.ashfall > 0) endRound('ashfall', 'elimination');
    else if (alive.ashfall <= 0 && alive.ember > 0) endRound('ember', 'elimination');
    else if (alive.ember <= 0 && alive.ashfall <= 0) endRound('ashfall', 'elimination');
  }

  function buy(item) {
    if (state.phase !== 'buy') return { ok: false, reason: 'not-buy-phase' };
    const price = WEAPON_PRICES[item];
    if (price === undefined) return { ok: false, reason: 'unknown-item' };
    if (item === 'grenade' && state.grenades >= 2) return { ok: false, reason: 'max-grenades' };
    if (state.money < price) return { ok: false, reason: 'too-expensive' };
    state.money -= price;
    if (item === 'grenade') state.grenades = (state.grenades ?? 0) + 1;
    return { ok: true, money: state.money };
  }

  function onKill() {
    state.money += KILL_REWARD;
    return state.money;
  }

  function onObjective() {
    state.money += OBJECTIVE_REWARD;
    return state.money;
  }

  function onDefuse() {
    state.spike = 'defused';
    endRound('ashfall', 'defuse');
  }

  return {
    state,
    step,
    buy,
    endRound,
    nextRound,
    onKill,
    onObjective,
    onDefuse,
    lossReward,
  };
}

// A plant/defuse channel: hold to fill, breaks on move / damage / death.
export function createChannel(duration) {
  let progress = 0;
  let active = false;
  return {
    duration,
    get progress() {
      return progress;
    },
    get active() {
      return active;
    },
    start() {
      active = true;
      progress = 0;
    },
    hold(dt) {
      if (!active) return false;
      progress += dt;
      if (progress >= duration) {
        active = false;
        return true; // completed
      }
      return false;
    },
    break() {
      active = false;
      progress = 0;
    },
  };
}
