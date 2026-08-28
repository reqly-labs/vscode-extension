const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

let pending = 0;
let batchErrors = [];

const problemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            if (pending === 0) {
                batchErrors = [];
                console.log('[watch] build started');
            }

            pending += 1;
        });

        build.onEnd((result) => {
            batchErrors.push(...result.errors);
            pending -= 1;

            if (pending > 0) {
                return;
            }

            batchErrors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);

                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });

            console.log('[watch] build finished');
        });
    },
};

const shared = {
    bundle: true,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
};

const targets = [
    {
        ...shared,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension.js',
        format: 'cjs',
        platform: 'node',
        external: ['vscode'],
    },
    {
        ...shared,
        entryPoints: ['src/webview/main.ts'],
        outfile: 'dist/webview.js',
        format: 'iife',
        platform: 'browser',
        target: ['chrome120'],
    },
    {
        ...shared,
        entryPoints: ['src/collections/main.ts'],
        outfile: 'dist/collections.js',
        format: 'iife',
        platform: 'browser',
        target: ['chrome120'],
    },
    {
        ...shared,
        entryPoints: ['src/environments/main.ts'],
        outfile: 'dist/environments.js',
        format: 'iife',
        platform: 'browser',
        target: ['chrome120'],
    },
];

async function main() {
    const contexts = await Promise.all(targets.map((options) => esbuild.context(options)));

    if (watch) {
        await Promise.all(contexts.map((context) => context.watch()));
        return;
    }

    await Promise.all(contexts.map((context) => context.rebuild()));
    await Promise.all(contexts.map((context) => context.dispose()));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
