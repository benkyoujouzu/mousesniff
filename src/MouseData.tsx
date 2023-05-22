export type MouseDataPoint = {
    t: number;
    x: number;
    y: number;
    dt: number;
    dx: number;
    dy: number;
    vx: number;
    vy: number;
};

export type MouseRawData = {
    t: number;
    dx: number;
    dy: number;
}

export class MouseData {
    data: MouseDataPoint[] = [];
    smooth_buffer: MouseRawData[] = [];
    smoothed_data: MouseDataPoint[] = [];
    polling_rate_buffer: MouseRawData[] = [];
    smooth_time: number = 1000 / 144;
    last_frame_time: number = 0;
    duration: number = 10000.0;

    public drop() {
            while (this.data.length > 0 && this.data[this.data.length - 1].t - this.data[0].t > this.duration) {
                this.data.shift();
            }
            while (this.smoothed_data.length > 0 && this.smoothed_data[this.smoothed_data.length - 1].t - this.smoothed_data[0].t > this.duration) {
                this.smoothed_data.shift();
            }
            while (this.polling_rate_buffer.length > 0 && this.polling_rate_buffer[this.polling_rate_buffer.length - 1].t - this.polling_rate_buffer[0].t > 1000) {
                this.polling_rate_buffer.shift();
            }
        }

    public push(point: MouseRawData) {
        let d = { ...point, t: point.t };
        let new_data: MouseDataPoint;
        const last_data = this.data[this.data.length - 1];
        if (last_data === undefined) {
            const dt = d.t;
            new_data = { ...d, 
                x: d.dx, 
                y: d.dy, 
                dt: 0, 
                vx: dt === 0 ? NaN : d.dx / dt, 
                vy: dt === 0 ? NaN : d.dy / dt
            };
        } else {
            const dt = d.t - last_data.t;
            new_data = {
                ...d,
                x: last_data.x + d.dx,
                y: last_data.y + d.dy,
                dt: dt,
                vx: dt === 0 ? NaN : d.dx / dt,
                vy: dt === 0 ? NaN : d.dy / dt,
            };
        }
        this.data.push(new_data);
        this.smooth_push(d);
        this.polling_rate_buffer.push(d);
        this.drop();
    }

    private smooth_push(d: MouseRawData) {
        if (this.smooth_buffer.length > 0 && d.t - this.last_frame_time > this.smooth_time) {
            const t = this.smooth_buffer[this.smooth_buffer.length - 1].t;
            const new_frame_time = Math.ceil(t / this.smooth_time) * this.smooth_time;
            const dx = this.smooth_buffer.reduce((sum, p) => (sum + p.dx), 0);
            const dy = this.smooth_buffer.reduce((sum, p) => (sum + p.dy), 0);
            const last_smoothed_data = this.smoothed_data[this.smoothed_data.length - 1];
            const dt = last_smoothed_data === undefined ? 0 : new_frame_time - this.last_frame_time;
            const x = last_smoothed_data === undefined ? dx : last_smoothed_data.x + dx;
            const y = last_smoothed_data === undefined ? dy : last_smoothed_data.y + dy;
            const vx = dt === 0 ? NaN : dx / dt;
            const vy = dt === 0 ? NaN : dy / dt;
            const new_data = { t, x, y, dt, dx, dy, vx, vy }
            this.smoothed_data.push(new_data);
            this.last_frame_time = new_frame_time;
            this.smooth_buffer = [];
        }
        this.smooth_buffer.push(d);
    }

    private recompute_smoothed_data() {
        this.smooth_buffer = [];
        this.smoothed_data = [];
        this.last_frame_time = 0;
        this.data.map((d) => this.smooth_push({t: d.t, dx: d.dx, dy: d.dy}));
    }

    public set_smooth_time(t: number) {
        this.smooth_time = t;
        this.recompute_smoothed_data();
    }

    public clear() {
        this.data = [];
        this.smooth_buffer = [];
        this.smoothed_data = [];
        this.polling_rate_buffer = [];
        this.last_frame_time = 0;
    }

    public set_duration(d: number) {
        this.duration = d;
    }
}
