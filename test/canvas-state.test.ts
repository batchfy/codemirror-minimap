import { describe, it, expect, afterEach } from "vitest";
import { javascript } from "@codemirror/lang-javascript";
import { EditorSelection } from "@codemirror/state";
import { setDiagnostics } from "@codemirror/lint";
import { mountMinimap, type Harness } from "./helpers/editor.js";
import { SAMPLE } from "./fixtures.js";

let h: Harness | undefined;
afterEach(() => {
    h?.destroy();
    h = undefined;
});

describe("canvas lifecycle", () => {
    it("reallocates the backing buffer only when the size changes", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        const { width, height } = h.context.canvas;
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);

        // A same-size render must clear rather than resize, since assigning
        // width/height reallocates the buffer and resets all context state.
        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(3) });

        expect(h.context.count("clearRect")).toBe(1);
        expect(h.context.canvas.width).toBe(width);
        expect(h.context.canvas.height).toBe(height);
    });

    it("starts every render fully opaque", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        // Faded layers (blocks mode, diagnostics) leave globalAlpha < 1 behind.
        // Resizing used to reset it incidentally; now that the resize is
        // conditional, each render must reset it itself or the text renders grey.
        for (let i = 1; i <= 5; i++) {
            h.context.reset();
            h.view.dispatch({ selection: EditorSelection.single(i) });

            expect(h.context.count("fillText")).toBeGreaterThan(0);
            expect(h.context.valueAt("globalAlpha", "fillText", 0)).toBe(1);
        }
    });

    it("resets opacity before painting anything", () => {
        // Blocks mode legitimately fades its own rects, so the invariant is not
        // "every paint is opaque" but "the frame starts opaque" -- the reset
        // must land before the first paint of the render.
        h = mountMinimap(SAMPLE, [javascript()], {
            config: { displayText: "blocks" },
        });

        h.view.dispatch({ selection: EditorSelection.single(1) });

        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(2) });

        const reset = h.context.calls.findIndex(
            (c) => c.op === "set:globalAlpha" && c.args[0] === 1,
        );
        const paint = h.context.calls.findIndex(
            (c) => c.op === "fill" || c.op === "fillText",
        );

        expect(paint).toBeGreaterThanOrEqual(0);
        expect(reset).toBeGreaterThanOrEqual(0);
        expect(reset).toBeLessThan(paint);
    });

    it("does not inherit faded diagnostics opacity into the next frame", () => {
        // diagnostics.ts sets globalAlpha to 0.65 and its restore is commented
        // out, so without a per-render reset the following frame draws its text
        // at 65% opacity.
        h = mountMinimap(SAMPLE, [javascript()]);

        h.view.dispatch(
            setDiagnostics(h.view.state, [
                { from: 0, to: 6, severity: "error", message: "boom" },
            ]),
        );

        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(2) });

        // Every line after the diagnostic's line is affected, not just the
        // first, so check the opacity of the whole frame's text.
        const alphas = h.context.valuesAt("globalAlpha", "fillText");
        expect(alphas.length).toBeGreaterThan(1);
        expect(alphas.filter((a) => a !== 1)).toEqual([]);
    });

    it("resizes when the editor height changes", () => {
        h = mountMinimap(SAMPLE, [javascript()]);
        const before = h.context.canvas.height;

        h.view.dom.getBoundingClientRect = () => ({
            width: 800,
            height: 900,
            top: 0,
            left: 0,
            right: 800,
            bottom: 900,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(2) });

        expect(h.context.canvas.height).not.toBe(before);
        // A resize clears implicitly, so no explicit clearRect is needed.
        expect(h.context.count("clearRect")).toBe(0);
    });
});
