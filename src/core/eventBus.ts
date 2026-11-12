export type GameEventMap = {
  POTION_BREWED: { potionName: string; description: string };
  ITEM_EQUIPPED: { item: 'Witch Hat' | 'Magic Broom' };
  ESCAPED_OUTSIDE: { elapsedSeconds: number };
};

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEventMap, Set<Listener<unknown>>>();

  on<K extends keyof GameEventMap>(event: K, listener: Listener<GameEventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;
    for (const listener of eventListeners) {
      listener(payload);
    }
  }
}