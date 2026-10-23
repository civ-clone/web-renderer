import {
  GameOverCivilization,
  GameOverDetails,
} from '../../Engine/lib/gameOver';
import { enterHallOfFame, hallOfFameEntry } from '../lib/hallOfFame';
import { allowLeaving } from '../lib/leaveGuard';
import { h } from '../lib/html';
import { hallOfFameTable, yearLabel } from './HallOfFameWindow';
import { s } from '@dom111/element';
import { scoreTable } from './CivilizationScoreReport';
import { t } from 'i18next';
import Transport from '../Transport';
import Window from './Window';

const people = ({ civilization }: GameOverCivilization): string =>
  t(`${civilization}.plural`, {
    defaultValue: civilization,
    ns: 'civilization',
  });

const leaderName = ({ leader }: GameOverCivilization): string =>
  leader === null
    ? ''
    : t(`Leader.${leader}.name`, { defaultValue: leader, ns: 'civilization' });

// The ending's text: who won, if anyone did and you know them. A spaceship landing reads differently for you, for a
//  civilization you know and for one you don't.
const endingText = ({
  discovery,
  reason,
  winner,
  you,
  year,
}: GameOverDetails): string =>
  t(`GameOver.${reason}.body`, {
    context:
      reason === 'destroyed' && discovery === null
        ? 'none'
        : winner === null
        ? undefined
        : winner.you
        ? 'you'
        : winner.known
        ? 'known'
        : 'unknown',
    discovery:
      discovery === null
        ? ''
        : t(`${discovery}.name`, { defaultValue: discovery, ns: 'science' }),
    leader: leaderName(you),
    nation: people(you),
    winner: winner === null || !winner.known ? '' : people(winner),
    year: yearLabel(year),
  });

const goToMainMenu = (): void => {
  allowLeaving();

  window.location.reload();
};

/**
 * How the game ended (#176): the ending, your Civilization Score and rating, and the Hall of Fame (#179). You can keep
 * playing after every ending but your own destruction, with no further score; or go back to the main menu. The engine
 * works it all out; this only draws it.
 */
export class GameOverWindow extends Window {
  constructor(
    details: GameOverDetails,
    transport: Transport,
    // A watched game's ending (#607) is nobody's own: no Hall of Fame entry, and no keeping playing.
    { observer = false }: { observer?: boolean } = {}
  ) {
    const entry = observer ? null : hallOfFameEntry(details, Date.now()),
      hallOfFame = entry === null ? null : enterHallOfFame(entry),
      keepPlaying = h(s(`<button>${t('GameOver.keep-playing')}</button>`), {
        click: () => {
          transport.send('gameContinue', null);

          this.close();
        },
      }),
      mainMenu = h(s(`<button>${t('GameOver.main-menu')}</button>`), {
        click: goToMainMenu,
      });

    super(
      t(`GameOver.${details.reason}.title`),
      s(
        '<div class="content"></div>',
        s(`<p class="ending">${endingText(details)}</p>`),
        ...(details.score === null
          ? []
          : [
              s(
                `<h3>${t('GameOver.score', {
                  score: details.score.total.toLocaleString(),
                })}</h3>`
              ),
              scoreTable(details.score),
            ]),
        ...(details.rating === null
          ? []
          : [
              s(
                `<p class="rating">${t('GameOver.rating', {
                  context: details.famousLeader === null ? 'none' : undefined,
                  famousLeader:
                    details.famousLeader === null
                      ? ''
                      : t(`FamousLeader.${details.famousLeader}`, {
                          defaultValue: details.famousLeader,
                        }),
                  rating: details.rating,
                })}</p>`
              ),
            ]),
        ...(details.scoringComplete
          ? [
              s(
                `<p class="scoring-complete">${t(
                  'CivilizationScoreReport.scoring-complete'
                )}</p>`
              ),
            ]
          : []),
        ...(hallOfFame === null || hallOfFame.length === 0
          ? []
          : [
              s(`<h3>${t('HallOfFame.title')}</h3>`),
              hallOfFameTable(hallOfFame, entry?.id ?? null),
            ]),
        s(
          '<footer></footer>',
          ...(details.keepPlaying && !observer ? [keepPlaying] : []),
          mainMenu
        )
      ),
      {
        canClose: false,
        classes: ['game-over', `game-over-${details.reason}`],
        modal: true,
      }
    );

    (details.keepPlaying ? keepPlaying : mainMenu).focus();
  }
}

export default GameOverWindow;
