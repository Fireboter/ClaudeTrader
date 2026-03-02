/**
 * Base class for observable state containers.
 * Managers and stores extend this to provide subscription-based reactivity.
 */
export class Observable {
    private listeners: Set<() => void> = new Set();

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(): void {
        this.listeners.forEach(fn => fn());
    }
}
