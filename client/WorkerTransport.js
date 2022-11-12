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
var _WorkerTransport_worker;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerTransport = void 0;
const AbstractTransport_1 = require("./AbstractTransport");
class WorkerTransport extends AbstractTransport_1.default {
    constructor(worker) {
        super();
        _WorkerTransport_worker.set(this, void 0);
        __classPrivateFieldSet(this, _WorkerTransport_worker, worker, "f");
    }
    receive(receivingChannel, handler) {
        __classPrivateFieldGet(this, _WorkerTransport_worker, "f").addEventListener('message', ({ data: { channel, data } }) => {
            if (channel === receivingChannel) {
                handler(data);
            }
        });
    }
    receiveOnce(receivingChannel, handler) {
        const onceHandler = ({ data: { channel, data }, }) => {
            if (channel === receivingChannel) {
                handler(data);
                __classPrivateFieldGet(this, _WorkerTransport_worker, "f").removeEventListener('message', onceHandler);
            }
        };
        __classPrivateFieldGet(this, _WorkerTransport_worker, "f").addEventListener('message', onceHandler);
    }
    send(channel, data) {
        __classPrivateFieldGet(this, _WorkerTransport_worker, "f").postMessage({
            channel,
            data,
        });
    }
}
exports.WorkerTransport = WorkerTransport;
_WorkerTransport_worker = new WeakMap();
exports.default = WorkerTransport;
//# sourceMappingURL=WorkerTransport.js.map