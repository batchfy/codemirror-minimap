import { BlockInfo, EditorView } from "@codemirror/view";
import { Scale } from "./Config.js";
import { LinesState, type Lines } from "./LinesState.js";

/** Editor pixels that fit into a single minimap pixel. */
export const SCALE = Scale.PixelMultiplier * Scale.SizeRatio;

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export type LayoutInput = {
    /** Rows the minimap draws: one per line it lays out, folds collapsed. */
    rowCount: number;
    /** Height of one row. */
    lineHeight: number;
    paddingTop: number;
    paddingBottom: number;
    /** Height of the visible minimap. */
    height: number;
    /** Rows the editor currently shows on screen, inclusive. */
    firstVisibleRow: number;
    lastVisibleRow: number;
    /**
     * Rows a screenful holds when none of its lines wrap.
     *
     * How many rows are on screen right now swings with how much the lines on
     * it wrap: a screen of code holds many lines, a screen of prose few. This
     * count follows from the editor's height and its line height alone, so it
     * holds still while the document scrolls.
     */
    rowsPerScreen: number;
};

export type Layout = {
    /** Height of every row plus the document padding. */
    contentHeight: number;
    /** How far the rows are scrolled up inside the visible minimap. */
    scrollTop: number;
    /** Position of the viewport overlay inside the visible minimap. */
    overlayTop: number;
    overlayHeight: number;
    /** Rows the minimap has to draw, carried through for the inverse. */
    rowCount: number;
    /**
     * Rows the document can scroll through if none of its lines wrap: the ones
     * past the first screenful.
     *
     * Wrapping puts fewer document lines on a screen than there are rows in it,
     * so the editor can carry on past this — `rowAtOverlayTop` covers the rest.
     */
    scrollableRows: number;
    /**
     * How far the overlay's top edge moves between the first row of the
     * document and the last, and so how far a drag has to travel to cross the
     * document. It is `overlayTravel / scrollableRows` per row, which is what
     * `rowAtOverlayTop` inverts.
     */
    overlayTravel: number;
};

/**
 * Places the rows and the viewport overlay together.
 *
 * The overlay marks lines, not pixels, so its position cannot be derived from
 * the editor's scroll offset: a wrapped line takes several rows of the editor
 * and one row of the minimap, so equal scroll fractions stop meaning equal
 * positions as soon as wrapping, folding or line-height variation enters the
 * document. Both halves are therefore anchored on the rows that are actually on
 * screen, which keeps the overlay on top of the content it stands for.
 *
 * The rows scroll in step with progress through the document, so the overlay
 * ends up where that progress says it should: at the top on the first row, at
 * the bottom on the last. Near either end, and whenever the rows have less to
 * give than the progress asks for, the rows stop and the overlay takes over the
 * remaining travel — covering its own rows always wins over sitting where the
 * scroll fraction would like it to.
 */
export function computeLayout(input: LayoutInput): Layout {
    const { rowCount, lineHeight, paddingTop, paddingBottom, height } = input;

    const lastRow = Math.max(0, rowCount - 1);
    const first = clamp(input.firstVisibleRow, 0, lastRow);
    const last = clamp(input.lastVisibleRow, first, lastRow);
    const visibleRows = last - first + 1;

    const contentHeight = paddingTop + paddingBottom + rowCount * lineHeight;
    const overlayHeight = Math.min(height, visibleRows * lineHeight);
    const rowTop = paddingTop + first * lineHeight;

    /**
     * Measured against a screenful of unwrapped lines rather than against the
     * rows that happen to be on screen. A denominator that moved with the
     * current wrapping would shrink as a screen of code scrolled into a screen
     * of wrapped prose, and the rows would slide backwards underneath an
     * overlay that had just moved forwards.
     */
    const scrollableRows = Math.max(0, rowCount - input.rowsPerScreen);
    const progress =
        scrollableRows <= 0 ? 0 : clamp(first / scrollableRows, 0, 1);

    const maxScroll = Math.max(0, contentHeight - height);
    const scrollTop = clamp(
        maxScroll * progress,
        Math.max(0, rowTop - (height - overlayHeight)),
        Math.min(maxScroll, rowTop),
    );

    /**
     * Measured against a screenful of rows rather than against the overlay's
     * current height, for the same reason `progress` is: an overlay shrunk by
     * the wrapping on screen right now would report a travel that the rows it
     * has to move over cannot back up, and a drag would run ahead of them.
     */
    const overlayTravel = Math.max(
        0,
        Math.min(height, contentHeight) -
            paddingTop -
            paddingBottom -
            input.rowsPerScreen * lineHeight,
    );

    return {
        contentHeight,
        scrollTop,
        overlayTop: rowTop - scrollTop,
        overlayHeight,
        rowCount,
        scrollableRows,
        overlayTravel,
    };
}

export type Geometry = Layout & {
    lineHeight: number;
    paddingTop: number;
    paddingBottom: number;
    /** Height of the visible minimap. */
    height: number;
};

/**
 * The part of the geometry that scrolling does not change.
 *
 * Everything here follows from the document's length, the theme's row height
 * and the size of the editor, so it holds still while the document moves under
 * the overlay. A drag can therefore measure it once at the outset instead of on
 * every report from the pointer — and the type is the argument that this is
 * safe, since a function given only these values cannot read the scroll
 * position it would be caching past.
 */
export type StableGeometry = Pick<
    Geometry,
    | "paddingTop"
    | "lineHeight"
    | "rowCount"
    | "scrollableRows"
    | "overlayTravel"
>;

/**
 * The row height the renderer measured, in minimap pixels.
 *
 * It comes from the computed style of a mock line, which only the renderer is
 * set up to measure, and it changes with the theme rather than with the scroll
 * position. Sharing the measurement lets the overlay lay itself out against the
 * exact grid the rows were drawn on instead of a second estimate of it.
 */
const rowHeights = new WeakMap<EditorView, number>();

export function setRowHeight(view: EditorView, canvasLineHeight: number) {
    const lineHeight = canvasLineHeight / Scale.PixelMultiplier;

    if (rowHeights.get(view) !== lineHeight) {
        rowHeights.set(view, lineHeight);
        measured.delete(view);
    }
}

/** Index of the row the minimap draws the given document position on. */
export function rowAtPos(lines: Lines, pos: number): number {
    let low = 0;
    let high = lines.length - 1;

    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const line = lines[mid];

        if (line && line.length && line[0].from <= pos) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return Math.max(0, low);
}

/**
 * The line block at a vertical position, found by bisecting the document.
 *
 * `view.lineBlockAtHeight` answers this directly, but it refuses to run while
 * the editor is mid-update, which is when the minimap draws. Blocks are ordered
 * by height, so the same answer is reachable through `view.lineBlockAt`, which
 * carries no such restriction.
 */
function lineBlockAtHeight(view: EditorView, height: number): BlockInfo {
    const { doc } = view.state;
    let low = 1;
    let high = doc.lines;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);

        if (view.lineBlockAt(doc.line(mid).from).bottom <= height) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return view.lineBlockAt(doc.line(low).from);
}

/** The rows the editor currently shows on screen, inclusive. */
function visibleRows(view: EditorView): { first: number; last: number } {
    const lines = view.state.field(LinesState);
    const { top, bottom } = view.scrollDOM.getBoundingClientRect();
    const documentTop = view.documentTop;

    return {
        first: rowAtPos(lines, lineBlockAtHeight(view, top - documentTop).from),
        last: rowAtPos(lines, lineBlockAtHeight(view, bottom - documentTop).to),
    };
}

/**
 * The last geometry measured for a view, and what it was measured for.
 *
 * The overlay and the renderer both need the geometry and both run on every
 * update, so measuring it twice means paying twice for the three
 * `getBoundingClientRect` calls behind `view.dom`, `view.scrollDOM` and
 * `view.documentTop`, and for the two bisections of the height map. Handing
 * both of them the same token — the `ViewUpdate` or the scroll event they are
 * responding to — lets the second one reuse the first one's answer.
 */
const measured = new WeakMap<
    EditorView,
    { token: object; geometry: Geometry }
>();

/**
 * Where the minimap draws its rows and its overlay for the current state.
 *
 * `token` stands for the moment being drawn: anything measured for the same
 * token describes the same moment, so it is measured once. Callers with no
 * moment to name pass nothing and get a fresh measurement.
 */
export function readGeometry(view: EditorView, token?: object): Geometry {
    if (token) {
        const previous = measured.get(view);

        if (previous && previous.token === token) {
            return previous.geometry;
        }
    }

    const geometry = measureGeometry(view);

    if (token) {
        measured.set(view, { token, geometry });
    }

    return geometry;
}

function measureGeometry(view: EditorView): Geometry {
    const lineHeight =
        rowHeights.get(view) || view.defaultLineHeight / SCALE || 0;
    const paddingTop = view.documentPadding.top / SCALE;
    const paddingBottom = view.documentPadding.bottom / SCALE;
    const height = view.dom.getBoundingClientRect().height;
    const { first, last } = visibleRows(view);

    const layout = computeLayout({
        rowCount: view.state.field(LinesState).length,
        lineHeight,
        paddingTop,
        paddingBottom,
        height,
        firstVisibleRow: first,
        lastVisibleRow: last,
        rowsPerScreen: view.defaultLineHeight
            ? view.scrollDOM.clientHeight / view.defaultLineHeight
            : 0,
    });

    return { ...layout, lineHeight, paddingTop, paddingBottom, height };
}

/** The row drawn `y` pixels below the top of the visible minimap. */
export function rowAtY(geometry: Geometry, y: number): number {
    if (geometry.lineHeight <= 0) {
        return 0;
    }

    const offset = geometry.scrollTop + y - geometry.paddingTop;
    return Math.floor(offset / geometry.lineHeight);
}

/**
 * The row the editor would have to put at the top of its viewport for the
 * overlay to sit at `overlayTop`.
 *
 * This is the inverse of the placement `computeLayout` performs, so dragging
 * the overlay to a position and letting the layout put it back lands on the
 * same pixel. It cannot be read off `rowAtY`: the rows underneath the overlay
 * scroll as the overlay moves, so the row drawn at a position is not the row
 * that would be on screen were the overlay taken there.
 *
 * The answer carries its fraction. A whole number of rows is not enough to
 * reach the end of a document: the editor stops with the last line against the
 * foot of the viewport, which in general falls part-way through a row, and a
 * drag that could only name whole rows would stop short of it by that part and
 * need a jump to finish.
 */
export function rowAtOverlayTop(
    geometry: StableGeometry,
    overlayTop: number,
): number {
    if (
        geometry.overlayTravel <= 0 ||
        geometry.scrollableRows <= 0 ||
        geometry.lineHeight <= 0
    ) {
        return 0;
    }

    const offset = overlayTop - geometry.paddingTop;

    /**
     * Past its travel the overlay is still moving, and the drag has to follow
     * it there.
     *
     * `scrollableRows` counts rows against a screenful of unwrapped lines, but
     * a screen of wrapped lines holds fewer document lines than it has rows,
     * so the editor can put rows past that one at the top of its viewport. The
     * layout already draws them: `progress` stops at 1, the rows stop
     * scrolling, and the overlay covers the remaining distance on its own, one
     * row height per row. Ending the inverse at `scrollableRows` instead left a
     * drag stuck a screenful's worth of wrapping short of the end, reachable
     * only by scrolling the editor itself.
     */
    if (offset >= geometry.overlayTravel) {
        return clamp(
            geometry.scrollableRows +
                (offset - geometry.overlayTravel) / geometry.lineHeight,
            0,
            Math.max(0, geometry.rowCount - 1),
        );
    }

    const progress = clamp(offset / geometry.overlayTravel, 0, 1);

    return progress * geometry.scrollableRows;
}

/**
 * Scrolls the editor until `row` sits `offset` pixels down the viewport.
 *
 * `row` may name a point inside a row rather than the start of one, and the
 * fraction is taken against that row's own height so that it means the same
 * part of a wrapped line as of an unwrapped one. Scrolling to whole rows is
 * enough for a click, which is aiming at a line; a drag needs the fraction, or
 * it cannot follow the pointer through the last part of a row and stops short
 * of the end of the document.
 */
export function scrollToRow(view: EditorView, row: number, offset = 0) {
    const lines = view.state.field(LinesState);
    const wanted = clamp(row, 0, lines.length - 1);
    const index = Math.floor(wanted);
    const line = lines[index];

    if (!line || !line.length) {
        return;
    }

    const block = view.lineBlockAt(line[0].from);
    const withinRow = (wanted - index) * block.height;

    /**
     * Set outright rather than nudged by a difference from where the editor is
     * now. `lineBlockAt` measures from the top of the document, and the
     * document begins `paddingTop` into the scroller's content, so that sum is
     * already the position that puts the row against the top of the viewport.
     * Working it out as a difference meant reading the current scroll offset,
     * the scroller's box and the document's box — three measurements of the
     * present, to arrive somewhere that never depended on it. The scroller
     * clamps the result at both ends by itself.
     */
    view.scrollDOM.scrollTop =
        view.documentPadding.top + block.top + withinRow - offset;
}
