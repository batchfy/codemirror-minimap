import { describe, it, expect, afterEach } from "vitest";
import { javascript } from "@codemirror/lang-javascript";
import { EditorSelection } from "@codemirror/state";
import { mountMinimap, type Harness } from "./helpers/editor.js";
import { SAMPLE } from "./fixtures.js";

const CLASS = "cm-minimap-hide-scrollbar";

let h: Harness | undefined;
afterEach(() => {
    h?.destroy();
    h = undefined;
});

function ruleFor(selectorPart: string): string | undefined {
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of Array.from(rules)) {
            if (rule.cssText.includes(selectorPart)) return rule.cssText;
        }
    }
    return undefined;
}

describe("native scrollbar", () => {
    it("is hidden by default", () => {
        h = mountMinimap(SAMPLE, [javascript()]);
        expect(h.view.scrollDOM.classList.contains(CLASS)).toBe(true);
    });

    it("can be kept with hideScrollbar: false", () => {
        h = mountMinimap(SAMPLE, [javascript()], {
            config: { hideScrollbar: false },
        });
        expect(h.view.scrollDOM.classList.contains(CLASS)).toBe(false);
    });

    it("emits rules for both scrollbar implementations", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        const standard = ruleFor(`.cm-scroller.${CLASS} {`);
        const webkit = ruleFor(`.cm-scroller.${CLASS}::-webkit-scrollbar`);

        expect(standard).toContain("scrollbar-width: none");
        expect(webkit).toContain("display: none");
    });

    it("does not suppress overflow, only the scrollbar's appearance", () => {
        h = mountMinimap(SAMPLE, [javascript()]);

        const standard = ruleFor(`.cm-scroller.${CLASS} {`) ?? "";
        // Setting overflow: hidden here would break scrolling outright.
        expect(standard).not.toContain("overflow");
    });

    it("drops the class when the minimap is removed", () => {
        h = mountMinimap(SAMPLE, [javascript()]);
        const scroller = h.view.scrollDOM;
        expect(scroller.classList.contains(CLASS)).toBe(true);

        h.view.destroy();
        expect(scroller.classList.contains(CLASS)).toBe(false);
        h = undefined;
    });

    it("does not disturb the editor root's class list", () => {
        // themeChanged() fingerprints the root classes; a class toggled there
        // would read as a theme change and drop the font metric cache.
        h = mountMinimap(SAMPLE, [javascript()]);
        expect(h.view.dom.className).not.toContain(CLASS);
    });

    it("keeps the class across ordinary renders", () => {
        h = mountMinimap(SAMPLE, [javascript()]);
        for (let i = 1; i <= 5; i++) {
            h.view.dispatch({ selection: EditorSelection.single(i) });
        }
        expect(h.view.scrollDOM.classList.contains(CLASS)).toBe(true);
    });
});
