import { bench, describe } from "vitest";
import { javascript } from "@codemirror/lang-javascript";
import { EditorSelection } from "@codemirror/state";
import { mountMinimap } from "./helpers/editor.js";
import { SAMPLE } from "./fixtures.js";

/**
 * These measure the JS-side cost of an update + render only. The canvas is a
 * recording stub and `getComputedStyle` is stubbed, so the browser's real
 * rasterisation and style-recalc costs are absent -- treat the numbers as a
 * relative regression signal, not as frame timings. The deterministic
 * counterpart to these is the style-recalc counting in font-cache.test.ts.
 */

const SMALL = SAMPLE;
const LARGE = SAMPLE.repeat(40);

describe("selection-only render", () => {
    const small = mountMinimap(SMALL, [javascript()]);
    let n = 0;

    bench("small document (~25 lines)", () => {
        small.view.dispatch({
            selection: EditorSelection.single(0, (n++ % 200) + 1),
        });
    });
});

describe("selection-only render, large document", () => {
    const large = mountMinimap(LARGE, [javascript()]);
    let n = 0;

    bench("large document (~1000 lines)", () => {
        large.view.dispatch({
            selection: EditorSelection.single(0, (n++ % 200) + 1),
        });
    });
});

describe("edit render", () => {
    const edit = mountMinimap(SMALL, [javascript()]);

    bench("insert a character (re-parses and re-highlights)", () => {
        edit.view.dispatch({ changes: { from: 0, insert: "x" } });
    });
});
