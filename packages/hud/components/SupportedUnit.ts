import { City, Unit as UnitData, Yield } from '@civ-clone/ui-protocol/types';
import { Element, s } from '@dom111/element';
import Unit from './Unit';
import { yieldImages } from '@civ-clone/ui-city/components/lib/cityYields';

type YieldWithUnit = Yield & { unit: UnitData };

export class SupportedUnit extends Element {
  constructor(
    city: City,
    unit: UnitData,
    yieldsToInclude: string[] = [
      'UnitSupportFood',
      'UnitSupportProduction',
      'MilitaryUnhappiness',
    ]
  ) {
    // The unit, then what it costs the city in a row of its own over the unit's box, in its corner (#1222).
    super(
      s(
        '<span class="supported-unit"></span>',
        new Unit(unit),
        s(
          '<span class="upkeep"></span>',
          ...city.yields
            .filter((cityYield): cityYield is YieldWithUnit =>
              yieldsToInclude.includes(cityYield._)
            )
            .filter((cityYield) => cityYield.unit.id === unit.id)
            .flatMap((cityYield) => yieldImages(cityYield, true))
        )
      )
    );
  }
}

export default SupportedUnit;
