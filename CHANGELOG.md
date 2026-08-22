# Change Log

All notable changes to the "Reqly" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

[unreleased]: https://github.com/reqly-labs/vscode-extension/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/reqly-labs/vscode-extension/releases/tag/v1.0.0
