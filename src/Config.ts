import { Facet, combineConfig } from "@codemirror/state";
import { DOMEventMap, EditorView } from "@codemirror/view";
import { MinimapConfig } from "./index.js";
import { Gutter } from "./Gutters.js";

type EventHandler<event extends keyof DOMEventMap> = (
    e: DOMEventMap[event],
    v: EditorView,
) => void;

type Options = {
    /**
     * Controls whether the minimap should be hidden on mouseout.
     * Defaults to `false`.
     */
    autohide?: boolean;

    enabled: boolean;

    /**
     * Determines how to render text. Defaults to `characters`.
     */
    displayText?: "blocks" | "characters";

    /**
     * Attach event handlers to the minimap container element.
     */
    eventHandlers?: {
        [event in keyof DOMEventMap]?: EventHandler<event>;
    };

    /**
     * The overlay shows the portion of the file currently in the viewport.
     * Defaults to `always`.
     */
    showOverlay?: "always" | "mouse-over";

    /**
     * Enables a gutter to be drawn on the given line to the left
     * of the minimap, with the given color. Accepts all valid CSS
     * color values.
     */
    gutters?: Array<Gutter>;

    /**
     * Maximum width of the minimap in pixels. Defaults to `120`.
     *
     * This is an upper bound rather than a fixed size: when the editor is
     * narrow the minimap shrinks proportionally so that it never dominates
     * the viewport. A wider minimap shows more characters per line; it does
     * not change the size the text is rendered at.
     */
    width?: number;

    /**
     * Hides the editor's native scrollbar while the minimap is shown, since
     * the minimap and its viewport overlay already serve that role. Scrolling
     * itself is unaffected -- only the scrollbar's appearance is suppressed.
     * Defaults to `true`.
     *
     * Note that this hides the horizontal scrollbar too, as scrollbar
     * visibility cannot be controlled per axis. Horizontal overflow stays
     * discoverable through the minimap's shadow.
     */
    hideScrollbar?: boolean;
};

const Scale = {
    // Multiply the number of canvas pixels
    PixelMultiplier: 2,
    // Downscale the editor contents by this ratio
    SizeRatio: 4,
    // Maximum width of the minimap in pixels
    MaxWidth: 120,
} as const;

const Config = Facet.define<MinimapConfig | null, Required<Options>>({
    combine: (c) => {
        const configs: Array<Options> = [];
        for (const config of c) {
            if (!config) {
                continue;
            }

            const { create, gutters, ...rest } = config;

            configs.push({
                ...rest,
                enabled: true,
                gutters: gutters
                    ? gutters.filter((v) => Object.keys(v).length > 0)
                    : undefined,
            });
        }

        return combineConfig(configs, {
            enabled: configs.length > 0,
            displayText: "characters",
            eventHandlers: {},
            showOverlay: "always",
            gutters: [],
            autohide: false,
            width: Scale.MaxWidth,
            hideScrollbar: true,
        });
    },
});

export { Config, Scale };
export type { Options };
