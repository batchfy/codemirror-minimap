# codemirror-minimap

A minimap for CodeMirror 6.

[![npm](https://img.shields.io/npm/v/@batchfy/codemirror-minimap)](https://www.npmjs.com/package/@batchfy/codemirror-minimap)

Published on npm as
[**@batchfy/codemirror-minimap**](https://www.npmjs.com/package/@batchfy/codemirror-minimap).

## Installation

```
npm i @batchfy/codemirror-minimap
```

## Usage

```typescript
import { basicSetup, EditorView } from "codemirror";
import { showMinimap } from "@batchfy/codemirror-minimap";

const create = (v: EditorView) => {
    const dom = document.createElement("div");
    return { dom };
};

const view = new EditorView({
    doc: "",
    extensions: [
        basicSetup,
        showMinimap.compute(["doc"], () => ({
            create,

            // All optional:
            displayText: "characters", // or "blocks"
            showOverlay: "always", // or "mouse-over"
            autohide: false, // hide the minimap until hover
            gutters: [{ 1: "#00FF00", 2: "green" }], // line number -> color
            width: 120, // max width in px, defaults to 120
            hideScrollbar: true, // hide the editor's native scrollbar, default true
            eventHandlers: {
                contextmenu: (e) => onContextMenu(e),
            },
        })),
    ],
    parent: document.querySelector("#editor"),
});
```

Return `null` from `compute` to hide the minimap.

## License

MIT
