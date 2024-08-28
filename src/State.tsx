import { createEffect } from "solid-js";
import { produce, SetStoreFunction } from "solid-js/store";
import styles from "./App.module.css"

export type TextEntry = {
    label: string;
    content: string;
};

type Edit = {
    idx: number;
    newContent: string;
};

type Selected = {
    text: string;
    idxs: number[];
};

export enum UpdateType {
    Add = "add",
    Remove = "remove",
    Edit = "edit",
    Distribute = "distribute",
    Clear = "clear",
}

type Update =
    | { type: UpdateType.Add; idx: number; entry: TextEntry }
    | { type: UpdateType.Remove; idx: number }
    | { type: UpdateType.Edit; edit: Edit }
    | { type: UpdateType.Distribute; edits: Edit[] }
    | { type: UpdateType.Clear; entries: TextEntry[] };

export type State = {
    entries: TextEntry[];
    fontSize: number;
    undoStack: Update[];
    redoStack: Update[];
    selected: Selected;
};

type StackName = "undoStack" | "redoStack";

export class StateWrapper {
    state: State;
    setState: SetStoreFunction<State>;

    constructor(state: State, setState: SetStoreFunction<State>) {
        this.state = state;
        this.setState = setState;
    }

    registerLocalStorage<K extends keyof State>(key: K) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            this.setState(key, JSON.parse(value));
        }
        createEffect(() => {
            localStorage.setItem(key, JSON.stringify(this.state[key]));
        });
    }

    setupObserver(): void {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (
                    mutation.target !== document.body ||
                    mutation.type !== "childList"
                ) {
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
        let { idx, newContent } = edit;
        let oldContent!: string;
        this.setState("entries", idx, "content", (content) => {
            oldContent = content;
            return newContent;
        });
        return { idx, newContent: oldContent };
    }

    updateAndGetReverse(update: Update): Update {
        const { state, setState } = this;
        switch (update.type) {
            case UpdateType.Add: {
                const { idx, entry } = update;
                setState(
                    "entries",
                    produce((entries) => {
                        entries.splice(idx, 0, entry);
                    }),
                );
                return {
                    type: UpdateType.Remove,
                    idx: state.entries.length - 1,
                };
            }
            case UpdateType.Remove: {
                const { idx } = update;
                let entry: TextEntry;
                setState(
                    "entries",
                    produce((entries) => {
                        entry = entries[idx];
                        entries.splice(idx, 1);
                    }),
                );
                return { type: UpdateType.Add, idx, entry: entry! };
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
                };
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
        setState(
            "undoStack",
            produce((stack) => {
                stack.push(this.updateAndGetReverse(update));
            }),
        );
        setState("redoStack", []);
    }

    addEntry(entry: TextEntry): void {
        const { state } = this;
        this.updateAndPushUndo({
            type: UpdateType.Add,
            idx: state.entries.length,
            entry,
        });
        // scroll page to bottom
        window.scrollTo(0, document.body.scrollHeight);
    }

    removeEntry(idx: number): void {
        this.updateAndPushUndo({ type: UpdateType.Remove, idx });
    }

    clearEntries(): void {
        if (this.state.entries.length > 0) {
            this.updateAndPushUndo({ type: UpdateType.Clear, entries: [] });
        }
    }

    editContent(idx: number, newContent: string): void {
        const entry = this.state.entries[idx];
        if (entry.content !== newContent) {
            this.updateAndPushUndo({
                type: UpdateType.Edit,
                edit: { idx, newContent: newContent },
            });
        }
    }

    updateWithStack(from: StackName, to: StackName): void {
        let { setState } = this;
        let update: Update | undefined;
        setState(
            from,
            produce((stack) => {
                update = stack.pop();
            }),
        );
        if (update !== undefined) {
            setState(
                to,
                produce((stack) => {
                    stack.push(this.updateAndGetReverse(update!));
                }),
            );
        }
    }

    distributeEdits(): Edit[] {
        function joinParenthesized(labels: string[]): string {
            const s = labels.join("\n");
            return s.length > 0 ? `（${s}）` : s;
        }

        const labels = this.state.entries.map((entry) => entry.label);
        return this.state.selected.idxs.map((idx, i) => {
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
            return { idx, newContent };
        });
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
        const selectedIdxs = [...this.state.entries.keys()].filter((idx) => {
            const lineBox = lines.children[idx];
            return selection.containsNode(lineBox, true);
        });
        return { text: selectedText, idxs: selectedIdxs };
    }
}
