import { describe, it, expect, afterEach } from "vitest";
import { javascript } from "@codemirror/lang-javascript";
import { EditorSelection } from "@codemirror/state";
import { mountMinimap, type Harness } from "./helpers/editor.js";
import { SAMPLE } from "./fixtures.js";

let h: Harness | undefined;
afterEach(() => {
    h?.destroy();
    h = undefined;
});

describe("rendering", () => {
    it("draws text left to right along a line", () => {
        h = mountMinimap("const alpha = 1;\n", [javascript()]);

        const xs = h.context
            .ops("fillText")
            .map((c) => c.args[1] as number)
            .slice(0, 3);

        expect(xs.length).toBeGreaterThan(0);
        for (let i = 1; i < xs.length; i++) {
            expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
        }
    });

    it("draws blocks instead of text in blocks mode", () => {
        h = mountMinimap(SAMPLE, [javascript()], {
            config: { displayText: "blocks" },
        });

        expect(h.context.count("fillText")).toBe(0);
        expect(h.context.count("rect")).toBeGreaterThan(0);
    });

    it("offsets text to make room for gutters", () => {
        const plain = mountMinimap("const alpha = 1;\n", [javascript()]);
        const firstPlain = plain.context.ops("fillText")[0]?.args[1] as number;
        plain.destroy();

        h = mountMinimap("const alpha = 1;\n", [javascript()], {
            config: { gutters: [{ 1: "#ff0000" }] },
        });
        const firstGutter = h.context.ops("fillText")[0]?.args[1] as number;

        expect(firstGutter).toBeGreaterThan(firstPlain);
    });

    it("paints a selection rectangle when text is selected", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(0, 40) });

        expect(h.context.count("rect")).toBeGreaterThan(0);
    });

    it("stops drawing at the end of the document", () => {
        h = mountMinimap("only one line\n", [javascript()]);
        // Two lines exist (the trailing newline), so the canvas must not be
        // filled with draws for the empty space below them.
        expect(h.context.count("fillText")).toBeLessThanOrEqual(2);
    });

    it("survives a destroy without leaking font listeners", () => {
        h = mountMinimap(SAMPLE, [javascript()]);
        const view = h.view;
        expect(() => view.destroy()).not.toThrow();
        h = undefined;
    });
});

describe("minimap width", () => {
    // The canvas is oversampled, so its pixel width is the CSS width times
    // Scale.PixelMultiplier (2).
    const OVERSAMPLE = 2;

    it("defaults to 120px in a wide editor", () => {
        h = mountMinimap(SAMPLE, [javascript()], { width: 2000 });
        expect(h.context.canvas.width).toBe(120 * OVERSAMPLE);
    });

    it("honours a configured width", () => {
        h = mountMinimap(SAMPLE, [javascript()], {
            width: 2000,
            config: { width: 240 },
        });
        expect(h.context.canvas.width).toBe(240 * OVERSAMPLE);
    });

    it("shows more characters per line when wider", () => {
        const narrow = mountMinimap(SAMPLE, [javascript()], {
            width: 2000,
            config: { width: 60 },
        });
        const narrowWidth = narrow.context.canvas.width;
        narrow.destroy();

        h = mountMinimap(SAMPLE, [javascript()], {
            width: 2000,
            config: { width: 240 },
        });

        expect(h.context.canvas.width).toBeGreaterThan(narrowWidth);
    });

    it("shrinks proportionally when the editor is narrow", () => {
        // 120 * WIDTH_RATIO (6) = 720, so a 360px editor halves the minimap.
        h = mountMinimap(SAMPLE, [javascript()], { width: 360 });
        expect(h.context.canvas.width).toBe(60 * OVERSAMPLE);
    });

    it("scales the shrink threshold with the configured width", () => {
        // 200 * 6 = 1200, so a 600px editor halves a 200px minimap.
        h = mountMinimap(SAMPLE, [javascript()], {
            width: 600,
            config: { width: 200 },
        });
        expect(h.context.canvas.width).toBe(100 * OVERSAMPLE);
    });
});
