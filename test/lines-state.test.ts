import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { codeFolding, foldEffect, foldedRanges } from "@codemirror/language";
import { LinesState, foldsChanged } from "../src/LinesState.js";
import { Config } from "../src/Config.js";
import { showMinimap } from "../src/index.js";

/**
 * LinesState is pure state -- no DOM, no canvas -- so it can be exercised
 * against a real EditorState directly.
 */
function stateFor(doc: string, enabled = true) {
    return EditorState.create({
        doc,
        extensions: [
            // foldEffect needs the folding state field to land in.
            codeFolding(),
            LinesState,
            showMinimap.compute([], () =>
                enabled
                    ? { create: () => ({ dom: document.createElement("div") }) }
                    : null,
            ),
        ],
    });
}

describe("LinesState", () => {
    it("produces one entry per document line", () => {
        const lines = stateFor("alpha\nbeta\ngamma").field(LinesState);
        expect(lines).toHaveLength(3);
    });

    it("spans cover each line's full range", () => {
        const state = stateFor("alpha\nbeta\ngamma");
        const lines = state.field(LinesState);

        expect(lines[0]).toEqual([{ from: 0, to: 5, folded: false }]);
        expect(lines[1]).toEqual([{ from: 6, to: 10, folded: false }]);
        expect(lines[2]).toEqual([{ from: 11, to: 16, folded: false }]);
    });

    it("represents an empty line as a zero-length span", () => {
        const lines = stateFor("alpha\n\ngamma").field(LinesState);
        expect(lines[1]).toEqual([{ from: 6, to: 6, folded: false }]);
    });

    it("is empty when the minimap is disabled", () => {
        const lines = stateFor("alpha\nbeta", false).field(LinesState);
        expect(lines).toEqual([]);
    });

    it("collapses a folded range into a single folded span", () => {
        const state = stateFor("one\ntwo\nthree\nfour");
        const folded = state.update({
            effects: foldEffect.of({ from: 3, to: 13 }),
        }).state;

        expect(foldedRanges(folded).size).toBeGreaterThan(0);

        const lines = folded.field(LinesState);
        const flat = lines.flat();
        const foldedSpans = flat.filter((s) => s.folded);

        expect(foldedSpans.length).toBeGreaterThan(0);
        // The folded region collapses, so fewer lines survive than the doc has.
        expect(lines.length).toBeLessThan(folded.doc.lines);
    });

    it("keeps a trailing unfolded remainder on the folded line", () => {
        const state = stateFor("one\ntwo\nthree\nfour");
        const folded = state.update({
            effects: foldEffect.of({ from: 3, to: 9 }),
        }).state;

        const line = folded.field(LinesState)[0];
        expect(line?.some((s) => s.folded)).toBe(true);
        expect(line?.some((s) => !s.folded)).toBe(true);
    });
});

describe("foldsChanged", () => {
    it("is false for an ordinary edit", () => {
        const state = stateFor("one\ntwo");
        const tr = state.update({ changes: { from: 0, insert: "x" } });
        expect(foldsChanged([tr])).toBe(false);
    });

    it("is true for a fold effect", () => {
        const state = stateFor("one\ntwo\nthree");
        const tr = state.update({ effects: foldEffect.of({ from: 3, to: 7 }) });
        expect(foldsChanged([tr])).toBe(true);
    });
});

describe("Config facet", () => {
    it("is disabled when no minimap is configured", () => {
        expect(stateFor("x", false).facet(Config).enabled).toBe(false);
    });

    it("defaults displayText to characters", () => {
        expect(stateFor("x").facet(Config).displayText).toBe("characters");
    });
});
