# Change Log

All notable changes to the "Reqly" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

[unreleased]: https://github.com/reqly-labs/vscode-extension/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.1.0
[1.0.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.0.0
