export abstract class Command {
  /** Execute the command (apply change to model). */
  abstract execute(): void;

  /** Undo the command (revert change to model). */
  abstract undo(): void;

  /** Human-readable description (optional). */
  getDescription(): string {
    return '';
  }
}
