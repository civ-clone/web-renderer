import { BuildItem, City as CityData, CityBuild } from '../types';
import { ActionWindowActions } from './ActionWindow';
import City from './City';
import Portal from './Portal';
import SelectionWindow, { ISelectionWindow } from './SelectionWindow';
import Transport from '../../Engine/Transport';
import { reduceKnownYield } from '../lib/yieldMap';
import { INotificationWindow } from './NotificationWindow';

type onCompleteHandler = (hasSelected: boolean, ...args: any[]) => void;

export class CityBuildSelectionWindow extends SelectionWindow {
  #onComplete: onCompleteHandler;
  #transport: Transport;

  constructor(
    cityBuild: CityBuild,
    transport: Transport,
    onComplete: onCompleteHandler = () => {},
    additionalActions: ActionWindowActions = {}
  ) {
    const turns = (buildItem: BuildItem) =>
      Math.max(
        1,
        Math.ceil(
          (buildItem.cost.value - cityBuild.progress.value) /
            reduceKnownYield(cityBuild.city.yields, 'Production')
        )
      );

    super(
      `What would you like to build in ${cityBuild.city.name}?`,
      cityBuild.available.map((buildItem) => ({
        label: `${buildItem.item._} (Cost: ${buildItem.cost.value} / ${turns(
          buildItem
        )} turn${turns(buildItem) === 1 ? '' : 's'})`,
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
