/**
 * jsdom implements no layout, and CodeMirror's measure cycle (driven from
 * requestAnimationFrame) calls Range geometry APIs that jsdom leaves out
 * entirely. Without these shims any test that lives long enough for a frame to
 * fire dies with "textRange(...).getClientRects is not a function".
 */

const emptyRect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
};

const emptyRectList = Object.assign([] as DOMRect[], {
    item: () => null,
}) as unknown as DOMRectList;

if (typeof Range !== "undefined") {
    const proto = Range.prototype as unknown as Record<string, unknown>;
    // `in`/hasOwnProperty rather than reading the value, so the check does not
    // trip the unbound-method rule.
    if (!Object.prototype.hasOwnProperty.call(proto, "getClientRects")) {
        proto.getClientRects = () => emptyRectList;
    }
    if (!Object.prototype.hasOwnProperty.call(proto, "getBoundingClientRect")) {
        proto.getBoundingClientRect = () => emptyRect;
    }
}

if (typeof document !== "undefined" && !document.fonts) {
    Object.defineProperty(document, "fonts", {
        value: {
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        },
        configurable: true,
    });
}
