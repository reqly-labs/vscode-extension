import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { renderPanelHtml } from '../panel/html';
import { renderCollectionsPage } from '../providers/collectionsPage';
import { createNonce } from '../utils/nonce';

const CSP_SOURCE = 'vscode-webview://test';

function fakeWebview(): vscode.Webview {
    return {
        cspSource: CSP_SOURCE,
        asWebviewUri: (uri: vscode.Uri) => vscode.Uri.parse(`${CSP_SOURCE}${uri.path}`),
    } as unknown as vscode.Webview;
}

function policyOf(html: string): string {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);

    assert.ok(match, 'the page must declare a Content-Security-Policy');

    return match[1];
}

const pages: [string, () => string][] = [
    ['request panel', () => renderPanelHtml(fakeWebview(), vscode.Uri.file('/ext'))],
    [
        'collections view',
        () =>
            renderCollectionsPage({
                scriptUri: `${CSP_SOURCE}/dist/collections.js`,
                styleUri: `${CSP_SOURCE}/dist/collections.css`,
                cspSource: CSP_SOURCE,
                nonce: createNonce(),
            }),
    ],
];

suite('webview content security policy', () => {
    for (const [name, render] of pages) {
        test(`${name} denies everything it does not need`, () => {
            assert.match(policyOf(render()), /default-src 'none'/);
        });

        test(`${name} never allows inline or evaluated script`, () => {
            const policy = policyOf(render());

            assert.equal(policy.includes('unsafe-inline'), false);
            assert.equal(policy.includes('unsafe-eval'), false);
            assert.equal(policy.includes('*'), false);
        });

        test(`${name} admits script only through the nonce`, () => {
            const html = render();
            const scriptSrc = /script-src ([^;"]*)/.exec(policyOf(html));

            assert.ok(scriptSrc);
            assert.match(scriptSrc[1], /^'nonce-[A-Za-z0-9_-]+'$/);
        });

        test(`${name} stamps the same nonce it declared onto its tags`, () => {
            const html = render();
            const declared = /'nonce-([A-Za-z0-9_-]+)'/.exec(policyOf(html));

            assert.ok(declared);

            const token = declared[1];
            const tags = [...html.matchAll(/<(script|style)\b[^>]*>/g)];

            assert.ok(tags.length >= 2, 'expected the page to carry a script and a style tag');

            for (const [tag] of tags) {
                assert.ok(
                    tag.includes(`nonce="${token}"`),
                    `tag without the declared nonce: ${tag}`
                );
            }
        });

        test(`${name} issues a fresh nonce on every render`, () => {
            const first = /'nonce-([A-Za-z0-9_-]+)'/.exec(policyOf(render()))?.[1];
            const second = /'nonce-([A-Za-z0-9_-]+)'/.exec(policyOf(render()))?.[1];

            assert.ok(first && second);
            assert.notEqual(first, second);
        });
    }
});

suite('createNonce', () => {
    test('is long enough to be worth guessing', () => {
        assert.ok(createNonce().length >= 32);
    });

    test('uses only characters that survive an HTML attribute untouched', () => {
        for (let i = 0; i < 200; i += 1) {
            assert.match(createNonce(), /^[A-Za-z0-9_-]+$/);
        }
    });

    test('does not repeat itself', () => {
        const seen = new Set<string>();

        for (let i = 0; i < 2000; i += 1) {
            seen.add(createNonce());
        }

        assert.equal(seen.size, 2000);
    });
});
