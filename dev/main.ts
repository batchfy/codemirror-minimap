import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { showMinimap } from "../src/index.js";
import { SAMPLE } from "./sample.js";

const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;

const minimapCompartment = new Compartment();
const themeCompartment = new Compartment();

/** Long enough out of the box that the document scrolls and the minimap
 *  overlay can actually be dragged. */
const DEFAULT_MULTIPLIER = 20;

function minimapExtension() {
    const gutters = $<HTMLInputElement>("gutters").checked
        ? [{ 3: "#e5534b", 7: "#3fb950", 12: "#d29922" }]
        : undefined;

    return showMinimap.compute([], () => ({
        create: () => ({ dom: document.createElement("div") }),
        displayText: $<HTMLSelectElement>("displayText").value as
            "blocks" | "characters",
        showOverlay: $<HTMLSelectElement>("showOverlay").value as
            "always" | "mouse-over",
        autohide: $<HTMLInputElement>("autohide").checked,
        gutters,
        width: Number($<HTMLInputElement>("width").value),
        hideScrollbar: $<HTMLInputElement>("hideScrollbar").checked,
    }));
}

function docFor(multiplier: number) {
    return Array.from({ length: multiplier }, () => SAMPLE).join("\n");
}

const view = new EditorView({
    state: EditorState.create({
        doc: docFor(DEFAULT_MULTIPLIER),
        extensions: [
            basicSetup,
            javascript(),
            themeCompartment.of([]),
            minimapCompartment.of(minimapExtension()),
        ],
    }),
    parent: $("editor"),
});

function reconfigureMinimap() {
    view.dispatch({
        effects: minimapCompartment.reconfigure(minimapExtension()),
    });
}

for (const id of [
    "displayText",
    "showOverlay",
    "autohide",
    "gutters",
    "hideScrollbar",
]) {
    $(id).addEventListener("change", reconfigureMinimap);
}

$("width").addEventListener("input", (e) => {
    const px = (e.target as HTMLInputElement).value;
    $("widthValue").textContent = `${px}px`;
    reconfigureMinimap();
});

/**
 * Switches the editor theme and the surrounding page together, so the minimap
 * is always judged against a matching background. Swapping themes also
 * exercises the font-metric cache invalidation: if the minimap keeps its old
 * colours here, the cache failed to clear.
 */
$("theme").addEventListener("change", (e) => {
    const dark = (e.target as HTMLSelectElement).value === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    view.dispatch({
        effects: themeCompartment.reconfigure(dark ? oneDark : []),
    });
});

$("size").addEventListener("change", (e) => {
    const multiplier = Number((e.target as HTMLSelectElement).value);
    view.dispatch({
        changes: {
            from: 0,
            to: view.state.doc.length,
            insert: docFor(multiplier),
        },
    });
});

$("diagnostics").addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    const diagnostics: Diagnostic[] = on
        ? [
              { from: 0, to: 6, severity: "error", message: "example error" },
              {
                  from: 60,
                  to: 66,
                  severity: "warning",
                  message: "example warning",
              },
          ]
        : [];
    view.dispatch(setDiagnostics(view.state, diagnostics));
});

/**
 * Reproduces the reported slow path: hold a selection open and keep extending
 * it, which re-renders the minimap on every keystroke without changing the doc.
 */
$("stress").addEventListener("click", () => {
    const readout = $("readout");
    const iterations = 200;
    const limit = view.state.doc.length;

    const start = performance.now();
    for (let i = 1; i <= iterations; i++) {
        view.dispatch({
            selection: EditorSelection.single(0, (i % (limit - 1)) + 1),
        });
    }
    const total = performance.now() - start;

    readout.textContent =
        `${iterations} renders in ${total.toFixed(0)}ms ` +
        `(${(total / iterations).toFixed(2)}ms each), ` +
        `${view.state.doc.lines} lines`;
});
