import { createSignal, For, Show, type Component } from "solid-js";

import styles from "./App.module.css";

import { createStore } from "solid-js/store";
import { State, StateWrapper, TextEntry, UpdateType } from "./State";

type EntryProps = {
    entry: TextEntry;
    removeEntry: () => void;
    setContent: (content: string) => void;
};
const Entry: Component<EntryProps> = ({
    entry,
    removeEntry,
    setContent,
}: EntryProps) => {
    let boxRef: HTMLDivElement;
    let contentRef: HTMLSpanElement;
    const [focused, setFocused] = createSignal(false);
    const onEdit = () => {
        setFocused(true);
        contentRef.contentEditable = "true";
        contentRef.focus();
    };
    const onFocusOut = () => {
        setFocused(false);
        contentRef.contentEditable = "false";
        setContent(contentRef.innerText);
    };
    const revertContent = () => {
        setContent(entry.label);
    };
    const contentVisible = () => {
        return focused() || entry.label != entry.content;
    };

    return (
        <div
            ref={boxRef!}
            class={styles.line_box}
        >
            <span class={styles.line_label}>{entry.label}</span>
            <div
                class={styles.line_button}
                onClick={onEdit}
            >
                🖉
            </div>
            <div
                class={styles.line_button}
                onClick={removeEntry}
            >
                ×
            </div>
            <br />
            <Show when={contentVisible()}>
                <span
                    ref={contentRef!}
                    class={styles.line_content}
                    onFocusOut={onFocusOut}
                    onClick={onEdit}
                >
                    {entry.content}
                </span>
                <div
                    class={styles.line_button}
                    onClick={revertContent}
                >
                    ↶
                </div>
            </Show>
        </div>
    );
};

const MAX_UNDO: number = 1000;

const App: Component = () => {
    const [state, setState] = createStore<State>({
        entries: [],
        fontSize: 26,
        undoStack: [],
        redoStack: [],
        selected: { text: "", idxs: [] },
    });

    const wrapper = new StateWrapper(state, setState);
    wrapper.setupObserver();

    for (const key of [
        "entries",
        "fontSize",
        "undoStack",
        "redoStack",
    ] as const) {
        wrapper.registerLocalStorage(key);
    }

    // Trim if too long
    if (state.undoStack.length > MAX_UNDO) {
        setState("undoStack", (stack) => stack.slice(stack.length - MAX_UNDO));
    }

    const handleFontSize = (e: InputEvent) => {
        setState(
            "fontSize",
            Number.parseInt((e.target! as HTMLInputElement).value),
        );
    };
    const undo = () => {
        wrapper.updateWithStack("undoStack", "redoStack");
    };
    const redo = () => {
        wrapper.updateWithStack("redoStack", "undoStack");
    };
    const downloadJson = () => {
        const entries = state.entries.map((entry) => JSON.stringify(entry));
        const blob = new Blob(entries);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "in.json";
        a.click();
    };
    const distribute = () => {
        const edits = wrapper.distributeEdits();
        if (edits.length > 0) {
            wrapper.updateAndPushUndo({ type: UpdateType.Distribute, edits });
        }
    };
    document.addEventListener("selectionchange", () => {
        setState("selected", wrapper.calcSelection() ?? { text: "", idxs: [] });
    });

    return (
        <>
            <div style={`font-size: ${state.fontSize}px`}>
                <div class={styles.container}>
                    <div
                        class={styles.container_button}
                        id={styles.clear_button}
                        title="Clear localStorage"
                        onClick={() => wrapper.clearEntries()}
                    >
                        <i class="nf nf-md-delete"></i>
                    </div>
                    <div
                        class={`${styles.container_button} ${state.redoStack.length === 0 ? styles.disabled_button : ""}`}
                        title="Redo last action"
                        onClick={redo}
                    >
                        <i class="nf nf-md-redo"></i>
                    </div>
                    <div
                        class={`${styles.container_button} ${state.undoStack.length === 0 ? styles.disabled_button : ""}`}
                        title="Undo last action"
                        onClick={undo}
                    >
                        <i class="nf nf-md-undo"></i>
                    </div>
                    <div
                        class={`${styles.container_button} ${state.selected.idxs.length <= 1 ? styles.disabled_button : ""}`}
                        title="Undo last action"
                        onClick={distribute}
                    >
                        <i class="nf nf-md-call_split"></i>
                    </div>
                    <div
                        class={styles.container_button}
                        title="Download as JSON"
                        onClick={downloadJson}
                    >
                        <i class="nf nf-md-download"></i>
                    </div>
                    <div
                        id={styles.counter}
                        title="No. of lines"
                    >
                        {state.entries.length}
                    </div>
                </div>
                <div id={styles.settings}>
                    <div>
                        <label for={styles["font-size-input"]}>Font Size</label>
                        <input
                            id={styles["font-size-input"]}
                            type="number"
                            min="0"
                            onInput={handleFontSize}
                            value={state.fontSize}
                        />
                    </div>
                </div>
                <div id="lines">
                    <For each={state.entries}>
                        {(entry, idx) => {
                            return (
                                <Entry
                                    entry={entry}
                                    removeEntry={() =>
                                        wrapper.removeEntry(idx())
                                    }
                                    setContent={(newContent) =>
                                        wrapper.editContent(idx(), newContent)
                                    }
                                />
                            );
                        }}
                    </For>
                </div>
            </div>
        </>
    );
};

export default App;
