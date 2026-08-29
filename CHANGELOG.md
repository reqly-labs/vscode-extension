# Change Log

All notable changes to the "Reqly" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.4.1] - 2026-08-29

### Fixed

- Editing a variable no longer takes the focus away. The variables editor rebuilt its whole table on
  every change, so tabbing from one field to the next dropped you onto nothing and each field had to
  be clicked again. Edits are now applied to the row that changed, and the panel only redraws when
  something other than a value moves.

## [1.4.0] - 2026-08-29

Environment variables. Write `{{baseUrl}}` once and point it at development, staging or production
without editing a single request.

### Added

- **Environments**: named sets of variables, one in use at a time, chosen from the panel header or
  with `Reqly: Select Environment`. Each one is a JSON file next to your collections, so it can be
  reviewed and committed like the rest of the project.
- **Collection variables**: values that live in the collection file itself and travel with it. An
  environment overrides them, so a collection can ship sensible defaults that a machine can replace.
- **Dynamic variables**, resolved fresh on every send: `{{$guid}}`, `{{$uuid}}`, `{{$timestamp}}`,
  `{{$isoTimestamp}}`, `{{$randomInt}}` and `{{$randomAlphaNumeric}}`. Define a variable with the
  same name and yours wins, so a value can be pinned while debugging.
- **Secret variables**: mark a value with the lock and it goes to the operating system keychain
  instead of the file. Collection variables cannot be marked secret, because that file is meant to be
  shared.
- `{{name}}` is resolved everywhere a request can carry text: URL, query parameters, headers, all
  body formats, form and multipart fields, file paths, and authentication.
- Typing `{{` anywhere offers the names in scope, filtered as you type, with `Enter` or `Tab` to
  accept and the arrow keys to move. Available in the URL, in every key and value field, in the
  request body, and in the authentication fields.
- A name that resolves is painted green; one that nothing defines is painted amber and underlined,
  so a typo is visible before the request goes out.
- A variables editor inside the request panel, with the collection and every environment in one
  place, and the dynamic variables listed so they can be discovered.
- `Reqly: Manage Environments` and `Reqly: Select Environment` commands.

### Changed

- Sending a request warns which names could not be resolved, and sends the text exactly as written
  rather than refusing.
- A variable that refers to another is resolved through, up to eight passes, and a cycle stops
  instead of hanging.

### Fixed

- The Content-Security-Policy nonce is generated with a cryptographic source in every webview.

## [1.3.0] - 2026-08-28

Collections are files now. They used to live in a single opaque blob inside VS Code's global state;
they are plain JSON documents you can read, diff, review and commit.

### Changed

- **Collections are stored as one JSON file per collection** instead of a single state blob. Saving
  one request rewrites one file, not the whole library, and a collection is a readable document
  rather than an entry in a database only VS Code can open.
- Collections written by 1.2.0 are moved into files automatically on first start, and the old state
  key is cleared. Nothing to do by hand; a message says how much was moved and where it went.
- Renaming a collection renames its file. Deleting one deletes its file.
- A file Reqly cannot parse is skipped and named, instead of taking the rest of the library with it.
  The healthy collections still load.
- A credential is never written to a collection file, even when the keychain is unavailable. Files
  can be committed, so an unreachable keychain now means the credential is not saved and you are
  told, rather than the credential being written in the clear.
- A credential found sitting in a collection file — hand-edited in, or pulled from a branch — is
  swept into the keychain and erased from the file on load.

### Added

- `reqly.storage.location`: keep collections in Reqly's global storage (the default, available in
  every window) or in a `.reqly` folder inside the workspace, so they travel with the project and
  can be committed.
- Collections are reloaded when their files change on disk, so switching branches or pulling a
  change updates the sidebar without a restart.

### Fixed

- The Content-Security-Policy nonce for both webviews is generated with a cryptographic random
  source. It used `Math.random()`, which is predictable and unfit for a security token.
- Work started during activation no longer fails silently. A credential restore, a keychain
  migration or a certificate load that fails now says so instead of becoming an unhandled rejection.

## [1.2.0] - 2026-08-28

A bug fix release. Requests that looked ready refused to send, TLS verification ignored the machine's
own certificate authorities, saved credentials sat in plain text, and a large response could take the
extension host down with it.

### Fixed

- Sending a request typed right after another one was opened no longer reports "Enter a URL before
  sending the request." with the URL plainly filled in. The panel's editors held on to the request
  they were mounted with, so edits after loading a second request were written to the previous one
  and silently lost. Params, headers, body, auth and the method were affected the same way.
- Loading a request now repaints the whole panel. The per-request settings kept the previous
  request's timeout, redirect and TLS values, and the response tab selection was never applied.
- TLS verification now trusts the certificate authorities installed on the machine, not only the list
  compiled into Node. Corporate roots, inspection proxies and locally installed development
  authorities are honoured, instead of failing with "unable to verify the first certificate" and
  offering to turn certificate validation off as the only way forward.
- TLS failures say what actually went wrong — expired, issued for another host, self-signed, or a
  chain that could not be verified — and point at the certificate store before the escape hatch.
- The request timeout is now a deadline for the whole request, shared across the redirect chain.
  It only bounded socket inactivity before, so a server trickling a byte at a time was never cut off.
- A response is no longer read into memory without limit. Oversized bodies stop at the configured
  size and are reported as cut short, rather than growing until the extension host runs out of
  memory. The size is measured after decompression, so a small compressed payload cannot expand past
  the limit.
- Editor state left in flight when another request is opened is no longer written over the newly
  opened request.

### Security

- Bearer tokens, Basic auth passwords and API key values are stored in VS Code's `SecretStorage`,
  backed by the operating system keychain, instead of plain text in extension state. Credentials
  already saved are moved on first start; nothing to do by hand. The rest of the request stays
  readable where it was. If the keychain is unavailable the credential is kept where it is rather
  than being dropped.

### Added

- `reqly.certificateAuthority`: paths to extra PEM certificate authorities to trust, for a root that
  is not installed in the operating system store. Reloaded when the setting changes.
- A **Max response size** control next to the timeout in the per-request settings, in megabytes,
  defaulting to 50 MB.

## [1.1.0] - 2026-08-23

Collections. Requests can now be grouped, named and kept, instead of the panel holding one throwaway
request at a time.

### Added

- Collections sidebar in the Activity Bar, replacing the previous placeholder view: collections at
  the top level, folders nested inside them, and requests either inside a group or loose at the root.
- Create, rename, duplicate and delete collections, folders and requests, from a context menu, the
  row actions, the view title bar, or the Command Palette.
- Inline renaming on double click or `F2`, with `Escape` to cancel.
- Drag and drop to move and reorder anything, with distinct drop indicators for landing inside a
  group and landing beside a row.
- Keyboard navigation in the sidebar: arrows to move, `Enter` to open or toggle, `F2` to rename,
  `Delete` to remove.
- Collections persisted in VS Code's global state, so they are present in every window and survive
  restarts and extension updates.
- Panel header showing the open request's name, the collection and folder it lives in, and an unsaved
  changes indicator.
- `Save` action and `Ctrl+S` in the panel to write edits back to the saved request, with a
  `Save to…` flow that asks for a destination when the request is not linked yet.
- `Reqly: New Collection` and `Reqly: Save Request` commands.
- Welcome state with quick actions, and a footer showing collection and request counts alongside a
  link to the GitHub organization.
- Integrity check on load that repairs an inconsistent stored tree, reporting what it changed instead
  of silently reshaping it.

### Changed

- `Reqly: New Request` now creates a real request in the tree and opens it, rather than clearing the
  panel to a blank slate. Creating a request means the same thing everywhere it is offered.
- The request panel no longer steals focus when a request is opened from the sidebar, so renaming
  stays possible right after creating something.
- Deleting asks for confirmation and, for a collection or folder, says how many items go with it.

### Removed

- The separate About view. Its actions now live in the collections sidebar, which is the only view in
  the container.
- The `Open HTTP Client` button in the sidebar. The panel opens on its own whenever a request is
  opened or created; the command remains in the Command Palette.

## [1.0.0] - 2026-08-22

First public release: a complete HTTP client inside VS Code, running over Node's own network stack so
that `localhost` services, self-signed certificates and arbitrary headers all work.

### Added

- Request panel in the editor area with method, URL, query parameters, headers, body and
  authentication, opened from the Activity Bar or the Command Palette.
- All seven HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and `OPTIONS`.
- Query parameter and header editors with per-row enable toggles and live counts on their tabs.
- Request bodies as JSON, XML, plain text, URL encoded forms, multipart form data with real file
  attachments, or any file from disk sent as a raw binary body.
- Code editor for text bodies, with line numbers, syntax highlighting, bracket and quote completion,
  smart indentation, and a Beautify action for JSON.
- Bearer token, Basic and API key authentication, with API keys placed in either a header or the
  query string.
- Response inspector with status, duration, size, syntax highlighted body, pretty print and line
  wrapping toggles, image previews, and full response headers.
- Timing waterfall covering DNS lookup, TCP connect, TLS handshake, time to first byte and download,
  alongside the negotiated protocol, the final URL and the full redirect chain.
- cURL import by pasting a command into the URL field, covering method, URL, query string, headers,
  body and `-F` form fields including `@path` attachments.
- Copy as cURL and Copy URL from the send menu, and Copy or Save for the response body.
- Per-request settings for timeout, redirect following and TLS certificate verification.
- Automatic decompression of `gzip`, `deflate` and `brotli` responses, with charset aware text
  decoding.
- Redirect handling that drops `Authorization` and `Cookie` headers across origins and drops the
  request body when the status code requires it.
- Cancellation of a request in flight from the same button that sent it.
- Resizable split between the request and response panes, with the layout remembered.
- Request state persisted per workspace, so the panel comes back exactly as you left it.
- Activity Bar view with quick actions, following the Reqly design system across light and dark
  editor themes.
- `Ctrl+Alt+Enter` / `Cmd+Alt+Enter` keybinding to send the current request from anywhere in VS Code.

[unreleased]: https://github.com/reqly-labs/vscode-extension/compare/v1.4.1...HEAD
[1.4.1]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.4.1
[1.4.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.4.0
[1.3.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.3.0
[1.2.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.2.0
[1.1.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.1.0
[1.0.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.0.0
