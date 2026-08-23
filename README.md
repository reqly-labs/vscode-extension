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

### Collections that keep their shape

The Reqly panel in the Activity Bar holds your whole workspace: collections at the top level, folders
nested inside them, and requests anywhere, including loose at the root when a collection would be
overkill. Create, rename, duplicate, delete and reorder from a right-click menu or by dragging rows
around. Renaming happens inline, on a double click or `F2`, the way the file explorer works.

Everything is stored globally rather than per project, so your collections are there in every window
and survive closing VS Code, updating the extension, and restarting the machine.

The structure is normalized internally and every operation addresses a single node by its own id,
never by a parent-plus-child pair. Moving a request while it is open cannot make a later save land on
the wrong row, because nothing anywhere caches which collection a request belongs to. On load the
stored tree is validated and, if it is ever inconsistent, repaired deterministically and reported
rather than silently reshaped.

### A request panel wired to your collections

Clicking a request in the sidebar opens it in the panel and links the two. The header shows its name,
the collection and folder it lives in, and a dot when there are unsaved edits. **Save** or `Ctrl+S`
writes the changes back; an unlinked request offers **Save to…** and asks where it should live.

Renaming, moving or deleting a request from the sidebar while it is open is handled live: the header
follows the rename, and a delete simply unlinks the panel instead of leaving it pointing at something
that no longer exists.

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
follows your editor between light and dark themes, live, with no configuration. Nothing is lost on a
reload: collections follow you across every window, and the request you were editing, saved or not,
comes back exactly as you left it in that workspace.

## Getting started

1. Click the Reqly duck in the Activity Bar.
2. Hit **New Request** to start a loose request, or **New Collection** to group a few together.
3. Name it inline, pick a method, type a URL, and press `Enter`.
4. Press `Ctrl+S` to save your changes back to the request.

## Commands

| Command                   | Description                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| `Reqly: New Request`      | Creates a request, opens it in the panel, and starts renaming it.     |
| `Reqly: New Collection`   | Creates a collection and starts renaming it.                          |
| `Reqly: Open HTTP Client` | Opens the request panel in the editor area.                           |
| `Reqly: Send Request`     | Sends whatever the panel currently holds.                             |
| `Reqly: Save Request`     | Writes the panel back to its saved request, asking where if unlinked. |

## Keyboard shortcuts

In the request panel:

| Shortcut                           | Action                          |
| ---------------------------------- | ------------------------------- |
| `Enter` in the URL field           | Send the request                |
| `Ctrl+Enter` / `Cmd+Enter`         | Send from anywhere in the panel |
| `Ctrl+S` / `Cmd+S`                 | Save the request                |
| `Ctrl+Alt+Enter` / `Cmd+Alt+Enter` | Send from anywhere in VS Code   |

In the collections sidebar:

| Shortcut     | Action                            |
| ------------ | --------------------------------- |
| `↑` / `↓`    | Move the selection                |
| `Enter`      | Open a request, or toggle a group |
| `F2`         | Rename the selected item          |
| `Delete`     | Delete the selected item          |
| Double click | Rename inline                     |
| Right click  | Open the context menu             |

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

The extension ships three bundles that never import each other, only the pure modules between them:

```
src/
├── core/         → pure logic shared by every bundle
│                   (types, the collection tree, curl, formatting, message contracts)
├── http/         → the transport: build a request, execute it, decode the response (Node only)
├── panel/        → the request panel controller and its HTML shell
├── providers/    → the collections sidebar controller and its HTML shell
├── services/     → persisted state, backed by VS Code Mementos
├── utils/        → small shared helpers
├── collections/  → the UI that runs inside the sidebar (DOM only, no VS Code API)
└── webview/      → the UI that runs inside the panel (DOM only, no VS Code API)
    └── components/
```

`src/extension.ts` runs in the Node extension host and owns the network, the file system, the
clipboard and the collection tree. `src/webview/main.ts` and `src/collections/main.ts` run inside
their webviews and own only the DOM. They never share objects, only the typed messages declared in
`src/core/messages.ts` and `src/core/collectionsMessages.ts`, which keeps the boundary explicit and
every side independently testable. Everything under `src/core` is free of both `vscode` and
`document`, which is exactly why the test suite can exercise it directly.

The collection tree deserves its own note. It lives in `src/core/workspace.ts` as a normalized map of
nodes plus ordered `childIds`, with no stored parent pointers: a node's parent is always derived, so
two sources of truth cannot disagree. Every mutation is a pure function taking a single node id and
returning either a new tree or a reason it refused, which means an operation can never quietly land
on the wrong row or silently do nothing. `WorkspaceService` is the only writer, and the sidebar
webview receives a flat list of rows to draw rather than the tree itself, so it makes no structural
decisions at all.

## Requirements

- Visual Studio Code `^1.134.0`.
- Network access to whatever you are calling. Nothing else: Reqly has no account, no telemetry, and
  no backend of its own.

## Extension Settings

Reqly does not add anything to `settings.json`. Request options (timeout, redirect following, TLS
verification) live with the request itself, behind the gear icon next to the send button, so two
workspaces can disagree without fighting over a global setting.

## Known Issues

- One request open at a time: opening another replaces what the panel is showing, and sending again
  replaces the request in flight.
- Deleting is permanent. There is a confirmation prompt, but no undo afterwards.
- Credentials saved inside a request are stored in plain text in VS Code's global state, the same as
  in other local API clients. Treat a saved token the way you would treat one in a scratch file.
- Responses over 5 MB are not previewed in the panel. Use **Save** to write them to disk.
- No request history yet.
- Proxy configuration is not read from VS Code settings yet.

## Roadmap

- Import and export, including Postman and Insomnia collections.
- Environment variables and interpolation.
- Multiple request tabs.
- Request history.
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
