

const map = this.make.tilemap({ key: 'overworld' });
const tileset = map.addTilesetImage('terrain', 'terrainImage');
const groundLayer = map.createLayer('Ground', tileset);
const collisionLayer = map.createLayer('Collision', tileset);
collisionLayer.setCollisionByProperty({ collides: true });

const puzzleObjects = map.getObjectLayer('Puzzles').objects;
for (const obj of puzzleObjects) {
  if (obj.type === 'PuzzleEntrance') {
    this.puzzles.push({
      id: obj.properties.find(p => p.name === 'puzzleId')?.value,
      x: obj.x,
      y: obj.y
    });
  }
}

if (player.interacts.with(puzzle)) {
    this.scene.start('PuzzleScene', { puzzleId: 'bridge_01' });

}