
import type { ConstraintResult } from "./constraints/ConstraintResult";
export interface ValidationResult {
  allSatisfied: boolean;
  perConstraint: Array<{ constraintId?: string; type?: string; result: ConstraintResult }>;
  unsatisfiedCount: number;
}