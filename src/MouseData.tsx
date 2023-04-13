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
    // rawDataBuffer: MouseRawData[] = [];
    data: MouseDataPoint[] = [];
    smooth_buffer: MouseRawData[] = [];
    smoothed_data: MouseDataPoint[] = [];
    smooth_time: number = 1000 / 144;
    last_frame_time: number = 0;
    duration: number = 100000.0;
    data_output_buffer: MouseDataPoint[] = [];
    smoothed_data_output_buffer: MouseDataPoint[] = [];

    private get_last_data() {
        if (this.data_output_buffer.length === 0) {
            return this.data[this.data.length - 1];
        } else {
            return this.data_output_buffer[this.data_output_buffer.length - 1];
        }
    }

    private get_last_smoothed_data() {
        if (this.smoothed_data_output_buffer.length === 0) {
            return this.smoothed_data[this.smoothed_data.length - 1];
        } else {
            return this.smoothed_data_output_buffer[this.smoothed_data_output_buffer.length - 1];
        }
    }

    public drop() {
        if (this.get_last_data() !== undefined) {
            while (this.data.length > 0 && this.get_last_data().t - this.data[0].t > this.duration) {
                this.data.shift();
            }
            while (this.data_output_buffer.length > 0 && this.get_last_data().t - this.data_output_buffer[0].t > this.duration) {
                this.data_output_buffer.shift();
            }
        }
        if (this.get_last_smoothed_data() !== undefined) {
            while (this.smoothed_data.length > 0 && this.get_last_smoothed_data().t - this.smoothed_data[0].t > this.duration) {
                this.smoothed_data.shift();
            }
            while (this.smoothed_data_output_buffer.length > 0 && this.get_last_smoothed_data().t - this.smoothed_data_output_buffer[0].t > this.duration) {
                this.smoothed_data_output_buffer.shift();
            }
        }
    }

    public flush_output_buffer(){
        while(true) {
            const d = this.data_output_buffer.shift();
            if (d === undefined) {
                break;
            }
            this.data.push(d);
        }
        while(true){
            const d = this.smoothed_data_output_buffer.shift();
            if (d === undefined) {
                break;
            }
            this.smoothed_data.push(d)
        }
    }

    public push(point: MouseRawData) {
        let d = { ...point, t: point.t / 1000.0 };
        let new_data: MouseDataPoint;
        const last_data = this.get_last_data();
        if (last_data === undefined) {
            const dt = d.t;
            new_data = { ...d, 
                x: d.dx, 
                y: d.dy, 
                dt: dt, 
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
        this.data_output_buffer.push(new_data);
        this.smooth_push(d);
        this.drop();
    }

    private smooth_push(d: MouseRawData) {
        if (this.smooth_buffer.length > 0 && d.t - this.last_frame_time > this.smooth_time) {
            const dx = this.smooth_buffer.reduce((sum, p) => (sum + p.dx), 0);
            const dy = this.smooth_buffer.reduce((sum, p) => (sum + p.dy), 0);
            const t = this.smooth_buffer[this.smooth_buffer.length - 1].t;
            const last_smoothed_data = this.get_last_smoothed_data();
            const dt = last_smoothed_data === undefined ? 0 : t - last_smoothed_data.t;
            const x = last_smoothed_data === undefined ? dx : last_smoothed_data.x + dx;
            const y = last_smoothed_data === undefined ? dy : last_smoothed_data.y + dy;
            const vx = dt === 0 ? NaN : dx / dt;
            const vy = dt === 0 ? NaN : dy / dt;
            const new_data = { t, x, y, dt, dx, dy, vx, vy }
            this.smoothed_data_output_buffer.push(new_data);
            this.smooth_buffer = [];
            this.last_frame_time = Math.ceil(d.t / this.smooth_time) * this.smooth_time;
        }
        this.smooth_buffer.push(d);
    }

    private recompute_smoothed_data() {
        this.smooth_buffer = [];
        this.smoothed_data = [];
        this.smoothed_data_output_buffer = [];
        this.last_frame_time = 0;
        this.data.map((d) => this.smooth_push({t: d.t, dx: d.dx, dy: d.dy}));
        this.smoothed_data = this.smoothed_data_output_buffer;
        this.smoothed_data_output_buffer = [];
        this.data_output_buffer.map((d) => this.smooth_push({t: d.t, dx: d.dx, dy: d.dy}));
    }

    public set_smooth_time(t: number) {
        this.smooth_time = t;
        this.recompute_smoothed_data();
    }

    public clear() {
        this.data = [];
        this.data_output_buffer = [];
        this.smooth_buffer = [];
        this.smoothed_data = [];
        this.smoothed_data_output_buffer = [];
        this.last_frame_time = 0;
    }

    public set_duration(d: number) {
        this.duration = d;
    }
}
