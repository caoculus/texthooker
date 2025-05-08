use std::{collections::BTreeMap, mem};

use leptos::{
    ev,
    html::{Div, Span},
    prelude::*,
    server::codee::string::JsonSerdeCodec,
};
use leptos_meta::{Html, provide_meta_context};
use leptos_use::{storage::use_local_storage, use_active_element, use_event_listener};
use serde::{Deserialize, Serialize};
use web_sys::{
    Element, HtmlElement, KeyboardEvent, MutationObserver, MutationObserverInit, Node,
    js_sys::Array,
    wasm_bindgen::{JsCast as _, closure::Closure},
};

fn main() {
    mount_to_body(App);
}

#[component]
fn App() -> impl IntoView {
    provide_meta_context();

    let (font_size, set_font_size, _) = use_local_storage::<FontSize, JsonSerdeCodec>("font-size");
    let (lines, set_lines, _) = use_local_storage::<LineMap, JsonSerdeCodec>("lines");
    normalize_line_map(set_lines);

    let (undo_stack, set_undo_stack) = signal(UndoStack::new());
    let selected_text = setup_selected_observer();
    setup_mutation_observer(selected_text, lines, set_lines, set_undo_stack);

    let clear = move || {
        let lines = &mut *set_lines.write();
        if lines.is_empty() {
            return;
        }
        let taken = mem::take(lines);
        set_undo_stack
            .write()
            .push_and_clear_redos(UndoEntry::ReplaceAll(taken));
    };
    let undo = move || {
        let undo_stack = &mut set_undo_stack.write();
        let Some(undo_entry) = undo_stack.undos.pop() else {
            return;
        };
        let lines = &mut *set_lines.write();
        let redo_entry = match undo_entry {
            UndoEntry::Add(id, line) => {
                lines.insert(id, line);
                RedoEntry::Remove(id)
            }
            UndoEntry::Remove(id) => {
                let line = lines.remove(&id).unwrap();
                RedoEntry::Add(id, line)
            }
            UndoEntry::Edit(id, old_text) => {
                let line = lines.get_mut(&id).unwrap();
                let new_text = mem::replace(&mut line.text, old_text);
                line.version -= 1;
                RedoEntry::Edit(id, new_text)
            }
            UndoEntry::ReplaceAll(old_lines) => {
                *lines = old_lines;
                RedoEntry::Clear
            }
        };
        undo_stack.redos.push(redo_entry);
    };
    let redo = move || {
        let undo_stack = &mut set_undo_stack.write();
        let Some(redo_entry) = undo_stack.redos.pop() else {
            return;
        };
        let lines = &mut *set_lines.write();
        let undo_entry = match redo_entry {
            RedoEntry::Add(id, line) => {
                lines.insert(id, line);
                UndoEntry::Remove(id)
            }
            RedoEntry::Remove(id) => {
                let line = lines.remove(&id).unwrap();
                UndoEntry::Add(id, line)
            }
            RedoEntry::Edit(id, new_text) => {
                let line = lines.get_mut(&id).unwrap();
                let old_text = mem::replace(&mut line.text, new_text);
                line.version += 1;
                UndoEntry::Edit(id, old_text)
            }
            RedoEntry::Clear => {
                let old_lines = mem::take(lines);
                UndoEntry::ReplaceAll(old_lines)
            }
        };
        undo_stack.undos.push(undo_entry);
    };

    // Undo key
    let (focused, set_focused) = signal(false);
    _ = use_event_listener(document(), ev::keydown, move |ev| {
        if ev.code() == "KeyZ" && ev.ctrl_key() && !ev.shift_key() && !ev.alt_key() && !focused() {
            undo();
        }
    });
    // redo key
    _ = use_event_listener(document(), ev::keydown, move |ev| {
        if ev.code() == "KeyY" && ev.ctrl_key() && !ev.shift_key() && !ev.alt_key() && !focused() {
            redo();
        }
    });
    // Unfocus on esc
    let active_element = use_active_element();
    _ = use_event_listener(document(), ev::keydown, move |ev| {
        let ev = ev.unchecked_ref::<KeyboardEvent>();
        if ev.code() != "Escape" {
            return;
        }
        if let Some(html_el) = active_element().and_then(|el| el.dyn_into::<HtmlElement>().ok()) {
            _ = html_el.blur();
        };
    });

    view! {
        <Html attr:style=move || format!("font-size: {}px", font_size().0) />
        <div id="container">
            <div
                class="container_button"
                id="clear_button"
                title="Clear lines"
                on:click=move |_| clear()
            >
                <i class="nf nf-md-delete"></i>
            </div>
            <div
                class="container_button"
                class:disabled_button=move || undo_stack.read().redos.is_empty()
                title="Redo last action"
                on:click=move |_| redo()
            >
                <i class="nf nf-md-redo"></i>
            </div>
            <div
                class="container_button"
                class:disabled_button=move || undo_stack.read().undos.is_empty()
                title="Undo last action"
                on:click=move |_| undo()
            >
                <i class="nf nf-md-undo"></i>
            </div>
            <div id="counter" title="No. of lines">
                {move || lines.read().len()}
            </div>

        </div>
        <div id="settings">
            <FontControl font_size set_font_size />
        </div>
        <div id="lines">
            <For
                each=lines
                key=|(id, line)| (*id, line.version)
                children=move |(id, line)| {
                    view! {
                        <LineView
                            text=line.text.clone()
                            set_text=move |new_text| {
                                let new_text = new_text.trim();
                                let mut lines = set_lines.write();
                                let line = lines.get_mut(&id).unwrap();
                                if line.text == new_text {
                                    return false;
                                }
                                let old_text = mem::replace(&mut line.text, new_text.to_owned());
                                line.version += 1;
                                set_undo_stack
                                    .write()
                                    .push_and_clear_redos(UndoEntry::Edit(id, old_text));
                                true
                            }
                            remove=move || {
                                let line = set_lines.write().remove(&id).unwrap();
                                set_undo_stack
                                    .write()
                                    .push_and_clear_redos(UndoEntry::Add(id, line));
                            }
                            set_focused
                        />
                    }
                }
            />
            <div class="line_box">
                // zero-width space
                <span class="line_text">{'\u{200b}'}</span>
            </div>
        </div>
    }
}

fn normalize_line_map(set_lines: WriteSignal<LineMap>) {
    let lines = &mut *set_lines.write();
    // compact all the ids together, and reset the versions
    *lines = (0..)
        .zip(
            mem::take(lines)
                .into_values()
                .map(|line| Line { version: 0, ..line }),
        )
        .collect();
}

fn setup_selected_observer() -> ReadSignal<String> {
    let (selected_text, set_selected_text) = signal(String::new());
    let calculate_selected_text = move || -> Option<String> {
        window()
            .get_selection()
            .ok()
            .flatten()
            .filter(|s| s.type_() == "Range")
            .and_then(|s| s.to_string().as_string())
    };

    _ = use_event_listener(document(), ev::selectionchange, move |_| {
        set_selected_text(calculate_selected_text().unwrap_or(String::new()));
    });

    selected_text
}

fn setup_mutation_observer(
    selected_text: ReadSignal<String>,
    lines: Signal<LineMap>,
    set_lines: WriteSignal<LineMap>,
    set_undo_stack: WriteSignal<UndoStack>,
) {
    let body = document().body().unwrap();
    let body_node: Node = body.clone().into();
    let id = StoredValue::new(lines.read_untracked().len());

    let add_entry = move |text: String| {
        let body = document().body().unwrap();
        let at_bottom = window().inner_height().unwrap().unchecked_into_f64()
            + window().scroll_y().unwrap()
            >= body.offset_height() as f64;
        let next_id = id.get_value();
        *id.write_value() += 1;
        set_lines.write().insert(next_id, Line::new(text));
        set_undo_stack
            .write()
            .push_and_clear_redos(UndoEntry::Remove(next_id));

        request_animation_frame(move || {
            if at_bottom {
                window().scroll_to_with_x_and_y(0.0, body.scroll_height() as f64);
            }
        });
    };

    let callback = Closure::<dyn Fn(Array, MutationObserver)>::new(move |array: Array, _| {
        array
            .to_vec()
            .into_iter()
            .map(|v| v.unchecked_into::<web_sys::MutationRecord>())
            .filter(|record| {
                let Some(target) = record.target() else {
                    return false;
                };
                target == body_node && record.type_() == "childList"
            })
            .flat_map(|record| {
                let added_nodes = record.added_nodes();
                (0..added_nodes.length()).map(move |i| added_nodes.get(i).expect("in bounds"))
            })
            .filter(|node| node.node_name() == "P")
            .for_each(|node| {
                node.unchecked_ref::<Element>().remove();
                let text = node.text_content().expect("has text content");
                let text = text.trim();
                if text.is_empty() {
                    return;
                }

                let is_page_text =
                    normalize_line_endings::normalized(selected_text.read_untracked().chars())
                        .eq(normalize_line_endings::normalized(text.chars()));
                if !is_page_text {
                    add_entry(text.to_owned());
                }
            });
    });

    let options = MutationObserverInit::new();
    options.set_child_list(true);
    _ = MutationObserver::new(callback.as_ref().unchecked_ref())
        .expect("callback is valid")
        .observe_with_options(&body, &options);

    StoredValue::new_local(callback);
}

type Id = usize;
type Version = usize;
type LineMap = BTreeMap<Id, Line>;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Line {
    version: Version,
    text: String,
}

impl Line {
    fn new(text: String) -> Self {
        Self { version: 0, text }
    }
}

struct UndoStack {
    undos: Vec<UndoEntry>,
    redos: Vec<RedoEntry>,
}

impl UndoStack {
    fn new() -> Self {
        Self {
            undos: vec![],
            redos: vec![],
        }
    }

    fn push_and_clear_redos(&mut self, entry: UndoEntry) {
        self.undos.push(entry);
        self.redos.clear();
    }
}

enum UndoEntry {
    Add(Id, Line),
    Remove(Id),
    Edit(Id, String),
    ReplaceAll(LineMap),
}

enum RedoEntry {
    Add(Id, Line),
    Remove(Id),
    Edit(Id, String),
    Clear,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct FontSize(u32);

impl Default for FontSize {
    fn default() -> Self {
        FontSize(26)
    }
}

#[component]
fn FontControl(font_size: Signal<FontSize>, set_font_size: WriteSignal<FontSize>) -> impl IntoView {
    view! {
        <div id="font-size-container">
            <label for="font-size-input">Font Size</label>
            <input
                id="font-size-input"
                type="number"
                min="0"
                on:input=move |ev| {
                    set_font_size(FontSize(event_target_value(&ev).parse().expect("valid integer")))
                }
                prop:value=move || font_size().0
            />
        </div>
    }
}

#[component]
fn LineView(
    text: String,
    mut set_text: impl (FnMut(String) -> bool) + 'static,
    remove: impl Fn() + 'static,
    set_focused: WriteSignal<bool>,
) -> impl IntoView {
    let text = StoredValue::new(text);
    let box_el = NodeRef::<Div>::new();
    let line_el = NodeRef::<Span>::new();
    let on_edit = move |_| {
        set_focused(true);
        let target = line_el.get().unwrap();
        target.set_content_editable("true");
        _ = target.focus();
    };
    let on_unfocus = move |_| {
        set_focused(false);
        let target = line_el.get().unwrap();
        target.set_content_editable("false");
        let changed = set_text(target.inner_text());
        if !changed {
            target.set_inner_text(text.read_value().as_str());
        }
    };
    view! {
        <div node_ref=box_el class="line_box">
            <span node_ref=line_el class="line_text" on:focusout=on_unfocus>
                {text.get_value()}
            </span>
            <div class="line_button" on:click=on_edit>
                "🖉"
            </div>
            <div class="line_button" on:click=move |_| remove()>
                "×"
            </div>
        </div>
    }
}
