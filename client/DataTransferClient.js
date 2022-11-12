"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _DataTransferClient_dataFilter, _DataTransferClient_dataQueue, _DataTransferClient_eventEmitter, _DataTransferClient_receiver, _DataTransferClient_sender, _DataTransferClient_sentInitialData;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTransferClient = void 0;
const PlayerActions_1 = require("@civ-clone/civ1-unit/PlayerActions");
const GoodyHuts_1 = require("@civ-clone/civ1-goody-hut/GoodyHuts");
const PlayerActions_2 = require("@civ-clone/core-city-build/PlayerActions");
const Client_1 = require("@civ-clone/core-civ-client/Client");
const PlayerActions_3 = require("@civ-clone/civ1-trade-rate/PlayerActions");
const Busy_1 = require("@civ-clone/core-unit/Rules/Busy");
const ChooseResearch_1 = require("@civ-clone/civ1-science/PlayerActions/ChooseResearch");
const City_1 = require("@civ-clone/core-city/City");
const CityGrowth_1 = require("@civ-clone/core-city-growth/CityGrowth");
const CityImprovement_1 = require("@civ-clone/core-city-improvement/CityImprovement");
const Civilization_1 = require("@civ-clone/core-civilization/Civilization");
const PlayerActions_4 = require("@civ-clone/civ1-treasury/PlayerActions");
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
const DataQueue_1 = require("./DataQueue");
const PlayerActions_5 = require("@civ-clone/civ1-player/PlayerActions");
const MandatoryPlayerAction_1 = require("@civ-clone/core-player/MandatoryPlayerAction");
const Player_1 = require("@civ-clone/core-player/Player");
const PlayerTile_1 = require("@civ-clone/core-player-world/PlayerTile");
const PlayerWorld_1 = require("@civ-clone/core-player-world/PlayerWorld");
const Retryable_1 = require("./Retryable");
const PlayerActions_6 = require("@civ-clone/civ1-government/PlayerActions");
const TransferObject_1 = require("./TransferObject");
const Tile_1 = require("@civ-clone/core-world/Tile");
const Unit_1 = require("@civ-clone/core-unit/Unit");
const City_2 = require("../UnknownObjects/City");
const Player_2 = require("../UnknownObjects/Player");
const Unit_2 = require("../UnknownObjects/Unit");
const Wonder_1 = require("@civ-clone/core-wonder/Wonder");
const AdvanceRegistry_1 = require("@civ-clone/core-science/AdvanceRegistry");
const CityRegistry_1 = require("@civ-clone/core-city/CityRegistry");
const CurrentPlayerRegistry_1 = require("@civ-clone/core-player/CurrentPlayerRegistry");
const Engine_1 = require("@civ-clone/core-engine/Engine");
const LeaderRegistry_1 = require("@civ-clone/core-civilization/LeaderRegistry");
const PlayerRegistry_1 = require("@civ-clone/core-player/PlayerRegistry");
const PlayerResearchRegistry_1 = require("@civ-clone/core-science/PlayerResearchRegistry");
const PlayerTreasuryRegistry_1 = require("@civ-clone/core-treasury/PlayerTreasuryRegistry");
const PlayerWorldRegistry_1 = require("@civ-clone/core-player-world/PlayerWorldRegistry");
const Turn_1 = require("@civ-clone/core-turn-based-game/Turn");
const UnitRegistry_1 = require("@civ-clone/core-unit/UnitRegistry");
const Year_1 = require("@civ-clone/core-game-year/Year");
const assignWorkers_1 = require("@civ-clone/civ1-city/lib/assignWorkers");
const EventEmitter_1 = require("@dom111/typed-event-emitter/EventEmitter");
const referenceObject = (object) => object instanceof DataObject_1.default
    ? {
        '#ref': object.id(),
    }
    : object, filterToReference = (...types) => (object) => types.some((Type) => object instanceof Type)
    ? referenceObject(object)
    : object, filterToReferenceAllExcept = (...types) => (object) => types.some((Type) => object instanceof Type)
    ? object
    : referenceObject(object);
const unknownPlayers = new Map(), unknownUnits = new Map(), unknownCities = new Map();
class DataTransferClient extends Client_1.Client {
    constructor(player, sender, receiver) {
        super(player);
        _DataTransferClient_dataFilter.set(this, (localFilter = (object) => object) => (object) => {
            if (object instanceof Player_1.default && object !== this.player()) {
                if (!unknownPlayers.has(object)) {
                    unknownPlayers.set(object, Player_2.default.fromPlayer(object));
                }
                return unknownPlayers.get(object);
            }
            if (object instanceof Unit_1.default && object.player() !== this.player()) {
                if (!unknownUnits.has(object)) {
                    unknownUnits.set(object, Unit_2.default.fromUnit(object));
                }
                return unknownUnits.get(object);
            }
            if (object instanceof City_1.default && object.player() !== this.player()) {
                if (!unknownCities.has(object)) {
                    unknownCities.set(object, City_2.default.fromCity(object));
                }
                return unknownCities.get(object);
            }
            if (object instanceof Tile_1.default) {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player());
                return playerWorld.get(object.x(), object.y());
            }
            if (object instanceof Busy_1.default) {
                return {
                    _: object.constructor.name,
                };
            }
            return localFilter(object);
        });
        _DataTransferClient_dataQueue.set(this, new DataQueue_1.default());
        _DataTransferClient_eventEmitter.set(this, void 0);
        _DataTransferClient_receiver.set(this, void 0);
        _DataTransferClient_sender.set(this, void 0);
        _DataTransferClient_sentInitialData.set(this, false);
        __classPrivateFieldSet(this, _DataTransferClient_eventEmitter, new EventEmitter_1.default(), "f");
        __classPrivateFieldSet(this, _DataTransferClient_sender, sender, "f");
        __classPrivateFieldSet(this, _DataTransferClient_receiver, receiver, "f");
        __classPrivateFieldGet(this, _DataTransferClient_receiver, "f").call(this, 'action', (...args) => {
            __classPrivateFieldGet(this, _DataTransferClient_eventEmitter, "f").emit('action', ...args);
        });
        // TODO: These could be `HiddenAction`s. Need to add a `perform` method to actions too...
        __classPrivateFieldGet(this, _DataTransferClient_receiver, "f").call(this, 'cheat', ({ name, value }) => {
            if (name === 'RevealMap') {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player());
                // A bit nasty... I wonder how slow this data transfer will be...
                const [tile] = playerWorld.entries();
                tile
                    .tile()
                    .map()
                    .entries()
                    .forEach((tile) => {
                    if (playerWorld.includes(tile)) {
                        return;
                    }
                    playerWorld.register(tile);
                    const playerTile = playerWorld.getByTile(tile);
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerWorld.id(), () => tile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this)), `entries[${playerWorld.entries().indexOf(playerTile)}]`);
                });
            }
            if (name === 'GrantAdvance') {
                const [Advance] = AdvanceRegistry_1.instance.filter((Advance) => Advance.name === value), playerResearch = PlayerResearchRegistry_1.instance.getByPlayer(this.player());
                if (!Advance) {
                    return;
                }
                if (playerResearch.completed(Advance)) {
                    return;
                }
                playerResearch.addAdvance(Advance);
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerResearch.id(), playerResearch.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            }
            if (name === 'GrantGold') {
                const playerTreasury = PlayerTreasuryRegistry_1.instance.getByPlayer(this.player());
                playerTreasury.add(value);
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerTreasury.id(), playerTreasury.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            }
            if (name === 'ModifyUnit') {
                const { unitId, properties } = value;
                const [unit] = UnitRegistry_1.instance.getBy('id', unitId);
                if (!unit) {
                    return;
                }
                ['attack', 'defence', 'moves', 'movement', 'visibility'].forEach((property) => {
                    if (property in properties) {
                        unit[property]().set(properties[property]);
                    }
                });
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(unit.id(), unit.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            }
            this.sendPatchData();
        });
        Engine_1.instance.on('engine:plugins:load:failed', (packagePath, error) => {
            console.log(packagePath + ' failed to load');
            console.error(error);
        });
        Engine_1.instance.on('player:visibility-changed', (tile, player) => {
            if (player !== this.player()) {
                return;
            }
            const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player()), playerTile = playerWorld.getByTile(tile);
            if (playerTile === null) {
                new Retryable_1.default(() => {
                    const playerTile = playerWorld.getByTile(tile);
                    if (playerTile === null) {
                        return false;
                    }
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerWorld.id(), () => tile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))), `tiles[${playerWorld.entries().indexOf(playerTile)}]`);
                    return true;
                }, 2, 20);
                return;
            }
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerWorld.id(), () => playerTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))), `tiles[${playerWorld.entries().indexOf(playerTile)}]`);
        });
        ['unit:created', 'unit:defeated'].forEach((event) => {
            Engine_1.instance.on(event, (unit) => {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player()), playerTile = playerWorld.getByTile(unit.tile());
                if (!playerTile) {
                    return;
                }
                // TODO: check if this is another player first and if there's already another unit there, use an unknown unit
                //  Need to update Units renderer if this happens
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerTile.id(), () => playerTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, 
                // filterToReferenceAllExcept(Tile, Unit, UnknownPlayer, Yield)
                filterToReference(Player_1.default))));
                if (unit.player() !== this.player()) {
                    return;
                }
                if (event === 'unit:created') {
                    const playerUnits = UnitRegistry_1.instance.getByPlayer(this.player()), playerIndex = playerUnits.indexOf(unit), cityUnits = UnitRegistry_1.instance.getByCity(unit.city()), cityIndex = cityUnits.indexOf(unit), tileUnits = UnitRegistry_1.instance.getByTile(unit.tile()), tileIndex = tileUnits.indexOf(unit);
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(player.id(), () => unit.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Tile_1.default, Player_1.default, PlayerTile_1.default, City_1.default))), `units[${playerIndex}]`);
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(playerTile.id(), () => unit.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Unit_1.default))), `units[${tileIndex}]`);
                    if (unit.city() !== null) {
                        __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(unit.city().id(), () => unit.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Unit_1.default))), `units[${cityIndex}]`);
                    }
                    return;
                }
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(this.player().id(), () => this.player().toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReferenceAllExcept(Player_1.default, Unit_1.default))));
            });
        });
        ['unit:destroyed'].forEach((event) => {
            Engine_1.instance.on(event, (unit, action) => {
                if (unit.player() === this.player() && unit.city() !== null) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(unit.city().id(), () => unit
                        .city()
                        .toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(PlayerActions_2.CityBuild, CityGrowth_1.default, CityImprovement_1.default, Player_1.default, PlayerTile_1.default, Tile_1.default, Unit_1.default))));
                }
            });
        });
        ['unit:moved'].forEach((event) => {
            Engine_1.instance.on(event, (unit, action) => {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player()), fromTile = playerWorld.getByTile(action.from()), toTile = playerWorld.getByTile(action.to());
                if (!fromTile && !toTile) {
                    return;
                }
                if (fromTile) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(fromTile.id(), () => fromTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, City_1.default))));
                }
                if (toTile) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(toTile.id(), () => toTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, City_1.default))));
                }
                if (unit.player() === this.player() && unit.city() !== null) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(unit.city().id(), () => unit
                        .city()
                        .toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(PlayerActions_2.CityBuild, CityGrowth_1.default, CityImprovement_1.default, Player_1.default, PlayerTile_1.default, Tile_1.default, Unit_1.default))));
                }
            });
        });
        ['tile-improvement:built', 'tile-improvement:pillaged'].forEach((event) => {
            Engine_1.instance.on(event, (tile) => {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player()), playerTile = playerWorld.getByTile(tile);
                if (playerTile) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerTile.id(), () => playerTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, City_1.default))));
                }
            });
        });
        Engine_1.instance.on('city:captured', (city, capturingPlayer, originalPlayer) => {
            if (originalPlayer === this.player()) {
                const playerCities = CityRegistry_1.instance.getByPlayer(this.player()), cityIndex = playerCities.indexOf(city);
                if (cityIndex !== -1) {
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(this.player().id(), () => this.player().toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReferenceAllExcept(Player_1.default))));
                    // this.#dataQueue.remove(this.player().id(), `cities[${cityIndex}]`);
                }
                this.sendNotification(`${capturingPlayer
                    .civilization()
                    .name()} have captured our city ${city.name()}!`);
                return;
            }
            if (capturingPlayer === this.player()) {
                this.sendNotification(`We have captured ${city.name()} from ${originalPlayer
                    .civilization()
                    .name()}!`);
                return;
            }
        });
        [
            'city:created',
            'city:captured',
            'city:destroyed',
            'city:grow',
            'city:shrink',
        ].forEach((event) => {
            Engine_1.instance.on(event, (city) => {
                const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player()), playerTile = playerWorld.getByTile(city.tile());
                if (!playerTile) {
                    return;
                }
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerTile.id(), () => playerTile.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            });
        });
        Engine_1.instance.on('city:shrink', (city) => {
            if (city.player() !== this.player()) {
                return;
            }
            this.sendNotification(`Population decrease in ${city.name()}.`);
        });
        Engine_1.instance.on('city:unit-unsupported', (city, unit) => {
            if (city.player() !== this.player()) {
                return;
            }
            this.sendNotification(`${city.name()} cannot support ${unit.constructor.name}.`);
        });
        Engine_1.instance.on('city:unsupported-improvement', (city, cityImprovement) => {
            if (city.player() !== this.player()) {
                return;
            }
            this.sendNotification(`${city.name()} cannot support ${cityImprovement.constructor.name}.`);
        });
        Engine_1.instance.on('city:food-storage-exhausted', (city) => {
            if (city.player() !== this.player()) {
                return;
            }
            this.sendNotification(`Food storage exhausted in ${city.name()}!`);
        });
        Engine_1.instance.on('city:building-complete', (cityBuild, build) => {
            const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player());
            if (cityBuild.city().player() !== this.player() &&
                build instanceof Wonder_1.default) {
                this.sendNotification(`${playerWorld.getByTile(cityBuild.city().tile())
                    ? cityBuild.city().name()
                    : 'A faraway city'} has completed work on ${build.constructor.name}!`);
                return;
            }
            if (cityBuild.city().player() !== this.player() &&
                !(build instanceof Wonder_1.default)) {
                return;
            }
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(cityBuild.id(), () => cityBuild.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Tile_1.default, Unit_1.default, Player_1.default))));
            this.sendNotification(`${cityBuild.city().name()} has completed work on ${build.constructor.name}!`);
        });
        Engine_1.instance.on('player:research-complete', (playerResearch, advance) => {
            if (playerResearch.player() !== this.player()) {
                return;
            }
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerResearch.id(), () => playerResearch.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            this.sendNotification(`You have discovered the secrets of ${advance.constructor.name}!`);
        });
        Engine_1.instance.on('goody-hut:action-performed', (goodyHut, action) => {
            const tile = goodyHut.tile(), units = UnitRegistry_1.instance.getByTile(tile);
            if (!units.some((unit) => unit.player() === this.player())) {
                return;
            }
            if (action instanceof GoodyHuts_1.Advance) {
                this.sendNotification('You have discovered scrolls of ancient wisdom...');
                return;
            }
            if (action instanceof GoodyHuts_1.City) {
                this.sendNotification('You have discovered an advanced tribe...');
                return;
            }
            if (action instanceof GoodyHuts_1.Gold) {
                this.sendNotification('You have discovered valuable treasure...');
                return;
            }
            if (action instanceof GoodyHuts_1.Unit) {
                this.sendNotification('You have discovered a friendly tribe of skilled mercenaries...');
                return;
            }
        });
        Engine_1.instance.on('player:defeated', (defeatedPlayer, player) => {
            if (defeatedPlayer === this.player()) {
                this.sendNotification(`You have been defeated!`);
                PlayerRegistry_1.instance.unregister(...PlayerRegistry_1.instance.entries());
                CurrentPlayerRegistry_1.instance.unregister(...CurrentPlayerRegistry_1.instance.entries());
                // TODO: summary and quit
                __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'restart', null);
            }
            this.sendNotification(`${defeatedPlayer.civilization().name()} defeated${player ? ` by ${player.civilization().name()}` : ''}.`);
        });
        Engine_1.instance.on('city:civil-disorder', (city) => {
            if (city.player() === this.player()) {
                this.sendNotification(`Civil disorder in ${city.name()}!`);
            }
        });
    }
    chooseCivilization(Civilizations) {
        const makeChoice = (ChosenCivilization) => {
            this.player().setCivilization(new ChosenCivilization());
            return this.chooseLeader(this.player().civilization());
        };
        return new Promise((resolve, reject) => {
            if (Civilizations.length === 1) {
                const [Civilization] = Civilizations;
                makeChoice(Civilization).then(() => resolve());
                return;
            }
            __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'chooseCivilization', new TransferObject_1.default({ choices: Civilizations }).toPlainObject());
            __classPrivateFieldGet(this, _DataTransferClient_receiver, "f").call(this, 'chooseCivilization', (choice) => {
                const [Civilization] = Civilizations.filter((Civilization) => Civilization.name === choice);
                if (!Civilization) {
                    reject(`Invalid civilization ${choice} (options: ${Civilizations.map((Civilization) => Civilization.name).join(', ')})`);
                    return;
                }
                makeChoice(Civilization).then(() => resolve());
            });
        });
    }
    chooseLeader(civilization) {
        return new Promise((resolve, reject) => {
            const Leaders = LeaderRegistry_1.instance.getByCivilization(civilization.constructor);
            if (Leaders.length === 1) {
                const [Leader] = Leaders;
                civilization.setLeader(new Leader());
                resolve();
                return;
            }
            __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'chooseLeader', new TransferObject_1.default({ choices: Leaders }).toPlainObject());
            __classPrivateFieldGet(this, _DataTransferClient_receiver, "f").call(this, 'chooseLeader', (choice) => {
                const [Leader] = Leaders.filter((Leader) => Leader.name === choice);
                if (!Leader) {
                    reject(`Invalid civilization ${choice} (options: ${Leaders.map((Leader) => Leader.name).join(', ')})`);
                    return;
                }
                civilization.setLeader(new Leader());
                resolve();
            });
        });
    }
    handleAction(...args) {
        const [action] = args, player = this.player(), actions = player.actions(), mandatoryActions = actions.filter((action) => action instanceof MandatoryPlayerAction_1.default);
        const { name, id } = action;
        // TODO: a proper action for this probably...
        if (name === 'ReassignWorkers') {
            const [city] = CityRegistry_1.instance.getBy('id', action.city);
            if (!city) {
                return false;
            }
            (0, assignWorkers_1.reassignWorkers)(city);
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(city.id(), city.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, Tile_1.default))));
            return false;
        }
        if (name === 'EndTurn') {
            return (mandatoryActions.length === 1 &&
                mandatoryActions.every((action) => action instanceof PlayerActions_5.EndTurn));
        }
        if (!name) {
            console.log('action not specified');
            return false;
        }
        const [playerAction] = actions.filter((action) => action.constructor.name === name &&
            id === (action.value() ? action.value().id() : undefined));
        if (!playerAction) {
            console.log('action not specified');
            return false;
        }
        // TODO: other actions
        // TODO: make this better...
        if (playerAction instanceof PlayerActions_1.ActiveUnit) {
            const { unitAction, target } = action, unit = playerAction.value(), allActions = [
                ...unit.actions(),
                ...Object.values(unit.actionsForNeighbours()),
            ].flat();
            let actions = allActions.filter((action) => action.constructor.name === unitAction);
            while (actions.length !== 1) {
                if (actions.length === 0) {
                    console.log(`action not found: ${unitAction}`);
                    return false;
                }
                const [playerTile] = PlayerWorldRegistry_1.instance
                    .getByPlayer(this.player())
                    .filter((tile) => tile.id() === target);
                if (!playerTile) {
                    console.log(`tile not found: ${target}`);
                    return false;
                }
                actions = actions.filter((action) => action.to() === playerTile.tile());
                if (actions.length > 1) {
                    if (!target) {
                        console.log(`too many actions found: ${unitAction} (${actions.length})`);
                        return false;
                    }
                }
            }
            const [actionToPerform] = actions;
            actionToPerform.perform();
            return false;
        }
        if (playerAction instanceof PlayerActions_1.InactiveUnit) {
            const unit = playerAction.value();
            if (unit.moves().value() > 0) {
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(unit.id(), unit.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, Tile_1.default))));
            }
            unit.activate();
            return false;
        }
        if (playerAction instanceof PlayerActions_2.CityBuild ||
            playerAction instanceof PlayerActions_2.ChangeProduction) {
            const cityBuild = playerAction.value(), { chosen } = action;
            if (!chosen) {
                console.log(`no build item specified`);
                return false;
            }
            const [buildItem] = cityBuild
                .available()
                .filter((buildItem) => buildItem.item().name === chosen);
            if (!buildItem) {
                console.log(`build item not available: ${chosen}`);
                return false;
            }
            cityBuild.build(buildItem.item());
            return false;
        }
        if (playerAction instanceof ChooseResearch_1.default) {
            const playerResearch = playerAction.value(), { chosen } = action;
            if (!chosen) {
                this.sendNotification(`no build item specified`);
                return false;
            }
            const [ChosenAdvance] = playerResearch
                .available()
                .filter((AdvanceType) => AdvanceType.name === chosen);
            if (!ChosenAdvance) {
                console.log(`build item not available: ${chosen}`);
                return false;
            }
            playerResearch.research(ChosenAdvance);
            return false;
        }
        if (playerAction instanceof PlayerActions_4.CompleteProduction) {
            const city = playerAction.value(), playerTreasury = PlayerTreasuryRegistry_1.instance.getByPlayer(this.player());
            playerTreasury.buy(city);
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerTreasury.id(), playerTreasury.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            return false;
        }
        // TODO: DelayedPlayerAction -> Revolution --> SelectGovernment
        if (playerAction instanceof PlayerActions_6.Revolution) {
            const playerGovernment = playerAction.value(), { chosen } = action, [GovernmentType] = playerGovernment
                .available()
                .filter((GovernmentType) => GovernmentType.name === chosen);
            if (!GovernmentType) {
                console.error(`Government type: '${chosen}' not found.`);
                return false;
            }
            playerGovernment.set(new GovernmentType());
            const playerWorld = PlayerWorldRegistry_1.instance.getByPlayer(this.player());
            __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(playerWorld.id(), playerWorld.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default))));
            CityRegistry_1.instance
                .getByPlayer(this.player())
                .forEach((city) => __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(city.id(), city.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, Tile_1.default, Unit_1.default)))));
            return false;
        }
        if (playerAction instanceof PlayerActions_3.AdjustTradeRates) {
            const playerTradeRates = playerAction.value(), { value } = action;
            playerTradeRates.setAll(value.map(([name, value]) => {
                const [rate] = playerTradeRates
                    .all()
                    .filter((rate) => rate.constructor.name === name);
                return [rate.constructor, value];
            }));
            CityRegistry_1.instance
                .getByPlayer(this.player())
                .forEach((city) => __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(city.id(), city.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Player_1.default, Tile_1.default, Unit_1.default)))));
            return false;
        }
        console.log(`unhandled action: ${JSON.stringify(action)}`);
        return false;
    }
    sendInitialData() {
        const rawData = {
            player: this.player(),
            turn: Turn_1.instance,
            year: Year_1.instance,
        };
        const dataObject = new TransferObject_1.default(rawData);
        __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'gameData', dataObject.toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this)));
        __classPrivateFieldSet(this, _DataTransferClient_sentInitialData, true, "f");
    }
    sendPatchData() {
        __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'gameDataPatch', __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").transferData());
        __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").clear();
    }
    sendNotification(message) {
        __classPrivateFieldGet(this, _DataTransferClient_sender, "f").call(this, 'gameNotification', {
            message: message,
        });
    }
    takeTurn() {
        return new Promise((resolve, reject) => {
            if (!__classPrivateFieldGet(this, _DataTransferClient_sentInitialData, "f")) {
                this.sendInitialData();
            }
            setTimeout(() => {
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(Turn_1.instance.id(), () => Turn_1.instance.toPlainObject());
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(Year_1.instance.id(), () => Year_1.instance.toPlainObject());
                __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").add(this.player().id(), () => this.player().toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(Tile_1.default, Civilization_1.default))));
                this.sendPatchData();
            }, 1);
            const listener = (...args) => {
                try {
                    if (this.handleAction(...args)) {
                        __classPrivateFieldGet(this, _DataTransferClient_eventEmitter, "f").off('action', listener);
                        this.sendPatchData();
                        setTimeout(() => resolve(), 100);
                        return;
                    }
                    __classPrivateFieldGet(this, _DataTransferClient_dataQueue, "f").update(this.player().id(), () => this.player().toPlainObject(__classPrivateFieldGet(this, _DataTransferClient_dataFilter, "f").call(this, filterToReference(PlayerWorld_1.default, Tile_1.default, City_1.default))));
                    this.sendPatchData();
                }
                catch (e) {
                    reject(e);
                }
            };
            __classPrivateFieldGet(this, _DataTransferClient_eventEmitter, "f").on('action', listener);
        });
    }
}
exports.DataTransferClient = DataTransferClient;
_DataTransferClient_dataFilter = new WeakMap(), _DataTransferClient_dataQueue = new WeakMap(), _DataTransferClient_eventEmitter = new WeakMap(), _DataTransferClient_receiver = new WeakMap(), _DataTransferClient_sender = new WeakMap(), _DataTransferClient_sentInitialData = new WeakMap();
exports.default = DataTransferClient;
//# sourceMappingURL=DataTransferClient.js.map