For simple changes (IE: adding a "download" button), you do not need to run the test suite or verify in a browser. The user can do that.

Do not add shell redirection (`>`, `>>`, or `2>&1`), pipes, or an extra shell wrapper merely to capture or limit output. Use the execution tool's output capture, output limits, and session polling instead. This keeps command invocations compatible with saved prefix permissions.

When requesting command approval, propose a reusable prefix scoped to the specific tool or script, omitting trailing arguments that vary between runs. For example, use `["python3", "/private/tmp/stencil-browser-check.py"]` rather than including `material-editing` or another check name. Do not request a broad interpreter-only prefix such as `["python3"]`.

Do not use desktop capture, prefer a headless browser.

Do not use middots in UI text or written responses. Use dashes, parentheses, periods, pills, or a bold title followed by a colon and definition instead.
