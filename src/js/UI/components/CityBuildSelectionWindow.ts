import { BuildItem, CityBuild } from '../types';
import { ActionWindowActions } from './ActionWindow';
import SelectionWindow from './SelectionWindow';
import Transport from '../Transport';
import { getLabelForBuildable } from './lib/cityBuild';
import { t } from 'i18next';
import { turnsLeft } from './lib/cityYields';

type onCompleteHandler = (hasSelected: boolean, ...args: any[]) => void;

export class CityBuildSelectionWindow extends SelectionWindow {
  #onComplete: onCompleteHandler;
  #transport: Transport;

  constructor(
    cityBuild: CityBuild,
    // What the city can build is not part of `cityBuild` (#324): the opener fetches it with a `CityBuildAvailable`.
    available: BuildItem[],
    transport: Transport,
    onComplete: onCompleteHandler = () => {},
    additionalActions: ActionWindowActions = {}
  ) {
    super(
      t('Actions.CityBuildSelectionWindow.title', {
        city: cityBuild.city,
      }),
      available.map((buildItem) => ({
        label: t('City.Build.build-item', {
          item: getLabelForBuildable(buildItem),
          cost: buildItem.cost.value,
          turns: turnsLeft(
            { ...cityBuild, ...buildItem } as unknown as CityBuild,
            cityBuild.city.yields,
            'Production'
          ),
        }) as string,
        value: buildItem.item._,
      })),
      (selection) => {
        if (!selection) {
          return;
        }

        transport.send('action', {
          name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
          id: cityBuild.id,
          chosen: selection ? selection : '@',
        });

        this.close(true);
      },
      null,
      {
        actions: additionalActions,
        // Starting a build is worth seeing, and the window also offers the
        //  city's own screen.
        autoChooseSingle: false,
        displayAll: true,
      }
    );

    this.#onComplete = onComplete;
    this.#transport = transport;
  }

  close(hasSelected: boolean = false): void {
    super.close();

    if (hasSelected) {
      this.#onComplete(hasSelected);
    }
  }
}

export default CityBuildSelectionWindow;
