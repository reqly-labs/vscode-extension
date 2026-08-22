<p align="center">
  <img src="media/icon.png" width="120" height="120" alt="Reqly icon" />
</p>

<h1 align="center">Reqly</h1>

<p align="center">
  A modern, lightweight HTTP client that lives inside VS Code. Compose a request, send it, and read the response without ever leaving the editor.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=arturbomtempo-dev.reqly"><img src="https://vsmarketplacebadges.dev/version/arturbomtempo-dev.reqly.png?label=VS%20Code%20Marketplace&color=blue" alt="VS Code Marketplace Version" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=arturbomtempo-dev.reqly"><img src="https://vsmarketplacebadges.dev/installs/arturbomtempo-dev.reqly.png?label=Installs" alt="Installs" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=arturbomtempo-dev.reqly"><img src="https://vsmarketplacebadges.dev/rating-star/arturbomtempo-dev.reqly.png?label=Rating" alt="Rating" /></a>
  <a href="https://github.com/reqly-labs/vscode-extension/stargazers"><img src="https://img.shields.io/github/stars/reqly-labs/vscode-extension?label=Stars" alt="GitHub Stars" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
</p>

---

## Why Reqly for VS Code exists

[Reqly](https://github.com/reqly-labs/reqly) is an open source HTTP client for developers. The hosted
web app is excellent for public APIs, but a browser can only reach what the browser is allowed to
reach: `localhost` services, self-signed certificates, and reserved headers are all off limits.

This extension removes that ceiling. Requests run in the VS Code extension host over Node's own HTTP
stack, so there is no browser sandbox in the way. The API you are building in one tab is one keystroke
away in the next, and nothing about your request ever leaves your machine.

## Features

### A full request builder

Pick any of the seven HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`), type
a URL, and go. Query parameters and headers live in their own tabs, each row with an enable toggle so
you can park a value without deleting it. Tabs show a live count of everything currently active, so
you always know what is going out on the wire.

Type a bare host such as `api.example.com/health` and Reqly fills in `https://` for you.

### Every body format you actually use

JSON, XML and plain text get a real editor: line numbers, syntax highlighting, auto-closing brackets
and quotes, smart indentation on `Enter`, and a **Beautify** button that reformats JSON in place. URL
encoded forms and multipart form data get a row editor, and multipart fields can carry real file
attachments picked through the native VS Code dialog. You can also send any file from disk as a raw
binary body.

Bodies are skipped automatically on `GET` and `HEAD`, and the right `Content-Type` is inferred unless
you set one yourself.

### Authentication without boilerplate

Bearer tokens (with a customizable scheme prefix), Basic auth, and API keys that go either into a
header or into the query string. Reqly encodes and attaches the credential at send time, so it never
clutters your headers tab.

### A response inspector that answers questions

Status code, duration and payload size sit above a syntax-highlighted body with pretty-print and line
wrapping toggles. Images render as an actual preview. Binary and oversized responses are recognized
instead of dumped as noise, and both can be written straight to disk with **Save**. Full response
headers get their own tab, with a live count.

### A timing waterfall

The **Timeline** tab breaks the request down into DNS lookup, TCP connect, TLS handshake, time to
first byte, and download, each with its own bar. Below it you get the negotiated HTTP protocol, the
final URL, and every hop of the redirect chain that led there. Timings are measured per hop and added
up, so the numbers stay honest even when a request is redirected several times.

### cURL in and out

Paste a `curl` command anywhere in the URL field and Reqly imports it: method, URL, query string,
headers, body, and `-F` form fields, including `@path` file attachments. It recognizes the common flag
spellings (`-X`/`--request`, `-H`/`--header`, `-d`/`--data-raw`/`--data-binary`, `-F`/`--form`,
`-u`/`--user`, `--url`) and picks the request tab most worth showing you afterwards.

Going the other way, **Copy as cURL** in the send menu turns whatever is on screen into a runnable
command, ready to paste into a terminal, a ticket, or a teammate's chat.

### Per-request settings

A gear next to the send button controls the request timeout, whether 3xx responses are followed
automatically, and whether TLS certificates are verified. Turn verification off and a self-signed
development certificate stops being a wall.

Redirects are handled carefully: `Authorization` and `Cookie` headers are dropped when a hop crosses
origins, and the request body and its `Content-Type` are dropped when the status code says they
should be.

### Built for real payloads

Responses are decompressed automatically for `gzip`, `deflate` and `brotli`, and text is decoded
using the charset the server declared rather than a guess. Long-running requests can be cancelled
mid-flight with the same button that sent them.

### At home in your editor

Every color comes from the [Reqly design system](https://github.com/reqly-labs/design-system) and
follows your editor between light and dark themes, live, with no configuration. Your request survives
a reload: method, URL, params, headers, body, auth and settings are all persisted per workspace.

## Getting started

1. Click the Reqly duck in the Activity Bar and choose **New Request**, or run **Reqly: Open HTTP
   Client** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Pick a method, type a URL, and press `Enter`.

## Commands

| Command                   | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `Reqly: Open HTTP Client` | Opens the request panel in the editor area.     |
| `Reqly: New Request`      | Clears the panel and starts from a blank slate. |
| `Reqly: Send Request`     | Sends whatever the panel currently holds.       |

## Keyboard shortcuts

| Shortcut                           | Action                          |
| ---------------------------------- | ------------------------------- |
| `Enter` in the URL field           | Send the request                |
| `Ctrl+Enter` / `Cmd+Enter`         | Send from anywhere in the panel |
| `Ctrl+Alt+Enter` / `Cmd+Alt+Enter` | Send from anywhere in VS Code   |

## Built with

- **[TypeScript](https://www.typescriptlang.org/)**: the entire extension, strict mode on.
- **[VS Code Extension API](https://code.visualstudio.com/api)**: `WebviewPanel`, `WebviewView`, view
  containers, workspace `Memento` persistence.
- **[Node HTTP/HTTPS](https://nodejs.org/api/http.html)**: the transport, with no third party request
  library in the path.
- **[@reqly/design-system](https://github.com/reqly-labs/design-system)**: tokens and themes shared
  with the rest of the Reqly ecosystem.
- **[esbuild](https://esbuild.github.io/)**: bundles the extension host and the webview separately.
- **[Mocha](https://mochajs.org/) + [@vscode/test-cli](https://github.com/microsoft/vscode-test-cli)**:
  unit tests for the pure layers.
- **[ESLint](https://eslint.org/) + [typescript-eslint](https://typescript-eslint.io/)**: linting.
- **[Prettier](https://prettier.io/)**: formatting.

## Architecture

The extension ships two bundles that never import each other, only the pure modules between them:

```
src/
├── core/       → pure logic shared by both bundles (types, curl, formatting, message contracts)
├── http/       → the transport: build a request, execute it, decode the response (Node only)
├── panel/      → the request panel controller and its HTML shell
├── providers/  → the Activity Bar webview view
├── services/   → persisted state, backed by a workspace Memento
├── utils/      → small shared helpers
└── webview/    → the UI that runs inside the panel (DOM only, no VS Code API)
    └── components/
```

`src/extension.ts` runs in the Node extension host and owns the network, the file system and the
clipboard. `src/webview/main.ts` runs in the panel and owns the DOM. They never share objects, only
the typed messages declared in `src/core/messages.ts`, which keeps the boundary explicit and both
sides independently testable. Everything under `src/core` is free of both `vscode` and `document`,
which is exactly why the test suite can exercise it directly.

## Requirements

- Visual Studio Code `^1.134.0`.
- Network access to whatever you are calling. Nothing else: Reqly has no account, no telemetry, and
  no backend of its own.

## Extension Settings

Reqly does not add anything to `settings.json`. Request options (timeout, redirect following, TLS
verification) live with the request itself, behind the gear icon next to the send button, so two
workspaces can disagree without fighting over a global setting.

## Known Issues

- Only one request at a time: sending again replaces the request in flight.
- Responses over 5 MB are not previewed in the panel. Use **Save** to write them to disk.
- No collections or request history yet. The panel remembers the current request per workspace.
- Proxy configuration is not read from VS Code settings yet.

## Roadmap

- Collections, folders and request history, matching the Reqly web app.
- Multiple request tabs.
- Environment variables and interpolation.
- `.http` and OpenAPI file import.
- Proxy support driven by the editor's own settings.

## Contributing

Contributions are welcome. To run the extension locally:

```bash
npm install
npm run watch
```

Then press `F5` in VS Code to launch an Extension Development Host with Reqly loaded.

Useful scripts:

- `npm run watch`: rebuild both bundles on every change.
- `npm run check-types`: run TypeScript without emitting.
- `npm run lint`: run ESLint over `src`.
- `npm run format`: format the project with Prettier.
- `npm run compile-tests`: build the unit tests into `out/`.
- `npm test`: run the unit test suite.
- `npm run package`: produce the production bundles.

## Following extension guidelines

This extension follows the official Visual Studio Code extension guidelines.

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Related projects

- **[Reqly](https://github.com/reqly-labs/reqly)**: the web application.
- **[Reqly Design System](https://github.com/reqly-labs/design-system)**: the shared tokens and
  themes.

## Author

Built by **Artur Bomtempo**.

- Website: [arturbomtempo.dev](https://www.arturbomtempo.dev)
- GitHub: [@arturbomtempo-dev](https://github.com/arturbomtempo-dev)
- LinkedIn: [in/artur-bomtempo](https://www.linkedin.com/in/artur-bomtempo/)
- Instagram: [@arturbomtempo.dev](https://www.instagram.com/arturbomtempo.dev)
- YouTube: [@ArturBomtempoDev](https://www.youtube.com/@ArturBomtempoDev)

## License

Released under the [MIT License](LICENSE.md).

**Enjoy!**
