import {
  clearLocalFlashcards,
  DECK_COLOR_PALETTE,
  getCards,
  getDecks,
  onFlashcardChange,
  saveCard,
  saveDeck,
  type FlashcardChange,
} from '../store/study'
import { lsGet, lsRemove, lsSet } from '../store/storage'
import { isAuthError } from '../api/client'
import {
  deleteCardInCloud,
  deleteDeckInCloud,
  fetchDecks,
  syncToCloud,
  type DeckDto,
} from '../api/sync'

// Which account the flashcards in this browser belong to. Lets login tell
// "my own leftovers" apart from "someone else's decks on a shared browser".
const OWNER_KEY = 'flashcards_owner'
const PUSH_DELAY_MS = 1500
const FLUSH_TIMEOUT_MS = 4000

let unsubscribe: (() => void) | null = null
let paused = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
// Cloud calls run one at a time so a delete can never be overtaken by an
// older push that is still on the wire.
let queue: Promise<unknown> = Promise.resolve()
let logoutOp: Promise<void> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

async function readLocalDecks(): Promise<DeckDto[]> {
  const decks = await getDecks()
  return Promise.all(
    decks.map(async (deck) => ({
      clientId: deck.id,
      name: deck.name,
      cards: (await getCards(deck.id)).map((card) => ({
        clientId: card.id,
        front: card.front,
        back: card.back,
      })),
    }))
  )
}

async function pushAll(): Promise<void> {
  const decks = await readLocalDecks()
  if (decks.length === 0) return
  await syncToCloud({ decks, notes: [] })
}

function clearPushTimer(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
}

function schedulePush(): void {
  clearPushTimer()
  pushTimer = setTimeout(() => {
    pushTimer = null
    enqueue(pushAll).catch((err) => console.warn('Could not sync flashcards to cloud:', err))
  }, PUSH_DELAY_MS)
}

function handleChange(change: FlashcardChange): void {
  if (paused) return
  if (change.type === 'upsert') {
    schedulePush()
    return
  }
  const remove = change.type === 'deleteDeck' ? deleteDeckInCloud : deleteCardInCloud
  enqueue(() => remove(change.id)).catch((err) =>
    console.warn('Could not delete flashcard data in cloud:', err)
  )
}

export function startCloudSync(): void {
  if (unsubscribe) return
  unsubscribe = onFlashcardChange(handleChange)
}

export function stopCloudSync(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  clearPushTimer()
}

// Pushes everything now. Resolves true when the cloud has the latest copy,
// false when it could not be reached in time.
export async function flushCloudSync(): Promise<boolean> {
  clearPushTimer()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      enqueue(pushAll),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Cloud sync timed out')), FLUSH_TIMEOUT_MS)
      }),
    ])
    return true
  } catch (err) {
    console.warn('Could not flush flashcards to cloud:', err)
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

// Brings this browser and the account together after a successful login.
// Nothing local is thrown away unless it belongs to a different account:
// cloud decks are added to the browser (cloud wins when the same deck or card
// exists on both sides) and anything that only exists locally, such as decks
// made as a guest, is pushed up to the account.
export async function reconcileOnLogin(email: string): Promise<void> {
  await logoutOp
  paused = true
  let needsPush = false
  try {
    const owner = lsGet(OWNER_KEY)
    if (owner && owner !== email) await clearLocalFlashcards()

    try {
      const cloudDecks = await fetchDecks()
      const localDecks = await getDecks()
      const localById = new Map(localDecks.map((deck) => [deck.id, deck]))
      const cloudDeckIds = new Set<string>()
      const cloudCardIds = new Set<string>()

      for (let i = 0; i < cloudDecks.length; i++) {
        const cloudDeck = cloudDecks[i]
        cloudDeckIds.add(cloudDeck.clientId)
        const existing = localById.get(cloudDeck.clientId)
        await saveDeck({
          id: cloudDeck.clientId,
          name: cloudDeck.name,
          createdAt: existing?.createdAt ?? Date.now(),
          colorIndex: existing?.colorIndex ?? i % DECK_COLOR_PALETTE.length,
        })
        for (const card of cloudDeck.cards) {
          cloudCardIds.add(card.clientId)
          await saveCard({
            id: card.clientId,
            deckId: cloudDeck.clientId,
            front: card.front,
            back: card.back,
          })
        }
      }

      for (const deck of localDecks) {
        if (!cloudDeckIds.has(deck.id)) needsPush = true
        for (const card of await getCards(deck.id)) {
          if (!cloudCardIds.has(card.id)) needsPush = true
        }
      }
    } catch (err) {
      // A rejected token has to reach the caller so it can log the user out.
      if (isAuthError(err)) throw err
      // Cloud unreachable: keep local data and let the next push catch up.
      console.warn('Could not load flashcards from cloud:', err)
    }

    lsSet(OWNER_KEY, email)
  } finally {
    paused = false
  }
  if (needsPush) void flushCloudSync()
}

// Pushes unsaved work, then clears this browser so the next person starts
// clean. If the cloud cannot be reached the local copy is kept (and still
// labelled with its owner) so no work is lost; the next login of the same
// account will push it, and a different account will clear it.
export function finishSessionOnLogout(): Promise<void> {
  logoutOp = (async () => {
    const saved = await flushCloudSync()
    stopCloudSync()
    if (saved) {
      await clearLocalFlashcards()
      lsRemove(OWNER_KEY)
    }
  })().catch((err) => console.warn('Could not finish logout cleanup:', err))
  return logoutOp
}
