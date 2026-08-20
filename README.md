# Reqly for VS Code

Bring [Reqly](https://github.com/arturbomtempo-dev/reqly)'s HTTP client experience directly into
VS Code. Compose a request, send it, and read the response without leaving the editor — styled with
the Reqly design system and themed alongside your editor.

Requests run in the extension host over Node's own HTTP stack, so there is no browser sandbox in the
way: `localhost` APIs, self-signed certificates, and arbitrary headers all work.

## Features

- **Every method** — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and `OPTIONS`.
- **Query parameters and headers** with per-row enable toggles.
- **Bodies** — JSON, XML, plain text, URL-encoded, multipart form data (with real file attachments)
  and raw binary files.
- **Authentication** — Bearer token, Basic auth and API key, placed in a header or the query string.
- **Response inspector** — status, duration and size, syntax-highlighted body with pretty-print and
  wrapping, full response headers, and image previews.
- **Timing waterfall** — DNS, TCP, TLS, time-to-first-byte and download, plus the redirect chain and
  final URL.
- **cURL in and out** — paste a `curl` command into the URL field to import it, or copy the current
  request back out as one.
- **Request settings** — timeout, redirect following, and TLS certificate verification.
- **Automatic decompression** for `gzip`, `deflate` and `brotli`, with charset-aware text decoding.

## Getting started

1. Open the Reqly view from the activity bar and choose **New Request**, or run
   **Reqly: Open HTTP Client** from the command palette.
2. Pick a method, type a URL, and press <kbd>Enter</kbd>.

## Commands

| Command                   | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `Reqly: Open HTTP Client` | Opens the request panel in the editor area.     |
| `Reqly: New Request`      | Clears the panel and starts from a blank slate. |
| `Reqly: Send Request`     | Sends whatever the panel currently holds.       |

## Keyboard shortcuts

| Shortcut                                        | Action                          |
| ----------------------------------------------- | ------------------------------- |
| <kbd>Enter</kbd> in the URL field               | Send the request                |
| <kbd>Ctrl</kbd> <kbd>Enter</kbd>                | Send from anywhere in the panel |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Enter</kbd> | Send from anywhere in VS Code   |

## Development

```bash
npm install
npm run watch      # rebuild the extension and webview bundles on change
```

Press <kbd>F5</kbd> to launch an Extension Development Host.

```bash
npm run check-types   # TypeScript
npm run lint          # ESLint
npm run compile-tests # build the unit tests into out/
npm test              # run them
```

The extension bundles two entry points: `src/extension.ts` runs in the Node extension host and owns
the transport, while `src/webview/main.ts` runs in the panel. They share the pure modules under
`src/core`, and communicate through the typed messages in `src/core/messages.ts`.

## License

MIT
