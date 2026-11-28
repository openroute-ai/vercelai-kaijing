export const LOOK_AROUND_KEY = 'kaijing.lookAround';
export const ENTRY_PATH_KEY = 'kaijing.entryPath';

export type KaijingEntryPath = 'drama' | 'media';

export function hasLookedAround(): boolean {
  try {
    return window.localStorage.getItem(LOOK_AROUND_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberLookAround() {
  try {
    window.localStorage.setItem(LOOK_AROUND_KEY, '1');
  } catch {
    /* ignore quota */
  }
}

export function getEntryPath(): KaijingEntryPath | null {
  try {
    const value = window.localStorage.getItem(ENTRY_PATH_KEY);
    return value === 'drama' || value === 'media' ? value : null;
  } catch {
    return null;
  }
}

export function rememberEntryPath(path: KaijingEntryPath) {
  try {
    window.localStorage.setItem(ENTRY_PATH_KEY, path);
  } catch {
    /* ignore quota */
  }
}
