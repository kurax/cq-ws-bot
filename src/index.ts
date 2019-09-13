require('dotenv').config();

import * as style from 'ansi-styles';
import { CQWebSocket } from 'cq-websocket';
import { ensureDirSync } from 'fs-extra';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import * as path from 'path';
import signale from 'signale';

import {
    CQHTTPDiscussMessage,
    CQHTTPGroupMessage,
    CQHTTPRequestMessage,
    CQHTTPSender,
    Listener,
    MessageListener
} from './cq';
import parser, { MessagePart } from './parser';

const uo = style.underline.open;
const uc = style.underline.close;
const yo = style.yellow.open;
const yc = style.yellow.close;

const messageEvents = {
    'message.private': 'onMessagePrivate',
    'message.discuss': 'onMessageDiscuss',
    'message.discuss.@': 'onMessageDiscussAt',
    'message.discuss.@.me': 'onMessageDiscussAtMe',
    'message.group': 'onMessageGroup',
    'message.group.@': 'onMessageGroupAt',
    'message.group.@.me': 'onMessageGroupAtMe'
};

const events = {
    'notice.group_upload': 'onGroupUpload',
    'notice.group_admin.set': 'onGroupAdminSet',
    'notice.group_admin.unset': 'onGroupAdminUnset',
    'notice.group_decrease.leave': 'onGroupLeave',
    'notice.group_decrease.kick': 'onGroupKick',
    'notice.group_decrease.kick_me': 'onGroupKickMe',
    'notice.group_increase.approve': 'onGroupApprove',
    'notice.group_increase.invite': 'onGroupInvite',
    'notice.friend_add': 'onFriendAdd',
    'request.friend': 'onRequestFriend',
    'request.group.add': 'onRequestGroupAdd',
    'request.group.invite': 'onRequestGroupInvite'
};

const config = low(new FileSync(path.join(__dirname, `config.json`)));
config
    .defaults({
        admin: []
    })
    .write();

signale.config({
    displayTimestamp: true,
    displayDate: true
});

export interface Message {
    id: number;
    time: Date;
    from: number;
    sender: CQHTTPSender;
    message: any;
    rawMessage: string;
    parts: MessagePart[];
}

export interface NoticeMessage {
    time: Date;
    user: number;
    group?: number;
}

type Handler = (message: NoticeMessage) => void | Promise<void>;
type MessageHandler = (message: Message) => void | Promise<void>;

export default class Bot {
    private cq: CQWebSocket;
    protected logger: signale.Signale;
    protected db: low.LowdbSync<any>;
    public name = '';

    constructor(name: string, host?: string, port?: number) {
        const dataPath = path.resolve(process.env.CQ_DATA || './data');
        ensureDirSync(dataPath);

        this.groupInviteListener = this.groupInviteListener.bind(this);
        this.sendPrivateMessage = this.sendPrivateMessage.bind(this);
        this.sendGroupMessage = this.sendGroupMessage.bind(this);
        this.sendDiscussMessage = this.sendDiscussMessage.bind(this);
        this.run = this.run.bind(this);

        this.name = name;
        this.logger = signale.scope(name);
        this.db = low(new FileSync(path.join(dataPath, `${name}.json`)));
        this.cq = new CQWebSocket({
            host: host || process.env.CQ_HOST || 'localhost',
            port:
                port ||
                (process.env.CQ_PORT && parseInt(process.env.CQ_PORT, 10)) ||
                6700
        });
        this.cq.on('socket.connect', ep =>
            this.logger.success(`WebSocket 端点 ${uo}${ep}${uc} 连接成功`)
        );
        this.cq.on('socket.error', (ep, err) => {
            this.logger.fatal(`连接 WebSocket 端点 ${uo}${ep}${uc} 时发生错误`);
            this.logger.fatal(err);
        });
        this.cq.on('request.group.invite', this.groupInviteListener);
        Object.keys(messageEvents).forEach((eventType: any) => {
            const handler = this[messageEvents[eventType]];
            if (typeof handler !== 'function') return;
            this.cq.on(eventType, this.createMessageEventListener(
                handler.bind(this)
            ) as any);
            this.logger.info(
                `已经为 ${yo}${this.name}${yc} 模块注册 ${yo}${eventType}${yc} 消息事件`
            );
        });
        Object.keys(events).forEach((eventType: any) => {
            const handler = this[events[eventType]];
            if (typeof handler !== 'function') return;
            this.cq.on(eventType, this.createEventListener(
                handler.bind(this)
            ) as any);
            this.logger.info(
                `已经为 ${yo}${this.name}${yc} 模块注册 ${yo}${eventType}${yc} 事件`
            );
        });
        this.cq.once('ready', () => void this.logger.info('Bot 已启动'));
    }

    private groupInviteListener(context: CQHTTPRequestMessage) {
        this.cq('set_group_add_request', {
            flag: context.flag,
            sub_type: context.sub_type,
            approve: true
        });
    }

    private createMessageEventListener(handler: MessageHandler) {
        const listener: MessageListener = (e, context) => {
            const message: Message = {
                id: context.message_id,
                time:
                    typeof context.time === 'number'
                        ? new Date(context.time * 1000)
                        : new Date(),
                from: context.user_id,
                sender: context.sender,
                message: context.message,
                rawMessage: context.raw_message,
                parts: parser(context.message)
            };
            switch (context.message_type) {
                case 'group':
                    message.from = (context as CQHTTPGroupMessage).group_id;
                    break;
                case 'discuss':
                    message.from = (context as CQHTTPDiscussMessage).discuss_id;
                    break;
            }
            return handler(message);
        };
        return listener;
    }

    private createEventListener(handler: Handler) {
        const listener: Listener = context => {
            const message: NoticeMessage = {
                time:
                    typeof context.time === 'number'
                        ? new Date(context.time * 1000)
                        : new Date(),
                user: context.user_id,
                group: context.group_id
            };
            return handler(message);
        };
        return listener;
    }

    protected sendPrivateMessage(user: number | string, message: string) {
        return this.cq('send_private_msg', {
            user_id: user,
            message
        });
    }

    protected sendGroupMessage(group: number | string, message: string) {
        return this.cq('send_group_msg', {
            group_id: group,
            message
        });
    }

    protected sendDiscussMessage(discuss: number | string, message: string) {
        return this.cq('send_discuss_msg', {
            discuss_id: discuss,
            message
        });
    }

    run() {
        this.cq.connect();
    }
}
