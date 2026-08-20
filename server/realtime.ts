type RealtimeEmitter = (userId: number, event: string, payload: unknown) => void;

let emitter: RealtimeEmitter | null = null;

export function registerRealtimeEmitter(next: RealtimeEmitter) {
  emitter = next;
  return () => {
    if (emitter === next) emitter = null;
  };
}

export function emitRealtime(userId: number, event: string, payload: unknown) {
  emitter?.(userId, event, payload);
}
