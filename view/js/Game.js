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
var _Game_transport;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const DataTransferClient_1 = require("../../client/DataTransferClient");
const Player_1 = require("@civ-clone/core-player/Player");
const SimpleAIClient_1 = require("@civ-clone/simple-ai-client/SimpleAIClient");
const ClientRegistry_1 = require("@civ-clone/core-client/ClientRegistry");
const Engine_1 = require("@civ-clone/core-engine/Engine");
const PlayerRegistry_1 = require("@civ-clone/core-player/PlayerRegistry");
class Game {
    constructor(transport) {
        _Game_transport.set(this, void 0);
        __classPrivateFieldSet(this, _Game_transport, transport, "f");
        transport.receive('start', () => {
            this.bindEvents();
            this.start();
        });
        transport.receive('setOption', ({ name, value }) => {
            __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `setting ${name} to ${value}`);
            Engine_1.instance.setOption(name, value);
        });
        transport.receive('getOptions', (values) => transport.send('getOptions', values.reduce((options, optionName) => {
            options[optionName] = Engine_1.instance.option(optionName);
            return options;
        }, {})));
        transport.receive('setOptions', (values) => {
            Object.entries(values).forEach(([option, value]) => Engine_1.instance.setOption(option, value));
            transport.send('setOptions');
        });
    }
    bindEvents() {
        __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `binding events`);
        Engine_1.instance.on('engine:initialise', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `initialising...`));
        Engine_1.instance.on('engine:plugins:load:success', (packageName) => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `loaded plugin: ${packageName}`));
        Engine_1.instance.on('engine:plugins-loaded', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `plugins loaded`));
        Engine_1.instance.on('engine:start', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `starting...`));
        Engine_1.instance.on('world:generate-start-tiles', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `generating start tiles...`));
        Engine_1.instance.on('world:built', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `world built`));
        Engine_1.instance.on('game:start', () => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `game start`));
        Engine_1.instance.on('turn:start', (turn) => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `turn start ${turn}`));
        Engine_1.instance.on('player:turn-start', (player) => __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `player turn-start: ${player.civilization().constructor.name}`));
    }
    start() {
        Engine_1.instance.on('engine:start', () => {
            new Array(parseInt(Engine_1.instance.option('players'), 10))
                .fill(0)
                .forEach((value, i) => {
                const player = new Player_1.default(), 
                // TODO: This is pretty basic.
                client = i === 0
                    ? new DataTransferClient_1.default(player, (channel, payload) => __classPrivateFieldGet(this, _Game_transport, "f").send(channel, payload), (channel, handler) => __classPrivateFieldGet(this, _Game_transport, "f").receive(channel, handler))
                    : new SimpleAIClient_1.default(player);
                PlayerRegistry_1.instance.register(player);
                ClientRegistry_1.instance.register(client);
                __classPrivateFieldGet(this, _Game_transport, "f").send('notification', `generating world...`);
            });
        });
        // we don't want to try and use FS objects so replace this call with the direct events instead.
        Engine_1.instance.start();
        Promise.resolve().then(() => require('./plugins')).then(() => Engine_1.instance.emit('plugins:load:end'));
    }
}
exports.Game = Game;
_Game_transport = new WeakMap();
exports.default = Game;
//# sourceMappingURL=Game.js.map