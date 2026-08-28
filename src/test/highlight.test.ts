import { JSDOM } from 'jsdom';
import * as assert from 'node:assert/strict';
import { escapeHtml } from '../webview/dom';
import { highlight, languageFor, type Language } from '../webview/highlight';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
const host = dom.window.document.getElementById('host') as HTMLElement;

function render(source: string, language: Language): string {
    host.innerHTML = highlight(source, language);

    return host.textContent ?? '';
}

function assertNoMarkupEscapes(source: string, language: Language): void {
    assert.equal(
        render(source, language),
        source,
        `highlighting changed the text or leaked markup for ${language}`
    );
    assert.equal(
        host.querySelector('script, img, iframe, svg'),
        null,
        `highlighting produced live markup for ${language}`
    );
}

const HOSTILE = [
    '<script>alert(1)</script>',
    '</span><script>alert(1)</script><span>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "'; alert(1); //",
    '<!-- <script> -->',
    '&lt;script&gt;',
    '&&&<<<>>>"""\'\'\'',
];

suite('escapeHtml', () => {
    test('escapes every character that can start markup', () => {
        assert.equal(escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#39;');
    });

    test('escapes the ampersand first so entities are not double-formed', () => {
        assert.equal(escapeHtml('&lt;'), '&amp;lt;');
    });

    test('leaves ordinary text alone', () => {
        assert.equal(escapeHtml('hello world'), 'hello world');
    });
});

suite('highlight keeps hostile response bodies inert', () => {
    for (const payload of HOSTILE) {
        test(`neutralises ${JSON.stringify(payload)} in every language`, () => {
            for (const language of ['json', 'xml', 'text'] as Language[]) {
                assertNoMarkupEscapes(payload, language);
            }
        });
    }

    test('neutralises markup hidden inside a JSON string value', () => {
        assertNoMarkupEscapes('{"a":"<script>alert(1)</script>","b":1}', 'json');
    });

    test('neutralises markup hidden inside an XML attribute', () => {
        assertNoMarkupEscapes('<a href="javascript:alert(1)">&lt;b&gt;</a>', 'xml');
    });

    test('neutralises markup in a body too large to tokenise', () => {
        const padding = 'x'.repeat(400001);

        assertNoMarkupEscapes(`${padding}<script>alert(1)</script>`, 'json');
    });
});

suite('highlight preserves the text it is given', () => {
    const samples: [string, Language][] = [
        ['{"name":"Ada","age":36,"ok":true,"nested":{"list":[1,2,null]}}', 'json'],
        ['{ malformed json, "still": text }', 'json'],
        ['', 'json'],
        ['<root attr="1"><child/></root>', 'xml'],
        ['<!-- comment --><a b=\'c\'>text</a>', 'xml'],
        ['plain text with < and & inside', 'text'],
        ['{"unicode":"café ✓ 🦆"}', 'json'],
    ];

    for (const [source, language] of samples) {
        test(`round-trips ${language}: ${JSON.stringify(source.slice(0, 40))}`, () => {
            assert.equal(render(source, language), source);
        });
    }

    test('wraps JSON tokens in classes rather than plain text', () => {
        host.innerHTML = highlight('{"a":1}', 'json');

        assert.ok(host.querySelector('.tok-key'), 'expected the key to be marked');
        assert.ok(host.querySelector('.tok-number'), 'expected the number to be marked');
    });
});

suite('languageFor', () => {
    test('recognises the content types that get highlighted', () => {
        assert.equal(languageFor('application/json; charset=utf-8'), 'json');
        assert.equal(languageFor('application/ld+json'), 'json');
        assert.equal(languageFor('text/xml'), 'xml');
        assert.equal(languageFor('text/html'), 'xml');
        assert.equal(languageFor('text/plain'), 'text');
        assert.equal(languageFor(''), 'text');
    });
});
