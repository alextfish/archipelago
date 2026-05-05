import Phaser from "phaser";
import { BridgePuzzleScene } from "@view/scenes/BridgePuzzleScene";
import { PuzzleHUDScene } from "@view/scenes/PuzzleHUDScene";
import { IslandMapScene } from "@view/scenes/IslandMapScene";
import { OverworldScene } from "@view/scenes/OverworldScene";
import { ConversationScene } from "@view/scenes/ConversationScene";
import { TranslationModeScene } from "@view/scenes/TranslationModeScene";
import { OverworldHUDScene } from "@view/scenes/OverworldHUDScene";
import { InteriorScene } from "@view/scenes/InteriorScene";
import { getPlayerPosition, getNPCSpriteStatus } from "@helpers/TestEvents";

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
  dom: {
    createContainer: true,
  },
  scene: [OverworldScene, ConversationScene, BridgePuzzleScene, PuzzleHUDScene, IslandMapScene, OverworldHUDScene, TranslationModeScene, InteriorScene],
};

const game = new Phaser.Game(config);

// Expose game instance and test helpers to window for E2E tests
(window as any).game = game;
(window as any).getPlayerPosition = getPlayerPosition;
(window as any).getNPCSpriteStatus = getNPCSpriteStatus;
