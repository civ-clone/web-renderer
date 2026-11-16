// How the relations between two players are worded (M2d, #1007): the treaty between them, how a computer player feels
//  toward another (one of nine bands, in our own words), a player's reputation (0 to 7) and a leader with the title
//  their government gives them. What the engine doesn't send (Civ1's rules keep no attitude, reputation or titles) is
//  left out, so Civ1 reads as it always has.

import { Treaty } from '@civ-clone/ui-protocol/reports';
import { t } from 'i18next';

/** The treaties, lowest first, for sorting. */
export const treaties: Treaty[] = [
  'war',
  'contact',
  'ceasefire',
  'peace',
  'alliance',
];

/** How far `treaty` goes: 0 at war to 4 allied. */
export const treatyRank = (treaty: Treaty): number => treaties.indexOf(treaty);

/** An attitude band, 0 the warmest to 8 the coldest. */
export const attitudeName = (attitude: number): string =>
  t(`Attitude.${attitude}`, { defaultValue: String(attitude) });

/** A reputation, 0 the best to 7 the worst. */
export const reputationName = (reputation: number): string =>
  t(`Reputation.${reputation}`, { defaultValue: String(reputation) });

/** A leader's name with the title their government gives them, where the rules give one. */
export const titledLeader = (
  leader: string,
  title: string | null | undefined
): string =>
  title
    ? t('Generic.leader-titled', {
        title: t(title, { defaultValue: '', ns: 'civilization' }),
        leader,
        interpolation: { escapeValue: false },
      }).trim()
    : leader;
