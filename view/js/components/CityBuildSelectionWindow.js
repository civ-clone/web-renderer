import { SelectionWindow } from './SelectionWindow.js';
import City from './City.js';
export class CityBuildSelectionWindow extends SelectionWindow {
    constructor(cityBuild, onComplete = () => { }, additionalActions = {}) {
        super(`What would you like to build in ${cityBuild.city.name}?`, cityBuild.available.map((advance) => ({
            value: advance._,
        })), (selection) => {
            if (!selection) {
                return;
            }
            transport.send('action', {
                name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
                id: cityBuild.id,
                chosen: selection ? selection : '@',
            });
            this.close(true);
        }, null, {
            actions: additionalActions,
            displayAll: true,
        });
        this.onComplete = onComplete;
    }
    close(hasSelected = false) {
        super.close();
        if (hasSelected) {
            this.onComplete(hasSelected);
        }
    }
}
CityBuildSelectionWindow.showCityAction = (city) => ({
    label: 'View city',
    action(selectionWindow) {
        selectionWindow.close();
        new City(city);
    },
});
CityBuildSelectionWindow.showCityOnMapAction = (city, portal) => ({
    label: 'Show on map',
    action(selectionWindow) {
        selectionWindow.close();
        portal.setCenter(city.tile.x, city.tile.y);
    },
});
export default CityBuildSelectionWindow;
//# sourceMappingURL=CityBuildSelectionWindow.js.map