import { api } from './client';

export interface CardDto {
  id?: number;
  clientId: string;
  front: string;
  back: string;
}

export interface DeckDto {
  id?: number;
  clientId: string;
  name: string;
  cards: CardDto[];
}

export interface NoteDto {
  id?: number;
  clientId: string;
  name: string;
  content: string;
  fileType: string;
}

export interface SyncRequest {
  decks: DeckDto[];
  notes: NoteDto[];
}

export async function syncToCloud(data: SyncRequest): Promise<void> {
  await api.post('/api/sync', data);
}

export async function deleteDeckInCloud(clientId: string): Promise<void> {
  await api.delete(`/api/sync/decks/${encodeURIComponent(clientId)}`);
}

export async function deleteCardInCloud(clientId: string): Promise<void> {
  await api.delete(`/api/sync/cards/${encodeURIComponent(clientId)}`);
}

export async function fetchDecks(): Promise<DeckDto[]> {
  return api.get<DeckDto[]>('/api/sync/decks');
}

export async function fetchNotes(): Promise<NoteDto[]> {
  return api.get<NoteDto[]>('/api/sync/notes');
}