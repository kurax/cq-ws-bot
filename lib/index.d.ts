import low from 'lowdb';
import signale from 'signale';
export default class Bot {
    name: string;
    protected logger: signale.Signale;
    protected db: low.LowdbSync<any>;
    constructor(name: string);
    sendPrivateMessage(user: number | string, message: string): Promise<import("cq-websocket").APIResponse<unknown>>;
    sendGroupMessage(group: number | string, message: string): Promise<import("cq-websocket").APIResponse<unknown>>;
    sendDiscussMessage(discuss: number | string, message: string): Promise<import("cq-websocket").APIResponse<unknown>>;
}
