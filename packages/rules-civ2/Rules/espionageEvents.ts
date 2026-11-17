import Action from '@civ-clone/core-unit/Action';
import AgentLost from '@civ-clone/base-unit-agent/Rules/AgentLost';
import City from '@civ-clone/core-city/City';
import DevicePlanted from '@civ-clone/base-unit-action-plant-nuclear-device/Rules/DevicePlanted';
import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import Unit from '@civ-clone/core-unit/Unit';

/**
 * Tells the client what became of a Diplomat or Spy on a mission (M2d part 2, #1007). base-unit-agent's `AgentLost` and
 *  base-unit-action-plant-nuclear-device's `DevicePlanted` are void rules the missions process and nothing emits, so
 *  these turn them into engine events, as `promoted` does a promotion:
 *  - `civ2:agent-lost` (the agent, the city or `null`, the mission, whether it was caught before the mission), just
 *    before the agent is destroyed;
 *  - `civ2:device-planted` (the Spy, the city), after the device has gone off.
 *  Only Civ2's rules register them, and they change nothing in the game: no answer, no draw.
 */
export const espionageEvents = (
  engine: Pick<Engine, 'emit'>
): (AgentLost | DevicePlanted)[] => [
  new AgentLost(
    'ui-rules-civ2:agent-lost/emit',
    new Effect(
      (unit: Unit, city: City | null, mission: Action, caught: boolean) => {
        engine.emit('civ2:agent-lost', unit, city, mission, caught);
      }
    )
  ),
  new DevicePlanted(
    'ui-rules-civ2:device-planted/emit',
    new Effect((unit: Unit, city: City): void => {
      engine.emit('civ2:device-planted', unit, city);
    })
  ),
];

export default espionageEvents;
