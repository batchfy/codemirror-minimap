import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Config } from "./Config.js";
import {
    readGeometry,
    rowAtOverlayTop,
    rowAtY,
    scrollToRow,
    type StableGeometry,
} from "./geometry.js";
import crelt from "crelt";

const Theme = EditorView.theme({
    ".cm-minimap-overlay-container": {
        position: "absolute",
        top: 0,
        height: "100%",
        width: "100%",
        // The minimap is a sibling of `.cm-content` inside the scroller, so
        // without this it inherits the caret the editor shows over text. It is
        // not text: clicking it jumps, and the overlay is dragged.
        cursor: "default",
        "&.cm-minimap-overlay-mouse-over": {
            opacity: 0,
            transition: "visibility 0s linear 300ms, opacity 300ms",
        },
        "&.cm-minimap-overlay-mouse-over:hover": {
            opacity: 1,
            transition: "visibility 0s linear 0ms, opacity 300ms",
        },
        "&.cm-minimap-overlay-off": {
            display: "none",
        },
        "& .cm-minimap-overlay": {
            background: "rgb(121, 121, 121)",
            opacity: "0.2",
            position: "absolute",
            right: 0,
            top: 0,
            width: "100%",
            transition: "top 0s ease-in 0ms",
            cursor: "grab",
            "&:hover": {
                opacity: "0.3",
            },
        },
        "&.cm-minimap-overlay-active": {
            opacity: 1,
            visibility: "visible",
            transition: "visibility 0s linear 0ms, opacity 300ms",
            "& .cm-minimap-overlay": {
                opacity: "0.4",
                cursor: "grabbing",
            },
        },
    },
});

const OverlayView = ViewPlugin.fromClass(
    class {
        private container: HTMLElement | undefined;
        private dom: HTMLElement | undefined;

        private _isDragging: boolean = false;
        /**
         * Where inside the overlay the drag took hold of it, as a fraction of
         * its height rather than a count of pixels down from its top.
         *
         * The overlay is sized to the lines on screen, so it shrinks as a drag
         * carries it from a screen of code into one of wrapped prose. A pixel
         * offset taken when it was tall goes on pointing at where its middle
         * used to be, which by the end of the document is somewhere below its
         * bottom edge — and the pointer would have to leave the minimap, often
         * the window, to put the overlay where it belongs. A fraction shrinks
         * with it and stays under the thumb.
         */
        private _dragAnchor: number | undefined;
        /** The last position the pointer reported, waiting for a frame. */
        private _dragPointerY: number | undefined;
        private _dragFrame: number | undefined;
        /**
         * Measured when the drag starts and kept for its duration. None of it
         * moves as the document scrolls, and `update` drops it so that anything
         * which does move it — an edit, a resize, a change of theme — is
         * measured again.
         */
        private _dragGeometry: StableGeometry | undefined;

        // Bound once so that removeEventListener sees the same reference that
        // addEventListener was given; `.bind` at call time yields a new
        // function each call and the listener would never be detached.
        private readonly boundMouseDown = this.onMouseDown.bind(this);
        private readonly boundMouseUp = this.onMouseUp.bind(this);
        private readonly boundMouseMove = this.onMouseMove.bind(this);

        public constructor(private view: EditorView) {
            if (view.state.facet(Config).enabled) {
                this.create(view);
            }
        }

        private create(view: EditorView) {
            this.container = crelt("div", {
                class: "cm-minimap-overlay-container",
            });
            this.dom = crelt("div", { class: "cm-minimap-overlay" });
            this.container.appendChild(this.dom);

            // Attach event listeners for overlay
            this.container.addEventListener("mousedown", this.boundMouseDown);
            window.addEventListener("mouseup", this.boundMouseUp);
            window.addEventListener("mousemove", this.boundMouseMove);

            // Attach the overlay elements to the minimap
            const inner = view.dom.querySelector(".cm-minimap-inner");
            if (inner) {
                inner.appendChild(this.container);
            }

            // Initially set overlay configuration styles, height, top
            this.computeShowOverlay();
            this.position();
        }

        private remove() {
            // A minimap turned off or torn down mid-drag would otherwise leave
            // the whole page holding the dragging cursor.
            if (this._isDragging) {
                this.endDrag();
            }

            if (this.container) {
                this.container.removeEventListener(
                    "mousedown",
                    this.boundMouseDown,
                );
                window.removeEventListener("mouseup", this.boundMouseUp);
                window.removeEventListener("mousemove", this.boundMouseMove);
                this.container.remove();
            }
        }

        update(update: ViewUpdate) {
            const prev = update.startState.facet(Config).enabled;
            const now = update.state.facet(Config).enabled;

            if (prev && !now) {
                this.remove();
                return;
            }

            if (!prev && now) {
                this.create(update.view);
            }

            if (now) {
                // Anything that reaches an update may have changed the size of
                // the editor, the length of the document or the height of a
                // row, so a drag in progress measures them again.
                this._dragGeometry = undefined;

                this.computeShowOverlay();

                // Unconditionally, and not just on `geometryChanged`: the rows
                // are redrawn on every update, and an overlay that skipped one
                // would be left marking rows that have since moved under it.
                // The renderer runs first and measures the same update, so this
                // reads that measurement rather than taking its own.
                this.position(update);
            }
        }

        /**
         * Covers the rows the editor is showing. The renderer scrolls its rows
         * to the position the same geometry prescribes, so the overlay lands on
         * the drawn content whatever the document does with wrapping or folds.
         */
        public position(token?: object) {
            if (!this.dom) {
                return;
            }

            const { overlayTop, overlayHeight } = readGeometry(
                this.view,
                token,
            );
            this.dom.style.top = overlayTop + "px";
            this.dom.style.height = overlayHeight + "px";
        }

        public computeShowOverlay() {
            if (!this.container) {
                return;
            }

            const { showOverlay } = this.view.state.facet(Config);

            if (showOverlay === "mouse-over") {
                this.container.classList.add("cm-minimap-overlay-mouse-over");
            } else {
                this.container.classList.remove(
                    "cm-minimap-overlay-mouse-over",
                );
            }

            const { clientHeight, scrollHeight } = this.view.scrollDOM;
            if (clientHeight === scrollHeight) {
                this.container.classList.add("cm-minimap-overlay-off");
            } else {
                this.container.classList.remove("cm-minimap-overlay-off");
            }
        }

        private onMouseDown(event: MouseEvent) {
            if (!this.container) {
                return;
            }

            // Ignore right click
            if (event.button === 2) {
                return;
            }

            /**
             * The minimap sits inside the scroller alongside `.cm-content`, so
             * a mousedown on it starts a native text selection that runs on for
             * as long as the button is held — which is what leaves the pointer
             * showing a caret through the whole drag, and what puts a selection
             * in the document that nobody asked for. Neither gesture here has
             * anything to do with selecting: one jumps, one drags.
             */
            event.preventDefault();

            // If target is the overlay start dragging
            const { clientY, target } = event;
            if (target === this.dom && this.dom) {
                const grabbed = this.dom.getBoundingClientRect();

                this._dragAnchor =
                    grabbed.height > 0
                        ? (clientY - grabbed.top) / grabbed.height
                        : 0;
                this._isDragging = true;
                this.container.classList.add("cm-minimap-overlay-active");

                // The pointer spends most of a drag off the overlay, and some
                // of it off the minimap altogether, where the rule on the
                // overlay no longer reaches it.
                document.body.style.cursor = "grabbing";
                return;
            }

            // A click anywhere else on the minimap centres the row underneath it
            const geometry = readGeometry(this.view);
            const y = clientY - this.container.getBoundingClientRect().top;

            scrollToRow(
                this.view,
                rowAtY(geometry, y),
                this.view.scrollDOM.clientHeight / 2,
            );
        }

        private onMouseUp(_event: MouseEvent) {
            // Stop dragging on mouseup
            if (this._isDragging) {
                this.endDrag();
            }
        }

        private endDrag() {
            if (this._dragFrame !== undefined) {
                cancelAnimationFrame(this._dragFrame);
                this._dragFrame = undefined;
            }

            this._dragAnchor = undefined;
            this._dragPointerY = undefined;
            this._dragGeometry = undefined;
            this._isDragging = false;
            this.container?.classList.remove("cm-minimap-overlay-active");
            document.body.style.removeProperty("cursor");
        }

        private onMouseMove(event: MouseEvent) {
            if (!this._isDragging || this._dragAnchor === undefined) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            this._dragPointerY = event.clientY;

            /**
             * At most one move per frame. A trackpad reports positions faster
             * than the screen can show them, and acting on each one means
             * reading the layout back immediately after the last one wrote to
             * it — the reading is what costs, and none of the extra readings
             * can reach the screen anyway.
             */
            if (this._dragFrame === undefined) {
                this._dragFrame = requestAnimationFrame(() => {
                    this._dragFrame = undefined;
                    this.dragToPointer();
                });
            }
        }

        private dragToPointer() {
            if (
                !this._isDragging ||
                this._dragAnchor === undefined ||
                this._dragPointerY === undefined ||
                !this.container ||
                !this.dom
            ) {
                return;
            }

            this._dragGeometry ??= readGeometry(this.view);

            /**
             * The overlay's drawn height, rather than a freshly computed one:
             * the anchor was taken against what is on the screen, the two rows
             * a frame of lag can cost are invisible at this scale, and reading
             * it is a single box where computing it means bisecting the height
             * map twice.
             */
            const overlayHeight = this.dom.getBoundingClientRect().height;
            const containerTop = this.container.getBoundingClientRect().top;

            const top =
                this._dragPointerY -
                this._dragAnchor * overlayHeight -
                containerTop;

            scrollToRow(this.view, rowAtOverlayTop(this._dragGeometry, top));
        }

        public destroy() {
            this.remove();
        }
    },
    {
        eventHandlers: {
            scroll(event) {
                requestAnimationFrame(() => this.position(event));
            },
        },
    },
);

export const Overlay = [Theme, OverlayView];
