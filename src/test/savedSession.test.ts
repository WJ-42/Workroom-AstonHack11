import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession } from '@/auth/savedSession'

const KEY = 'workroom_session'

describe('savedSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('returns null when nothing is saved', () => {
    expect(loadSession()).toBeNull()
  })

  it('round-trips a session', () => {
    saveSession({ token: 'tok', email: 'me@example.com', displayName: 'Me' })
    expect(loadSession()).toEqual({ token: 'tok', email: 'me@example.com', displayName: 'Me' })
  })

  it('clears a saved session', () => {
    saveSession({ token: 'tok', email: 'me@example.com', displayName: 'Me' })
    clearSession()
    expect(loadSession()).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('treats unreadable data as no session and removes it', () => {
    sessionStorage.setItem(KEY, '{not json')
    expect(loadSession()).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('rejects entries with missing or empty fields', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ token: '', email: 'me@example.com', displayName: 'Me' }))
    expect(loadSession()).toBeNull()
    sessionStorage.setItem(KEY, JSON.stringify({ token: 'tok', email: 'me@example.com' }))
    expect(loadSession()).toBeNull()
  })
})
