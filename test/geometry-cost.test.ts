import { describe, it, expect, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";
import { mountMinimap, type Harness } from "./helpers/editor.js";
import { readGeometry, setRowHeight } from "../src/geometry.js";
import { SAMPLE, repeat } from "./fixtures.js";

let h: Harness | undefined;
afterEach(() => {
    h?.destroy();
    h = undefined;
});

/**
 * Counts the two things reading the geometry costs: the layout reads behind
 * `view.dom`, `view.scrollDOM` and `view.documentTop`, each a forced reflow in
 * a browser, and the height-map queries the two bisections make.
 */
function countReads(view: EditorView) {
    const counts = { rects: 0, lineBlockAt: 0 };

    for (const el of [view.dom, view.scrollDOM, view.contentDOM]) {
        const original = el.getBoundingClientRect.bind(el);
        el.getBoundingClientRect = () => {
            counts.rects++;
            return original();
        };
    }

    const original = view.lineBlockAt.bind(view);
    view.lineBlockAt = (pos: number) => {
        counts.lineBlockAt++;
        return original(pos);
    };

    return counts;
}

describe("geometry measurement", () => {
    it("measures once per update, not once per reader", () => {
        // The overlay and the renderer both draw every update and both need the
        // geometry. Measuring it twice would pay for every layout read and both
        // bisections twice over, on every keystroke.
        h = mountMinimap(repeat(SAMPLE, 40));
        const counts = countReads(h.view);

        h.view.dispatch({ changes: { from: 0, insert: "x" } });

        // Three of the reads are the measurement; the rest belong to the
        // renderer sizing its canvas. A second measurement would add three more
        // and double the height-map queries.
        expect(counts.rects).toBeLessThanOrEqual(4);
        expect(counts.lineBlockAt).toBeLessThanOrEqual(24);
    });

    it("keeps the height-map queries logarithmic in the document", () => {
        // Two bisections, so the count grows with the log of the line count
        // rather than with the line count.
        const measure = (times: number) => {
            const harness = mountMinimap(repeat(SAMPLE, times));
            const counts = countReads(harness.view);
            harness.view.dispatch({ changes: { from: 0, insert: "x" } });
            harness.destroy();
            return counts.lineBlockAt;
        };

        const small = measure(1);
        const large = measure(400);

        // A hundredfold more lines, but nothing like a hundredfold more work.
        expect(large).toBeLessThan(small * 4);
    });

    it("hands the same token the same answer", () => {
        h = mountMinimap(repeat(SAMPLE, 40));
        const token = {};

        expect(readGeometry(h.view, token)).toBe(readGeometry(h.view, token));
    });

    it("measures afresh for a caller with no moment to name", () => {
        h = mountMinimap(repeat(SAMPLE, 40));

        expect(readGeometry(h.view)).not.toBe(readGeometry(h.view));
    });

    it("measures again once the row height changes", () => {
        // The renderer measures the row height off the theme and shares it
        // through `setRowHeight`. Answering from a measurement taken before the
        // change would put the overlay on a grid the rows are no longer drawn
        // on, for as long as the token lived.
        h = mountMinimap(repeat(SAMPLE, 40));
        const token = {};

        const before = readGeometry(h.view, token);
        setRowHeight(h.view, before.lineHeight * 8);
        const after = readGeometry(h.view, token);

        expect(after.lineHeight).not.toBe(before.lineHeight);
    });
});

/**
 * Detaches the scroller so that a drag's own cost can be seen.
 *
 * Writing to `scrollTop` sets the minimap redrawing, which measures the layout
 * for its own reasons; holding the value in a plain property keeps that out of
 * the count.
 */
function detachScroller(view: EditorView) {
    let value = 0;
    Object.defineProperty(view.scrollDOM, "scrollTop", {
        get: () => value,
        set: (next: number) => {
            value = next;
        },
        configurable: true,
    });
}

function grab(view: EditorView, clientY: number) {
    view.dom.querySelector(".cm-minimap-overlay")?.dispatchEvent(
        new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientY,
        }),
    );
}

function report(clientY: number) {
    window.dispatchEvent(
        new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientY,
        }),
    );
}

const nextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe("dragging cost", () => {
    /** What one frame of a drag costs, given `reports` pointer positions. */
    async function frameCost(reports: number) {
        const harness = mountMinimap(repeat(SAMPLE, 400));
        detachScroller(harness.view);
        const counts = countReads(harness.view);

        grab(harness.view, 20);
        const before = { ...counts };

        for (let i = 0; i < reports; i++) {
            report(100 + i);
        }

        const beforeFrame = { ...counts };
        await nextFrame();
        harness.destroy();

        return {
            beforeFrame: beforeFrame.rects - before.rects,
            rects: counts.rects - before.rects,
            lineBlockAt: counts.lineBlockAt - before.lineBlockAt,
        };
    }

    it("does nothing until the frame it deferred to", async () => {
        const cost = await frameCost(40);

        expect(cost.beforeFrame).toBe(0);
    });

    it("costs the same for forty pointer reports as for one", async () => {
        // The property that makes a drag cheap: a trackpad reporting faster
        // than the screen refreshes cannot make it do more work, because the
        // extra reports could not have reached the screen anyway.
        const one = await frameCost(1);
        const many = await frameCost(40);

        expect(many.rects).toBe(one.rects);
        expect(many.lineBlockAt).toBe(one.lineBlockAt);
    });

    it("costs a settled drag one height-map query and nothing else", async () => {
        // Measured as what a frame carrying a pointer report costs over one
        // that carries none, so that CodeMirror's own measuring — which
        // happens either way — is not counted as the drag's.
        //
        // What is left is the one thing a drag cannot do without: turning a row
        // into a scroll position, which only the height map can answer. Every
        // other number it needs was measured when the drag began, and the two
        // boxes it reads belong to the overlay and its container, neither of
        // which is the editor.
        const settled = async (moveInSecondFrame: boolean) => {
            const harness = mountMinimap(repeat(SAMPLE, 400));
            detachScroller(harness.view);
            const counts = countReads(harness.view);

            grab(harness.view, 20);
            report(100);
            await nextFrame();

            const before = { ...counts };
            if (moveInSecondFrame) {
                report(160);
            }
            await nextFrame();
            harness.destroy();

            return {
                rects: counts.rects - before.rects,
                lineBlockAt: counts.lineBlockAt - before.lineBlockAt,
            };
        };

        const moved = await settled(true);
        const still = await settled(false);

        expect(moved.rects - still.rects).toBe(0);
        expect(moved.lineBlockAt - still.lineBlockAt).toBeLessThanOrEqual(1);
    });
});

describe("the minimap is not text", () => {
    it("does not let a click on it start a selection drag", () => {
        // The minimap is a sibling of `.cm-content` inside the scroller, so an
        // unhandled mousedown there starts a native selection that runs until
        // the button comes up — showing a caret for the whole drag and leaving
        // a selection in the document behind it.
        h = mountMinimap(repeat(SAMPLE, 40));
        const overlay = h.view.dom.querySelector(".cm-minimap-overlay");

        expect(overlay).toBeTruthy();

        const event = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientY: 40,
        });
        overlay?.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("does not let a click elsewhere on it start one either", () => {
        h = mountMinimap(repeat(SAMPLE, 40));
        const container = h.view.dom.querySelector(
            ".cm-minimap-overlay-container",
        );

        const event = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientY: 300,
        });
        container?.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("leaves a right click alone", () => {
        // Context menus are the browser's business.
        h = mountMinimap(repeat(SAMPLE, 40));
        const overlay = h.view.dom.querySelector(".cm-minimap-overlay");

        const event = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 2,
        });
        overlay?.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });
});
