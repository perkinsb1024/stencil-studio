// Browser workflows must wait for worker calculations, including chained jobs.
export async function previewReady(document) {
  const deadline = performance.now() + 30000;
  do {
    await new Promise(resolve => setTimeout(resolve, 25));
    if (performance.now() > deadline) throw new Error('Timed out waiting for geometry');
  } while (document.querySelector('[aria-busy="true"]'));
}
