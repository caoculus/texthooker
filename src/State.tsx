import { produce, SetStoreFunction } from "solid-js/store";
import { Dictionary } from "typescript-collections";

type Id = number;
type FontSize = number;

type TextEntry = {
    label: string,
    content: string,
};

type Edit = {
    id: Id,
    newContent: string,
};

type Selected = {
    text: string,
    ids: Id[],
};

type EntryMap = Dictionary<Id, TextEntry>;

export enum UpdateType {
    Add = "add",
    Remove = "remove",
    Edit = "edit",
    Distribute = "distribute",
    Clear = "clear",
}

type Update =
    | { type: UpdateType.Add, id: Id, entry: TextEntry }
    | { type: UpdateType.Remove, id: Id }
    | { type: UpdateType.Edit, edit: Edit }
    | { type: UpdateType.Distribute, edits: Edit[] }
    | { type: UpdateType.Clear, entries: EntryMap };

export type State = {
    entries: EntryMap,
    fontSize: FontSize,
    undoStack: Update[],
    redoStack: Update[],
    selected: Selected,
    nextId: Id,
};

type StackName = "undoStack" | "redoStack";

export class StateWrapper {
    state: State;
    setState: SetStoreFunction<State>;

    constructor(state: State, setState: SetStoreFunction<State>) {
        this.state = state;
        this.setState = setState;
    }

    normalizeState(): void {
        const { state, setState } = this;
        const newEntries: EntryMap = new Dictionary();
        for (const [id, entry] of state.entries.values().entries()) {
            newEntries.setValue(id, entry);
        }
        setState("entries", newEntries);
    }

    setupObserver(): void {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.target !== document.body || mutation.type !== "childList") {
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    if (node.nodeName !== "P") {
                        continue;
                    }
                    (node as Element).remove();
                    const text = node.textContent;
                    if (text === null || text.trim().length === 0) {
                        continue;
                    }
                    this.addEntry({
                        label: text,
                        content: text,
                    });
                }
            }
        });
        observer.observe(document.body, { childList: true });
    }

    applyEdit(edit: Edit): Edit {
        let { id, newContent } = edit;
        let oldContent!: string;
        this.setState("entries", produce((entries) => {
            const entry = entries.getValue(id);
            if (entry === undefined) {
                throw new Error(`Couldn't find entry for id ${id}`);
            }
            oldContent = entry.content;
            entries.setValue(id, { ...entry, content: newContent });
        }));
        return { id, newContent: oldContent };
    }

    updateAndGetReverse(update: Update): Update {
        console.log("update");
        const { state, setState } = this;
        switch (update.type) {
            case UpdateType.Add: {
                const { id, entry } = update;
                setState("entries", (entries) => {
                    entries.setValue(id, entry);
                    return entries;
                });
                return { type: UpdateType.Remove, id };
            }
            case UpdateType.Remove: {
                const { id } = update;
                let entry: TextEntry;
                setState("entries", produce((entries) => {
                    const removed = entries.remove(id);
                    if (removed === undefined) {
                        throw new Error(`Couldn't find entry for id ${id}`);
                    }
                    entry = removed;
                }));
                return { type: UpdateType.Add, id, entry: entry! };
            }
            case UpdateType.Edit: {
                const { edit } = update;
                return { type: UpdateType.Edit, edit: this.applyEdit(edit) };
            }
            case UpdateType.Distribute: {
                const { edits } = update;
                return {
                    type: UpdateType.Distribute,
                    edits: edits.map((edit) => this.applyEdit(edit)),
                }
            }
            case UpdateType.Clear: {
                const { entries: newEntries } = update;
                const oldEntries = state.entries;
                setState("entries", newEntries);
                return { type: UpdateType.Clear, entries: oldEntries };
            }
        }
    }

    updateAndPushUndo(update: Update): void {
        const { setState } = this;
        setState("undoStack", produce((stack) => {
            stack.push(this.updateAndGetReverse(update));
        }));
        setState("redoStack", []);
    }

    addEntry(entry: TextEntry): void {
        const { state, setState } = this;
        const id = state.nextId;
        setState("nextId", id + 1);
        this.updateAndPushUndo({ type: UpdateType.Add, id, entry });
        // scroll page to bottom
        window.scrollTo(0, document.body.scrollHeight);
    }

    removeEntry(id: Id): void {
        this.updateAndPushUndo({ type: UpdateType.Remove, id });
    }

    clearEntries(): void {
        if (!this.state.entries.isEmpty()) {
            this.updateAndPushUndo({ type: UpdateType.Clear, entries: new Dictionary() });
        }
    }

    editContent(id: Id, newContent: string): void {
        const entry = this.state.entries.getValue(id);
        if (entry === undefined) {
            throw new Error(`Couldn't find entry for id ${id}`);
        }
        if (entry.content !== newContent) {
            this.updateAndPushUndo({ type: UpdateType.Edit, edit: { id, newContent: newContent } });
        }
    }

    updateWithStack(from: StackName, to: StackName): void {
        let { setState } = this;
        let update: Update | undefined;
        setState(from, produce((stack) => {
            update = stack.pop();
        }));
        if (update !== undefined) {
            setState(to, produce((stack) => {
                stack.push(this.updateAndGetReverse(update!));
            }))
        }
    }

    distributeEdits(): Edit[] {
        function joinParenthesized(labels: string[]): string {
            const s = labels.join("\n");
            return s.length > 0 ? `（${s}）` : s;
        }

        const labels = this.state.entries.values().map((entry) => entry.label);
        return this.state.selected.ids.map((id, i) => {
            const parts: string[] = [];
            const before = joinParenthesized(labels.slice(0, i));
            const after = joinParenthesized(labels.slice(i + 1));
            if (before.length > 0) {
                parts.push(before);
            }
            parts.push(labels[i]);
            if (after.length > 0) {
                parts.push(after);
            }
            const newContent = parts.join("\n");
            return { id, newContent };
        })
    }

    calcSelection(): Selected | null {
        const selection = window.getSelection();
        if (selection === null) {
            return null;
        }
        if (selection.type !== "Range") {
            return null;
        }
        const selectedText = selection.toString();
        const lines = document.getElementById("lines");
        if (lines === null) {
            throw new Error("Could not find lines element");
        }
        const selectedIds = this.state.entries.keys().filter((_id, i) => {
            const lineBox = lines.children[i];
            return selection.containsNode(lineBox, true);
        });
        return { text: selectedText, ids: selectedIds };
    };
}

