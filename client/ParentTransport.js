"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentTransport = void 0;
addEventListener('message', ({ data: { channel, data } }) => console.log('receiving: ' + channel, data));
class ParentTransport {
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
                handler(data.data);
            }
        }, {
            once: true,
        });
    }
    send(channel, data) {
        console.log('sending: ' + channel, data);
        postMessage({
            channel,
            data,
        });
    }
}
exports.ParentTransport = ParentTransport;
exports.default = ParentTransport;
//# sourceMappingURL=ParentTransport.js.map