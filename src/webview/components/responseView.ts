import { formatBytes, formatDuration, prettyPrint } from '../../core/format';
import { post, schedulePersist } from '../bridge';
import { el, replace } from '../dom';
import { languageFor } from '../highlight';
import { icon } from '../icons';
import { getState, mutate, watch, type ReadonlyAppState } from '../store';
import { createViewer } from './codeEditor';
import { createTabs } from './tabs';

type ResponseValue = NonNullable<ReadonlyAppState['response']>;

type ErrorValue = NonNullable<ReadonlyAppState['error']>;

interface Outcome {
    loading: boolean;
    error: ErrorValue | null;
    response: ResponseValue | null;
}

function selectOutcome(state: ReadonlyAppState): Outcome {
    return { loading: state.loading, error: state.error, response: state.response };
}

function statusClass(status: number): string {
    if (status >= 200 && status < 300) {
        return 'status-success';
    }

    if (status >= 300 && status < 400) {
        return 'status-info';
    }

    if (status >= 400 && status < 500) {
        return 'status-warning';
    }

    return 'status-danger';
}

function fileNameFor(response: ResponseValue): string {
    const type = response.contentType.split(';')[0]?.trim() ?? '';
    const extension = type.includes('json')
        ? 'json'
        : type.includes('xml')
          ? 'xml'
          : type.includes('html')
            ? 'html'
            : type.split('/')[1] || 'txt';

    return `response.${extension}`;
}

export function createResponseView(): HTMLElement {
    const content = el('div', { class: 'pane-host' });
    const meta = el('div', { class: 'response-meta' });
    const head = el('div', { class: 'panel-head response-head' });
    const viewer = createViewer(getState().wrapLines);
    const bodyPane = el('div', { class: 'pane response-body-pane' });
    const headersPane = el('div', { class: 'pane response-headers' });
    const timelinePane = el('div', { class: 'pane response-timeline' });
    const tabs = createTabs({
        items: [
            { id: 'body', label: 'Body' },
            { id: 'headers', label: 'Headers' },
            { id: 'timeline', label: 'Timeline' },
        ],
        active: getState().activeResponseTab,
        onChange: (id) => {
            mutate((draft) => {
                draft.activeResponseTab = id;
            });
            showPane();
            schedulePersist();
        },
    });

    function showPane(): void {
        const panes: Record<string, HTMLElement> = {
            body: bodyPane,
            headers: headersPane,
            timeline: timelinePane,
        };

        replace(content, panes[getState().activeResponseTab] ?? bodyPane);
    }

    const root = el('section', { class: 'panel response-panel' }, head, meta, content);

    function renderIdle(): void {
        replace(head);
        replace(meta);
        replace(
            content,
            el(
                'div',
                { class: 'placeholder' },
                icon('inbox', 'placeholder-icon'),
                el('p', { text: 'Send a request to see the response.' })
            )
        );
    }

    function renderLoading(): void {
        replace(head);
        replace(meta);
        replace(
            content,
            el(
                'div',
                { class: 'placeholder' },
                icon('spinner', 'placeholder-icon is-spinning'),
                el('p', { text: 'Sending request…' })
            )
        );
    }

    function renderError(error: ErrorValue): void {
        replace(head);
        replace(meta);
        replace(
            content,
            el(
                'div',
                { class: 'placeholder is-error' },
                icon('alert', 'placeholder-icon'),
                el('p', { class: 'error-title', text: error.message || 'Request failed.' }),
                error.detail ? el('p', { class: 'error-detail', text: error.detail }) : null
            )
        );
    }

    function renderMeta(response: ResponseValue): void {
        const stats = el(
            'div',
            { class: 'meta-stats' },
            el('span', {
                class: `status-pill ${statusClass(response.status)}`,
                text: `${response.status} ${response.statusText}`.trim(),
            }),
            el(
                'span',
                { class: 'meta-stat' },
                el('strong', { text: formatDuration(response.timings.total) })
            ),
            el('span', { class: 'meta-stat' }, el('strong', { text: formatBytes(response.size) })),
            response.redirects.length > 0
                ? el('span', {
                      class: 'meta-chip',
                      text: `${response.redirects.length} redirect${response.redirects.length > 1 ? 's' : ''}`,
                  })
                : null
        );
        const actions = el('div', { class: 'meta-actions' });

        if (!response.binary) {
            actions.append(
                toggleButton('Pretty', getState().prettyPrint, (value) => {
                    mutate((draft) => {
                        draft.prettyPrint = value;
                    });
                    renderBody(response);
                }),
                toggleButton('Wrap', getState().wrapLines, (value) => {
                    mutate((draft) => {
                        draft.wrapLines = value;
                    });
                    viewer.setWrap(value);
                }),
                el(
                    'button',
                    {
                        class: 'ghost-btn',
                        type: 'button',
                        on: {
                            click: () =>
                                post({
                                    type: 'copy',
                                    text: currentText(response),
                                    label: 'Response body',
                                }),
                        },
                    },
                    icon('copy'),
                    'Copy'
                )
            );
        }

        actions.append(
            el(
                'button',
                {
                    class: 'ghost-btn',
                    type: 'button',
                    on: {
                        click: () =>
                            post({ type: 'saveResponse', fileName: fileNameFor(response) }),
                    },
                },
                icon('save'),
                'Save'
            )
        );
        replace(meta, stats, actions);
    }

    function toggleButton(
        label: string,
        active: boolean,
        onChange: (value: boolean) => void
    ): HTMLElement {
        const button = el('button', {
            class: `ghost-btn${active ? ' is-active' : ''}`,
            type: 'button',
            text: label,
            on: {
                click: () => {
                    const next = !button.classList.contains('is-active');

                    button.classList.toggle('is-active', next);
                    onChange(next);
                },
            },
        });

        return button;
    }

    function currentText(response: ResponseValue): string {
        return getState().prettyPrint
            ? prettyPrint(response.body, response.contentType)
            : response.body;
    }

    function noticeText(response: ResponseValue): string | null {
        if (response.capped) {
            return `The download stopped at ${formatBytes(response.size)}. Raise "Max response size" in the request settings to keep more.`;
        }

        if (response.truncated) {
            return `Showing the first ${formatBytes(response.shown)} of ${formatBytes(response.size)}. Save writes the whole body to disk.`;
        }

        return null;
    }

    function renderBody(response: ResponseValue): void {
        const notice = noticeText(response);

        if (response.previewUri) {
            replace(
                bodyPane,
                el(
                    'div',
                    { class: 'image-preview' },
                    el('img', { src: response.previewUri, alt: 'Response preview' })
                )
            );

            return;
        }

        if (response.binary || !response.body) {
            replace(
                bodyPane,
                el(
                    'div',
                    { class: 'placeholder' },
                    icon(response.binary ? 'file' : 'alert', 'placeholder-icon'),
                    el('p', {
                        text: response.binary
                            ? `Binary response (${response.contentType || 'unknown type'}), ${formatBytes(response.size)}.`
                            : `The response is ${formatBytes(response.size)}, too large to preview here.`,
                    }),
                    el('p', {
                        class: 'error-detail',
                        text: notice ?? 'Use Save to write it to disk.',
                    })
                )
            );

            return;
        }

        viewer.setContent(currentText(response), languageFor(response.contentType));
        viewer.setWrap(getState().wrapLines);
        replace(
            bodyPane,
            notice ? el('p', { class: 'response-notice', text: notice }) : null,
            viewer.root
        );
    }

    function renderHeaders(response: ResponseValue): void {
        if (response.headers.length === 0) {
            replace(headersPane, el('p', { class: 'empty-hint', text: 'No response headers.' }));

            return;
        }

        replace(
            headersPane,
            ...response.headers.map(([key, value]) =>
                el(
                    'div',
                    { class: 'header-row' },
                    el('span', { class: 'header-key', text: key }),
                    el('span', { class: 'header-value', text: value })
                )
            )
        );
    }

    function renderTimeline(response: ResponseValue): void {
        const { timings } = response;
        const phases: [string, number][] = [
            ['DNS lookup', timings.dns],
            ['TCP connect', timings.connect],
            ['TLS handshake', timings.tls],
            ['Waiting (TTFB)', timings.wait],
            ['Download', timings.download],
        ];
        const total = Math.max(1, timings.total);

        replace(
            timelinePane,
            el(
                'div',
                { class: 'timeline' },
                ...phases.map(([label, value]) =>
                    el(
                        'div',
                        { class: 'timeline-row' },
                        el('span', { class: 'timeline-label', text: label }),
                        el(
                            'span',
                            { class: 'timeline-track' },
                            el('span', {
                                class: 'timeline-fill',
                                attrs: { style: `width:${Math.min(100, (value / total) * 100)}%` },
                            })
                        ),
                        el('span', { class: 'timeline-value', text: `${value} ms` })
                    )
                ),
                el(
                    'div',
                    { class: 'timeline-row is-total' },
                    el('span', { class: 'timeline-label', text: 'Total' }),
                    el('span', { class: 'timeline-track' }),
                    el('span', { class: 'timeline-value', text: `${timings.total} ms` })
                )
            ),
            el(
                'div',
                { class: 'timeline-meta' },
                el('p', {}, el('strong', { text: 'Final URL: ' }), response.finalUrl),
                el('p', {}, el('strong', { text: 'Protocol: ' }), `HTTP/${response.httpVersion}`),
                ...response.redirects.map((hop, index) =>
                    el(
                        'p',
                        { class: 'redirect-hop' },
                        el('strong', { text: `↳ ${index + 1}. ` }),
                        hop
                    )
                )
            )
        );
    }

    function renderResponse(response: ResponseValue): void {
        replace(head, tabs.root);
        tabs.setBadge(
            'headers',
            response.headers.length > 0 ? String(response.headers.length) : null
        );
        renderMeta(response);
        renderBody(response);
        renderHeaders(response);
        renderTimeline(response);
        showPane();
    }

    watch(selectOutcome, (outcome) => {
        if (outcome.loading) {
            renderLoading();

            return;
        }

        if (outcome.error) {
            renderError(outcome.error);

            return;
        }

        if (outcome.response) {
            renderResponse(outcome.response);

            return;
        }

        renderIdle();
    });

    return root;
}
