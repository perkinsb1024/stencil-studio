For simple changes (IE: adding a "download" button), you do not need to run the test suite or verify in a browser. The user can do that.

Do not add shell redirection (`>`, `>>`, or `2>&1`), pipes, or an extra shell wrapper merely to capture or limit output. Use the execution tool's output capture, output limits, and session polling instead. This keeps command invocations compatible with saved prefix permissions.

Do not use desktop capture, prefer a headless browser.