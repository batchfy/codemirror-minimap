import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    defaultHighlightStyle,
    syntaxHighlighting,
} from "@codemirror/language";
import { showMinimap, type MinimapConfig } from "../../src/index.js";
import { installCanvasRecorder, type RecordingContext } from "./canvas.js";

/**
 * Counts every `getComputedStyle` the library performs. Each one is preceded by
 * a mock element being spliced into `contentDOM`, so in a real browser each is a
 * forced style recalc — this count is the perf signal the tests assert on.
 *
 * jsdom resolves no cascade, so the returned values are also filled in here;
 * `lineHeight` in particular is "normal" by default, which would parse to NaN.
 */
export function installStyleSpy() {
    const original = window.getComputedStyle.bind(window);
    const spy = { count: 0 };

    window.getComputedStyle = (el: Element, pseudo?: string | null) => {
        spy.count++;
        const style = original(el, pseudo ?? undefined);
        return {
            color: style.color || "rgb(200, 200, 200)",
            backgroundColor: style.backgroundColor || "rgb(60, 90, 120)",
            fontStyle: style.fontStyle || "normal",
            fontWeight: style.fontWeight || "400",
            fontFamily: style.fontFamily || "monospace",
            lineHeight: Number.isFinite(parseFloat(style.lineHeight))
                ? style.lineHeight
                : "14px",
        } as unknown as CSSStyleDeclaration;
    };

    return spy;
}

/** jsdom reports every box as zero-sized; give the view a plausible layout. */
function stubLayout(view: EditorView, width: number, height: number) {
    const boxes: Array<[HTMLElement, number, number]> = [
        [view.dom, width, height],
        [view.scrollDOM, width, height],
        [view.contentDOM, width, height],
    ];

    for (const [el, w, h] of boxes) {
        Object.defineProperty(el, "clientWidth", {
            value: w,
            configurable: true,
        });
        Object.defineProperty(el, "clientHeight", {
            value: h,
            configurable: true,
        });
        Object.defineProperty(el, "scrollWidth", {
            value: w,
            configurable: true,
        });
        Object.defineProperty(el, "scrollHeight", {
            value: h * 4,
            configurable: true,
        });
        el.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: w,
            bottom: h,
            width: w,
            height: h,
            toJSON: () => ({}),
        });
    }
}

export type Harness = {
    view: EditorView;
    context: RecordingContext;
    style: { count: number };
    render: () => void;
    destroy: () => void;
};

export function mountMinimap(
    doc: string,
    extensions: Extension[] = [],
    {
        width = 800,
        height = 400,
        config = {},
    }: {
        width?: number;
        height?: number;
        config?: Partial<Omit<MinimapConfig, "create">>;
    } = {},
): Harness {
    const { contexts } = installCanvasRecorder();
    const style = installStyleSpy();

    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
        state: EditorState.create({
            doc,
            extensions: [
                showMinimap.compute([], () => ({
                    create: () => ({ dom: document.createElement("div") }),
                    ...config,
                })),
                // Without a highlight style every span resolves to the same
                // (empty) tag, which would make the font cache look trivial.
                syntaxHighlighting(defaultHighlightStyle),
                ...extensions,
            ],
        }),
        parent,
    });

    stubLayout(view, width, height);

    // The plugin only acquires a context inside `render`, which runs on update.
    view.dispatch({});

    const context = contexts[0];
    if (!context) {
        throw new Error("minimap never acquired a 2d context");
    }

    return {
        view,
        context,
        style,
        render: () => {
            // Re-run the plugin's draw pass without going through an update.
            view.dispatch({});
        },
        destroy: () => {
            view.destroy();
            parent.remove();
        },
    };
}
