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

/**
 * Every `getComputedStyle` is preceded by a mock element being inserted into
 * `contentDOM`, so in a browser each one forces a style recalc. These tests pin
 * that cost to "once per distinct token style" rather than "once per frame".
 */
describe("font metric caching", () => {
    it("does not re-measure styles on selection-only renders", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        // Warm every lazily-measured style, including the selection colour,
        // which is only resolved once a selection actually intersects a line.
        h.view.dispatch({ selection: EditorSelection.single(0, 1) });
        const warm = h.style.count;
        expect(warm).toBeGreaterThan(0);

        for (let i = 2; i <= 40; i++) {
            h.view.dispatch({ selection: EditorSelection.single(0, i) });
        }

        expect(h.style.count).toBe(warm);
    });

    it("keeps drawing text across those renders", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        h.context.reset();
        h.view.dispatch({ selection: EditorSelection.single(0, 5) });

        expect(h.context.count("fillText")).toBeGreaterThan(0);
    });

    it("measures a bounded number of styles regardless of document length", () => {
        const short = mountMinimap(SAMPLE, [javascript()]);
        const shortCount = short.style.count;
        short.destroy();

        const long = mountMinimap(SAMPLE.repeat(20), [javascript()]);
        const longCount = long.style.count;
        long.destroy();

        // Cost tracks distinct token styles, not lines drawn.
        expect(longCount).toBeLessThanOrEqual(shortCount * 2);
    });

    it("re-measures when the theme changes", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        const before = h.style.count;
        h.view.dom.classList.add("cm-theme-dark");
        h.view.dispatch({ selection: EditorSelection.single(1) });

        expect(h.style.count).toBeGreaterThan(before);
    });

    it("ignores cm-focused when deciding the theme changed", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        const before = h.style.count;
        h.view.dom.classList.add("cm-focused");
        h.view.dispatch({ selection: EditorSelection.single(1) });

        expect(h.style.count).toBe(before);
    });
});
