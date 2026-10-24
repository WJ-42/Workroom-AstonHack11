import { idbGetAll, idbGet, idbPut, idbDelete } from './storage'

const STORE = 'study'

export interface PomodoroState {
  id: 'pomodoro'
  phase: 'work' | 'shortBreak' | 'longBreak'
  remainingSeconds: number
  cycleCount: number
  isRunning: boolean
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
}

export interface CustomTimerState {
  id: 'customTimer'
  /** Total duration in seconds (used for set/reset). Kept for backward compat: durationMinutes is migrated to durationSeconds on load. */
  durationSeconds: number
  /** @deprecated Use durationSeconds. Migrated on load. */
  durationMinutes?: number
  remainingSeconds: number
  isRunning: boolean
}

export interface Flashcard {
  id: string
  deckId: string
  front: string
  back: string
}

// Each entry is { front, back } where front is the card front background
// and back is the card back background. Both use white text.
export const DECK_COLOR_PALETTE: { front: string; back: string }[] = [
  { front: '#6366f1', back: '#4338ca' },  // indigo
  { front: '#10b981', back: '#065f46' },  // emerald
  { front: '#f43f5e', back: '#9f1239' },  // rose
  { front: '#f59e0b', back: '#92400e' },  // amber
  { front: '#8b5cf6', back: '#5b21b6' },  // violet
  { front: '#06b6d4', back: '#164e63' },  // cyan
  { front: '#ec4899', back: '#9d174d' },  // pink
  { front: '#3b82f6', back: '#1e3a8a' },  // blue
]

export function getDeckColor(colorIndex?: number): { front: string; back: string } {
  const idx = colorIndex ?? 0
  return DECK_COLOR_PALETTE[idx % DECK_COLOR_PALETTE.length]
}

export interface FlashcardDeck {
  id: string
  name: string
  createdAt: number
  colorIndex?: number  // index into DECK_COLOR_PALETTE, optional for backward compat
}

const POMODORO_DEFAULTS: PomodoroState = {
  id: 'pomodoro',
  phase: 'work',
  remainingSeconds: 25 * 60,
  cycleCount: 0,
  isRunning: false,
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
}

const CUSTOM_TIMER_DEFAULTS: CustomTimerState = {
  id: 'customTimer',
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  isRunning: false,
}

export async function getPomodoroState(): Promise<PomodoroState> {
  const s = await idbGet<PomodoroState>(STORE, 'pomodoro')
  return s ?? POMODORO_DEFAULTS
}

export async function setPomodoroState(state: PomodoroState): Promise<void> {
  await idbPut(STORE, state)
}

export async function getCustomTimerState(): Promise<CustomTimerState> {
  const s = await idbGet<CustomTimerState & { durationMinutes?: number }>(STORE, 'customTimer')
  if (!s) return CUSTOM_TIMER_DEFAULTS
  const durationSeconds = s.durationSeconds ?? (s.durationMinutes ?? 25) * 60
  return { ...CUSTOM_TIMER_DEFAULTS, ...s, durationSeconds }
}

export async function setCustomTimerState(state: CustomTimerState): Promise<void> {
  await idbPut(STORE, state)
}

export interface FiftyTwoSeventeenState {
  id: '5217'
  phase: 'work' | 'break'
  remainingSeconds: number
  isRunning: boolean
  workMinutes: number
  breakMinutes: number
}

const FIFTY_TWO_SEVENTEEN_DEFAULTS: FiftyTwoSeventeenState = {
  id: '5217',
  phase: 'work',
  remainingSeconds: 52 * 60,
  isRunning: false,
  workMinutes: 52,
  breakMinutes: 17,
}

export async function get5217State(): Promise<FiftyTwoSeventeenState> {
  const s = await idbGet<FiftyTwoSeventeenState>(STORE, '5217')
  return s ?? FIFTY_TWO_SEVENTEEN_DEFAULTS
}

export async function set5217State(state: FiftyTwoSeventeenState): Promise<void> {
  await idbPut(STORE, state)
}

export interface TimeboxBlock {
  id: string
  label: string
  durationMinutes: number
  order: number
}

export interface TimeboxState {
  id: 'timebox'
  blocks: TimeboxBlock[]
  currentIndex: number
  remainingSeconds: number
  isRunning: boolean
}

export async function getTimeboxState(): Promise<TimeboxState> {
  const s = await idbGet<TimeboxState>(STORE, 'timebox')
  return s ?? { id: 'timebox', blocks: [], currentIndex: 0, remainingSeconds: 0, isRunning: false }
}

export async function setTimeboxState(state: TimeboxState): Promise<void> {
  await idbPut(STORE, state)
}

export interface SpacedRepSession {
  id: string
  label: string
  scheduledDate: string
  completed: boolean
  completedAt?: number
}

export interface SpacedRepState {
  id: 'spacedrep'
  sessions: SpacedRepSession[]
}

export async function getSpacedRepState(): Promise<SpacedRepState> {
  const s = await idbGet<SpacedRepState>(STORE, 'spacedrep')
  return s ?? { id: 'spacedrep', sessions: [] }
}

export async function setSpacedRepState(state: SpacedRepState): Promise<void> {
  await idbPut(STORE, state)
}

export async function getDecks(): Promise<FlashcardDeck[]> {
  const all = await idbGetAll<FlashcardDeck | Flashcard>(STORE)
  return all.filter((x): x is FlashcardDeck => 'name' in x && 'createdAt' in x && !('deckId' in x))
}

export async function getCards(deckId: string): Promise<Flashcard[]> {
  const all = await idbGetAll<Flashcard>(STORE)
  return all.filter((x) => x.deckId === deckId)
}

// Flashcard writes announce themselves so cloud sync can follow along
// without every caller having to know about it.
export type FlashcardChange =
  | { type: 'upsert' }
  | { type: 'deleteDeck'; id: string }
  | { type: 'deleteCard'; id: string }

const flashcardListeners = new Set<(change: FlashcardChange) => void>()

export function onFlashcardChange(listener: (change: FlashcardChange) => void): () => void {
  flashcardListeners.add(listener)
  return () => {
    flashcardListeners.delete(listener)
  }
}

function emitFlashcardChange(change: FlashcardChange): void {
  for (const listener of flashcardListeners) {
    try {
      listener(change)
    } catch (err) {
      console.warn('Flashcard change listener failed:', err)
    }
  }
}

export async function saveDeck(deck: FlashcardDeck): Promise<void> {
  await idbPut(STORE, deck)
  emitFlashcardChange({ type: 'upsert' })
}

export async function deleteDeck(deckId: string): Promise<void> {
  const cards = await getCards(deckId)
  for (const c of cards) await idbDelete(STORE, c.id)
  await idbDelete(STORE, deckId)
  emitFlashcardChange({ type: 'deleteDeck', id: deckId })
}

export async function saveCard(card: Flashcard): Promise<void> {
  await idbPut(STORE, card)
  emitFlashcardChange({ type: 'upsert' })
}

export async function deleteCard(cardId: string): Promise<void> {
  await idbDelete(STORE, cardId)
  emitFlashcardChange({ type: 'deleteCard', id: cardId })
}

// Removes all deck and card entries from local IDB.
// Deliberately skips pomodoro/timer/timebox/spacedrep states so those
// are not wiped when switching accounts.
export async function clearLocalFlashcards(): Promise<void> {
  const all = await idbGetAll<Record<string, unknown>>(STORE)
  const toDelete = all.filter(
    (x) =>
      // card: has deckId field
      'deckId' in x ||
      // deck: has name + createdAt but is not a known timer-state record
      ('name' in x && 'createdAt' in x && !('deckId' in x))
  )
  for (const item of toDelete) {
    await idbDelete(STORE, item.id as string)
  }
}

export function generateId(): string {
  return crypto.randomUUID()
}
