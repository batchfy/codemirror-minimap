/**
 * jsdom does not implement `getContext`, so tests install this recorder in its
 * place. It doubles as the assertion surface: every draw call and every state
 * mutation is appended to `calls` in order, which is what lets a test say
 * "globalAlpha was 1 when the first fillText happened".
 */

export type Call = { op: string; args: unknown[] };

const METHODS = [
    "clearRect",
    "fillText",
    "measureText",
    "beginPath",
    "rect",
    "fill",
    "save",
    "restore",
    "drawImage",
] as const;

const PROPS = ["fillStyle", "font", "textBaseline", "globalAlpha"] as const;

export class RecordingContext {
    public calls: Array<Call> = [];
    public canvas: HTMLCanvasElement;

    public constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        for (const prop of PROPS) {
            let value: unknown = prop === "globalAlpha" ? 1 : "";
            Object.defineProperty(this, prop, {
                get: () => value,
                set: (next: unknown) => {
                    value = next;
                    this.calls.push({ op: `set:${prop}`, args: [next] });
                },
                enumerable: true,
            });
        }

        for (const method of METHODS) {
            Object.defineProperty(this, method, {
                value: (...args: unknown[]) => {
                    this.calls.push({ op: method, args });
                    // Width is proportional to length so offset math stays sane.
                    if (method === "measureText") {
                        const text = typeof args[0] === "string" ? args[0] : "";
                        return { width: text.length * 2 };
                    }
                    return undefined;
                },
                enumerable: true,
            });
        }
    }

    public reset() {
        this.calls = [];
    }

    public ops(name: string): Array<Call> {
        return this.calls.filter((c) => c.op === name);
    }

    public count(name: string): number {
        return this.ops(name).length;
    }

    /** Value of `prop` at every call to `op`, in order. */
    public valuesAt(prop: string, op: string): Array<unknown> {
        let current: unknown = prop === "globalAlpha" ? 1 : undefined;
        const out: Array<unknown> = [];
        for (const call of this.calls) {
            if (call.op === `set:${prop}`) current = call.args[0];
            if (call.op === op) out.push(current);
        }
        return out;
    }

    /** Value of `prop` at the moment the `nth` call to `op` was made. */
    public valueAt(prop: string, op: string, nth = 0): unknown {
        let current: unknown = prop === "globalAlpha" ? 1 : undefined;
        let seen = 0;
        for (const call of this.calls) {
            if (call.op === `set:${prop}`) {
                current = call.args[0];
            }
            if (call.op === op) {
                if (seen === nth) return current;
                seen++;
            }
        }
        return undefined;
    }
}

/** Installs the recorder and returns the context handed to the next canvas. */
export function installCanvasRecorder(): { contexts: RecordingContext[] } {
    const contexts: RecordingContext[] = [];

    HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        kind: string,
    ) {
        if (kind !== "2d") return null;
        const existing = contexts.find((c) => c.canvas === this);
        if (existing) return existing;
        const ctx = new RecordingContext(this);
        contexts.push(ctx);
        return ctx;
    } as unknown as HTMLCanvasElement["getContext"];

    return { contexts };
}
