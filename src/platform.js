export function createEngineWorker() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

export async function loadDemoImage() {
  const response = await fetch(new URL('../assets/desert-observatory.svg', import.meta.url));
  if (!response.ok) throw new Error('Demo image unavailable');
  return response.blob();
}
