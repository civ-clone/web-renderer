import CoreCity from '@civ-clone/core-city/City';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import { civilDisorder } from '@civ-clone/civ1-city-happiness/lib/cityStatus';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';

export class City extends DataObject {
  #civilDisorderDeclared: boolean;
  #name: string;
  #originalPlayer: Player;
  #player: Player;
  #growth: {
    size: number;
  } = {
    size: 0,
  };
  #tile: Tile;

  constructor(
    name: string,
    tile: Tile,
    player: Player,
    size: number,
    originalPlayer: Player = player,
    civilDisorderDeclared: boolean = false
  ) {
    super();

    this.#civilDisorderDeclared = civilDisorderDeclared;
    this.#name = name;
    this.#originalPlayer = originalPlayer;
    this.#player = player;
    this.#growth.size = size;
    this.#tile = tile;

    // `originalPlayer` is the founder, which is whose list the city's name comes from (`Generic.city-name`). Without
    //  it, any string naming another player's city showed the raw `{{city.originalPlayer.civilization._}}` (#2).
    // `civilDisorderDeclared` lets the map show a rival's city in disorder, as v474.05 does for any city it draws, as it
    //  does for your own (#265).
    this.addKey(
      '_',
      'civilDisorderDeclared',
      'growth',
      'name',
      'originalPlayer',
      'player',
      'tile'
    );
  }

  static fromCity(city: CoreCity): City {
    const cityGrowth = cityGrowthRegistryInstance.getByCity(city);

    return new City(
      city.name(),
      city.tile(),
      city.player(),
      cityGrowth.size(),
      city.originalPlayer(),
      civilDisorder(city) !== null
    );
  }

  _(): string {
    return 'City';
  }

  name(): string {
    return this.#name;
  }

  originalPlayer(): Player {
    return this.#originalPlayer;
  }

  player(): Player {
    return this.#player;
  }

  civilDisorderDeclared(): boolean {
    return this.#civilDisorderDeclared;
  }

  growth(): {
    size: number;
  } {
    return this.#growth;
  }

  tile(): Tile {
    return this.#tile;
  }

  update(city: CoreCity): void {
    const cityGrowth = cityGrowthRegistryInstance.getByCity(city);

    this.#name = city.name();
    this.#player = city.player();
    this.#growth.size = cityGrowth.size();
    this.#civilDisorderDeclared = civilDisorder(city) !== null;
  }
}

export default City;
