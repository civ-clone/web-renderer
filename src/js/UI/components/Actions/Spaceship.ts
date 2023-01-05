import Action from './Action';
import { Spaceship as SpaceshipData } from '../../types';
import Window from '../Window';
import { h } from '../../lib/html';
import { instance as localeProviderInstance } from '../../LocaleProvider';
import { s } from '@dom111/element';
import civilizationAttribute from '../lib/civilizationAttribute';

type SpaceshipYieldMap = {
  [key: string]: [number, number];
};

export class Spaceship extends Action {
  activate(): void {
    const spaceship = this.value(),
      yields = spaceship.yields.reduce(
        (yieldMap: SpaceshipYieldMap, spaceshipYield) => {
          if (!(spaceshipYield._ in yieldMap)) {
            return yieldMap;
          }

          if (spaceshipYield.value < 0) {
            yieldMap[spaceshipYield._][1] += Math.abs(spaceshipYield.value);

            return yieldMap;
          }

          yieldMap[spaceshipYield._][0] += spaceshipYield.value;

          return yieldMap;
        },
        {
          Energy: [0, 0],
          LifeSupport: [0, 0],
          Mass: [0, 0],
          Population: [0, 0],
        } as SpaceshipYieldMap
      ),
      activeParts = spaceship.activeParts.reduce(
        (partMap: { [key: string]: number }, part) => {
          if (!(part._ in partMap)) {
            return partMap;
          }

          partMap[part._]++;

          return partMap;
        },
        {
          Structural: 0,
          Fuel: 0,
          Propulsion: 0,
          Habitation: 0,
          LifeSupport: 0,
          Power: 0,
        }
      ),
      inactiveParts = spaceship.inactiveParts.reduce(
        (partMap: { [key: string]: number }, part) => {
          if (!(part._ in partMap)) {
            return partMap;
          }

          partMap[part._]++;

          return partMap;
        },
        {
          Structural: 0,
          Fuel: 0,
          Propulsion: 0,
          Habitation: 0,
          LifeSupport: 0,
          Power: 0,
        }
      ),
      values = [
        [
          'Chance of success',
          localeProviderInstance.percent(spaceship.chanceOfSuccess),
        ],
        [
          'Flight time',
          localeProviderInstance.number(spaceship.flightTime, {
            style: 'unit',
            unit: 'year',
            unitDisplay: 'long',
          }),
        ],
        ['Launched?', spaceship.launched ? 'Yes' : 'No'],
        [
          'Mass',
          localeProviderInstance.number(yields.Mass[0] * 1000, {
            style: 'unit',
            unit: 'kilogram',
          }),
        ],
        ['Population', localeProviderInstance.number(yields.Population[0])],
        [
          'Energy',
          localeProviderInstance.percent(
            yields.Energy[1] > 0 ? yields.Energy[0] / yields.Energy[1] : 0
          ),
        ],
        [
          'Life Support',
          localeProviderInstance.percent(
            yields.LifeSupport[1] > 0
              ? yields.LifeSupport[0] / yields.LifeSupport[1]
              : 0
          ),
        ],
      ],
      launch = () => {
        // TODO: could highlight the button? Red for < 50%, Yellow for < 80%, otherwise Green?
        this.transport().send('action', {
          name: 'LaunchSpaceship',
          id: spaceship.id,
        });

        window.close();
      },
      window = new Window(
        `${civilizationAttribute(
          spaceship.player.civilization,
          'people'
        )} spaceship`,
        s(
          '<div></div>',
          s(
            `<dl>${Object.entries(activeParts)
              .map(
                ([key, value]) =>
                  `<dd>${key}</dd><dt>${localeProviderInstance.number(value)}${
                    inactiveParts[key] === 0
                      ? ''
                      : ` <span class="inactive">(${inactiveParts[key]} inactive)</span>`
                  }</dt>`
              )
              .join('')}</dl>`
          ),
          s(
            `<dl>${values
              .map(([label, value]) => `<dd>${label}</dd><dt>${value}</dt>`)
              .join('')}</dl>`
          ),
          s(
            '<footer></footer>',
            h(
              s<HTMLButtonElement>(
                `<button${
                  spaceship.launched || spaceship.chanceOfSuccess === 0
                    ? ' disabled'
                    : ''
                }>${spaceship.launched ? 'Launched' : 'Launch'}</button>`
              ),
              {
                keydown(event: KeyboardEvent) {
                  if (['Enter', ' '].includes(event.key)) {
                    launch();
                  }
                },
                click() {
                  launch();
                },
              }
            )
          )
        )
      );

    window.addClass('spaceship');
  }

  build(): void {
    this.append(
      s(`<button class="spaceship" title="View spaceship"></button>`)
    );
  }

  value(): SpaceshipData {
    return super.value() as SpaceshipData;
  }
}

export default Spaceship;
