// src/model/puzzle/BridgeInventory.ts
var BridgeInventory = class {
  allBridges = [];
  constructor(types) {
    let counter = 0;
    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        this.allBridges.push({
          id: `b${++counter}`,
          type: { id: t.id, colour: t.colour, width: t.width, style: t.style, length: t.length }
        });
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
};

// src/model/puzzle/constraints/AllBridgesPlacedConstraint.ts
var AllBridgesPlacedConstraint = class _AllBridgesPlacedConstraint extends Constraint {
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
      glyphMessage: ok ? void 0 : "no adjacent bridge"
    };
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
      glyphMessage: ok ? void 0 : "no adjacent bridge"
    };
  }
};

// src/model/puzzle/constraints/NoCrossingConstraint.ts
var NoCrossingConstraint = class _NoCrossingConstraint extends Constraint {
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
};

// src/model/puzzle/constraints/IslandColorSeparationConstraint.ts
var IslandColorSeparationConstraint = class _IslandColorSeparationConstraint extends Constraint {
  color1;
  color2;
  constructor(color1, color2) {
    super();
    this.color1 = color1;
    this.color2 = color2;
  }
  static fromSpec(params) {
    return new _IslandColorSeparationConstraint(params.color1, params.color2);
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
      const hasColor1 = component.some((i) => this.getIslandColor(i) === this.color1);
      const hasColor2 = component.some((i) => this.getIslandColor(i) === this.color2);
      if (hasColor1 && hasColor2) {
        violations.push(...component.map((i) => i.id));
      }
    }
    this.violations = violations;
    const ok = violations.length === 0;
    let glyphMessage;
    if (!ok) {
      glyphMessage = `${this.color1} island must-not connected ${this.color2} island`;
    }
    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? void 0 : `Islands of colour ${this.color1} must not connect to islands of colour ${this.color2}`,
      glyphMessage
    };
  }
  /**
   * Extract colour from island constraints.
   * Expects a constraint like "color=red" or "colour=blue"
   */
  getIslandColor(island) {
    const colorConstraint = island.constraints?.find(
      (c) => c.startsWith("color=") || c.startsWith("colour=")
    );
    if (!colorConstraint) return void 0;
    return colorConstraint.split("=")[1];
  }
};

// src/model/puzzle/constraints/IslandDirectionalBridgeConstraint.ts
var IslandDirectionalBridgeConstraint = class _IslandDirectionalBridgeConstraint extends Constraint {
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
};

// src/model/puzzle/constraints/IslandPassingBridgeCountConstraint.ts
var IslandPassingBridgeCountConstraint = class _IslandPassingBridgeCountConstraint extends Constraint {
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
};

// src/model/puzzle/constraints/IslandVisibilityConstraint.ts
var IslandVisibilityConstraint = class _IslandVisibilityConstraint extends Constraint {
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
        glyphMessage = "not-enough island connected";
      } else {
        glyphMessage = "too-many island connected";
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
      if (currentX <= 0 || currentX >= puzzle.width || currentY <= 0 || currentY >= puzzle.height) {
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
};

// src/model/puzzle/constraints/EnclosedAreaSizeConstraint.ts
var EnclosedAreaSizeConstraint = class _EnclosedAreaSizeConstraint extends Constraint {
  x;
  y;
  expectedSize;
  constructor(x, y, expectedSize) {
    super();
    this.x = x;
    this.y = y;
    this.expectedSize = expectedSize;
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
    return x <= 0 || x >= puzzle.width || y <= 0 || y >= puzzle.height;
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
};

// src/model/puzzle/constraints/BridgeMustCoverIslandConstraint.ts
var BridgeMustCoverIslandConstraint = class _BridgeMustCoverIslandConstraint extends Constraint {
  static fromSpec(_params) {
    return new _BridgeMustCoverIslandConstraint();
  }
  check(puzzle) {
    const violations = [];
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      if (!bridge.type.mustCoverIsland) continue;
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
      case "IslandColorSeparationConstraint":
        return IslandColorSeparationConstraint.fromSpec(spec.params);
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
      // Add more cases as needed for other constraint types.
      default:
        throw new Error(`Unknown constraint type: ${spec.type}`);
    }
  });
}

// src/model/puzzle/constraints/BridgeLengthConstraint.ts
var BridgeLengthConstraint = class _BridgeLengthConstraint extends Constraint {
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
  constructor(spec) {
    this.id = spec.id;
    this.width = spec.size.width;
    this.height = spec.size.height;
    this.islands = spec.islands;
    this.constraints = createConstraintsFromSpec(spec.constraints);
    const bridgeTypes = spec.bridgeTypes.map(
      (spec2) => ({
        ...createBridgeType({
          id: spec2.id,
          colour: spec2.colour,
          length: spec2.length,
          width: spec2.width,
          style: spec2.style
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
   * If typeId is undefined, this behaves like the legacy couldPlaceBridgeAt (only max-bridges and existence checks).
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
};

// editor/editor.ts
var CONSTRAINT_TYPES = [
  {
    type: "AllBridgesPlacedConstraint",
    name: "All Bridges Placed",
    description: "All bridges from inventory must be placed",
    needsParams: false,
    needsCell: false
  },
  {
    type: "NoCrossingConstraint",
    name: "No Crossing",
    description: "Bridges must not cross each other",
    needsParams: false,
    needsCell: false
  },
  {
    type: "MustTouchAHorizontalBridge",
    name: "Must Touch Horizontal Bridge",
    description: "Cell must be adjacent to a horizontal bridge",
    needsParams: true,
    needsCell: true,
    params: ["x", "y"]
  },
  {
    type: "MustTouchAVerticalBridge",
    name: "Must Touch Vertical Bridge",
    description: "Cell must be adjacent to a vertical bridge",
    needsParams: true,
    needsCell: true,
    params: ["x", "y"]
  },
  {
    type: "IslandMustBeCoveredConstraint",
    name: "Island Must Be Covered",
    description: "Specified island must be covered by at least one bridge",
    needsParams: true,
    needsCell: false,
    params: [{ name: "islandId", type: "string" }]
  },
  {
    type: "IslandColorSeparationConstraint",
    name: "Island Colour Separation",
    description: "Islands of different colours must be separated",
    needsParams: true,
    needsCell: false,
    params: [{ name: "colour1", type: "string" }, { name: "colour2", type: "string" }]
  },
  {
    type: "IslandDirectionalBridgeConstraint",
    name: "Island Directional Bridge",
    description: "Island must have a bridge in a specific direction",
    needsParams: true,
    needsCell: false,
    params: [{ name: "islandId", type: "string" }, { name: "direction", type: "string" }]
  },
  {
    type: "IslandPassingBridgeCountConstraint",
    name: "Island Passing Bridge Count",
    description: "Number of bridges passing by an island",
    needsParams: true,
    needsCell: false,
    params: [
      { name: "islandId", type: "string" },
      { name: "direction", type: "string" },
      { name: "expectedCount", type: "number" }
    ]
  },
  {
    type: "IslandVisibilityConstraint",
    name: "Island Visibility",
    description: "Islands must be visible from a specific island",
    needsParams: true,
    needsCell: false,
    params: [{ name: "islandId", type: "string" }, { name: "visibleCount", type: "number" }]
  },
  {
    type: "EnclosedAreaSizeConstraint",
    name: "Enclosed Area Size",
    description: "Size of enclosed areas created by bridges",
    needsParams: true,
    needsCell: true,
    params: [{ name: "size", type: "number" }]
  },
  {
    type: "BridgeMustCoverIslandConstraint",
    name: "Bridge Must Cover Island",
    description: "A specific bridge must cover an island",
    needsParams: true,
    needsCell: false,
    params: [{ name: "islandId", type: "string" }],
    note: "Applied to individual bridge types"
  }
];
var PuzzleEditor = class {
  canvas;
  ctx;
  puzzle;
  cellSize = 60;
  mode = "edit";
  tool = "island";
  selectedConstraintType = null;
  selectedBridgeTypeId = null;
  testBridges = [];
  bridgePlacementStart = null;
  nextIslandId = 0;
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
    this.renderAll();
  }
  setupEventListeners() {
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
    document.querySelectorAll('input[name="mode"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.mode = e.target.value;
        this.updateUI();
      });
    });
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
      this.puzzle.size = { width, height };
      this.updateCanvasSize();
      this.renderAll();
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
    if (this.mode === "edit") {
      this.handleEditClick(gridX, gridY);
    } else if (this.mode === "constraint") {
      this.handleConstraintClick(gridX, gridY);
    }
  }
  handleEditClick(gridX, gridY) {
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
      alert("Please select a bridge type first from the right panel");
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
        alert("Bridge must connect two different cells");
        this.bridgePlacementStart = null;
        this.renderAll();
        return;
      }
      this.testBridges.push({
        start,
        end,
        bridgeTypeId: this.selectedBridgeTypeId
      });
      this.bridgePlacementStart = null;
      this.renderAll();
    }
  }
  handleConstraintClick(gridX, gridY) {
    if (!this.selectedConstraintType) {
      alert("Please select a constraint type first");
      return;
    }
    const constraintInfo = CONSTRAINT_TYPES.find((c) => c.type === this.selectedConstraintType);
    if (!constraintInfo) return;
    if (constraintInfo.needsCell) {
      this.showConstraintConfig(constraintInfo, { x: gridX, y: gridY });
    } else {
      alert("This constraint does not apply to grid cells. Configure it in the left panel.");
    }
  }
  addIsland(x, y) {
    const existing = this.puzzle.islands.find((i) => i.x === x && i.y === y);
    if (existing) {
      alert("Island already exists at this position");
      return;
    }
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
    this.puzzle.bridgeTypes.push({
      id,
      colour: "black",
      length: 1,
      count: 1
    });
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
    if (bridge) {
      bridge[field] = value;
    }
  }
  showConstraintConfig(constraintInfo, cell) {
    const configDiv = document.getElementById("cellConstraintConfig");
    const cellConstraintsDiv = document.getElementById("cellConstraints");
    cellConstraintsDiv.style.display = "block";
    let html = `<h4>${constraintInfo.name}</h4>`;
    if (cell) {
      html += `<div class="param-group">
                <label>X:</label>
                <input type="number" id="param_x" value="${cell.x}" readonly>
            </div>
            <div class="param-group">
                <label>Y:</label>
                <input type="number" id="param_y" value="${cell.y}" readonly>
            </div>`;
    }
    if (constraintInfo.params && Array.isArray(constraintInfo.params)) {
      constraintInfo.params.forEach((param) => {
        const paramName = typeof param === "string" ? param : param.name;
        const paramType = typeof param === "string" ? "text" : param.type;
        if (paramName !== "x" && paramName !== "y") {
          html += `<div class="param-group">
                        <label>${paramName}:</label>
                        <input type="${paramType === "number" ? "number" : "text"}" 
                               id="param_${paramName}" 
                               placeholder="${paramName}">
                    </div>`;
        }
      });
    }
    html += `<button class="btn-small" id="addConstraintBtn">Add Constraint</button>`;
    configDiv.innerHTML = html;
    document.getElementById("addConstraintBtn")?.addEventListener("click", () => {
      this.addConstraintFromConfig(constraintInfo);
    });
  }
  addConstraintFromConfig(constraintInfo) {
    const params = {};
    if (constraintInfo.needsCell) {
      params.x = parseInt(document.getElementById("param_x").value);
      params.y = parseInt(document.getElementById("param_y").value);
    }
    if (constraintInfo.params) {
      constraintInfo.params.forEach((param) => {
        const paramName = typeof param === "string" ? param : param.name;
        const paramType = typeof param === "string" ? "text" : param.type;
        if (paramName !== "x" && paramName !== "y") {
          const input = document.getElementById(`param_${paramName}`);
          if (input) {
            params[paramName] = paramType === "number" ? parseInt(input.value) : input.value;
          }
        }
      });
    }
    this.puzzle.constraints.push({
      type: constraintInfo.type,
      params: Object.keys(params).length > 0 ? params : void 0
    });
    this.renderAll();
    document.getElementById("cellConstraints").style.display = "none";
  }
  removeConstraint(index) {
    this.puzzle.constraints.splice(index, 1);
    this.renderAll();
  }
  savePuzzle() {
    try {
      localStorage.setItem("archipelago_puzzle_draft", JSON.stringify(this.puzzle));
      alert("Puzzle saved to local storage!");
    } catch (e) {
      alert("Failed to save puzzle: " + e);
    }
  }
  loadPuzzle() {
    try {
      const saved = localStorage.getItem("archipelago_puzzle_draft");
      if (saved) {
        this.puzzle = JSON.parse(saved);
        this.nextIslandId = this.puzzle.islands.length;
        document.getElementById("puzzleId").value = this.puzzle.id;
        document.getElementById("gridWidth").value = this.puzzle.size.width.toString();
        document.getElementById("gridHeight").value = this.puzzle.size.height.toString();
        this.updateCanvasSize();
        this.renderAll();
        alert("Puzzle loaded from local storage!");
      } else {
        alert("No saved puzzle found in local storage");
      }
    } catch (e) {
      alert("Failed to load puzzle: " + e);
    }
  }
  exportJSON() {
    const json = JSON.stringify(this.puzzle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.puzzle.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  newPuzzle() {
    if (confirm("Create a new puzzle? Unsaved changes will be lost.")) {
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
      document.getElementById("puzzleId").value = this.puzzle.id;
      document.getElementById("gridWidth").value = "4";
      document.getElementById("gridHeight").value = "4";
      this.updateCanvasSize();
      this.renderAll();
    }
  }
  validateSolution() {
    try {
      const puzzleSpec = {
        id: this.puzzle.id,
        type: this.puzzle.type,
        size: this.puzzle.size,
        islands: this.puzzle.islands,
        bridgeTypes: this.puzzle.bridgeTypes,
        constraints: this.puzzle.constraints,
        maxNumBridges: this.puzzle.maxNumBridges
      };
      const bridgePuzzle = new BridgePuzzle(puzzleSpec);
      for (const testBridge of this.testBridges) {
        const bridgeType = bridgePuzzle.inventory.takeBridge(testBridge.bridgeTypeId);
        if (!bridgeType) {
          const resultsDiv2 = document.getElementById("validationResults");
          resultsDiv2.innerHTML = `<div class="validation-message error">No more bridges of type ${testBridge.bridgeTypeId} available</div>`;
          return;
        }
        bridgePuzzle.placeBridge(bridgeType.id, testBridge.start, testBridge.end);
      }
      const validator = new PuzzleValidator(bridgePuzzle);
      const validationResult = validator.validateAll();
      const resultsDiv = document.getElementById("validationResults");
      if (validationResult.allSatisfied) {
        resultsDiv.innerHTML = '<div class="validation-message success">\u2713 All constraints satisfied! Puzzle solved!</div>';
      } else {
        let html = `<div class="validation-message error">\u2717 ${validationResult.unsatisfiedCount} constraint(s) failed:</div>`;
        for (const constraint of validationResult.perConstraint) {
          if (!constraint.result.satisfied) {
            const message = constraint.result.message || "Constraint not satisfied";
            html += `<div class="validation-message error"><strong>${constraint.type}:</strong> ${message}</div>`;
          }
        }
        resultsDiv.innerHTML = html;
      }
    } catch (error) {
      const resultsDiv = document.getElementById("validationResults");
      resultsDiv.innerHTML = `<div class="validation-message error">Validation error: ${error}</div>`;
      console.error("Validation error:", error);
    }
  }
  updateCanvasSize() {
    this.canvas.width = this.puzzle.size.width * this.cellSize;
    this.canvas.height = this.puzzle.size.height * this.cellSize;
  }
  updateToolButtons() {
    document.querySelectorAll(".tool-controls .btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    if (this.tool === "island") {
      document.getElementById("addIslandBtn")?.classList.add("active");
    } else if (this.tool === "remove") {
      document.getElementById("removeIslandBtn")?.classList.add("active");
    } else if (this.tool === "bridge") {
      document.getElementById("addBridgeBtn")?.classList.add("active");
    }
  }
  updateUI() {
    this.renderConstraintList();
    this.renderPuzzleConstraints();
    this.renderBridgeTypes();
    this.renderIslandsList();
  }
  renderAll() {
    this.updateUI();
    this.renderGrid();
  }
  renderGrid() {
    const ctx = this.ctx;
    const { width, height } = this.puzzle.size;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * this.cellSize, 0);
      ctx.lineTo(x * this.cellSize, height * this.cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * this.cellSize);
      ctx.lineTo(width * this.cellSize, y * this.cellSize);
      ctx.stroke();
    }
    this.puzzle.constraints.forEach((constraint) => {
      if (constraint.params && constraint.params.x && constraint.params.y) {
        const x = (constraint.params.x - 0.5) * this.cellSize;
        const y = (constraint.params.y - 0.5) * this.cellSize;
        ctx.fillStyle = "rgba(255, 193, 7, 0.3)";
        ctx.fillRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
        ctx.strokeStyle = "#ffc107";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
      }
    });
    this.testBridges.forEach((bridge) => {
      const startX = (bridge.start.x - 0.5) * this.cellSize;
      const startY = (bridge.start.y - 0.5) * this.cellSize;
      const endX = (bridge.end.x - 0.5) * this.cellSize;
      const endY = (bridge.end.y - 0.5) * this.cellSize;
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    });
    if (this.bridgePlacementStart) {
      const x = (this.bridgePlacementStart.x - 0.5) * this.cellSize;
      const y = (this.bridgePlacementStart.y - 0.5) * this.cellSize;
      ctx.fillStyle = "rgba(52, 152, 219, 0.3)";
      ctx.fillRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
    }
    this.puzzle.islands.forEach((island) => {
      const x = (island.x - 0.5) * this.cellSize;
      const y = (island.y - 0.5) * this.cellSize;
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#27ae60";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(island.id, x, y);
    });
  }
  renderConstraintList() {
    const listDiv = document.getElementById("constraintList");
    let html = "";
    CONSTRAINT_TYPES.forEach((constraint) => {
      const selected = this.selectedConstraintType === constraint.type ? "selected" : "";
      html += `
                <div class="constraint-item ${selected}" data-type="${constraint.type}">
                    <h4>${constraint.name}</h4>
                    <p>${constraint.description}</p>
                    ${constraint.note ? `<p><em>${constraint.note}</em></p>` : ""}
                </div>
            `;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".constraint-item").forEach((item) => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-type");
        this.selectedConstraintType = type;
        this.renderConstraintList();
        const constraintInfo = CONSTRAINT_TYPES.find((c) => c.type === type);
        if (constraintInfo && !constraintInfo.needsCell) {
          this.showConstraintConfig(constraintInfo);
        }
      });
    });
  }
  renderPuzzleConstraints() {
    const listDiv = document.getElementById("puzzleConstraintsList");
    if (this.puzzle.constraints.length === 0) {
      listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No constraints added yet</p>';
      return;
    }
    let html = "";
    this.puzzle.constraints.forEach((constraint, index) => {
      const info = CONSTRAINT_TYPES.find((c) => c.type === constraint.type);
      const name = info ? info.name : constraint.type;
      const paramsStr = constraint.params ? JSON.stringify(constraint.params) : "";
      html += `
                <div class="puzzle-constraint">
                    <button class="remove-btn" data-index="${index}">\xD7</button>
                    <strong>${name}</strong>
                    ${paramsStr ? `<br><small>${paramsStr}</small>` : ""}
                </div>
            `;
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
      listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No bridge types defined</p>';
      return;
    }
    let html = "";
    this.puzzle.bridgeTypes.forEach((bridge, index) => {
      const selected = this.selectedBridgeTypeId === bridge.id ? "selected" : "";
      html += `
                <div class="bridge-type-item ${selected}" data-bridge-id="${bridge.id}">
                    <button class="remove-btn" data-id="${bridge.id}">\xD7</button>
                    <div><strong>ID:</strong> ${bridge.id}</div>
                    <div>
                        <label>Colour: 
                            <input type="text" 
                                   value="${bridge.colour || "black"}" 
                                   data-id="${bridge.id}" 
                                   data-field="colour">
                        </label>
                    </div>
                    <div>
                        <label>Length: 
                            <input type="number" 
                                   value="${bridge.length ?? 1}" 
                                   data-id="${bridge.id}" 
                                   data-field="length"
                                   placeholder="-1 for variable">
                        </label>
                    </div>
                    <div>
                        <label>Count: 
                            <input type="number" 
                                   value="${bridge.count ?? 1}" 
                                   data-id="${bridge.id}" 
                                   data-field="count">
                        </label>
                    </div>
                </div>
            `;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".bridge-type-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.classList.contains("remove-btn")) {
          return;
        }
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
        const value = target.type === "number" ? parseInt(target.value) : target.value;
        this.updateBridgeType(id, field, value);
      });
    });
  }
  renderIslandsList() {
    const listDiv = document.getElementById("islandsList");
    if (this.puzzle.islands.length === 0) {
      listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No islands added yet</p>';
      return;
    }
    let html = "";
    this.puzzle.islands.forEach((island) => {
      const constraintsStr = island.constraints ? island.constraints.join(", ") : "";
      html += `
                <div class="island-item">
                    <button class="remove-btn" data-x="${island.x}" data-y="${island.y}">\xD7</button>
                    <div><strong>${island.id}</strong> (${island.x}, ${island.y})</div>
                    <div class="island-constraints">
                        <label>Constraints (e.g., num_bridges=3):
                            <input type="text" 
                                   value="${constraintsStr}" 
                                   data-id="${island.id}"
                                   placeholder="num_bridges=3">
                        </label>
                    </div>
                </div>
            `;
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.target;
        const x = parseInt(target.getAttribute("data-x"));
        const y = parseInt(target.getAttribute("data-y"));
        this.removeIsland(x, y);
      });
    });
    listDiv.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const target = e.target;
        const id = target.getAttribute("data-id");
        const island = this.puzzle.islands.find((i) => i.id === id);
        if (island) {
          const value = target.value.trim();
          island.constraints = value ? value.split(",").map((s) => s.trim()) : void 0;
        }
      });
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new PuzzleEditor();
});
