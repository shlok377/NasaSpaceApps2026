/**
 * Flight challenges, one folder each. They plug into the flight through ChallengeRunner and touch
 * the sim only through its public hooks (damage, gust, separate, spendFuel), so the game's
 * mechanics stay untouched. Numbers live in game.json → challenges.
 */
export { ChallengeRunner, createChallenges } from './ChallengeRunner';
export { ChallengeCard } from './hud/ChallengeCard';
export { Combo, rockX } from './rockBelt/RockField';
export type { Rock } from './rockBelt/RockField';
export type { ChallengeBand, ChallengeContext, ChallengeEvent, ChallengeId, ChallengeModule, ChallengeStatus } from './types';
