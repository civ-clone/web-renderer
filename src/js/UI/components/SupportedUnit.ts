import {
  City,
  MilitaryUnhappiness,
  Unit as UnitData,
  UnitSupportFood,
  UnitSupportProduction,
  Yield,
} from '../types';
import { Element, s } from '@dom111/element';
import Unit from './Unit';
import { yieldImages } from './lib/cityYields';

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
    super(
      s(
        '<span class="supported-unit"></span>',
        new Unit(unit),
        ...city.yields
          .filter((cityYield): cityYield is YieldWithUnit =>
            yieldsToInclude.includes(cityYield._)
          )
          .filter((cityYield) => cityYield.unit.id === unit.id)
          .flatMap((cityYield) => yieldImages(cityYield))
      )
    );
  }
}

export default SupportedUnit;
