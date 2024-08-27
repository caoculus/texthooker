import { createEffect, createSignal, For, Show, type Component } from 'solid-js';

import styles from './App.module.css';

import { Dictionary } from "typescript-collections";
import { createMutable, createStore } from 'solid-js/store';
import { State, StateWrapper, UpdateType } from './State';

function registerLocalStorage<T>(name: string, get: () => T, set: (value: string) => void): void {
    const value = localStorage.getItem(name);
    if (value !== null) {
        set(value);
    }
    createEffect(() => {
        localStorage.setItem(name, JSON.stringify(get()))
    })
}

type EntryProps = {
    label: string,
    content: () => string,
    removeEntry: () => void,
    setContent: (content: string) => void,
};
const Entry: Component<EntryProps> = ({ label, content, removeEntry, setContent }: EntryProps) => {
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
        setContent(label);
    };
    const contentVisible = () => {
        return focused() || label == content();
    };

    return (
        <div ref={boxRef!} class={styles.line_box}>
            <span class={styles.line_label}>{label}</span>
            <div class={styles.line_button} onClick={onEdit}>
                🖉
            </div>
            <div class={styles.line_button} onClick={removeEntry}>
                ×
            </div>
            <br />
            <Show when={contentVisible}>
                <span ref={contentRef!} class={styles.line_content} onFocusOut={onFocusOut} onClick={onEdit}>
                    {content()}
                </span>
                <div class={styles.line_button} onClick={revertContent}>
                    ↶
                </div>
            </Show>
        </div >
    );
};

const App: Component = () => {
    const [state, setState] = createStore<State>({
        entries: createMutable(new Dictionary()),
        fontSize: 26,
        undoStack: [],
        redoStack: [],
        selected: { text: "", ids: [] },
        nextId: 0,
    });

    registerLocalStorage("entries", () => state.entries, (s) => {
        const obj = JSON.parse(s);
        setState("entries", Object.create(Dictionary.prototype, Object.getOwnPropertyDescriptors(obj)));
    });
    registerLocalStorage("fontSize", () => state.fontSize, (s) => {
        setState("fontSize", JSON.parse(s));
    })

    const wrapper = new StateWrapper(state, setState);
    wrapper.normalizeState();
    wrapper.setupObserver();

    const handleFontSize = (e: InputEvent) => {
        setState("fontSize", Number.parseInt((e.target! as HTMLInputElement).value))
    };
    const undo = () => {
        wrapper.updateWithStack("undoStack", "redoStack");
    };
    const redo = () => {
        wrapper.updateWithStack("redoStack", "undoStack");
    };
    const downloadJson = () => {
        const entries = state.entries.values().map((entry) => JSON.stringify(entry));
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
        setState("selected", wrapper.calcSelection() ?? { text: "", ids: [] });
    });

    return (
        <>
            <div style={`font-size: ${state.fontSize}px`}>
                <div class={styles.container}>
                    <div class={styles.container_button} id="clear_button" title="Clear localStorage" onClick={() => wrapper.clearEntries()}>
                        <i class="nf nf-md-delete"></i>
                    </div>
                    <div class={`${styles.container_button} ${state.redoStack.length === 0 ? styles.disabled_button : ""}`} title="Redo last action" onClick={redo}>
                        <i class="nf nf-md-redo"></i>
                    </div>
                    <div class={`${styles.container_button} ${state.undoStack.length === 0 ? styles.disabled_button : ""}`} title="Undo last action" onClick={undo}>
                        <i class="nf nf-md-undo"></i>
                    </div>
                    <div class={`${styles.container_button} ${state.selected.ids.length <= 1 ? styles.disabled_button : ""}`} title="Undo last action" onClick={distribute}>
                        <i class="nf nf-md-call_split"></i>
                    </div>
                    <div class={styles.container_button} title="Download as JSON" onClick={downloadJson}>
                        <i class="nf nf-md-download"></i>
                    </div>
                    <div id={styles.counter} title="No. of lines">
                        {state.entries.size()}
                    </div>
                    <div id={styles.settings}>
                        <div>
                            <label for="font-size-input">Font Size</label>
                            <input
                                id="font-size-input"
                                type="number"
                                min="0"
                                onInput={handleFontSize}
                                value={state.fontSize}
                            />
                        </div>
                    </div>
                    <div id="lines">
                        <For each={state.entries.keys()}>{(id) => {
                            console.log("For component");
                            const label = state.entries.getValue(id)!.label;
                            const content = () => state.entries.getValue(id)!.content;
                            return <Entry label={label} content={content} removeEntry={() => wrapper.removeEntry(id)} setContent={(newContent) => setState("entries", (entries) => {
                                entries.getValue(id)!.content = newContent;
                                return { ...entries };
                            })} />
                        }}</For>
                    </div>
                </div>
            </div>
        </>
    );
};

export default App;
