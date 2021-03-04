"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _ready, _window;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const electron_1 = require("electron");
const ElectronClient_1 = require("./client/ElectronClient");
const Player_1 = require("@civ-clone/core-player/Player");
const SimpleAIClient_1 = require("@civ-clone/simple-ai-client/SimpleAIClient");
const Engine_1 = require("@civ-clone/core-engine/Engine");
const PlayerRegistry_1 = require("@civ-clone/core-player/PlayerRegistry");
const ClientRegistry_1 = require("@civ-clone/core-client/ClientRegistry");
class Game {
    constructor() {
        _ready.set(this, void 0);
        _window.set(this, void 0);
        __classPrivateFieldSet(this, _ready, electron_1.app.whenReady().then(() => {
            this.createWindow();
            this.sendData('notification', 'window loaded.');
        }));
        electron_1.app.on('window-all-closed', () => electron_1.app.quit());
        electron_1.ipcMain.handle('start', () => {
            this.sendData('notification', 'off we go!');
            this.bindEvents();
            this.configure();
            this.start();
        });
    }
    createWindow() {
        __classPrivateFieldSet(this, _window, new electron_1.BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                contextIsolation: true,
                enableRemoteModule: false,
                preload: `${__dirname}/view/js/preload.js`,
            },
        }));
        __classPrivateFieldGet(this, _window).loadURL(`file://${__dirname}/view/html/index.html`);
        // this.#window.webContents.openDevTools();
    }
    bindEvents() {
        this.sendData('notification', `binding events`);
        Engine_1.instance.on('engine:initialise', () => this.sendData('notification', `initialising...`));
        Engine_1.instance.on('engine:plugins:load:success', (packageName) => this.sendData('notification', `loaded plugin: ${packageName}`));
        Engine_1.instance.on('engine:plugins-loaded', () => this.sendData('notification', `plugins loaded`));
        Engine_1.instance.on('engine:start', () => this.sendData('notification', `starting...`));
        Engine_1.instance.on('world:generate-start-tiles', () => this.sendData('notification', `generating start tiles...`));
        Engine_1.instance.on('world:built', () => this.sendData('notification', `world built`));
        Engine_1.instance.on('game:start', () => this.sendData('notification', `game start`));
        Engine_1.instance.on('turn:start', (turn) => this.sendData('notification', `turn start ${turn}`));
        Engine_1.instance.on('player:turn-start', (player) => this.sendData('notification', `player turn-start: ${player.civilization().constructor.name}`));
    }
    configure() {
        // engine.setOption('debug', true);
        // this.sendData('notification', 'debug enabled');
        Engine_1.instance.setOption('height', 60);
        Engine_1.instance.setOption('width', 80);
        // TODO: Determine number of players via UI
        Engine_1.instance.setOption('players', 5);
        this.sendData('notification', '5 players');
    }
    sendData(channel, payload) {
        __classPrivateFieldGet(this, _window).webContents.send(channel, payload);
    }
    start() {
        __classPrivateFieldGet(this, _ready).then(() => {
            Engine_1.instance.on('engine:start', () => {
                new Array(Engine_1.instance.option('players'))
                    .fill(0)
                    .forEach((value, i) => {
                    this.sendData('notification', `working on player ${i + 1}...`);
                    const player = new Player_1.default(), 
                    // TODO: This is pretty basic.
                    client = i === 0
                        ? new ElectronClient_1.default(player, (channel, payload) => this.sendData(channel, payload), (channel, handler) => electron_1.ipcMain.handle(channel, (event, ...args) => handler(...args)))
                        : new SimpleAIClient_1.default(player);
                    PlayerRegistry_1.instance.register(player);
                    ClientRegistry_1.instance.register(client);
                    this.sendData('notification', `generating world...`);
                });
            });
            Engine_1.instance.start();
            this.sendData('notification', 'started.');
        });
    }
}
exports.Game = Game;
_ready = new WeakMap(), _window = new WeakMap();
exports.default = Game;
//# sourceMappingURL=Game.js.map