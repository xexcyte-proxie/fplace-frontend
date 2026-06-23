import type { AppState } from '../types';
import { initialAppState } from '../types';

type Listener = (state: AppState) => void;

export class AppStore {
  private state: AppState = initialAppState();
  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
