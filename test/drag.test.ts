import { describe, it, expect, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";
import { mountMinimap, type Harness } from "./helpers/editor.js";
import { SAMPLE, repeat } from "./fixtures.js";

let h: Harness | undefined;
afterEach(() => {
    h?.destroy();
    h = undefined;
});

/**
 * Records where the drag leaves the scroller, clamping as a real one does.
 *
 * jsdom stores whatever is assigned, so without the clamp a drag that has run
 * off the end of the document reads back as still moving, and a test cannot
 * tell a scroller that has stopped from one that never had a limit.
 */
function recordScroll(view: EditorView) {
    const reached: number[] = [];
    const max = Math.max(
        0,
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
    );
    let value = 0;

    Object.defineProperty(view.scrollDOM, "scrollTop", {
        get: () => value,
        set: (next: number) => {
            value = Math.min(Math.max(next, 0), max);
            reached.push(value);
        },
        configurable: true,
    });

    return reached;
}

function press(el: Element, clientY: number) {
    el.dispatchEvent(
        new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientY,
        }),
    );
}

/**
 * Reports a pointer position and waits for the frame the drag defers to.
 *
 * The handler records the position and schedules the work, so nothing has
 * happened yet when `dispatchEvent` returns.
 */
function move(clientY: number) {
    window.dispatchEvent(
        new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientY,
        }),
    );

    return new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
    );
}

describe("dragging the overlay", () => {
    it("reaches the end of the document when dragged to the bottom", async () => {
        // The bug this covers: the drag worked out its furthest row from a
        // count of unwrapped lines per screen, so anything that made the real
        // count differ left a stretch of the document that no amount of
        // dragging would enter — reachable only by scrolling the editor.
        h = mountMinimap(repeat(SAMPLE, 40));
        const overlay = h.view.dom.querySelector(".cm-minimap-overlay");
        expect(overlay).toBeTruthy();

        const reached = recordScroll(h.view);
        const { scrollHeight, clientHeight } = h.view.scrollDOM;

        press(overlay!, 10);
        await move(10_000);

        expect(reached.length).toBeGreaterThan(0);
        expect(reached[reached.length - 1]).toBeGreaterThanOrEqual(
            scrollHeight - clientHeight,
        );
    });

    it("reaches the start of the document when dragged to the top", async () => {
        h = mountMinimap(repeat(SAMPLE, 40));
        const overlay = h.view.dom.querySelector(".cm-minimap-overlay");

        const reached = recordScroll(h.view);

        press(overlay!, 200);
        await move(-10_000);

        expect(reached[reached.length - 1]).toBe(0);
    });

    it("holds still once the pointer has run past the bottom", async () => {
        // Absolute positioning, not accumulated movement: pushing further past
        // the end must not bank distance against the way back.
        h = mountMinimap(repeat(SAMPLE, 40));
        const overlay = h.view.dom.querySelector(".cm-minimap-overlay");

        const reached = recordScroll(h.view);

        press(overlay!, 10);
        await move(10_000);
        const atEnd = reached[reached.length - 1];
        await move(20_000);

        expect(reached[reached.length - 1]).toBe(atEnd);
    });

    it("asks for nothing at all when no drag is in progress", async () => {
        h = mountMinimap(repeat(SAMPLE, 40));
        const reached = recordScroll(h.view);

        await move(500);

        expect(reached).toEqual([]);
    });
});
