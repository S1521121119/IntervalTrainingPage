export const State = Object.freeze({
  Prepare:   'prepare',
  Exercise:  'exercise',
  Rest:      'rest',
  RoundRest: 'roundRest',
  Paused:    'paused',
  End:       'end',
});

export class IntervalTrainingEngine {
  constructor(training, exercises) {
    this._config    = training;
    this._exercises = exercises;

    this.state             = null;
    this.currentRound      = 1;
    this.currentExIdx      = 0;
    this.totalRounds       = training.rounds;
    this.totalSetsPerRound = exercises.length;
    this.roundsCompleted   = 0;
    this.setsCompleted     = 0;
    this.phaseDurationMs   = 0;

    this._stateBeforePause = null;

    // Callbacks set by main.js
    this.onStateChanged      = null; // (state) => {}
    this.onTrainingCompleted = null; // () => {}
  }

  get currentExercise() { return this._exercises[this.currentExIdx]; }

  get nextExercise() {
    const next = this.currentExIdx + 1;
    return this._exercises[next < this._exercises.length ? next : 0];
  }

  get displayRound() { return this.state === State.RoundRest ? this.currentRound + 1 : this.currentRound; }
  get displaySet()   { return this.state === State.RoundRest ? 1 : this.currentExIdx + 1; }
  get isLastSet()    { return this.currentExIdx === this._exercises.length - 1; }
  get isLastRound()  { return this.currentRound === this.totalRounds; }

  start()    { this._transitionTo(State.Prepare); }
  forceEnd() { this._transitionTo(State.End); }

  togglePause() {
    if (this.state === State.Paused) {
      this.state = this._stateBeforePause;
      this.onStateChanged?.(this.state);
    } else if (this.state !== State.End) {
      this._stateBeforePause = this.state;
      this.state = State.Paused;
      this.onStateChanged?.(this.state);
    }
  }

  onPhaseComplete() {
    switch (this.state) {
      case State.Prepare:
        this._transitionTo(State.Exercise);
        break;
      case State.Exercise:
        this.setsCompleted++;
        if (this.isLastSet) {
          this.roundsCompleted++;
          this._transitionTo(this.isLastRound ? State.End : State.RoundRest);
        } else {
          this._transitionTo(State.Rest);
        }
        break;
      case State.Rest:
        this.currentExIdx++;
        this._transitionTo(State.Exercise);
        break;
      case State.RoundRest:
        this.currentRound++;
        this.currentExIdx = 0;
        this._transitionTo(State.Prepare);
        break;
    }
  }

  _transitionTo(next) {
    this.state           = next;
    this.phaseDurationMs = this._phaseMs(next);
    if (next === State.End) this.onTrainingCompleted?.();
    this.onStateChanged?.(next);
  }

  _phaseMs(s) {
    switch (s) {
      case State.Prepare:   return this._config.prepare_seconds   * 1000;
      case State.Exercise:  return this._config.exercise_seconds  * 1000;
      case State.Rest:      return this._config.rest_seconds      * 1000;
      case State.RoundRest: return this._config.round_rest_seconds * 1000;
      default: return 0;
    }
  }
}
