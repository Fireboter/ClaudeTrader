import { Observable } from '../Observable';
import { Order } from '../models/Order';
import { Signal } from '../models/Signal';

/**
 * Manages orders, signals, and equity tracking for backtesting.
 */
export class BacktestManager extends Observable {
    orders: Order[] = [];
    signals: Signal[] = [];
    currentEquity: number = 100000;

    processSignal(signal: Signal): void {
        this.signals.push(signal);
        this.notify();
    }

    updatePnL(currentPrice: number): void {
        for (const order of this.orders) {
            if (order.status === 'active') {
                order.updatePnL(currentPrice);
            }
        }
        this.notify();
    }

    reset(initialEquity: number): void {
        this.orders = [];
        this.signals = [];
        this.currentEquity = initialEquity;
        this.notify();
    }
}
