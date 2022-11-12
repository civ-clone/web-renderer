"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractTransport = void 0;
class AbstractTransport {
    async request(request, ...args) {
        return new Promise((resolve) => {
            this.send(request.channel(), ...args);
            this.receiveOnce(request.channel(), (value) => resolve(value));
        });
    }
}
exports.AbstractTransport = AbstractTransport;
exports.default = AbstractTransport;
//# sourceMappingURL=AbstractTransport.js.map