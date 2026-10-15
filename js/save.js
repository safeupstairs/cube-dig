const KEY = 'cube-dig-v3';
const LEGACY_KEYS = ['cube-dig-v2', 'cube-dig-v1'];

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    console.warn('Could not save Cube Dig');
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
}
