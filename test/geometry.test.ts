import { describe, it, expect } from "vitest";
import {
    computeLayout,
    rowAtOverlayTop,
    rowAtPos,
    rowAtY,
    type Geometry,
    type LayoutInput,
} from "../src/geometry.js";
import type { Lines } from "../src/LinesState.js";

/** A minimap 400px tall over a document of `rowCount` rows, 2px each. */
function input(overrides: Partial<LayoutInput> = {}): LayoutInput {
    return {
        rowCount: 1000,
        lineHeight: 2,
        paddingTop: 4,
        paddingBottom: 4,
        height: 400,
        firstVisibleRow: 0,
        lastVisibleRow: 39,
        rowsPerScreen: 40,
        ...overrides,
    };
}

/** Where the layout puts the given row inside the visible minimap. */
const rowTop = (
    layout: ReturnType<typeof computeLayout>,
    i: LayoutInput,
    row: number,
) => i.paddingTop + row * i.lineHeight - layout.scrollTop;

describe("computeLayout", () => {
    it("covers exactly the rows on screen", () => {
        const i = input({ firstVisibleRow: 500, lastVisibleRow: 539 });
        const layout = computeLayout(i);

        expect(layout.overlayTop).toBeCloseTo(rowTop(layout, i, 500));
        expect(layout.overlayHeight).toBeCloseTo(40 * i.lineHeight);
    });

    it("keeps covering them when the lines on screen wrap", () => {
        // Wrapped lines put far fewer document lines on screen; the overlay has
        // to shrink to those lines rather than to a share of the scroll range.
        const i = input({ firstVisibleRow: 500, lastVisibleRow: 508 });
        const layout = computeLayout(i);

        expect(layout.overlayHeight).toBeCloseTo(9 * i.lineHeight);
        expect(layout.overlayTop).toBeCloseTo(rowTop(layout, i, 500));
    });

    it("does not scroll the rows while they all fit", () => {
        const i = input({
            rowCount: 100,
            firstVisibleRow: 30,
            lastVisibleRow: 69,
        });
        const layout = computeLayout(i);

        expect(layout.scrollTop).toBe(0);
        expect(layout.overlayTop).toBeCloseTo(i.paddingTop + 30 * i.lineHeight);
    });

    it("pins the overlay to the top at the start of the document", () => {
        const layout = computeLayout(
            input({ firstVisibleRow: 0, lastVisibleRow: 39 }),
        );

        expect(layout.scrollTop).toBe(0);
        expect(layout.overlayTop).toBeCloseTo(4);
    });

    it("pins the overlay to the bottom at the end of the document", () => {
        const i = input({ firstVisibleRow: 960, lastVisibleRow: 999 });
        const layout = computeLayout(i);

        expect(layout.scrollTop).toBeCloseTo(layout.contentHeight - i.height);
        expect(layout.overlayTop + layout.overlayHeight).toBeCloseTo(
            i.height - i.paddingBottom,
        );
    });

    it("stays inside the minimap at every scroll position", () => {
        for (let first = 0; first <= 960; first += 7) {
            const i = input({
                firstVisibleRow: first,
                lastVisibleRow: first + 39,
            });
            const layout = computeLayout(i);

            expect(layout.overlayTop).toBeGreaterThanOrEqual(0);
            expect(
                layout.overlayTop + layout.overlayHeight,
            ).toBeLessThanOrEqual(i.height + 0.001);
            expect(layout.scrollTop).toBeGreaterThanOrEqual(0);
            expect(layout.scrollTop).toBeLessThanOrEqual(
                layout.contentHeight - i.height,
            );
        }
    });

    it("puts the overlay on its own rows at every scroll position", () => {
        // The property the whole layout exists for: wherever the rows end up,
        // the overlay is drawn over the ones the editor is showing.
        for (let first = 0; first <= 990; first += 3) {
            const i = input({
                firstVisibleRow: first,
                lastVisibleRow: Math.min(999, first + 12),
            });
            const layout = computeLayout(i);

            expect(layout.overlayTop).toBeCloseTo(rowTop(layout, i, first));
        }
    });

    it("advances the overlay monotonically through the document", () => {
        let previous = -Infinity;
        for (let first = 0; first <= 960; first += 4) {
            const layout = computeLayout(
                input({ firstVisibleRow: first, lastVisibleRow: first + 39 }),
            );
            const position = layout.scrollTop + layout.overlayTop;

            expect(position).toBeGreaterThan(previous);
            previous = position;
        }
    });

    it("does not pull the rows back when the lines on screen start wrapping", () => {
        // A screen of code holds forty rows, a screen of wrapped prose nine.
        // Scrolling from one into the other moves forwards by a single row, so
        // the rows underneath must not slide backwards to meet it.
        const code = computeLayout(
            input({ firstVisibleRow: 500, lastVisibleRow: 539 }),
        );
        const prose = computeLayout(
            input({ firstVisibleRow: 501, lastVisibleRow: 509 }),
        );

        expect(prose.scrollTop).toBeGreaterThanOrEqual(code.scrollTop);
    });

    it("advances monotonically however the lines on screen wrap", () => {
        let previousScroll = -Infinity;
        let previousRow = -Infinity;

        for (let first = 0; first <= 960; first += 4) {
            // Wrapping thick enough to swing the rows on screen from 40 to 9,
            // alternating so that every step changes it.
            const onScreen = first % 8 === 0 ? 40 : 9;
            const layout = computeLayout(
                input({
                    firstVisibleRow: first,
                    lastVisibleRow: first + onScreen - 1,
                }),
            );

            expect(layout.scrollTop).toBeGreaterThanOrEqual(previousScroll);
            expect(layout.scrollTop + layout.overlayTop).toBeGreaterThan(
                previousRow,
            );

            previousScroll = layout.scrollTop;
            previousRow = layout.scrollTop + layout.overlayTop;
        }
    });

    it("gives up the overlay's height rather than overflow a short minimap", () => {
        const layout = computeLayout(
            input({ height: 20, firstVisibleRow: 0, lastVisibleRow: 39 }),
        );

        expect(layout.overlayHeight).toBe(20);
        expect(layout.overlayTop).toBe(0);
    });

    it("survives a document with a single row", () => {
        const layout = computeLayout(
            input({ rowCount: 1, firstVisibleRow: 0, lastVisibleRow: 0 }),
        );

        expect(layout.scrollTop).toBe(0);
        expect(layout.overlayTop).toBeCloseTo(4);
        expect(layout.overlayHeight).toBeCloseTo(2);
    });

    it("clamps a visible range that runs past the end of the document", () => {
        const layout = computeLayout(
            input({ rowCount: 10, firstVisibleRow: 20, lastVisibleRow: 60 }),
        );

        expect(layout.overlayTop).toBeCloseTo(4 + 9 * 2);
        expect(layout.overlayHeight).toBeCloseTo(2);
    });
});

describe("rowAtPos", () => {
    /** One row per line, each line ten characters long. */
    const lines: Lines = Array.from({ length: 20 }, (_, i) => [
        { from: i * 10, to: i * 10 + 9, folded: false },
    ]);

    it("finds the row a position sits on", () => {
        expect(rowAtPos(lines, 0)).toBe(0);
        expect(rowAtPos(lines, 5)).toBe(0);
        expect(rowAtPos(lines, 70)).toBe(7);
        expect(rowAtPos(lines, 79)).toBe(7);
        expect(rowAtPos(lines, 195)).toBe(19);
    });

    it("clamps positions outside the document", () => {
        expect(rowAtPos(lines, -100)).toBe(0);
        expect(rowAtPos(lines, 100_000)).toBe(19);
    });

    it("returns the collapsed row for a position inside a fold", () => {
        // A fold swallows lines 2 through 4, so they share one drawn row.
        const folded: Lines = [
            [{ from: 0, to: 9, folded: false }],
            [{ from: 10, to: 19, folded: false }],
            [
                { from: 20, to: 24, folded: false },
                { from: 24, to: 49, folded: true },
            ],
            [{ from: 50, to: 59, folded: false }],
        ];

        expect(rowAtPos(folded, 22)).toBe(2);
        expect(rowAtPos(folded, 35)).toBe(2);
        expect(rowAtPos(folded, 49)).toBe(2);
        expect(rowAtPos(folded, 55)).toBe(3);
    });

    it("answers for an empty document", () => {
        expect(rowAtPos([], 0)).toBe(0);
    });
});

/** The geometry the minimap ends up with for a given set of inputs. */
function geometryFor(overrides: Partial<LayoutInput> = {}): Geometry {
    const i = input(overrides);
    const { lineHeight, paddingTop, paddingBottom, height } = i;

    return {
        ...computeLayout(i),
        lineHeight,
        paddingTop,
        paddingBottom,
        height,
    };
}

const geometry: Geometry = {
    ...geometryFor(),
    scrollTop: 100,
    overlayTop: 0,
    overlayHeight: 80,
};

describe("overlayTravel", () => {
    it("spans the minimap minus a screenful of rows and the padding", () => {
        expect(computeLayout(input()).overlayTravel).toBe(400 - 4 - 4 - 80);
    });

    it("stops at the end of the rows when they do not fill the minimap", () => {
        // A hundred 2px rows plus padding is 208px of content in a 400px map.
        expect(computeLayout(input({ rowCount: 100 })).overlayTravel).toBe(
            208 - 4 - 4 - 80,
        );
    });

    it("matches the distance the layout actually moves the overlay", () => {
        const first = computeLayout(
            input({ firstVisibleRow: 0, lastVisibleRow: 39 }),
        );
        const last = computeLayout(
            input({ firstVisibleRow: 960, lastVisibleRow: 999 }),
        );

        expect(last.overlayTop - first.overlayTop).toBeCloseTo(
            first.overlayTravel,
        );
    });

    it("matches it however the lines on screen wrap", () => {
        // The overlay is shrunk by the wrapping at both ends, but the distance
        // between where it starts and where it stops is unchanged by that.
        const first = computeLayout(
            input({ firstVisibleRow: 0, lastVisibleRow: 8 }),
        );
        const last = computeLayout(
            input({ firstVisibleRow: 960, lastVisibleRow: 968 }),
        );

        expect(last.overlayTop - first.overlayTop).toBeCloseTo(
            first.overlayTravel,
        );
    });

    it("asks for no travel a short minimap cannot give", () => {
        expect(computeLayout(input({ height: 20 })).overlayTravel).toBe(0);
    });
});

describe("rowAtOverlayTop", () => {
    it("inverts the position the layout gives a row", () => {
        // What dragging needs: take the overlay to where the layout would have
        // drawn a row, and the row the editor scrolls to is that row.
        for (let first = 0; first <= 960; first += 7) {
            const g = geometryFor({
                firstVisibleRow: first,
                lastVisibleRow: first + 39,
            });

            expect(rowAtOverlayTop(g, g.overlayTop)).toBeCloseTo(first);
        }
    });

    it("inverts it just as well when the lines on screen wrap", () => {
        // The case a pixel-for-pixel drag gets wrong: a screen of wrapped prose
        // covers a ninth of the rows a screen of code does, so the editor's
        // scroll range and the overlay's travel stop being proportional.
        for (let first = 0; first <= 960; first += 7) {
            const g = geometryFor({
                firstVisibleRow: first,
                lastVisibleRow: first + 8,
            });

            expect(rowAtOverlayTop(g, g.overlayTop)).toBeCloseTo(first);
        }
    });

    it("moves without a jolt anywhere, including at the ends", () => {
        // What a drag feels. Sweeping the overlay from the top of the minimap
        // to the bottom must not step further in one pixel at one place than
        // at another: a jump is a jolt, and a jump at one end and not the
        // other is why a drag can feel smooth going up and catch going down.
        const g = geometryFor({ firstVisibleRow: 500, lastVisibleRow: 539 });

        // The steepest the mapping ever gets: the stretch where the rows
        // themselves scroll, which covers `scrollableRows` over its travel.
        const steepest = g.scrollableRows / g.overlayTravel;

        let previous = rowAtOverlayTop(g, -20);
        for (let top = -20; top <= g.height + 20; top += 0.5) {
            const row = rowAtOverlayTop(g, top);

            expect(row).toBeGreaterThanOrEqual(previous);
            expect(row - previous).toBeLessThanOrEqual(steepest * 0.5 + 1e-9);

            previous = row;
        }
    });

    it("meets its own two halves without a step", () => {
        // The rows stop scrolling part-way down and the overlay carries on
        // alone, at a different rate. The rate may change; the position may
        // not.
        const g = geometryFor({ firstVisibleRow: 500, lastVisibleRow: 539 });
        const junction = g.paddingTop + g.overlayTravel;

        expect(rowAtOverlayTop(g, junction - 1e-6)).toBeCloseTo(
            rowAtOverlayTop(g, junction + 1e-6),
        );
        expect(rowAtOverlayTop(g, junction)).toBeCloseTo(g.scrollableRows);
    });

    it("clamps a drag that runs off either end of the minimap", () => {
        const g = geometryFor({ firstVisibleRow: 500, lastVisibleRow: 539 });

        expect(rowAtOverlayTop(g, -5000)).toBe(0);
        expect(rowAtOverlayTop(g, 5000)).toBe(999);
    });

    it("reaches the last screenful when the lines on screen wrap", () => {
        // A screenful of forty rows holds only sixteen wrapped lines, so the
        // furthest row the editor can put at the top is 1000 - 16 = 984, not
        // the 1000 - 40 that a screen of unwrapped lines would stop at.
        // Stopping at the latter left the last two dozen lines reachable only
        // by scrolling the editor: the overlay would not drag any further.
        const g = geometryFor({ firstVisibleRow: 984, lastVisibleRow: 999 });

        expect(rowAtOverlayTop(g, g.overlayTop)).toBeCloseTo(984);
    });

    it("takes the overlay to the bottom of the minimap on the last row", () => {
        // The two halves of the same property: the layout draws the overlay
        // flush with the bottom on the last screenful, and a drag to that
        // position asks for the row that put it there.
        const g = geometryFor({ firstVisibleRow: 984, lastVisibleRow: 999 });
        const bottom = 400 - 4;

        expect(g.overlayTop + g.overlayHeight).toBeCloseTo(bottom);
        expect(rowAtOverlayTop(g, bottom - g.overlayHeight)).toBeCloseTo(984);
    });

    it("keeps a grabbed point reachable as the overlay shrinks", () => {
        // A drag that starts on a screen of code and ends on a screen of
        // wrapped prose carries the overlay from forty rows down to sixteen.
        // Where the drag holds it has to shrink with it: an offset measured in
        // pixels when it was tall points below its bottom edge by the end, and
        // the pointer would have to leave the minimap to put it there — which
        // is what a drag jamming short of the end feels like.
        const start = geometryFor({ firstVisibleRow: 0, lastVisibleRow: 39 });
        const end = geometryFor({ firstVisibleRow: 984, lastVisibleRow: 999 });

        // Grabbed nine tenths of the way down a full-height overlay.
        const anchor = 0.9;

        const asFraction = end.overlayTop + anchor * end.overlayHeight;
        const asPixels = end.overlayTop + anchor * start.overlayHeight;

        expect(asFraction).toBeLessThanOrEqual(end.height);
        expect(asPixels).toBeGreaterThan(end.height);
    });

    it("inverts every row of a wrapped tail, not just its ends", () => {
        // Walking the tail one row at a time: each position the layout draws
        // has to map back to the row that produced it, or a drag through the
        // last screenful moves in jumps.
        for (let first = 950; first <= 984; first++) {
            const g = geometryFor({
                firstVisibleRow: first,
                lastVisibleRow: Math.min(999, first + 15),
            });

            expect(rowAtOverlayTop(g, g.overlayTop)).toBeCloseTo(first);
        }
    });

    it("holds still for a document that has nowhere to scroll", () => {
        // Twenty rows in a minimap that shows forty: dragging has no target.
        const g = geometryFor({
            rowCount: 20,
            firstVisibleRow: 0,
            lastVisibleRow: 19,
        });

        expect(rowAtOverlayTop(g, 200)).toBe(0);
    });
});

describe("rowAtY", () => {
    it("reads back the row drawn at a position", () => {
        expect(rowAtY(geometry, 0)).toBe(48);
        expect(rowAtY(geometry, 96)).toBe(96);
    });

    it("does not divide by a row height of zero", () => {
        expect(rowAtY({ ...geometry, lineHeight: 0 }, 40)).toBe(0);
    });
});
