export interface ConstraintResult {
  satisfied: boolean;
  affectedElements?: string[]; // e.g. island ids, bridge ids
  message?: string;            // for UI to display if desired
}
