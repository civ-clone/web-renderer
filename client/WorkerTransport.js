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
class WorkerTransport {
    constructor(worker) {
        _WorkerTransport_worker.set(this, void 0);
        __classPrivateFieldSet(this, _WorkerTransport_worker, worker, "f");
        worker.addEventListener('message', ({ data: { channel, data } }) => console.log('receiving: ' + channel, data));
    }
    receive(receivingChannel, handler) {
        __classPrivateFieldGet(this, _WorkerTransport_worker, "f").addEventListener('message', ({ data: { channel, data } }) => {
            if (channel === receivingChannel) {
                handler(data);
            }
        });
    }
    receiveOnce(receivingChannel, handler) {
        __classPrivateFieldGet(this, _WorkerTransport_worker, "f").addEventListener('message', ({ data: { channel, data } }) => {
            if (channel === receivingChannel) {
                handler(data.data);
            }
        }, {
            once: true,
        });
    }
    send(channel, data) {
        console.log('sending: ' + channel, data);
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