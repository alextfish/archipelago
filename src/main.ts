import Phaser from "phaser";
import { BridgePuzzleScene } from "@view/scenes/BridgePuzzleScene";
import { PuzzleHUDScene } from "@view/scenes/PuzzleHUDScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#87CEEB", // Sky blue for sea
  parent: "game-container",
  scene: [BridgePuzzleScene, PuzzleHUDScene],
};

new Phaser.Game(config);
