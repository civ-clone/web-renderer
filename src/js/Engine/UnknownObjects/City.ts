import CoreCity from '@civ-clone/core-city/City';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';

export class City extends DataObject {
  #name: string;
  #player: Player;
  #growth: {
    size: number;
  } = {
    size: 0,
  };
  #tile: Tile;

  constructor(name: string, tile: Tile, player: Player, size: number) {
    super();

    this.#name = name;
    this.#player = player;
    this.#growth.size = size;
    this.#tile = tile;

    this.addKey('_', 'growth', 'name', 'player', 'tile');
  }

  public static fromCity(city: CoreCity): City {
    const cityGrowth = cityGrowthRegistryInstance.getByCity(city);

    return new City(city.name(), city.tile(), city.player(), cityGrowth.size());
  }

  public _(): string {
    return 'City';
  }

  public name(): string {
    return this.#name;
  }

  public player(): Player {
    return this.#player;
  }

  public growth(): {
    size: number;
  } {
    return this.#growth;
  }

  public tile(): Tile {
    return this.#tile;
  }
}

export default City;
