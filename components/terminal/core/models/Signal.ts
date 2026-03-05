export type SignalKind   = 'long' | 'short' | 'win' | 'loss';
export type SignalSource = 'pivot_confirmation' | 'breakout' | 'stop_loss' | 'take_profit' | 'zone_exit';

export interface Signal {
    id:       string;
    kind:     SignalKind;
    source:   SignalSource;
    price:    number;      // exact price at signal time
    time:     number;      // minute timestamp
    dayIndex: number;      // index in visibleDays[] for x-positioning
}

export interface ActiveTrade {
    kind:        'long' | 'short';
    entryPrice:  number;
    slPrice:     number | null;
    tpPrice:     number | null;
    entryTime:   number;
    entryDayIdx: number;
}
