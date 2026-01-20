// Hold a list of all active Constraint instances.
export class PuzzleValidator {
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
        // Defensive: puzzle.constraints may be constructed by the puzzle constructor.
        const constraints = this.puzzle.constraints ?? [];
        for (const c of constraints) {
            // Each constraint implements check(puzzle): ConstraintResult
            const result = c.check(this.puzzle);
            perConstraint.push({
                constraintId: c.id,
                type: c.constructor?.name,
                result,
            });
        }
        const unsatisfiedCount = perConstraint.reduce((acc, item) => acc + (item.result.satisfied ? 0 : 1), 0);
        const result = {
            allSatisfied: unsatisfiedCount === 0,
            perConstraint,
            unsatisfiedCount,
        };
        // Debug: emit per-constraint summary to help failing tests diagnostics
        try {
            console.log('[PuzzleValidator] validateAll results:', result.perConstraint.map(p => ({ type: p.type, ok: p.result.satisfied, msg: p.result.message })));
        }
        catch (e) { }
        return result;
    }
    /**
     * Convenience method: are all constraints satisfied right now?
     */
    isSolved() {
        return this.validateAll().allSatisfied;
    }
}
//   /**
//    * Validates all constraints and returns { ok, violations }
//    */
//   validateWithViolations(): { ok: boolean; violations: any[] } {
//     const results = this.validateAll(this.puzzle);
//     const ok = results.every(r => r.satisfied);
//     // Collect violations from affectedElements in each ConstraintResult
//     const violations = results
//       .map(r => r.affectedElements)
//       .filter(v => v && v.length)
//       .flat();
//     return { ok, violations };
//   }
//   validateAll() {
//     return this.constraints.map(c => c.check(this.puzzle));
//   }
//   isSolved(): boolean {
//     const results = this.validateAll(this.puzzle)
//     return results.every(r => r.satisfied);
//   }
