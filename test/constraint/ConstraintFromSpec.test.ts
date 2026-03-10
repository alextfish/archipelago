import { describe, it, expect } from "vitest";
import { createConstraintsFromSpec } from '@model/puzzle/constraints/createConstraintsFromSpec';
import { AllBridgesPlacedConstraint } from "@model/puzzle/constraints/AllBridgesPlacedConstraint";
import { MustTouchAHorizontalBridge } from "@model/puzzle/constraints/GridCellConstraints";

describe("createConstraintsFromSpec", () => {
	it("creates constraints from simple specs", () => {
		const specs = [
			{ type: "AllBridgesPlacedConstraint" },
			{ type: "MustTouchAHorizontalBridge", params: { x: 2, y: 3 } },
		];
		const constraints = createConstraintsFromSpec(specs);
		expect(constraints[0]).toBeInstanceOf(AllBridgesPlacedConstraint);
		expect(constraints[1]).toBeInstanceOf(MustTouchAHorizontalBridge);
		expect((constraints[1] as MustTouchAHorizontalBridge).x).toBe(2);
		expect((constraints[1] as MustTouchAHorizontalBridge).y).toBe(3);
	});
});
