import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Deck = { id: string; name: string; createdAt: number; colorIndex?: number }
type Card = { id: string; deckId: string; front: string; back: string }
type Change =
  | { type: 'upsert' }
  | { type: 'deleteDeck'; id: string }
  | { type: 'deleteCard'; id: string }

// In-memory stand-in for the IndexedDB flashcard store, with the same
// change notifications as the real one. A fresh copy is built per test
// because the module registry is reset in beforeEach.
vi.mock('@/store/study', () => {
  const decks = new Map<string, Deck>()
  const cards = new Map<string, Card>()
  const listeners = new Set<(change: Change) => void>()
  const emit = (change: Change) => listeners.forEach((listener) => listener(change))
  return {
    DECK_COLOR_PALETTE: [
      { front: 'a', back: 'b' },
      { front: 'c', back: 'd' },
    ],
    getDecks: async () => [...decks.values()],
    getCards: async (deckId: string) => [...cards.values()].filter((c) => c.deckId === deckId),
    saveDeck: async (deck: Deck) => {
      decks.set(deck.id, deck)
      emit({ type: 'upsert' })
    },
    saveCard: async (card: Card) => {
      cards.set(card.id, card)
      emit({ type: 'upsert' })
    },
    deleteDeck: async (id: string) => {
      for (const card of [...cards.values()]) if (card.deckId === id) cards.delete(card.id)
      decks.delete(id)
      emit({ type: 'deleteDeck', id })
    },
    deleteCard: async (id: string) => {
      cards.delete(id)
      emit({ type: 'deleteCard', id })
    },
    clearLocalFlashcards: async () => {
      decks.clear()
      cards.clear()
    },
    onFlashcardChange: (listener: (change: Change) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
})

vi.mock('@/api/sync', () => ({
  syncToCloud: vi.fn(async () => undefined),
  fetchDecks: vi.fn(async () => []),
  deleteDeckInCloud: vi.fn(async () => undefined),
  deleteCardInCloud: vi.fn(async () => undefined),
}))

type SyncModule = typeof import('@/sync/cloudSync')
type StoreModule = typeof import('@/store/study')
type ApiModule = typeof import('@/api/sync')

let sync: SyncModule
let store: StoreModule
let api: ApiModule

const OWNER_KEY = 'studyapp_flashcards_owner'

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  sync = await import('@/sync/cloudSync')
  store = await import('@/store/study')
  api = await import('@/api/sync')

  // The mocked modules are shared between tests, so put them back to a
  // known state: empty store, default API behaviour, no call history.
  await store.clearLocalFlashcards()
  vi.mocked(api.syncToCloud).mockReset().mockResolvedValue(undefined)
  vi.mocked(api.fetchDecks).mockReset().mockResolvedValue([])
  vi.mocked(api.deleteDeckInCloud).mockReset().mockResolvedValue(undefined)
  vi.mocked(api.deleteCardInCloud).mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  // Detach this test's sync module from the shared store mock.
  sync.stopCloudSync()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function addLocalDeck(id: string, cardIds: string[] = []) {
  await store.saveDeck({ id, name: `Deck ${id}`, createdAt: 1 })
  for (const cardId of cardIds) {
    await store.saveCard({ id: cardId, deckId: id, front: `f-${cardId}`, back: `b-${cardId}` })
  }
}

describe('reconcileOnLogin', () => {
  it('pushes decks made as a guest up to the account', async () => {
    await addLocalDeck('d1', ['c1'])
    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(0)

    expect(api.syncToCloud).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.syncToCloud).mock.calls[0][0]
    expect(payload.decks).toEqual([
      { clientId: 'd1', name: 'Deck d1', cards: [{ clientId: 'c1', front: 'f-c1', back: 'b-c1' }] },
    ])
    expect(localStorage.getItem(OWNER_KEY)).toBe('me@example.com')
  })

  it('adds cloud decks to the browser and keeps local-only decks', async () => {
    await addLocalDeck('local', ['lc'])
    vi.mocked(api.fetchDecks).mockResolvedValue([
      { clientId: 'cloud', name: 'From cloud', cards: [{ clientId: 'cc', front: 'cf', back: 'cb' }] },
    ])

    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(0)

    const decks = (await store.getDecks()).map((d) => d.id).sort()
    expect(decks).toEqual(['cloud', 'local'])
    expect(await store.getCards('cloud')).toEqual([
      { id: 'cc', deckId: 'cloud', front: 'cf', back: 'cb' },
    ])
    // the local-only deck was pushed so the cloud now has both
    const pushed = vi.mocked(api.syncToCloud).mock.calls[0][0].decks.map((d) => d.clientId).sort()
    expect(pushed).toEqual(['cloud', 'local'])
  })

  it('lets the cloud copy win when a deck exists on both sides', async () => {
    await store.saveDeck({ id: 'd1', name: 'Old name', createdAt: 5, colorIndex: 1 })
    await store.saveCard({ id: 'c1', deckId: 'd1', front: 'old', back: 'old' })
    vi.mocked(api.fetchDecks).mockResolvedValue([
      { clientId: 'd1', name: 'New name', cards: [{ clientId: 'c1', front: 'new', back: 'new' }] },
    ])

    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(0)

    const [deck] = await store.getDecks()
    expect(deck).toMatchObject({ id: 'd1', name: 'New name', createdAt: 5, colorIndex: 1 })
    expect((await store.getCards('d1'))[0]).toMatchObject({ front: 'new', back: 'new' })
    // nothing local-only, so nothing to push
    expect(api.syncToCloud).not.toHaveBeenCalled()
  })

  it('clears decks that belong to a different account first', async () => {
    localStorage.setItem(OWNER_KEY, 'someone-else@example.com')
    await addLocalDeck('theirs', ['tc'])

    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(0)

    expect(await store.getDecks()).toEqual([])
    expect(api.syncToCloud).not.toHaveBeenCalled()
    expect(localStorage.getItem(OWNER_KEY)).toBe('me@example.com')
  })

  it('keeps the same account’s leftovers and pushes them', async () => {
    localStorage.setItem(OWNER_KEY, 'me@example.com')
    await addLocalDeck('mine', ['mc'])

    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(0)

    expect((await store.getDecks()).map((d) => d.id)).toEqual(['mine'])
    expect(api.syncToCloud).toHaveBeenCalledTimes(1)
  })

  it('keeps local data and does not throw when the cloud is unreachable', async () => {
    await addLocalDeck('d1', ['c1'])
    vi.mocked(api.fetchDecks).mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(sync.reconcileOnLogin('me@example.com')).resolves.toBeUndefined()

    expect((await store.getDecks()).map((d) => d.id)).toEqual(['d1'])
    expect(localStorage.getItem(OWNER_KEY)).toBe('me@example.com')
  })

  it('does not trigger pushes for its own writes', async () => {
    sync.startCloudSync()
    vi.mocked(api.fetchDecks).mockResolvedValue([
      { clientId: 'cloud', name: 'From cloud', cards: [{ clientId: 'cc', front: 'f', back: 'b' }] },
    ])

    await sync.reconcileOnLogin('me@example.com')
    await vi.advanceTimersByTimeAsync(5000)

    expect(api.syncToCloud).not.toHaveBeenCalled()
  })
})

describe('live sync', () => {
  it('pushes once after a burst of edits', async () => {
    sync.startCloudSync()
    await addLocalDeck('d1', ['c1', 'c2'])
    expect(api.syncToCloud).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1600)

    expect(api.syncToCloud).toHaveBeenCalledTimes(1)
    const [deck] = vi.mocked(api.syncToCloud).mock.calls[0][0].decks
    expect(deck.cards.map((c) => c.clientId)).toEqual(['c1', 'c2'])
  })

  it('sends deletes to the cloud right away', async () => {
    await addLocalDeck('d1', ['c1'])
    sync.startCloudSync()

    await store.deleteCard('c1')
    await store.deleteDeck('d1')
    await vi.advanceTimersByTimeAsync(0)

    expect(api.deleteCardInCloud).toHaveBeenCalledWith('c1')
    expect(api.deleteDeckInCloud).toHaveBeenCalledWith('d1')
  })

  it('does nothing once stopped', async () => {
    sync.startCloudSync()
    sync.stopCloudSync()

    await addLocalDeck('d1', ['c1'])
    await store.deleteDeck('d1')
    await vi.advanceTimersByTimeAsync(5000)

    expect(api.syncToCloud).not.toHaveBeenCalled()
    expect(api.deleteDeckInCloud).not.toHaveBeenCalled()
  })

  it('survives a failed push and tries again on the next edit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(api.syncToCloud).mockRejectedValueOnce(new Error('offline'))
    sync.startCloudSync()

    await addLocalDeck('d1')
    await vi.advanceTimersByTimeAsync(1600)
    await addLocalDeck('d2')
    await vi.advanceTimersByTimeAsync(1600)

    expect(api.syncToCloud).toHaveBeenCalledTimes(2)
    const second = vi.mocked(api.syncToCloud).mock.calls[1][0].decks.map((d) => d.clientId).sort()
    expect(second).toEqual(['d1', 'd2'])
  })
})

describe('logout', () => {
  it('pushes unsaved work and then clears the browser', async () => {
    sync.startCloudSync()
    await addLocalDeck('d1', ['c1'])
    localStorage.setItem(OWNER_KEY, 'me@example.com')

    const done = sync.finishSessionOnLogout()
    await vi.advanceTimersByTimeAsync(0)
    await done

    expect(api.syncToCloud).toHaveBeenCalledTimes(1)
    expect(await store.getDecks()).toEqual([])
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it('keeps local decks when the cloud cannot be reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(api.syncToCloud).mockRejectedValue(new Error('offline'))
    sync.startCloudSync()
    await addLocalDeck('d1', ['c1'])
    localStorage.setItem(OWNER_KEY, 'me@example.com')

    const done = sync.finishSessionOnLogout()
    await vi.advanceTimersByTimeAsync(5000)
    await done

    expect((await store.getDecks()).map((d) => d.id)).toEqual(['d1'])
    expect(localStorage.getItem(OWNER_KEY)).toBe('me@example.com')
  })

  it('does not let the next login race ahead of the cleanup', async () => {
    sync.startCloudSync()
    await addLocalDeck('old', ['oc'])
    localStorage.setItem(OWNER_KEY, 'old@example.com')
    vi.mocked(api.fetchDecks).mockResolvedValue([
      { clientId: 'new', name: 'New account deck', cards: [] },
    ])

    const logout = sync.finishSessionOnLogout()
    const login = sync.reconcileOnLogin('new@example.com')
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all([logout, login])

    expect((await store.getDecks()).map((d) => d.id)).toEqual(['new'])
  })
})
