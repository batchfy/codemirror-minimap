import { Facet } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Overlay } from "./Overlay.js";
import { Config, Options, Scale } from "./Config.js";
import { DiagnosticState, diagnostics } from "./diagnostics.js";
import { SelectionState, selections } from "./selections.js";
import { TextState, text } from "./text.js";
import { LinesState } from "./LinesState.js";
import { readGeometry, setRowHeight } from "./geometry.js";
import crelt from "crelt";
import { GUTTER_WIDTH, drawLineGutter } from "./Gutters.js";

const Theme = EditorView.theme({
    "&": {
        height: "100%",
        overflowY: "auto",
    },
    "& .cm-minimap-gutter": {
        borderRight: 0,
        flexShrink: 0,
        left: "unset",
        position: "sticky",
        right: 0,
        top: 0,
    },
    "& .cm-minimap-autohide": {
        opacity: 0.0,
        transition: "opacity 0.3s",
    },
    "& .cm-minimap-autohide:hover": {
        opacity: 1.0,
    },
    "& .cm-minimap-inner": {
        height: "100%",
        position: "absolute",
        right: 0,
        top: 0,
        overflowY: "hidden",
        "& canvas": {
            display: "block",
        },
    },
    "& .cm-minimap-box-shadow": {
        boxShadow: "12px 0px 20px 5px #6c6c6c",
    },
    // Suppresses the scrollbar's appearance only; the scroller keeps its
    // overflow, so wheel, trackpad, keyboard and programmatic scrolling all
    // continue to work.
    // Lives on the scroller rather than the editor root: `themeChanged`
    // fingerprints the root's class list, so toggling a class there would read
    // as a theme change and needlessly drop the font metric cache.
    "& .cm-scroller.cm-minimap-hide-scrollbar": {
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": {
            display: "none",
        },
    },
});

const HIDE_SCROLLBAR_CLASS = "cm-minimap-hide-scrollbar";

const WIDTH_RATIO = 6;

const minimapClass = ViewPlugin.fromClass(
    class {
        private dom: HTMLElement | undefined;
        private inner: HTMLElement | undefined;
        private canvas: HTMLCanvasElement | undefined;

        public text: TextState;
        public selection: SelectionState;
        public diagnostic: DiagnosticState;

        public constructor(private view: EditorView) {
            this.text = text(view);
            this.selection = selections(view);
            this.diagnostic = diagnostics(view);

            if (view.state.facet(showMinimap)) {
                this.create(view);
            }
        }

        private create(view: EditorView) {
            const config = view.state.facet(showMinimap);
            if (!config) {
                throw Error("Expected nonnull");
            }

            this.inner = crelt("div", { class: "cm-minimap-inner" });
            this.canvas = crelt("canvas");

            this.dom = config.create(view).dom;
            this.dom.classList.add("cm-gutters");
            this.dom.classList.add("cm-minimap-gutter");

            this.inner.appendChild(this.canvas);
            this.dom.appendChild(this.inner);

            // For now let's keep this same behavior. We might want to change
            // this in the future and have the extension figure out how to mount.
            // Or expose some more generic right gutter api and use that
            this.view.scrollDOM.insertBefore(
                this.dom,
                this.view.contentDOM.nextSibling,
            );

            for (const key in this.view.state.facet(Config).eventHandlers) {
                const handler =
                    this.view.state.facet(Config).eventHandlers[key];
                if (handler) {
                    this.dom.addEventListener(key, (e) =>
                        handler(e, this.view),
                    );
                }
            }

            if (config.autohide) {
                this.dom.classList.add("cm-minimap-autohide");
            }
        }

        private remove() {
            this.view.scrollDOM.classList.remove(HIDE_SCROLLBAR_CLASS);

            if (this.dom) {
                this.dom.remove();
            }
        }

        update(update: ViewUpdate) {
            const prev = update.startState.facet(showMinimap);
            const now = update.state.facet(showMinimap);

            if (prev && !now) {
                this.remove();
                return;
            }

            if (!prev && now) {
                this.create(update.view);
            }

            if (now) {
                this.text.update(update);
                this.selection.update(update);
                this.diagnostic.update(update);
                this.render(update);
            }
        }

        getWidth(): number {
            const maxWidth = this.view.state.facet(Config).width;
            const editorWidth = this.view.dom.clientWidth;

            // Shrink proportionally rather than letting the minimap take over
            // a narrow editor.
            if (editorWidth <= maxWidth * WIDTH_RATIO) {
                return maxWidth * (editorWidth / (maxWidth * WIDTH_RATIO));
            }

            return maxWidth;
        }

        /**
         * `token` names the moment being drawn, and is passed on to
         * `readGeometry` so that the overlay, which draws the same moment,
         * measures it only once between them.
         */
        render(token?: object) {
            // If we don't have elements to draw to exit early
            if (!this.dom || !this.canvas || !this.inner) {
                return;
            }

            this.updateBoxShadow();
            this.view.scrollDOM.classList.toggle(
                HIDE_SCROLLBAR_CLASS,
                this.view.state.facet(Config).hideScrollbar,
            );

            const width = this.getWidth();
            const domHeight = this.view.dom.getBoundingClientRect().height;

            this.dom.style.width = width + "px";
            this.canvas.style.maxWidth = width + "px";
            this.inner.style.minHeight = domHeight + "px";
            this.canvas.style.height = domHeight + "px";

            /**
             * Assigning to `width`/`height` reallocates the backing buffer and
             * resets every canvas property, so only do it on an actual size
             * change. The reset doubles as the clear when it does happen.
             */
            const canvasWidth = width * Scale.PixelMultiplier;
            const canvasHeight = domHeight * Scale.PixelMultiplier;
            const resized =
                this.canvas.width !== canvasWidth ||
                this.canvas.height !== canvasHeight;

            if (resized) {
                this.canvas.width = canvasWidth;
                this.canvas.height = canvasHeight;
            }

            const context = this.canvas.getContext("2d");
            if (!context) {
                return;
            }

            if (!resized) {
                context.clearRect(0, 0, canvasWidth, canvasHeight);
            }

            /**
             * Draw layers leave `globalAlpha` faded behind them. Resizing used
             * to reset it as a side effect of reallocating the canvas; now that
             * the resize is conditional, reset it explicitly instead.
             */
            context.globalAlpha = 1;

            /* We need to get the correct font dimensions before this to measure characters */
            const { charWidth, lineHeight } = this.text.measure(context);
            setRowHeight(this.view, lineHeight);

            let { startIndex, endIndex, offsetY } = this.canvasStartAndEndIndex(
                context,
                lineHeight,
                token,
            );

            const gutters = this.view.state.facet(Config).gutters;
            const lineCount = this.view.state.field(LinesState).length;

            for (let i = startIndex; i < endIndex; i++) {
                if (i >= lineCount) break;

                const drawContext = {
                    offsetX: 0,
                    offsetY,
                    context,
                    lineHeight,
                    charWidth,
                };

                if (gutters.length) {
                    /* Small leading buffer */
                    drawContext.offsetX += 2;

                    for (const gutter of gutters) {
                        drawLineGutter(gutter, drawContext, i + 1);
                        drawContext.offsetX += GUTTER_WIDTH;
                    }

                    /* Small trailing buffer */
                    drawContext.offsetX += 2;
                }

                this.text.drawLine(drawContext, i + 1);
                this.selection.drawLine(drawContext, i + 1);
                this.diagnostic.drawLine(drawContext, i + 1);

                offsetY += lineHeight;
            }

            context.restore();
        }

        private canvasStartAndEndIndex(
            context: CanvasRenderingContext2D,
            lineHeight: number,
            token?: object,
        ) {
            const pTop = this.view.documentPadding.top / Scale.SizeRatio;
            const canvasHeight = context.canvas.height;

            /**
             * The rows are scrolled to wherever the overlay needs them: the two
             * are laid out together so that the overlay covers the rows the
             * editor is showing rather than an approximation of them.
             */
            const canvasTop =
                readGeometry(this.view, token).scrollTop *
                Scale.PixelMultiplier;

            if (lineHeight <= 0) {
                return { startIndex: 0, endIndex: 0, offsetY: 0 };
            }

            /**
             * The first row to draw is the one the top edge falls inside, not
             * the nearest one to it: rounding would leave every row up to half
             * a row away from where the overlay expects it, and by a different
             * amount at every scroll position. Whatever part of that row lies
             * above the edge goes into `offsetY`, which is why it may be
             * negative — the row is drawn from off the top of the canvas so the
             * rest of it lands exactly where the overlay marks it.
             */
            const startIndex = Math.max(
                0,
                Math.floor((canvasTop - pTop) / lineHeight),
            );
            const offsetY = pTop + startIndex * lineHeight - canvasTop;
            const spaceForLines = Math.ceil(
                (canvasHeight - offsetY) / lineHeight,
            );

            return {
                startIndex,
                endIndex: startIndex + spaceForLines,
                offsetY,
            };
        }

        private updateBoxShadow() {
            if (!this.canvas) {
                return;
            }

            const { clientWidth, scrollWidth, scrollLeft } =
                this.view.scrollDOM;

            if (clientWidth + scrollLeft < scrollWidth) {
                this.canvas.classList.add("cm-minimap-box-shadow");
            } else {
                this.canvas.classList.remove("cm-minimap-box-shadow");
            }
        }

        destroy() {
            this.text.destroy();
            this.remove();
        }
    },
    {
        eventHandlers: {
            scroll(event) {
                requestAnimationFrame(() => this.render(event));
            },
        },
        provide: (plugin) => {
            return EditorView.scrollMargins.of((view) => {
                const width = view.plugin(plugin)?.getWidth();
                if (!width) {
                    return null;
                }

                return { right: width };
            });
        },
    },
);

export interface MinimapConfig extends Omit<Options, "enabled"> {
    /**
     * A function that creates the element that contains the minimap
     */
    create: (view: EditorView) => { dom: HTMLElement };
}

/**
 * Facet used to show a minimap in the right gutter of the editor using the
 * provided configuration.
 *
 * If you return `null`, a minimap will not be shown.
 */
const showMinimap = Facet.define<MinimapConfig | null, MinimapConfig | null>({
    combine: (c) => c.find((o) => o !== null) ?? null,
    enables: (f) => {
        return [
            [
                Config.compute([f], (s) => s.facet(f)),
                Theme,
                LinesState,
                minimapClass, // TODO, codemirror-ify this one better
                Overlay,
            ],
        ];
    },
});

export { showMinimap };
