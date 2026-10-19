// Served and injected by the development server only.
const changes = new URLSearchParams(location.search).get('live-reload') === 'off' ? null : new EventSource('/__dev/events');
let styles = Promise.resolve();
changes?.addEventListener('change', event => {
  const { paths } = JSON.parse(event.data);
  if (paths.some(path => !path.endsWith('.css'))) {
    window.dispatchEvent(new Event('stencil:before-reload'));
    location.reload();
    return;
  }
  styles = styles.then(async () => {
    for (const path of paths) {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(link => new URL(link.href).pathname === path);
      if (!links.length) continue;
      await Promise.all(links.map(link => new Promise(resolve => {
        const replacement = link.cloneNode();
        const url = new URL(link.href);
        url.searchParams.set('dev-update', Date.now());
        replacement.href = url.href;
        replacement.onload = () => { link.remove(); resolve(); };
        replacement.onerror = () => { replacement.remove(); resolve(); };
        link.after(replacement);
      })));
    }
  });
});
