import Units from './Units.js';
export class ActiveUnit extends Units {
    render() {
        this.clear();
        const activeUnit = this.activeUnit();
        if (activeUnit === null) {
            return;
        }
        const { x, y } = activeUnit.tile, tile = this.world().get(x, y), size = this.tileSize(), offsetX = x * size, offsetY = y * size, image = this.renderUnit(activeUnit);
        if (tile.units.length > 1) {
            this.putImage(image, offsetX - this.scale(), offsetY - this.scale());
        }
        this.putImage(image, offsetX, offsetY);
    }
    update() {
        this.render();
    }
}
export default ActiveUnit;
//# sourceMappingURL=ActiveUnit.js.map