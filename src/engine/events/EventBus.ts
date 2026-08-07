/** 엔진 전역 이벤트 버스. 퍼즐 보상(reward.event), 문 개방, 내러티브 트리거가 이곳을 지난다. */
export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler<never>>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as EventHandler<never>);
  }

  emit<T = unknown>(event: string, payload?: T): void {
    this.handlers.get(event)?.forEach((h) => (h as EventHandler<T | undefined>)(payload));
  }
}

export const bus = new EventBus();
