"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconstituteData = void 0;
const reconstituteData = ({ hierarchy, objects }, orphanIds = null) => {
    const seenObjects = new Map();
    if (orphanIds) {
        Object.keys(objects).forEach((id) => orphanIds.push(id));
    }
    const getReferences = (value) => {
        if (seenObjects.has(value)) {
            return seenObjects.get(value);
        }
        if (Array.isArray(value)) {
            const updated = [];
            seenObjects.set(value, updated);
            value.forEach((value) => updated.push(getReferences(value)));
            return updated;
        }
        if (value && value['#ref']) {
            if (orphanIds) {
                orphanIds.splice(orphanIds.indexOf(value['#ref']), 1);
            }
            if (!(value['#ref'] in objects)) {
                throw new TypeError(`missing ${value['#ref']}`);
            }
            const updated = getReferences(objects[value['#ref']]);
            seenObjects.set(value, updated);
            return updated;
        }
        if (value instanceof Object) {
            const updated = {};
            seenObjects.set(value, updated);
            Object.entries(value).forEach(([key, childValue]) => {
                updated[key] = getReferences(childValue);
            });
            return updated;
        }
        return value;
    };
    return getReferences(hierarchy);
};
exports.reconstituteData = reconstituteData;
exports.default = exports.reconstituteData;
//# sourceMappingURL=reconstituteData.js.map