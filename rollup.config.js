import esbuild from "rollup-plugin-esbuild";
import pkg from "./package.json" with { type: "json" };

// Anything declared as a peer or runtime dependency stays external so the
// bundle only ever contains this package's own source.
const external = [
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.dependencies ?? {}),
].map((name) => new RegExp(`^${name}(/.*)?$`));

export default {
    input: "src/index.ts",
    external,
    output: {
        file: "dist/index.js",
        format: "esm",
        sourcemap: true,
    },
    plugins: [esbuild({ target: "es2022" })],
};
