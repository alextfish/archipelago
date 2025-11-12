import { Command } from "@model/commands/Command";

export class UndoRedoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private maxHistorySize = 50) {}

  executeCommand(command: Command): void {
    // Execute and push onto undo stack; clear redo stack
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    // Enforce history limit
    if (this.undoStack.length > this.maxHistorySize) {
      // drop oldest
      this.undoStack.shift();
    }
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const cmd = this.undoStack.pop()!;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const cmd = this.redoStack.pop()!;
    cmd.execute();
    this.undoStack.push(cmd);
    // Trim if needed
    if (this.undoStack.length > this.maxHistorySize) this.undoStack.shift();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  getHistorySize(): number {
    return this.undoStack.length;
  }
}