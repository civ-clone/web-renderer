"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentTransport = void 0;
const AbstractTransport_1 = require("./AbstractTransport");
class ParentTransport extends AbstractTransport_1.default {
    receive(receivingChannel, handler) {
        addEventListener('message', ({ data: { channel, data } }) => {
            if (channel === receivingChannel) {
                handler(data);
            }
        });
    }
    receiveOnce(receivingChannel, handler) {
        addEventListener('message', ({ data: { channel, data } }) => {
            if (channel === receivingChannel) {
                handler(data);
            }
        }, {
            once: true,
        });
    }
    send(channel, data) {
        postMessage({
            channel,
            data,
        });
    }
}
exports.ParentTransport = ParentTransport;
exports.default = ParentTransport;
//# sourceMappingURL=ParentTransport.js.map