import { AllBridgesPlacedConstraint } from './AllBridgesPlacedConstraint';
import type { Constraint } from './Constraint';
import { MustTouchAHorizontalBridge, MustTouchAVerticalBridge } from './GridCellConstraints';
import { NoCrossingConstraint } from './NoCrossingConstraint';
import { IslandMustBeCoveredConstraint } from './IslandMustBeCoveredConstraint';
import { IslandColorSeparationConstraint } from './IslandColorSeparationConstraint';
import { IslandDirectionalBridgeConstraint } from './IslandDirectionalBridgeConstraint';
import { IslandPassingBridgeCountConstraint } from './IslandPassingBridgeCountConstraint';
import { IslandVisibilityConstraint } from './IslandVisibilityConstraint';
import { EnclosedAreaSizeConstraint } from './EnclosedAreaSizeConstraint';
import { BridgeMustCoverIslandConstraint } from './BridgeMustCoverIslandConstraint';


export function createConstraintsFromSpec(constraints: { type: string; params?: any; }[]): Constraint[] {
  // Assume each constraint type corresponds to a class with a static fromSpec method
  // and is imported somewhere else in the project.
  // Example: { type: "MaxBridges", params: { max: 2 } }
  return constraints.map(spec => {
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
