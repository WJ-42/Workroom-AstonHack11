// Keeps the login across page refreshes. sessionStorage is per tab and is
// cleared when the tab closes, so closing the tab still logs you out.
const KEY = 'workroom_session'

export interface SavedSession {
  token: string
  email: string
  displayName: string
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable (private mode, quota): the login just won't survive a refresh.
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SavedSession).token === 'string' &&
      typeof (parsed as SavedSession).email === 'string' &&
      typeof (parsed as SavedSession).displayName === 'string' &&
      (parsed as SavedSession).token !== ''
    ) {
      return parsed as SavedSession
    }
  } catch {
    // fall through to clearing the unreadable entry
  }
  clearSession()
  return null
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
