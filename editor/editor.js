// src/model/puzzle/StrutBridge.ts
var StrutBridge = class {
  id;
  start;
  end;
  type;
  constructor(id, type) {
    this.id = id;
    this.type = type;
  }
  /**
   * Returns the strut location for this bridge when placed, based on
   * which islands the bridge crosses:
   * - 0 islands crossed → midpoint of the bridge
   * - 1 island crossed  → that island's position
   * - 2+ islands crossed → island closest to the midpoint
   *
   * Returns null when the bridge is not placed or has length less than 2.
   */
  getStrutLocation(puzzle) {
    if (!this.start || !this.end) return null;
    const length = Math.abs(this.end.x - this.start.x) + Math.abs(this.end.y - this.start.y);
    if (length < 2) return null;
    const { start, end } = this;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const crossedIslands = this.getCrossedIslands(puzzle.islands);
    if (crossedIslands.length === 0) {
      return midpoint;
    }
    if (crossedIslands.length === 1) {
      return { x: crossedIslands[0].x, y: crossedIslands[0].y };
    }
    let closest = crossedIslands[0];
    let closestDist = distSquared(closest, midpoint);
    for (let i = 1; i < crossedIslands.length; i++) {
      const d = distSquared(crossedIslands[i], midpoint);
      if (d < closestDist) {
        closestDist = d;
        closest = crossedIslands[i];
      }
    }
    return { x: closest.x, y: closest.y };
  }
  /**
   * Returns all islands that this bridge crosses (strictly between endpoints).
   * Assumes the bridge is placed (start and end are defined).
   */
  getCrossedIslands(islands) {
    if (!this.start || !this.end) return [];
    const { start, end } = this;
    const result = [];
    const isHorizontal = start.y === end.y;
    const isVertical = start.x === end.x;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    for (const island of islands) {
      if (island.x === start.x && island.y === start.y) continue;
      if (island.x === end.x && island.y === end.y) continue;
      if (isHorizontal && island.y === start.y) {
        if (island.x > minX && island.x < maxX) {
          result.push(island);
        }
      }
      if (isVertical && island.x === start.x) {
        if (island.y > minY && island.y < maxY) {
          result.push(island);
        }
      }
    }
    return result;
  }
  /**
   * Returns the ordered list of sprite frame names for this bridge, from the
   * start endpoint to the end endpoint, including endpoint tiles.
   *
   * Frame name semantics:
   * - l2s-* : "left/top to strut" — the approach from the start endpoint
   * - strut  : the strut tile itself
   * - s2r-* : "strut to right/bottom" — the departure toward the end endpoint
   *
   * Returns null when the bridge is not placed.
   */
  getFrames(puzzle) {
    if (!this.start || !this.end) return null;
    const { start, end } = this;
    const isHorizontal = start.y === end.y;
    const length = isHorizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
    if (length === 1) {
      return ["l2s-single", "s2r-single"];
    }
    const strutLocation = this.getStrutLocation(puzzle);
    if (!strutLocation) return null;
    const strutDist = isHorizontal ? Math.abs(strutLocation.x - Math.min(start.x, end.x)) : Math.abs(strutLocation.y - Math.min(start.y, end.y));
    const rightDist = length - strutDist;
    return [
      ...buildSectionFrames(strutDist, "l2s"),
      "strut",
      ...buildSectionFrames(rightDist, "s2r")
    ];
  }
};
function buildSectionFrames(dist, prefix) {
  if (dist === 1) return [`${prefix}-single`];
  if (dist === 2) return [`${prefix}-left`, `${prefix}-right`];
  return [
    `${prefix}-left`,
    ...Array(dist - 2).fill(`${prefix}-mid`),
    `${prefix}-right`
  ];
}
function distSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// src/model/puzzle/BridgeInventory.ts
var BridgeInventory = class {
  allBridges = [];
  constructor(types) {
    let counter = 0;
    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        const bridgeType = {
          id: t.id,
          colour: t.colour,
          width: t.width,
          style: t.style,
          length: t.length,
          mustCoverIsland: t.mustCoverIsland,
          canCoverIsland: t.canCoverIsland
        };
        if (t.mustCoverIsland) {
          this.allBridges.push(new StrutBridge(`b${++counter}`, bridgeType));
        } else {
          this.allBridges.push({ id: `b${++counter}`, type: bridgeType });
        }
      }
    }
  }
  /** Returns all bridges, whether placed or not */
  get bridges() {
    return this.allBridges;
  }
  get bridgeTypes() {
    const unique = [
      ...new Map(
        this.allBridges.map((bridge) => [bridge.type.id, bridge])
      ).values()
    ];
    return unique.map((bridge) => bridge.type);
  }
  /** Returns unplaced bridges of a given type */
  getAvailableOfType(typeId) {
    return this.allBridges.filter((b) => b.type.id === typeId && !b.start && !b.end);
  }
  /** Take the next available bridge of the given type */
  takeBridge(typeId) {
    const available = this.getAvailableOfType(typeId);
    return available.length ? available[0] : void 0;
  }
  /** Mark a bridge as returned to pool (after removal) */
  returnBridge(bridgeId) {
    const bridge = this.allBridges.find((b) => b.id === bridgeId);
    if (bridge) {
      delete bridge.start;
      delete bridge.end;
    }
  }
  /** Number of remaining bridges of each type */
  countsByType() {
    const counts = {};
    for (const b of this.allBridges) {
      if (!(b.type.id in counts)) counts[b.type.id] = 0;
    }
    for (const b of this.allBridges) {
      if (!b.start && !b.end) {
        counts[b.type.id] = counts[b.type.id] + 1;
      }
    }
    return counts;
  }
};

// src/model/puzzle/constraints/Constraint.ts
var Constraint = class {
  id;
  description;
  violations;
  /**
   * Whether this constraint is "personified" — i.e. it has an NPC that
   * represents it in the world. Most constraints are personified. Non-personified
   * constraints (e.g. AllBridgesPlacedConstraint, BridgeLengthConstraint,
   * NoCrossingConstraint) don't need NPC glyph lists or conversation files.
   */
  personified = true;
  /**
   * Path (relative to resources/conversations/) to the conversation JSON file
   * shown when this constraint is unsatisfied.
   */
  conversationFile;
  /**
   * Path (relative to resources/conversations/) to the conversation JSON file
   * shown when this constraint is satisfied.
   */
  conversationFileSolved;
  /**
   * Returns the core display items for this constraint — one per constrained element.
   * Each item carries the glyph message ("good" when satisfied, violation message
   * otherwise) to be shown in a small speech bubble next to the element.
   * Constraints that have no per-element display return an empty array (the default).
   *
   * Subclasses override this method rather than {@link getDisplayItems}.
   * Disguise overrides from island constraint strings are applied automatically by
   * {@link getDisplayItems} after this method returns.
   */
  getCoreDisplayItems(_puzzle) {
    return [];
  }
  /**
   * Returns display items for this constraint, enriched with any disguise properties
   * declared on the corresponding islands in the Tiled map
   * (`disguise_sprite`, `disguise_sprite_solved`, `conversation_file`,
   * `conversation_file_solved`).
   *
   * Subclasses should override {@link getCoreDisplayItems}, not this method.
   */
  getDisplayItems(puzzle) {
    const items = this.getCoreDisplayItems(puzzle);
    return items.map((item) => {
      const island = puzzle.islands.find((i) => i.id === item.elementID);
      if (!island?.constraints) return item;
      const get = (prefix) => island.constraints.find((c) => c.startsWith(`${prefix}=`))?.substring(prefix.length + 1);
      const disguiseSpriteKey = get("disguise_sprite");
      const disguiseSpriteSolvedKey = get("disguise_sprite_solved");
      const conversationFile = get("conversation_file");
      const conversationFileSolved = get("conversation_file_solved");
      const animate = island.constraints.includes("animate=true") || void 0;
      const hasOverride = [disguiseSpriteKey, disguiseSpriteSolvedKey, conversationFile, conversationFileSolved, animate].some((v) => v !== void 0);
      if (!hasOverride) return item;
      return {
        ...item,
        ...disguiseSpriteKey !== void 0 && { disguiseSpriteKey },
        ...disguiseSpriteSolvedKey !== void 0 && { disguiseSpriteSolvedKey },
        ...conversationFile !== void 0 && { conversationFile },
        ...conversationFileSolved !== void 0 && { conversationFileSolved },
        ...animate !== void 0 && { animate }
      };
    });
  }
};

// src/model/puzzle/constraints/AllBridgesPlacedConstraint.ts
var AllBridgesPlacedConstraint = class _AllBridgesPlacedConstraint extends Constraint {
  personified = false;
  static fromSpec(_params) {
    return new _AllBridgesPlacedConstraint();
  }
  check(puzzle) {
    const violations = puzzle.bridges.filter((b) => !b.start || !b.end);
    this.violations = violations;
    const ok = violations.length === 0;
    return {
      satisfied: ok,
      affectedElements: violations.map((b) => b.id),
      message: ok ? void 0 : `Some bridges are unplaced: ${violations.map((b) => b.id).join(", ")}`
    };
  }
};

// src/model/puzzle/constraints/GridCellConstraints.ts
var GridCellConstraint = class extends Constraint {
  x;
  y;
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
  }
  // Subclasses should implement their own static fromSpec
  adjacentPoints() {
    return [
      { x: this.x + 1, y: this.y },
      { x: this.x - 1, y: this.y },
      { x: this.x, y: this.y + 1 },
      { x: this.x, y: this.y - 1 }
    ];
  }
  findTouchingBridge(puzzle, orientation) {
    return puzzle.bridges.filter((thisBridge) => {
      if (!thisBridge.start || !thisBridge.end) return false;
      const { start, end } = thisBridge;
      switch (orientation) {
        case "horizontal":
          const isHorizontal = start.y === end.y;
          if (!isHorizontal) return false;
          const y = start.y;
          const minX = Math.min(start.x, end.x);
          const maxX = Math.max(start.x, end.x);
          return (this.y === y + 1 || this.y === y - 1) && this.x >= minX && this.x <= maxX;
          break;
        case "vertical":
          const isVertical = start.x === end.x;
          if (!isVertical) return false;
          const x = start.x;
          const minY = Math.min(start.y, end.y);
          const maxY = Math.max(start.y, end.y);
          return (this.x === x + 1 || this.x === x - 1) && this.y >= minY && this.y <= maxY;
          break;
        default:
          console.error(`Unknown orientation: ${orientation}`);
          return false;
      }
    });
  }
};
var MustTouchAHorizontalBridge = class _MustTouchAHorizontalBridge extends GridCellConstraint {
  static fromSpec(params) {
    return new _MustTouchAHorizontalBridge(params.x, params.y);
  }
  check(puzzle) {
    const touching = this.findTouchingBridge(puzzle, "horizontal");
    const ok = touching.length > 0;
    this.violations = ok ? [] : [`${this.x},${this.y}`];
    return {
      satisfied: ok,
      affectedElements: ok ? touching.map((b) => b.id) : [],
      message: ok ? void 0 : `No horizontal bridge adjacent to space (${this.x}, ${this.y})`,
      glyphMessage: ok ? void 0 : "no adjacent horizontal bridge"
    };
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: `${this.x},${this.y}`,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "good",
      constraintType: "MustTouchAHorizontalBridge"
    }];
  }
};
var MustTouchAVerticalBridge = class _MustTouchAVerticalBridge extends GridCellConstraint {
  static fromSpec(params) {
    return new _MustTouchAVerticalBridge(params.x, params.y);
  }
  check(puzzle) {
    const touching = this.findTouchingBridge(puzzle, "vertical");
    const ok = touching.length > 0;
    this.violations = ok ? [] : [`${this.x},${this.y}`];
    return {
      satisfied: ok,
      affectedElements: ok ? touching.map((b) => b.id) : [],
      message: ok ? void 0 : `No vertical bridge adjacent to space (${this.x}, ${this.y})`,
      glyphMessage: ok ? void 0 : "no adjacent vertical bridge"
    };
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: `${this.x},${this.y}`,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "good",
      constraintType: "MustTouchAVerticalBridge"
    }];
  }
};

// src/model/puzzle/constraints/NoCrossingConstraint.ts
var NoCrossingConstraint = class _NoCrossingConstraint extends Constraint {
  personified = false;
  static fromSpec(_params) {
    return new _NoCrossingConstraint();
  }
  check(puzzle) {
    const bridges = puzzle.bridges;
    const violations = [];
    for (let i = 0; i < bridges.length; i++) {
      const b1 = bridges[i];
      if (!b1.start || !b1.end) continue;
      for (let j = i + 1; j < bridges.length; j++) {
        const b2 = bridges[j];
        if (!b2.start || !b2.end) continue;
        if (this.cross(b1.start, b1.end, b2.start, b2.end)) {
          violations.push(`${b1.id}:${b2.id}`);
        }
      }
    }
    this.violations = violations;
    const ok = violations.length === 0;
    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? void 0 : `Crossing bridges detected: ${violations.join(", ")}`
    };
  }
  cross(a1, a2, b1, b2) {
    const sharesEndpoint = a1.x === b1.x && a1.y === b1.y || a1.x === b2.x && a1.y === b2.y || a2.x === b1.x && a2.y === b1.y || a2.x === b2.x && a2.y === b2.y;
    if (sharesEndpoint) return false;
    function ccw(p1, p2, p3) {
      return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    }
    function segmentsIntersect(p1, p2, p3, p4) {
      return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }
    return segmentsIntersect(a1, a2, b1, b2);
  }
};

// src/model/puzzle/constraints/IslandMustBeCoveredConstraint.ts
var IslandMustBeCoveredConstraint = class _IslandMustBeCoveredConstraint extends Constraint {
  islandId;
  constructor(islandId) {
    super();
    this.islandId = islandId;
  }
  static fromSpec(params) {
    return new _IslandMustBeCoveredConstraint(params.islandId);
  }
  check(puzzle) {
    const island = puzzle.islands.find((i) => i.id === this.islandId);
    if (!island) {
      return {
        satisfied: false,
        affectedElements: [],
        message: `Island ${this.islandId} not found`
      };
    }
    const coveringBridges = puzzle.placedBridges.filter((bridge) => {
      if (!bridge.start || !bridge.end) return false;
      if (bridge.start.y === bridge.end.y && bridge.start.y === island.y) {
        const minX = Math.min(bridge.start.x, bridge.end.x);
        const maxX = Math.max(bridge.start.x, bridge.end.x);
        return island.x > minX && island.x < maxX;
      }
      if (bridge.start.x === bridge.end.x && bridge.start.x === island.x) {
        const minY = Math.min(bridge.start.y, bridge.end.y);
        const maxY = Math.max(bridge.start.y, bridge.end.y);
        return island.y > minY && island.y < maxY;
      }
      return false;
    });
    const ok = coveringBridges.length > 0;
    this.violations = ok ? [] : [this.islandId];
    return {
      satisfied: ok,
      affectedElements: ok ? coveringBridges.map((b) => b.id) : [this.islandId],
      message: ok ? void 0 : `Island ${this.islandId} at (${island.x}, ${island.y}) must be covered by a bridge`,
      glyphMessage: ok ? void 0 : "no bridge over island"
    };
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: this.islandId,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "good",
      constraintType: "IslandMustBeCoveredConstraint"
    }];
  }
};

// src/model/puzzle/constraints/IslandColourSeparationConstraint.ts
var IslandColourSeparationConstraint = class _IslandColourSeparationConstraint extends Constraint {
  colour1;
  colour2;
  constructor(colour1, colour2) {
    super();
    this.colour1 = colour1;
    this.colour2 = colour2;
  }
  static fromSpec(params) {
    return new _IslandColourSeparationConstraint(params.colour1, params.colour2);
  }
  check(puzzle) {
    const adjacencyMap = /* @__PURE__ */ new Map();
    for (const island of puzzle.islands) {
      adjacencyMap.set(island.id, /* @__PURE__ */ new Set());
    }
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const startIsland = puzzle.islands.find((i) => i.x === bridge.start.x && i.y === bridge.start.y);
      const endIsland = puzzle.islands.find((i) => i.x === bridge.end.x && i.y === bridge.end.y);
      if (startIsland && endIsland) {
        adjacencyMap.get(startIsland.id).add(endIsland.id);
        adjacencyMap.get(endIsland.id).add(startIsland.id);
      }
    }
    const visited = /* @__PURE__ */ new Set();
    const violations = [];
    for (const island of puzzle.islands) {
      if (visited.has(island.id)) continue;
      const component = [];
      const queue = [island.id];
      visited.add(island.id);
      while (queue.length > 0) {
        const currentId = queue.shift();
        const currentIsland = puzzle.islands.find((i) => i.id === currentId);
        component.push(currentIsland);
        for (const neighborId of adjacencyMap.get(currentId)) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
      const hasColour1 = component.some((i) => this.getIslandColour(i) === this.colour1);
      const hasColour2 = component.some((i) => this.getIslandColour(i) === this.colour2);
      if (hasColour1 && hasColour2) {
        violations.push(...component.map((i) => i.id));
      }
    }
    this.violations = violations;
    const ok = violations.length === 0;
    let glyphMessage;
    if (!ok) {
      glyphMessage = `${this.colour1} island must-not connected ${this.colour2} island`;
    }
    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? void 0 : `Islands of colour ${this.colour1} must not connect to islands of colour ${this.colour2}`,
      glyphMessage
    };
  }
  /**
   * Extract colour from island constraints.
   * Expects a constraint like "colour=red" or "colour=blue"
   */
  getIslandColour(island) {
    const colourConstraint = island.constraints?.find(
      (c) => c.startsWith("colour=")
    );
    if (!colourConstraint) return void 0;
    return colourConstraint.split("=")[1];
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    const violatedIds = new Set(result.affectedElements ?? []);
    const violationGlyph = result.glyphMessage ?? `${this.colour1} island must-not connected ${this.colour2} island`;
    return puzzle.islands.filter((island) => {
      const colour = this.getIslandColour(island);
      return colour === this.colour1 || colour === this.colour2;
    }).map((island) => ({
      elementID: island.id,
      glyphMessage: violatedIds.has(island.id) ? violationGlyph : "good",
      constraintType: "IslandColourSeparationConstraint"
    }));
  }
};

// src/model/puzzle/constraints/IslandDirectionalBridgeConstraint.ts
var IslandDirectionalBridgeConstraint = class _IslandDirectionalBridgeConstraint extends Constraint {
  conversationFile = "constraints/islandDirectionalBridge_unsatisfied.json";
  conversationFileSolved = "constraints/islandDirectionalBridge_satisfied.json";
  islandId;
  constraintType;
  constructor(islandId, constraintType) {
    super();
    this.islandId = islandId;
    this.constraintType = constraintType;
  }
  static fromSpec(params) {
    return new _IslandDirectionalBridgeConstraint(params.islandId, params.constraintType);
  }
  check(puzzle) {
    const island = puzzle.islands.find((i) => i.id === this.islandId);
    if (!island) {
      return {
        satisfied: false,
        affectedElements: [],
        message: `Island ${this.islandId} not found`
      };
    }
    const bridges = puzzle.bridgesFromIsland(island);
    const counts = this.countBridgesByDirection(island, bridges);
    let ok = false;
    let message;
    let glyphMessage;
    switch (this.constraintType) {
      case "double_horizontal":
        ok = counts.left === 2 || counts.right === 2 || counts.left === 1 && counts.right === 1;
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in same horizontal direction OR one left and one right (left: ${counts.left}, right: ${counts.right})`;
          glyphMessage = "not-enough horizontal bridge";
        }
        break;
      case "double_vertical":
        ok = counts.up === 2 || counts.down === 2 || counts.up === 1 && counts.down === 1;
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in same vertical direction OR one up and one down (up: ${counts.up}, down: ${counts.down})`;
          glyphMessage = "not-enough vertical bridge";
        }
        break;
      case "double_any_direction":
        ok = counts.left === 2 || counts.right === 2 || counts.up === 2 || counts.down === 2;
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in any single direction (left: ${counts.left}, right: ${counts.right}, up: ${counts.up}, down: ${counts.down})`;
          glyphMessage = "not-enough bridge";
        }
        break;
      case "no_double_any_direction":
        ok = counts.left !== 2 && counts.right !== 2 && counts.up !== 2 && counts.down !== 2;
        if (!ok) {
          message = `Island ${this.islandId} must NOT have 2 bridges in any single direction (left: ${counts.left}, right: ${counts.right}, up: ${counts.up}, down: ${counts.down})`;
          glyphMessage = "too-many bridge";
        }
        break;
      default:
        return {
          satisfied: false,
          affectedElements: [],
          message: `Unknown constraint type: ${this.constraintType}`
        };
    }
    this.violations = ok ? [] : [this.islandId];
    return {
      satisfied: ok,
      affectedElements: ok ? [] : [this.islandId, ...bridges.map((b) => b.id)],
      message,
      glyphMessage
    };
  }
  countBridgesByDirection(island, bridges) {
    const counts = { left: 0, right: 0, up: 0, down: 0 };
    for (const bridge of bridges) {
      if (!bridge.start || !bridge.end) continue;
      const isStart = bridge.start.x === island.x && bridge.start.y === island.y;
      const isEnd = bridge.end.x === island.x && bridge.end.y === island.y;
      if (!isStart && !isEnd) continue;
      const otherEnd = isStart ? bridge.end : bridge.start;
      if (otherEnd.x < island.x) {
        counts.left++;
      } else if (otherEnd.x > island.x) {
        counts.right++;
      } else if (otherEnd.y < island.y) {
        counts.up++;
      } else if (otherEnd.y > island.y) {
        counts.down++;
      }
    }
    return counts;
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: this.islandId,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "good",
      constraintType: "IslandDirectionalBridgeConstraint"
    }];
  }
};

// src/model/puzzle/constraints/IslandPassingBridgeCountConstraint.ts
var IslandPassingBridgeCountConstraint = class _IslandPassingBridgeCountConstraint extends Constraint {
  conversationFile = "constraints/islandPassingBridgeCount_unsatisfied.json";
  conversationFileSolved = "constraints/islandPassingBridgeCount_satisfied.json";
  islandId;
  direction;
  expectedCount;
  constructor(islandId, direction, expectedCount) {
    super();
    this.islandId = islandId;
    this.direction = direction;
    this.expectedCount = expectedCount;
  }
  static fromSpec(params) {
    return new _IslandPassingBridgeCountConstraint(params.islandId, params.direction, params.count);
  }
  check(puzzle) {
    const island = puzzle.islands.find((i) => i.id === this.islandId);
    if (!island) {
      return {
        satisfied: false,
        affectedElements: [],
        message: `Island ${this.islandId} not found`
      };
    }
    const passingBridges = this.findPassingBridges(puzzle, island);
    const actualCount = passingBridges.length;
    const ok = actualCount === this.expectedCount;
    this.violations = ok ? [] : [this.islandId];
    let glyphMessage;
    if (!ok) {
      const directionStr = this.direction === "adjacent" ? "" : ` ${this.direction}`;
      if (actualCount < this.expectedCount) {
        glyphMessage = `not-enough bridge${directionStr} island`;
      } else {
        glyphMessage = `too-many bridge${directionStr} island`;
      }
    }
    return {
      satisfied: ok,
      affectedElements: ok ? passingBridges.map((b) => b.id) : [this.islandId, ...passingBridges.map((b) => b.id)],
      message: ok ? void 0 : `Island ${this.islandId} requires ${this.expectedCount} bridges passing ${this.direction}, but has ${actualCount}`,
      glyphMessage
    };
  }
  findPassingBridges(puzzle, island) {
    const bridges = [];
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const connectedToIsland = bridge.start.x === island.x && bridge.start.y === island.y || bridge.end.x === island.x && bridge.end.y === island.y;
      if (connectedToIsland) continue;
      const passes = this.bridgePassesInDirection(
        bridge,
        island
      );
      if (passes) {
        bridges.push(bridge);
      }
    }
    return bridges;
  }
  bridgePassesInDirection(bridge, island) {
    const { start, end } = bridge;
    if (start.y === end.y) {
      const bridgeY = start.y;
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      if (island.x < minX || island.x > maxX) return false;
      switch (this.direction) {
        case "above":
          return bridgeY < island.y;
        // Any bridge above the island
        case "below":
          return bridgeY > island.y;
        // Any bridge below the island
        case "adjacent":
          return bridgeY === island.y - 1 || bridgeY === island.y + 1;
        // One cell away
        default:
          return false;
      }
    }
    if (start.x === end.x) {
      const bridgeX = start.x;
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (island.y < minY || island.y > maxY) return false;
      switch (this.direction) {
        case "left":
          return bridgeX < island.x;
        // Any bridge to the left of the island
        case "right":
          return bridgeX > island.x;
        // Any bridge to the right of the island
        case "adjacent":
          return bridgeX === island.x - 1 || bridgeX === island.x + 1;
        // One cell away
        default:
          return false;
      }
    }
    return false;
  }
  /** Maps direction to the glyph word used in speech bubble messages. */
  directionGlyphWord() {
    switch (this.direction) {
      case "above":
        return "above";
      case "below":
        return "below";
      case "left":
        return "left-of";
      case "right":
        return "right-of";
      case "adjacent":
        return "adjacent";
    }
  }
  /** Maps direction to the compass_overlay frame index (0=N, 1=E, 2=S, 3=W, 5=adjacent). */
  directionCompassFrame() {
    switch (this.direction) {
      case "above":
        return 0;
      case "right":
        return 1;
      case "below":
        return 2;
      case "left":
        return 3;
      case "adjacent":
        return 5;
    }
  }
  getCoreDisplayItems(puzzle) {
    const island = puzzle.islands.find((i) => i.id === this.islandId);
    if (!island) return [];
    const result = this.check(puzzle);
    const compassFrame = this.directionCompassFrame();
    const conversationVariables = { count: String(this.expectedCount), direction: this.directionGlyphWord() };
    if (result.satisfied) {
      return [{ elementID: this.islandId, glyphMessage: "good", constraintType: "IslandPassingBridgeCountConstraint", requiredCount: this.expectedCount, compassFrame, conversationVariables }];
    }
    const dirWord = this.directionGlyphWord();
    const passingBridges = this.findPassingBridges(puzzle, island);
    const actualCount = passingBridges.length;
    const prefix = actualCount < this.expectedCount ? "not-enough" : "too-many";
    const glyphMessage = `${prefix} bridge ${dirWord} island`;
    return [{ elementID: this.islandId, glyphMessage, constraintType: "IslandPassingBridgeCountConstraint", requiredCount: this.expectedCount, compassFrame, conversationVariables }];
  }
};

// src/model/puzzle/constraints/IslandVisibilityConstraint.ts
var IslandVisibilityConstraint = class _IslandVisibilityConstraint extends Constraint {
  conversationFile = "constraints/islandVisibility_unsatisfied.json";
  conversationFileSolved = "constraints/islandVisibility_satisfied.json";
  islandId;
  expectedCount;
  constructor(islandId, expectedCount) {
    super();
    this.islandId = islandId;
    this.expectedCount = expectedCount;
  }
  static fromSpec(params) {
    return new _IslandVisibilityConstraint(params.islandId, params.count);
  }
  check(puzzle) {
    const island = puzzle.islands.find((i) => i.id === this.islandId);
    if (!island) {
      return {
        satisfied: false,
        affectedElements: [],
        message: `Island ${this.islandId} not found`
      };
    }
    const visibleIslands = this.countVisibleIslands(puzzle, island);
    const actualCount = visibleIslands.size;
    const ok = actualCount === this.expectedCount;
    this.violations = ok ? [] : [this.islandId];
    let glyphMessage;
    if (!ok) {
      if (actualCount < this.expectedCount) {
        glyphMessage = "see not-enough island";
      } else {
        glyphMessage = "see too-many island";
      }
    }
    return {
      satisfied: ok,
      affectedElements: ok ? Array.from(visibleIslands) : [this.islandId, ...Array.from(visibleIslands)],
      message: ok ? void 0 : `Island ${this.islandId} requires ${this.expectedCount} visible islands, but has ${actualCount}`,
      glyphMessage
    };
  }
  countVisibleIslands(puzzle, sourceIsland) {
    const visibleIslands = /* @__PURE__ */ new Set();
    const directions = [
      { dx: 0, dy: -1, name: "up" },
      { dx: 0, dy: 1, name: "down" },
      { dx: -1, dy: 0, name: "left" },
      { dx: 1, dy: 0, name: "right" }
    ];
    for (const dir of directions) {
      const islandsInDirection = this.findVisibleIslandsInDirection(
        puzzle,
        sourceIsland,
        dir.dx,
        dir.dy
      );
      islandsInDirection.forEach((id) => visibleIslands.add(id));
    }
    return visibleIslands;
  }
  findVisibleIslandsInDirection(puzzle, sourceIsland, dx, dy) {
    const visible = /* @__PURE__ */ new Set();
    let currentX = sourceIsland.x;
    let currentY = sourceIsland.y;
    let previousIsland = sourceIsland;
    while (true) {
      currentX += dx;
      currentY += dy;
      if (currentX < 0 || currentX >= puzzle.width || currentY < 0 || currentY >= puzzle.height) {
        break;
      }
      const islandAtPosition = puzzle.islands.find((i) => i.x === currentX && i.y === currentY);
      if (!islandAtPosition) {
        continue;
      }
      const bridgeExists = this.hasBridgeBetween(puzzle, previousIsland, islandAtPosition);
      if (!bridgeExists) {
        break;
      }
      if (islandAtPosition.id !== sourceIsland.id) {
        visible.add(islandAtPosition.id);
      }
      previousIsland = islandAtPosition;
    }
    return visible;
  }
  hasBridgeBetween(puzzle, island1, island2) {
    return puzzle.placedBridges.some((bridge) => {
      if (!bridge.start || !bridge.end) return false;
      const connects1to2 = bridge.start.x === island1.x && bridge.start.y === island1.y && bridge.end.x === island2.x && bridge.end.y === island2.y;
      const connects2to1 = bridge.start.x === island2.x && bridge.start.y === island2.y && bridge.end.x === island1.x && bridge.end.y === island1.y;
      return connects1to2 || connects2to1;
    });
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: this.islandId,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "good",
      constraintType: "IslandVisibilityConstraint",
      requiredCount: this.expectedCount,
      conversationVariables: { count: String(this.expectedCount) }
    }];
  }
};

// src/model/puzzle/constraints/EnclosedAreaSizeConstraint.ts
var EnclosedAreaSizeConstraint = class _EnclosedAreaSizeConstraint extends Constraint {
  conversationFile;
  conversationFileSolved;
  x;
  y;
  expectedSize;
  constructor(x, y, expectedSize) {
    super();
    this.x = x;
    this.y = y;
    this.expectedSize = expectedSize;
    this.conversationFile = expectedSize === 0 ? "constraints/enclosedAreaSizeZero_unsatisfied.json" : "constraints/enclosedAreaSize_unsatisfied.json";
    this.conversationFileSolved = expectedSize === 0 ? "constraints/enclosedAreaSizeZero_satisfied.json" : "constraints/enclosedAreaSize_satisfied.json";
  }
  static fromSpec(params) {
    return new _EnclosedAreaSizeConstraint(params.x, params.y, params.size);
  }
  check(puzzle) {
    const isCovered = this.isCellCoveredByBridge(puzzle, this.x, this.y);
    if (this.expectedSize === 0) {
      if (isCovered) {
        return {
          satisfied: true,
          affectedElements: [],
          message: void 0
        };
      }
      const areaInfo2 = this.getEnclosedAreaSize(puzzle, this.x, this.y);
      const ok2 = !areaInfo2.isEnclosed;
      this.violations = ok2 ? [] : [`${this.x},${this.y}`];
      return {
        satisfied: ok2,
        affectedElements: ok2 ? [] : [`${this.x},${this.y}`],
        message: ok2 ? void 0 : `Cell (${this.x}, ${this.y}) with size=0 must be covered by a bridge or open to outside, but is in an enclosed area`,
        glyphMessage: ok2 ? void 0 : "area must-not enclosed"
      };
    }
    if (isCovered) {
      this.violations = [`${this.x},${this.y}`];
      return {
        satisfied: false,
        affectedElements: [`${this.x},${this.y}`],
        message: `Cell (${this.x}, ${this.y}) is covered by a bridge but should be in an enclosed area of size ${this.expectedSize}`,
        glyphMessage: "must-not bridge over me"
      };
    }
    const areaInfo = this.getEnclosedAreaSize(puzzle, this.x, this.y);
    const ok = areaInfo.isEnclosed && areaInfo.size === this.expectedSize;
    this.violations = ok ? [] : [`${this.x},${this.y}`];
    let glyphMessage;
    if (!ok) {
      if (!areaInfo.isEnclosed) {
        glyphMessage = "area not enclosed";
      } else if (areaInfo.size > this.expectedSize) {
        glyphMessage = "too-many enclosed area";
      } else {
        glyphMessage = "not-enough enclosed area";
      }
    }
    return {
      satisfied: ok,
      affectedElements: ok ? areaInfo.cells : [`${this.x},${this.y}`, ...areaInfo.cells],
      message: ok ? void 0 : areaInfo.isEnclosed ? `Cell (${this.x}, ${this.y}) is in an enclosed area of size ${areaInfo.size}, but requires size ${this.expectedSize}` : `Cell (${this.x}, ${this.y}) is not in a fully enclosed area (requires size ${this.expectedSize})`,
      glyphMessage
    };
  }
  isCellCoveredByBridge(puzzle, x, y) {
    return puzzle.placedBridges.some((bridge) => {
      if (!bridge.start || !bridge.end) return false;
      if (bridge.start.y === bridge.end.y && bridge.start.y === y) {
        const minX = Math.min(bridge.start.x, bridge.end.x);
        const maxX = Math.max(bridge.start.x, bridge.end.x);
        return x >= minX && x <= maxX;
      }
      if (bridge.start.x === bridge.end.x && bridge.start.x === x) {
        const minY = Math.min(bridge.start.y, bridge.end.y);
        const maxY = Math.max(bridge.start.y, bridge.end.y);
        return y >= minY && y <= maxY;
      }
      return false;
    });
  }
  /**
   * Create a matrix marking occupied cells (1 = bridge or island, 0 = empty)
   */
  createOccupancyMatrix(puzzle) {
    const matrix = [];
    for (let y = 0; y <= puzzle.height; y++) {
      matrix[y] = new Array(puzzle.width + 1).fill(0);
    }
    for (const island of puzzle.islands) {
      matrix[island.y][island.x] = 1;
    }
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const startX = bridge.start.x;
      const startY = bridge.start.y;
      const endX = bridge.end.x;
      const endY = bridge.end.y;
      if (startY === endY) {
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        for (let x = minX; x <= maxX; x++) {
          matrix[startY][x] = 1;
        }
      } else if (startX === endX) {
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        for (let y = minY; y <= maxY; y++) {
          matrix[y][startX] = 1;
        }
      }
    }
    return matrix;
  }
  isOutOfBounds(x, y, puzzle) {
    return x < 0 || x > puzzle.width || y < 0 || y > puzzle.height;
  }
  getEnclosedAreaSize(puzzle, startX, startY) {
    const matrix = this.createOccupancyMatrix(puzzle);
    const visited = /* @__PURE__ */ new Set();
    const queue = [{ x: startX, y: startY }];
    const cellKey = (x, y) => `${x},${y}`;
    visited.add(cellKey(startX, startY));
    let isEnclosed = true;
    const cells = [];
    while (queue.length > 0 && isEnclosed) {
      const { x, y } = queue.shift();
      cells.push(cellKey(x, y));
      if (this.isOutOfBounds(x, y, puzzle)) {
        isEnclosed = false;
        break;
      }
      const directions = [
        { dx: 0, dy: -1 },
        // up
        { dx: 0, dy: 1 },
        // down
        { dx: -1, dy: 0 },
        // left
        { dx: 1, dy: 0 }
        // right
      ];
      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = cellKey(nx, ny);
        if (visited.has(key)) continue;
        if (this.isOutOfBounds(nx, ny, puzzle)) {
          isEnclosed = false;
          continue;
        }
        if (matrix[ny][nx] === 1) {
          continue;
        }
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    return { size: cells.length, isEnclosed, cells };
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: `${this.x},${this.y}`,
      glyphMessage: result.satisfied ? "good" : result.glyphMessage ?? "area not enclosed",
      constraintType: "EnclosedAreaSizeConstraint",
      position: { x: this.x, y: this.y },
      requiredCount: this.expectedSize >= 0 ? this.expectedSize : void 0,
      conversationVariables: this.expectedSize >= 0 ? { count: String(this.expectedSize) } : void 0
    }];
  }
};

// src/model/puzzle/constraints/BridgeMustCoverIslandConstraint.ts
var BridgeMustCoverIslandConstraint = class _BridgeMustCoverIslandConstraint extends Constraint {
  bridgeID;
  constructor(bridgeID) {
    super();
    this.bridgeID = bridgeID;
  }
  static fromSpec(_params) {
    return new _BridgeMustCoverIslandConstraint();
  }
  check(puzzle) {
    const violations = [];
    const bridgesToCheck = this.bridgeID ? puzzle.placedBridges.filter((b) => b.id === this.bridgeID) : puzzle.placedBridges.filter((b) => b.type.mustCoverIsland);
    for (const bridge of bridgesToCheck) {
      if (!bridge.start || !bridge.end) continue;
      const coversIsland = this.bridgeCoversAnyIsland(puzzle, bridge);
      if (!coversIsland) {
        violations.push(bridge.id);
      }
    }
    const ok = violations.length === 0;
    this.violations = violations;
    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? void 0 : `Bridge${violations.length === 1 ? "" : "s"} must cover island${violations.length === 1 ? "" : "s"}: ${violations.join(", ")}`,
      glyphMessage: ok ? void 0 : "no island under bridge"
    };
  }
  getCoreDisplayItems(puzzle) {
    if (!this.bridgeID) return [];
    const bridge = puzzle.bridges.find((b) => b.id === this.bridgeID);
    if (!bridge || !bridge.start || !bridge.end) return [];
    if (!(bridge instanceof StrutBridge)) return [];
    const strutLocation = bridge.getStrutLocation(puzzle);
    if (!strutLocation) return [];
    const coversIsland = this.bridgeCoversAnyIsland(puzzle, bridge);
    const glyphMessage = coversIsland ? "good" : "no island under bridge";
    return [{
      elementID: bridge.id,
      glyphMessage,
      constraintType: "BridgeMustCoverIslandConstraint",
      position: strutLocation
    }];
  }
  bridgeCoversAnyIsland(puzzle, bridge) {
    const { start, end } = bridge;
    for (const island of puzzle.islands) {
      if (start.y === end.y && start.y === island.y) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        if (island.x > minX && island.x < maxX) {
          return true;
        }
      }
      if (start.x === end.x && start.x === island.x) {
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        if (island.y > minY && island.y < maxY) {
          return true;
        }
      }
    }
    return false;
  }
};

// src/model/puzzle/constraints/MustHaveWaterConstraint.ts
function hasTileHasWater(puzzle) {
  return typeof puzzle.tileHasWater === "function";
}
var MustHaveWaterConstraint = class _MustHaveWaterConstraint extends Constraint {
  conversationFile = "constraints/mustHaveWater_unsatisfied.json";
  conversationFileSolved = "constraints/mustHaveWater_satisfied.json";
  x;
  y;
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
  }
  static fromSpec(params) {
    return new _MustHaveWaterConstraint(params.x, params.y);
  }
  check(puzzle) {
    const has = hasTileHasWater(puzzle) ? puzzle.tileHasWater(this.x, this.y) : false;
    this.violations = has ? [] : [`${this.x},${this.y}`];
    return {
      satisfied: has,
      affectedElements: this.violations ?? [],
      message: has ? void 0 : `Tile (${this.x},${this.y}) must have water.`,
      glyphMessage: has ? void 0 : "no water"
    };
  }
  getCoreDisplayItems(puzzle) {
    const result = this.check(puzzle);
    return [{
      elementID: `${this.x},${this.y}`,
      glyphMessage: result.satisfied ? "good" : "no water",
      constraintType: "MustHaveWaterConstraint",
      position: { x: this.x, y: this.y }
    }];
  }
};

// src/model/puzzle/constraints/IslandBridgeCountConstraint.ts
var IslandBridgeCountConstraint = class _IslandBridgeCountConstraint extends Constraint {
  conversationFile = "constraints/islandBridgeCount_unsatisfied.json";
  conversationFileSolved = "constraints/islandBridgeCount_satisfied.json";
  static fromSpec(_params) {
    return new _IslandBridgeCountConstraint();
  }
  check(puzzle) {
    const violations = [];
    const violationGlyphs = [];
    for (const island of puzzle.islands) {
      const rule = island.constraints?.find((c) => c.startsWith("num_bridges="));
      if (!rule) continue;
      const expected = Number(rule.split("=")[1]);
      const actual = puzzle.bridgesFromIsland(island).length;
      if (actual !== expected) {
        violations.push(island.id);
        if (actual < expected) {
          violationGlyphs.push("not-enough bridge");
        } else {
          violationGlyphs.push("too-many bridge");
        }
      }
    }
    const glyphMessage = violationGlyphs.length > 0 ? violationGlyphs[0] : void 0;
    return {
      satisfied: violations.length === 0,
      affectedElements: violations,
      message: violations.length ? `Incorrect bridge count: ${violations.join(", ")}` : void 0,
      glyphMessage
    };
  }
  getCoreDisplayItems(puzzle) {
    const items = [];
    for (const island of puzzle.islands) {
      const rule = island.constraints?.find((c) => c.startsWith("num_bridges="));
      if (!rule) continue;
      const expected = Number(rule.split("=")[1]);
      const actual = puzzle.bridgesFromIsland(island).length;
      let glyphMessage;
      if (actual === expected) {
        glyphMessage = "good";
      } else if (actual < expected) {
        glyphMessage = "not-enough bridge";
      } else {
        glyphMessage = "too-many bridge";
      }
      items.push({
        elementID: island.id,
        glyphMessage,
        constraintType: "IslandBridgeCountConstraint",
        requiredCount: expected,
        conversationVariables: { count: String(expected) }
      });
    }
    return items;
  }
};

// src/model/puzzle/constraints/createConstraintsFromSpec.ts
function createConstraintsFromSpec(constraints) {
  return constraints.map((spec) => {
    switch (spec.type) {
      case "AllBridgesPlacedConstraint":
        return AllBridgesPlacedConstraint.fromSpec(spec.params);
      case "NoCrossingConstraint":
        return NoCrossingConstraint.fromSpec(spec.params);
      case "MustTouchAHorizontalBridge":
        return MustTouchAHorizontalBridge.fromSpec(spec.params);
      case "MustTouchAVerticalBridge":
        return MustTouchAVerticalBridge.fromSpec(spec.params);
      case "IslandMustBeCoveredConstraint":
        return IslandMustBeCoveredConstraint.fromSpec(spec.params);
      case "IslandColourSeparationConstraint":
        return IslandColourSeparationConstraint.fromSpec(spec.params);
      case "IslandDirectionalBridgeConstraint":
        return IslandDirectionalBridgeConstraint.fromSpec(spec.params);
      case "IslandPassingBridgeCountConstraint":
        return IslandPassingBridgeCountConstraint.fromSpec(spec.params);
      case "IslandVisibilityConstraint":
        return IslandVisibilityConstraint.fromSpec(spec.params);
      case "EnclosedAreaSizeConstraint":
        return EnclosedAreaSizeConstraint.fromSpec(spec.params);
      case "BridgeMustCoverIslandConstraint":
        return BridgeMustCoverIslandConstraint.fromSpec(spec.params);
      case "MustHaveWaterConstraint":
        return MustHaveWaterConstraint.fromSpec(spec.params);
      case "IslandBridgeCountConstraint":
        return IslandBridgeCountConstraint.fromSpec(spec.params);
      // Add more cases as needed for other constraint types.
      default:
        throw new Error(`Unknown constraint type: ${spec.type}`);
    }
  });
}

// src/model/puzzle/constraints/BridgeLengthConstraint.ts
var BridgeLengthConstraint = class _BridgeLengthConstraint extends Constraint {
  personified = false;
  typeId;
  expectedLength;
  constructor(typeId, expectedLength) {
    super();
    this.typeId = typeId;
    this.expectedLength = expectedLength;
  }
  static fromSpec(spec) {
    return new _BridgeLengthConstraint(spec.typeId, spec.length);
  }
  check(puzzle) {
    const violations = [];
    const bridges = puzzle.bridges.filter((bridge) => bridge.type.id === this.typeId);
    for (const bridge of bridges) {
      if (!bridge.start || !bridge.end) {
        continue;
      }
      const dx = bridge.end.x - bridge.start.x;
      const dy = bridge.end.y - bridge.start.y;
      const actualLength = Math.sqrt(dx * dx + dy * dy);
      const tolerance = 0.01;
      if (Math.abs(actualLength - this.expectedLength) > tolerance) {
        violations.push(bridge.id);
      }
    }
    return {
      satisfied: violations.length === 0,
      affectedElements: violations,
      message: violations.length ? `Bridge length mismatch for type ${this.typeId}: ${violations.join(", ")}` : void 0
    };
  }
};

// src/model/puzzle/BridgeType.ts
function createBridgeType(params) {
  const id = params.id ?? "default";
  const length = params.length ?? -1;
  const colour = params.colour ?? "black";
  const width = params.width ?? 1;
  const style = params.style ?? "normal";
  const canCoverIsland = params.canCoverIsland ?? false;
  const mustCoverIsland = params.mustCoverIsland ?? false;
  return {
    id,
    length,
    colour,
    width,
    style,
    canCoverIsland,
    mustCoverIsland,
    hasLength: () => length !== -1,
    allowsSpan: (start, end) => {
      if (length === -1) return true;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return Math.abs(dist - length) <= 0.01;
    }
  };
}

// src/model/puzzle/BridgePuzzle.ts
var BridgePuzzle = class {
  id;
  width;
  height;
  islands;
  constraints;
  inventory;
  maxNumBridges;
  givesFeedback;
  constructor(spec) {
    this.id = spec.id;
    this.width = spec.size.width;
    this.height = spec.size.height;
    this.islands = spec.islands;
    this.constraints = createConstraintsFromSpec(spec.constraints);
    this.givesFeedback = spec.givesFeedback ?? true;
    const bridgeTypes = spec.bridgeTypes.map(
      (spec2) => ({
        ...createBridgeType({
          id: spec2.id,
          colour: spec2.colour,
          length: spec2.length,
          width: spec2.width,
          style: spec2.style,
          mustCoverIsland: spec2.mustCoverIsland
        }),
        count: spec2.count ?? 1
      })
    );
    this.inventory = new BridgeInventory(bridgeTypes);
    if (spec.maxNumBridges !== void 0) {
      this.maxNumBridges = spec.maxNumBridges;
    } else {
      this.maxNumBridges = 2;
    }
    const hasSpecConstraints = Array.isArray(spec.constraints) && spec.constraints.length > 0;
    if (!hasSpecConstraints) {
      for (const bt of bridgeTypes) {
        const len = bt.length === void 0 ? -1 : bt.length ?? -1;
        if (len !== -1) {
          this.constraints.push(BridgeLengthConstraint.fromSpec({ typeId: bt.id, length: len }));
        }
      }
    }
    for (const bridge of this.inventory.bridges) {
      if (bridge instanceof StrutBridge) {
        this.constraints.push(new BridgeMustCoverIslandConstraint(bridge.id));
      }
    }
  }
  /** Get all bridges (placed or unplaced) */
  get bridges() {
    return this.inventory.bridges;
  }
  /** Get all placed bridges */
  get placedBridges() {
    return this.inventory.bridges.filter((b) => b.start && b.end);
  }
  placeBridge(bridgeID, start, end) {
    const bridge = this.inventory.bridges.find((b) => b.id === bridgeID);
    if (!bridge) throw new Error(`No such bridge ${bridgeID}`);
    bridge.start = start;
    bridge.end = end;
    return true;
  }
  removeBridge(bridgeID) {
    const bridge = this.inventory.bridges.find((b) => b.id === bridgeID);
    if (!bridge) throw new Error(`No such bridge ${bridgeID}`);
    delete bridge.start;
    delete bridge.end;
    this.inventory.returnBridge(bridgeID);
  }
  allBridgesPlaced() {
    return this.inventory.bridges.every((b) => b.start && b.end);
  }
  bridgesFromIsland(island) {
    return this.placedBridges.filter((b) => {
      const startMatches = b.start?.x === island.x && b.start?.y === island.y;
      const endMatches = b.end?.x === island.x && b.end?.y === island.y;
      return startMatches || endMatches;
    });
  }
  /**
   * Count placed bridges between two islands (counts both directions)
   */
  getBridgeCountBetween(startIslandId, endIslandId) {
    const startIsland = this.islands.find((i) => i.id === startIslandId);
    const endIsland = this.islands.find((i) => i.id === endIslandId);
    if (!startIsland || !endIsland) return 0;
    let count = 0;
    for (const b of this.placedBridges) {
      if (!b.start || !b.end) continue;
      const sMatchesStart = b.start.x === startIsland.x && b.start.y === startIsland.y && b.end.x === endIsland.x && b.end.y === endIsland.y;
      const sMatchesEnd = b.start.x === endIsland.x && b.start.y === endIsland.y && b.end.x === startIsland.x && b.end.y === startIsland.y;
      if (sMatchesStart || sMatchesEnd) count++;
    }
    return count;
  }
  /**
   * Return whether a bridge could be placed between two islands according to
   * the puzzle's current rules (encapsulated here so criteria can change later).
   */
  couldPlaceBridgeAt(startIslandId, endIslandId) {
    return this.couldPlaceBridgeOfType(startIslandId, endIslandId, void 0);
  }
  /**
   * Returns whether a bridge of the given type can be placed between two islands.
   * If typeId is undefined, this performs only max-bridges and existence checks.
   */
  couldPlaceBridgeOfType(startIslandId, endIslandId, typeId) {
    if (startIslandId === endIslandId) return false;
    const startIsland = this.islands.find((i) => i.id === startIslandId);
    const endIsland = this.islands.find((i) => i.id === endIslandId);
    if (!startIsland || !endIsland) return false;
    const existing = this.getBridgeCountBetween(startIslandId, endIslandId);
    if (existing >= this.maxNumBridges) return false;
    if (!typeId) return true;
    const bt = this.inventory.bridgeTypes.find((b) => b.id === typeId);
    if (!bt) return true;
    if (!bt.canCoverIsland && !bt.mustCoverIsland) {
      if (this.bridgeWouldCrossIslands(startIsland, endIsland)) {
        return false;
      }
    }
    if (bt.allowsSpan) {
      return bt.allowsSpan({ x: startIsland.x, y: startIsland.y }, { x: endIsland.x, y: endIsland.y });
    }
    const len = bt.length === void 0 ? -1 : bt.length ?? -1;
    if (len === -1) return true;
    const dx = endIsland.x - startIsland.x;
    const dy = endIsland.y - startIsland.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.abs(dist - len) <= 0.01;
  }
  /**
   * Check if a bridge between two islands would cross over any other islands.
   * Returns true if any island lies strictly between the start and end islands.
   */
  bridgeWouldCrossIslands(startIsland, endIsland) {
    for (const island of this.islands) {
      if (island.id === startIsland.id || island.id === endIsland.id) continue;
      if (startIsland.y === endIsland.y && startIsland.y === island.y) {
        const minX = Math.min(startIsland.x, endIsland.x);
        const maxX = Math.max(startIsland.x, endIsland.x);
        if (island.x > minX && island.x < maxX) {
          return true;
        }
      }
      if (startIsland.x === endIsland.x && startIsland.x === island.x) {
        const minY = Math.min(startIsland.y, endIsland.y);
        const maxY = Math.max(startIsland.y, endIsland.y);
        if (island.y > minY && island.y < maxY) {
          return true;
        }
      }
    }
    return false;
  }
  takeBridgeOfType(typeId) {
    return this.inventory.takeBridge(typeId);
  }
  getAvailableBridgeTypes() {
    console.log("getAvailableBridgeTypes", this.inventory.bridgeTypes);
    return this.inventory.bridgeTypes;
  }
  availableCounts() {
    return this.inventory.countsByType();
  }
  /**
   * Returns all bridges where (x, y) is the same proportion between start and end for both coordinates.
   */
  bridgesAt(x, y) {
    const foundBridges = [];
    for (const bridge of this.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const { start, end } = bridge;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx === 0 && dy === 0) continue;
      let px = void 0;
      let py = void 0;
      if (dx !== 0) px = (x - start.x) / dx;
      if (dy !== 0) py = (y - start.y) / dy;
      if (dx !== 0 && dy !== 0 && px !== void 0 && py !== void 0 && px === py && px >= 0 && px <= 1) {
        foundBridges.push(bridge);
      } else if (dx === 0 && dy !== 0 && x === start.x && py !== void 0 && py >= 0 && py <= 1) {
        foundBridges.push(bridge);
      } else if (dy === 0 && dx !== 0 && y === start.y && px !== void 0 && px >= 0 && px <= 1) {
        foundBridges.push(bridge);
      }
    }
    return foundBridges;
  }
  /**
   * Parse a Tiled "bridges" property string into BridgeTypeSpecs.
   *
   * Each entry is a length optionally followed by '+' to denote a StrutBridge
   * (e.g. "3,2,3+,4+"). Duplicate lengths are counted and collapsed into a
   * single spec with the appropriate count.  StrutBridge entries receive
   * `mustCoverIsland: true` and use an id prefixed with "strut_".
   *
   * @param bridges - Comma-separated bridge entries, e.g. "3,2,3+,4+"
   * @param colour  - Colour to apply to all created bridge types
   */
  static parseBridgesString(bridges, colour = "#8B4513") {
    const normalCounts = /* @__PURE__ */ new Map();
    const strutCounts = /* @__PURE__ */ new Map();
    for (const raw of bridges.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      if (part.endsWith("+")) {
        const len = parseInt(part.slice(0, -1), 10);
        if (!Number.isFinite(len)) continue;
        strutCounts.set(len, (strutCounts.get(len) ?? 0) + 1);
      } else {
        const len = parseInt(part, 10);
        if (!Number.isFinite(len)) continue;
        normalCounts.set(len, (normalCounts.get(len) ?? 0) + 1);
      }
    }
    const result = [];
    for (const [length, count] of normalCounts) {
      result.push({ id: `fixed_${length}`, colour, length, count, width: 1, style: "wooden" });
    }
    for (const [length, count] of strutCounts) {
      result.push({
        id: `strut_${length}`,
        colour,
        length,
        count,
        width: 1,
        style: "wooden",
        mustCoverIsland: true
      });
    }
    return result;
  }
};

// src/model/puzzle/PuzzleValidator.ts
var PuzzleValidator = class {
  puzzle;
  constructor(puzzle) {
    this.puzzle = puzzle;
  }
  /**
  * Run every constraint attached to the puzzle and return the aggregated result.
  * This does not mutate the puzzle.
  */
  validateAll() {
    const perConstraint = [];
    const constraints = this.puzzle.constraints ?? [];
    for (const c of constraints) {
      const result2 = c.check(this.puzzle);
      perConstraint.push({
        constraintId: c.id,
        type: c.constructor?.name,
        result: result2
      });
    }
    const unsatisfiedCount = perConstraint.reduce(
      (acc, item) => acc + (item.result.satisfied ? 0 : 1),
      0
    );
    const result = {
      allSatisfied: unsatisfiedCount === 0,
      perConstraint,
      unsatisfiedCount
    };
    try {
      console.log("[PuzzleValidator] validateAll results:", result.perConstraint.map((p) => ({ type: p.type, ok: p.result.satisfied, msg: p.result.message })));
    } catch (e) {
    }
    return result;
  }
  /**
   * Convenience method: are all constraints satisfied right now?
   */
  isSolved() {
    return this.validateAll().allSatisfied;
  }
  /**
   * Collects display items from all constraints that provide them.
   * Each item describes what glyph to show in the speech bubble next to a
   * constrained element when all bridges are placed.
   */
  getConstraintDisplayItems() {
    return this.puzzle.constraints.flatMap((c) => c.getDisplayItems(this.puzzle));
  }
};

// editor/editor.ts
var CONSTRAINT_TYPES = [
  {
    type: "AllBridgesPlacedConstraint",
    name: "All Bridges Placed",
    description: "All bridges from inventory must be placed",
    params: []
  },
  {
    type: "NoCrossingConstraint",
    name: "No Crossing",
    description: "Bridges must not cross each other",
    params: []
  },
  {
    type: "MustTouchAHorizontalBridge",
    name: "Must Touch Horizontal Bridge",
    description: "Cell must be adjacent to a horizontal bridge",
    params: [
      { name: "x", type: "number", isCoord: true },
      { name: "y", type: "number", isCoord: true }
    ],
    needsCell: true
  },
  {
    type: "MustTouchAVerticalBridge",
    name: "Must Touch Vertical Bridge",
    description: "Cell must be adjacent to a vertical bridge",
    params: [
      { name: "x", type: "number", isCoord: true },
      { name: "y", type: "number", isCoord: true }
    ],
    needsCell: true
  },
  {
    type: "MustHaveWaterConstraint",
    name: "Must Have Water",
    description: "A specific cell must contain water",
    params: [
      { name: "x", type: "number", isCoord: true },
      { name: "y", type: "number", isCoord: true }
    ],
    needsCell: true
  },
  {
    type: "IslandMustBeCoveredConstraint",
    name: "Island Must Be Covered",
    description: "Specified island must be covered by at least one bridge",
    params: [{ name: "islandId", type: "string" }]
  },
  {
    type: "IslandColourSeparationConstraint",
    name: "Island Colour Separation",
    description: "Islands of different colours must be separated by bridge colours",
    params: [{ name: "colour1", type: "string" }, { name: "colour2", type: "string" }]
  },
  {
    type: "IslandDirectionalBridgeConstraint",
    name: "Island Directional Bridge",
    description: "Island must have bridges in a specific direction pattern",
    params: [
      { name: "islandId", type: "string" },
      {
        name: "constraintType",
        type: "string",
        hint: "double_horizontal | double_vertical | double_any_direction | no_double_any_direction"
      }
    ]
  },
  {
    type: "IslandPassingBridgeCountConstraint",
    name: "Island Passing Bridge Count",
    description: "Number of bridges passing by an island in a given direction",
    params: [
      { name: "islandId", type: "string" },
      { name: "direction", type: "string", hint: "above | below | left | right | adjacent" },
      { name: "count", type: "number" }
    ]
  },
  {
    type: "IslandVisibilityConstraint",
    name: "Island Visibility",
    description: "Precise count of islands visible from a specific island",
    params: [
      { name: "islandId", type: "string" },
      { name: "count", type: "number" }
    ]
  },
  {
    type: "EnclosedAreaSizeConstraint",
    name: "Enclosed Area Size",
    description: "Size of enclosed area at a grid cell (0 = open or covered)",
    params: [
      { name: "x", type: "number", isCoord: true },
      { name: "y", type: "number", isCoord: true },
      { name: "size", type: "number" }
    ],
    needsCell: true
  },
  {
    type: "BridgeMustCoverIslandConstraint",
    name: "Bridge Must Cover Island",
    description: "A specific bridge must cover an island",
    params: [{ name: "islandId", type: "string" }],
    note: "Applied to individual bridge types"
  },
  {
    type: "IslandBridgeCountConstraint",
    name: "Island Bridge Count",
    description: "Number of bridges required at an island",
    params: [
      { name: "islandId", type: "string" },
      { name: "count", type: "number" }
    ]
  }
];
function getConstraintGridItems(constraints, islands) {
  const items = [];
  for (const c of constraints) {
    const p = c.params;
    switch (c.type) {
      case "MustTouchAHorizontalBridge":
        if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: "TH" });
        break;
      case "MustTouchAVerticalBridge":
        if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: "TV" });
        break;
      case "MustHaveWaterConstraint":
        if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: "W" });
        break;
      case "EnclosedAreaSizeConstraint":
        if (p?.x != null && p?.y != null) {
          items.push({ x: p.x, y: p.y, label: `A=${p.size ?? "?"}` });
        }
        break;
      case "IslandMustBeCoveredConstraint": {
        const island = islands.find((i) => i.id === p?.islandId);
        if (island) items.push({ x: island.x, y: island.y, label: "COV" });
        break;
      }
      case "IslandDirectionalBridgeConstraint": {
        const island = islands.find((i) => i.id === p?.islandId);
        if (island) {
          const labelMap = {
            double_horizontal: "DH",
            double_vertical: "DV",
            double_any_direction: "D",
            no_double_any_direction: "DX"
          };
          const label = labelMap[p?.constraintType ?? ""] ?? "D?";
          items.push({ x: island.x, y: island.y, label });
        }
        break;
      }
      case "IslandPassingBridgeCountConstraint": {
        const island = islands.find((i) => i.id === p?.islandId);
        if (island) {
          const dirMap = {
            above: "PU",
            below: "PD",
            left: "PL",
            right: "PR",
            adjacent: "P"
          };
          const prefix = dirMap[p?.direction ?? ""] ?? "P";
          items.push({ x: island.x, y: island.y, label: `${prefix}=${p?.count ?? "?"}` });
        }
        break;
      }
      case "IslandVisibilityConstraint": {
        const island = islands.find((i) => i.id === p?.islandId);
        if (island) items.push({ x: island.x, y: island.y, label: `V=${p?.count ?? "?"}` });
        break;
      }
      case "IslandBridgeCountConstraint": {
        const island = islands.find((i) => i.id === p?.islandId);
        if (island && p?.count != null) {
          items.push({ x: island.x, y: island.y, label: `B=${p.count}` });
        }
        break;
      }
    }
  }
  for (const island of islands) {
    const rule = island.constraints?.find((c) => c.startsWith("num_bridges="));
    if (rule) {
      const n = rule.split("=")[1];
      const alreadyAdded = items.some((i) => i.x === island.x && i.y === island.y && i.label.startsWith("B="));
      if (!alreadyAdded) {
        items.push({ x: island.x, y: island.y, label: `B=${n}` });
      }
    }
  }
  return items;
}
var PuzzleEditor = class {
  canvas;
  ctx;
  puzzle;
  cellSize = 60;
  tool = "island";
  selectedBridgeTypeId = null;
  testBridges = [];
  bridgePlacementStart = null;
  nextIslandId = 0;
  // Constraint form state
  constraintFormVisible = false;
  constraintFormNeedsCell = false;
  selectedConstraintType = null;
  constructor() {
    this.canvas = document.getElementById("gridCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.puzzle = {
      id: "new_puzzle",
      type: "standard",
      size: { width: 4, height: 4 },
      islands: [],
      bridgeTypes: [],
      constraints: [],
      maxNumBridges: 10
    };
    this.setupEventListeners();
    this.renderConstraintTypeList();
    this.updateCanvasSize();
    this.renderAll();
  }
  setupEventListeners() {
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
    document.getElementById("addIslandBtn")?.addEventListener("click", () => {
      this.tool = "island";
      this.updateToolButtons();
    });
    document.getElementById("removeIslandBtn")?.addEventListener("click", () => {
      this.tool = "remove";
      this.updateToolButtons();
    });
    document.getElementById("addBridgeBtn")?.addEventListener("click", () => {
      this.tool = "bridge";
      this.updateToolButtons();
    });
    document.getElementById("puzzleId")?.addEventListener("change", (e) => {
      this.puzzle.id = e.target.value;
    });
    document.getElementById("resizeGrid")?.addEventListener("click", () => {
      const width = parseInt(document.getElementById("gridWidth").value);
      const height = parseInt(document.getElementById("gridHeight").value);
      if (!isNaN(width) && !isNaN(height)) {
        this.puzzle.size = { width, height };
        this.updateCanvasSize();
        this.renderAll();
      }
    });
    document.getElementById("saveBtn")?.addEventListener("click", () => this.savePuzzle());
    document.getElementById("loadBtn")?.addEventListener("click", () => this.loadPuzzle());
    document.getElementById("exportBtn")?.addEventListener("click", () => this.exportJSON());
    document.getElementById("newBtn")?.addEventListener("click", () => this.newPuzzle());
    document.getElementById("addBridgeType")?.addEventListener("click", () => this.addBridgeType());
    document.getElementById("validateBtn")?.addEventListener("click", () => this.validateSolution());
    document.getElementById("clearTestBtn")?.addEventListener("click", () => {
      this.testBridges = [];
      this.bridgePlacementStart = null;
      document.getElementById("validationResults").innerHTML = "";
      this.renderAll();
    });
    document.getElementById("showConstraintListBtn")?.addEventListener("click", () => {
      this.toggleConstraintTypePanel();
    });
    document.getElementById("editConstraintsBtn")?.addEventListener("click", () => {
      this.togglePuzzleConstraintsPanel();
    });
    document.getElementById("cancelConstraintTypeBtn")?.addEventListener("click", () => {
      this.hideConstraintTypePanel();
    });
    document.getElementById("cancelConstraintFormBtn")?.addEventListener("click", () => {
      this.hideConstraintForm();
    });
    document.getElementById("confirmAddConstraintBtn")?.addEventListener("click", () => {
      this.addConstraintFromForm();
    });
  }
  toggleConstraintTypePanel() {
    const sidebar = document.getElementById("constraintTypeSidebar");
    const panel = document.getElementById("constraintTypePanel");
    if (sidebar.style.display !== "none" && panel.style.display !== "none") {
      this.hideConstraintTypePanel();
    } else {
      this.hideConstraintForm();
      sidebar.style.display = "block";
      panel.style.display = "block";
    }
  }
  hideConstraintTypePanel() {
    document.getElementById("constraintTypePanel").style.display = "none";
    document.getElementById("constraintTypeSidebar").style.display = "none";
  }
  togglePuzzleConstraintsPanel() {
    const panel = document.getElementById("puzzleConstraintsPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    if (panel.style.display === "block") {
      this.renderPuzzleConstraints();
    }
  }
  showConstraintForm(ctDef) {
    this.selectedConstraintType = ctDef;
    this.constraintFormVisible = true;
    this.constraintFormNeedsCell = ctDef.needsCell === true;
    const title = document.getElementById("constraintFormTitle");
    const fields = document.getElementById("constraintFormFields");
    title.textContent = ctDef.name;
    let html = "";
    if (ctDef.needsCell) {
      html += `<p class="cell-hint">Click a grid cell to set position, or type coordinates below.</p>`;
    }
    if (ctDef.note) {
      html += `<p class="constraint-note">${ctDef.note}</p>`;
    }
    for (const param of ctDef.params ?? []) {
      const hintHtml = param.hint ? ` <small>${param.hint}</small>` : "";
      html += `<div class="param-group">
                <label for="param_${param.name}">${param.name}:${hintHtml}</label>
                <input type="${param.type === "number" ? "number" : "text"}"
                       id="param_${param.name}"
                       placeholder="${param.name}">
            </div>`;
    }
    fields.innerHTML = html;
    document.getElementById("constraintFormPanel").style.display = "block";
  }
  hideConstraintForm() {
    this.constraintFormVisible = false;
    this.constraintFormNeedsCell = false;
    this.selectedConstraintType = null;
    document.getElementById("constraintFormPanel").style.display = "none";
  }
  addConstraintFromForm() {
    const ctDef = this.selectedConstraintType;
    if (!ctDef) return;
    const params = {};
    for (const param of ctDef.params ?? []) {
      const input = document.getElementById(`param_${param.name}`);
      if (!input || !input.value.trim()) {
        alert(`Please enter a value for "${param.name}"`);
        return;
      }
      if (param.type === "number") {
        const n = parseInt(input.value, 10);
        if (isNaN(n)) {
          alert(`"${param.name}" must be a valid integer`);
          return;
        }
        params[param.name] = n;
      } else {
        params[param.name] = input.value.trim();
      }
    }
    this.puzzle.constraints.push({
      type: ctDef.type,
      params: Object.keys(params).length > 0 ? params : void 0
    });
    this.hideConstraintForm();
    this.renderAll();
    const panel = document.getElementById("puzzleConstraintsPanel");
    if (panel.style.display !== "none") {
      this.renderPuzzleConstraints();
    }
  }
  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridX = Math.floor(x / this.cellSize) + 1;
    const gridY = Math.floor(y / this.cellSize) + 1;
    if (gridX < 1 || gridX > this.puzzle.size.width || gridY < 1 || gridY > this.puzzle.size.height) {
      return;
    }
    if (this.constraintFormVisible && this.constraintFormNeedsCell) {
      const xInput = document.getElementById("param_x");
      const yInput = document.getElementById("param_y");
      if (xInput) xInput.value = String(gridX);
      if (yInput) yInput.value = String(gridY);
      return;
    }
    if (this.tool === "island") {
      this.addIsland(gridX, gridY);
    } else if (this.tool === "remove") {
      this.removeIsland(gridX, gridY);
    } else if (this.tool === "bridge") {
      this.handleBridgePlacement(gridX, gridY);
    }
  }
  handleBridgePlacement(gridX, gridY) {
    if (!this.selectedBridgeTypeId) {
      alert("Please select a bridge type first from the Bridge Types panel below");
      return;
    }
    if (!this.bridgePlacementStart) {
      this.bridgePlacementStart = { x: gridX, y: gridY };
      this.renderAll();
    } else {
      const start = this.bridgePlacementStart;
      const end = { x: gridX, y: gridY };
      if (start.x !== end.x && start.y !== end.y) {
        alert("Bridges must be horizontal or vertical");
        this.bridgePlacementStart = null;
        this.renderAll();
        return;
      }
      if (start.x === end.x && start.y === end.y) {
        this.bridgePlacementStart = null;
        this.renderAll();
        return;
      }
      this.testBridges.push({ start, end, bridgeTypeId: this.selectedBridgeTypeId });
      this.bridgePlacementStart = null;
      this.renderAll();
    }
  }
  addIsland(x, y) {
    if (this.puzzle.islands.find((i) => i.x === x && i.y === y)) return;
    const id = this.generateIslandId();
    this.puzzle.islands.push({ id, x, y });
    this.renderAll();
  }
  removeIsland(x, y) {
    const index = this.puzzle.islands.findIndex((i) => i.x === x && i.y === y);
    if (index >= 0) {
      this.puzzle.islands.splice(index, 1);
      this.renderAll();
    }
  }
  generateIslandId() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letters[this.nextIslandId++ % 26];
  }
  addBridgeType() {
    const id = `bridge_${this.puzzle.bridgeTypes.length + 1}`;
    this.puzzle.bridgeTypes.push({ id, colour: "black", length: 1, count: 1 });
    this.renderAll();
  }
  removeBridgeType(id) {
    const index = this.puzzle.bridgeTypes.findIndex((b) => b.id === id);
    if (index >= 0) {
      this.puzzle.bridgeTypes.splice(index, 1);
      this.renderAll();
    }
  }
  updateBridgeType(id, field, value) {
    const bridge = this.puzzle.bridgeTypes.find((b) => b.id === id);
    if (bridge) bridge[field] = value;
  }
  removeConstraint(index) {
    this.puzzle.constraints.splice(index, 1);
    this.renderAll();
    this.renderPuzzleConstraints();
  }
  savePuzzle() {
    try {
      localStorage.setItem("archipelago_puzzle_draft", JSON.stringify(this.puzzle));
      alert("Puzzle saved to local storage!");
    } catch (e) {
      alert("Failed to save: " + e);
    }
  }
  loadPuzzle() {
    try {
      const saved = localStorage.getItem("archipelago_puzzle_draft");
      if (saved) {
        this.puzzle = JSON.parse(saved);
        this.nextIslandId = this.puzzle.islands.length;
        document.getElementById("puzzleId").value = this.puzzle.id;
        document.getElementById("gridWidth").value = String(this.puzzle.size.width);
        document.getElementById("gridHeight").value = String(this.puzzle.size.height);
        this.updateCanvasSize();
        this.renderAll();
        alert("Puzzle loaded!");
      } else {
        alert("No saved puzzle found in local storage");
      }
    } catch (e) {
      alert("Failed to load: " + e);
    }
  }
  // Transform editor-internal puzzle data to game-compatible export format
  buildExportSpec() {
    const spec = JSON.parse(JSON.stringify(this.puzzle));
    const bridgeCountConstraints = spec.constraints.filter(
      (c) => c.type === "IslandBridgeCountConstraint" && c.params?.islandId != null && c.params?.count != null
    );
    for (const bc of bridgeCountConstraints) {
      const island = spec.islands.find((i) => i.id === bc.params.islandId);
      if (island) {
        if (!island.constraints) island.constraints = [];
        island.constraints = island.constraints.filter((c) => !c.startsWith("num_bridges="));
        island.constraints.push(`num_bridges=${bc.params.count}`);
      }
    }
    spec.constraints = spec.constraints.filter(
      (c) => !(c.type === "IslandBridgeCountConstraint" && c.params?.islandId != null)
    );
    if (bridgeCountConstraints.length > 0 && !spec.constraints.find((c) => c.type === "IslandBridgeCountConstraint")) {
      spec.constraints.push({ type: "IslandBridgeCountConstraint" });
    }
    return spec;
  }
  exportJSON() {
    const spec = this.buildExportSpec();
    const json = JSON.stringify(spec, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.puzzle.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  newPuzzle() {
    if (!confirm("Create a new puzzle? Unsaved changes will be lost.")) return;
    this.puzzle = {
      id: "new_puzzle",
      type: "standard",
      size: { width: 4, height: 4 },
      islands: [],
      bridgeTypes: [],
      constraints: [],
      maxNumBridges: 10
    };
    this.nextIslandId = 0;
    this.testBridges = [];
    this.bridgePlacementStart = null;
    document.getElementById("puzzleId").value = "new_puzzle";
    document.getElementById("gridWidth").value = "4";
    document.getElementById("gridHeight").value = "4";
    this.hideConstraintForm();
    this.updateCanvasSize();
    this.renderAll();
  }
  validateSolution() {
    try {
      const exported = this.buildExportSpec();
      const puzzleSpec = {
        id: exported.id,
        type: exported.type,
        size: exported.size,
        islands: exported.islands,
        bridgeTypes: exported.bridgeTypes,
        constraints: exported.constraints,
        maxNumBridges: exported.maxNumBridges
      };
      const bridgePuzzle = new BridgePuzzle(puzzleSpec);
      for (const tb of this.testBridges) {
        const bridgeType = bridgePuzzle.inventory.takeBridge(tb.bridgeTypeId);
        if (!bridgeType) {
          document.getElementById("validationResults").innerHTML = `<div class="validation-message error">No more bridges of type "${tb.bridgeTypeId}" available</div>`;
          return;
        }
        bridgePuzzle.placeBridge(bridgeType.id, tb.start, tb.end);
      }
      const validator = new PuzzleValidator(bridgePuzzle);
      const result = validator.validateAll();
      const resultsDiv = document.getElementById("validationResults");
      if (result.allSatisfied) {
        resultsDiv.innerHTML = '<div class="validation-message success">\u2713 All constraints satisfied!</div>';
      } else {
        let html = `<div class="validation-message error">\u2717 ${result.unsatisfiedCount} constraint(s) failed:</div>`;
        for (const c of result.perConstraint) {
          if (!c.result.satisfied) {
            html += `<div class="validation-message error"><strong>${c.type}:</strong> ${c.result.message ?? "Not satisfied"}</div>`;
          }
        }
        resultsDiv.innerHTML = html;
      }
    } catch (error) {
      document.getElementById("validationResults").innerHTML = `<div class="validation-message error">Validation error: ${error}</div>`;
      console.error("Validation error:", error);
    }
  }
  updateCanvasSize() {
    this.canvas.width = this.puzzle.size.width * this.cellSize;
    this.canvas.height = this.puzzle.size.height * this.cellSize;
  }
  updateToolButtons() {
    document.querySelectorAll(".tool-controls .btn").forEach((btn) => btn.classList.remove("active"));
    if (this.tool === "island") document.getElementById("addIslandBtn")?.classList.add("active");
    else if (this.tool === "remove") document.getElementById("removeIslandBtn")?.classList.add("active");
    else if (this.tool === "bridge") document.getElementById("addBridgeBtn")?.classList.add("active");
  }
  renderAll() {
    this.renderGrid();
    this.renderBridgeTypes();
  }
  renderGrid() {
    const ctx = this.ctx;
    const { width, height } = this.puzzle.size;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= width; gx++) {
      ctx.beginPath();
      ctx.moveTo(gx * this.cellSize, 0);
      ctx.lineTo(gx * this.cellSize, height * this.cellSize);
      ctx.stroke();
    }
    for (let gy = 0; gy <= height; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, gy * this.cellSize);
      ctx.lineTo(width * this.cellSize, gy * this.cellSize);
      ctx.stroke();
    }
    this.renderConstraintLabels();
    this.renderTestBridges();
    if (this.bridgePlacementStart) {
      const px = (this.bridgePlacementStart.x - 0.5) * this.cellSize;
      const py = (this.bridgePlacementStart.y - 0.5) * this.cellSize;
      ctx.fillStyle = "rgba(52, 152, 219, 0.3)";
      ctx.fillRect(px - this.cellSize / 2, py - this.cellSize / 2, this.cellSize, this.cellSize);
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 3;
      ctx.strokeRect(px - this.cellSize / 2, py - this.cellSize / 2, this.cellSize, this.cellSize);
    }
    this.puzzle.islands.forEach((island) => {
      const ix = (island.x - 0.5) * this.cellSize;
      const iy = (island.y - 0.5) * this.cellSize;
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath();
      ctx.arc(ix, iy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#27ae60";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(island.id, ix, iy);
    });
  }
  renderConstraintLabels() {
    const items = getConstraintGridItems(this.puzzle.constraints, this.puzzle.islands);
    const byPos = /* @__PURE__ */ new Map();
    for (const item of items) {
      const key = `${item.x},${item.y}`;
      if (!byPos.has(key)) byPos.set(key, []);
      byPos.get(key).push(item.label);
    }
    const ctx = this.ctx;
    byPos.forEach((labels, key) => {
      const [gx, gy] = key.split(",").map(Number);
      const cx = (gx - 0.5) * this.cellSize;
      const cy = (gy - 0.5) * this.cellSize;
      const half = this.cellSize / 2;
      ctx.fillStyle = "rgba(255, 193, 7, 0.15)";
      ctx.fillRect(cx - half, cy - half, this.cellSize, this.cellSize);
      ctx.strokeStyle = "rgba(255, 150, 0, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - half, cy - half, this.cellSize, this.cellSize);
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      labels.forEach((label, idx) => {
        const textY = cy - half + 9 + idx * 13;
        const metrics = ctx.measureText(label);
        const bgW = metrics.width + 6;
        const bgH = 12;
        ctx.fillStyle = "rgba(255, 193, 7, 0.9)";
        ctx.fillRect(cx - bgW / 2, textY - bgH + 3, bgW, bgH);
        ctx.fillStyle = "#333";
        ctx.fillText(label, cx, textY);
      });
    });
  }
  renderTestBridges() {
    const bridgesBySpan = /* @__PURE__ */ new Map();
    this.testBridges.forEach((bridge) => {
      const key = bridge.start.x === bridge.end.x ? `v_${bridge.start.x}_${Math.min(bridge.start.y, bridge.end.y)}_${Math.max(bridge.start.y, bridge.end.y)}` : `h_${Math.min(bridge.start.x, bridge.end.x)}_${Math.max(bridge.start.x, bridge.end.x)}_${bridge.start.y}`;
      if (!bridgesBySpan.has(key)) bridgesBySpan.set(key, []);
      bridgesBySpan.get(key).push(bridge);
    });
    const ctx = this.ctx;
    bridgesBySpan.forEach((bridges) => {
      bridges.forEach((bridge, index) => {
        const sx = (bridge.start.x - 0.5) * this.cellSize;
        const sy = (bridge.start.y - 0.5) * this.cellSize;
        const ex = (bridge.end.x - 0.5) * this.cellSize;
        const ey = (bridge.end.y - 0.5) * this.cellSize;
        const offset = (index - (bridges.length - 1) / 2) * 5;
        ctx.strokeStyle = "#3498db";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (bridge.start.x === bridge.end.x) {
          ctx.moveTo(sx + offset, sy);
          ctx.lineTo(ex + offset, ey);
        } else {
          ctx.moveTo(sx, sy + offset);
          ctx.lineTo(ex, ey + offset);
        }
        ctx.stroke();
      });
    });
  }
  renderConstraintTypeList() {
    const listDiv = document.getElementById("constraintList");
    let html = "";
    CONSTRAINT_TYPES.forEach((ct) => {
      html += `<div class="constraint-item" data-type="${ct.type}">
                <h4>${ct.name}</h4>
                <p>${ct.description}</p>
                ${ct.note ? `<p><em>${ct.note}</em></p>` : ""}
            </div>`;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".constraint-item").forEach((item) => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-type");
        const ctDef = CONSTRAINT_TYPES.find((c) => c.type === type);
        if (!ctDef) return;
        this.hideConstraintTypePanel();
        this.showConstraintForm(ctDef);
      });
    });
  }
  renderPuzzleConstraints() {
    const listDiv = document.getElementById("puzzleConstraintsList");
    if (this.puzzle.constraints.length === 0) {
      listDiv.innerHTML = '<p class="empty-note">No constraints added yet</p>';
      return;
    }
    let html = "";
    this.puzzle.constraints.forEach((constraint, index) => {
      const info = CONSTRAINT_TYPES.find((c) => c.type === constraint.type);
      const name = info ? info.name : constraint.type;
      const paramsStr = constraint.params ? JSON.stringify(constraint.params) : "";
      html += `<div class="puzzle-constraint">
                <button class="remove-btn" data-index="${index}">\xD7</button>
                <strong>${name}</strong>
                ${paramsStr ? `<br><small>${paramsStr}</small>` : ""}
            </div>`;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.target.getAttribute("data-index"));
        this.removeConstraint(index);
      });
    });
  }
  renderBridgeTypes() {
    const listDiv = document.getElementById("bridgeTypeList");
    if (this.puzzle.bridgeTypes.length === 0) {
      listDiv.innerHTML = '<p class="empty-note">No bridge types defined</p>';
      return;
    }
    let html = "";
    this.puzzle.bridgeTypes.forEach((bridge) => {
      const selected = this.selectedBridgeTypeId === bridge.id ? "selected" : "";
      html += `<div class="bridge-type-item ${selected}" data-bridge-id="${bridge.id}">
                <button class="remove-btn" data-id="${bridge.id}">\xD7</button>
                <div><strong>ID:</strong> ${bridge.id}</div>
                <label>Colour:
                    <input type="text" value="${bridge.colour || "black"}"
                           data-id="${bridge.id}" data-field="colour">
                </label>
                <label>Length (\u22121 = variable):
                    <input type="number" value="${bridge.length ?? 1}"
                           data-id="${bridge.id}" data-field="length">
                </label>
                <label>Count:
                    <input type="number" value="${bridge.count ?? 1}"
                           data-id="${bridge.id}" data-field="count">
                </label>
            </div>`;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".bridge-type-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const t = e.target;
        if (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.classList.contains("remove-btn")) return;
        const bridgeId = item.getAttribute("data-bridge-id");
        this.selectedBridgeTypeId = bridgeId;
        this.renderBridgeTypes();
      });
    });
    listDiv.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = e.target.getAttribute("data-id");
        this.removeBridgeType(id);
      });
    });
    listDiv.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const target = e.target;
        const id = target.getAttribute("data-id");
        const field = target.getAttribute("data-field");
        const value = target.type === "number" ? parseInt(target.value, 10) : target.value;
        this.updateBridgeType(id, field, value);
      });
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new PuzzleEditor();
});
