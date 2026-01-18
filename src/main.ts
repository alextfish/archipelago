import Phaser from "phaser";
import { BridgePuzzleScene } from "@view/scenes/BridgePuzzleScene";
import { PuzzleHUDScene } from "@view/scenes/PuzzleHUDScene";
import { IslandMapScene } from "@view/scenes/IslandMapScene";
import { OverworldScene } from "@view/scenes/OverworldScene";
import { ConversationScene } from "@view/scenes/ConversationScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,  // Increased for better overworld view
  height: 800,  // Increased for better overworld view
  backgroundColor: "#87CEEB", // Sky blue for sea
  parent: "game-container",
  pixelArt: true,
  render: {
    antialias: false
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },  // No gravity for top-down view
      debug: false
    }
  },
  scene: [OverworldScene, ConversationScene, BridgePuzzleScene, PuzzleHUDScene, IslandMapScene],
};

new Phaser.Game(config);
