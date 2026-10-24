import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError, getToken, setToken } from '@/api/client'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/sync/cloudSync', () => ({
  reconcileOnLogin: vi.fn(async () => undefined),
  startCloudSync: vi.fn(),
  finishSessionOnLogout: vi.fn(async () => undefined),
}))

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import * as authApi from '@/api/auth'
import * as cloudSync from '@/sync/cloudSync'

const KEY = 'workroom_session'

function Probe() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="user">{auth.user ? `${auth.user.email}|${auth.user.displayName}` : 'none'}</span>
      <button onClick={() => void auth.login('me@example.com', 'pw').catch(() => undefined)}>login</button>
      <button onClick={auth.logout}>logout</button>
      <button onClick={() => auth.updateDisplayName('Renamed')}>rename</button>
    </div>
  )
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
}

function saveFake() {
  sessionStorage.setItem(KEY, JSON.stringify({ token: 'saved-token', email: 'me@example.com', displayName: 'Me' }))
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  setToken(null)
  vi.clearAllMocks()
  vi.mocked(cloudSync.reconcileOnLogin).mockResolvedValue(undefined)
  vi.mocked(cloudSync.finishSessionOnLogout).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AuthProvider session restore', () => {
  it('starts logged out when nothing was saved', () => {
    mount()
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(cloudSync.reconcileOnLogin).not.toHaveBeenCalled()
    expect(getToken()).toBeNull()
  })

  it('is already signed in on the first render after a refresh', async () => {
    saveFake()
    mount()

    // no waiting: the logged-out state must never flash
    expect(screen.getByTestId('user').textContent).toBe('me@example.com|Me')
    expect(getToken()).toBe('saved-token')

    await waitFor(() => expect(cloudSync.startCloudSync).toHaveBeenCalledTimes(1))
    expect(cloudSync.reconcileOnLogin).toHaveBeenCalledWith('me@example.com')
  })

  it('logs out and forgets the session when the server rejects the token', async () => {
    saveFake()
    vi.mocked(cloudSync.reconcileOnLogin).mockRejectedValue(new ApiError('Unauthorized', 401))
    mount()

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(getToken()).toBeNull()
    expect(cloudSync.startCloudSync).not.toHaveBeenCalled()
  })

  it('stays signed in when the server cannot be reached', async () => {
    saveFake()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(cloudSync.reconcileOnLogin).mockRejectedValue(new TypeError('Failed to fetch'))
    mount()

    await waitFor(() => expect(cloudSync.startCloudSync).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('user').textContent).toBe('me@example.com|Me')
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
  })
})

describe('AuthProvider login, logout and rename', () => {
  it('saves the session on login so a refresh keeps it', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ token: 'new-token', email: 'me@example.com', displayName: 'Me' })
    mount()

    await act(async () => {
      fireEvent.click(screen.getByText('login'))
    })

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('me@example.com|Me'))
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? 'null')).toEqual({
      token: 'new-token',
      email: 'me@example.com',
      displayName: 'Me',
    })
    expect(cloudSync.startCloudSync).toHaveBeenCalled()
  })

  it('clears the saved session on logout', async () => {
    saveFake()
    mount()

    await act(async () => {
      fireEvent.click(screen.getByText('logout'))
    })

    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(cloudSync.finishSessionOnLogout).toHaveBeenCalledTimes(1)
  })

  it('keeps a renamed display name across a refresh', async () => {
    saveFake()
    mount()

    await act(async () => {
      fireEvent.click(screen.getByText('rename'))
    })

    expect(screen.getByTestId('user').textContent).toBe('me@example.com|Renamed')
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? 'null').displayName).toBe('Renamed')
  })
})
