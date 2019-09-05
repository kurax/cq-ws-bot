require('dotenv').config();

import * as style from 'ansi-styles';
import CQWebSocket from 'cq-websocket';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import moment from 'moment';
import * as path from 'path';
import signale from 'signale';

const uo = style.underline.open;
const uc = style.underline.close;
const yo = style.yellow.open;
const yc = style.yellow.close;

signale.config({
    displayTimestamp: true,
    displayDate: true
});

const messageEvents = {
    'message.private': 'onMessagePrivate',
    'message.discuss': 'onMessageDiscuss',
    'message.discuss.@': 'onMessageDiscussAt',
    'message.discuss.@.me': 'onMessageDiscussAtMe',
    'message.group': 'onMessageGroup',
    'message.group.@': 'onMessageGroupAt',
    'message.group.@.me': 'onMessageGroupAtMe'
};
const noticeEvents = {
    'notice.group_upload': 'onGroupUpload',
    'notice.group_admin.set': 'onGroupAdminSet',
    'notice.group_admin.unset': 'onGroupAdminUnset',
    'notice.group_decrease.leave': 'onGroupLeave',
    'notice.group_decrease.kick': 'onGroupKick',
    'notice.group_decrease.kick_me': 'onGroupKickMe',
    'notice.group_increase.approve': 'onGroupApprove',
    'notice.group_increase.invite': 'onGroupInvite',
    'notice.friend_add': 'onFriendAdd'
};
const requestEvents = {
    'request.friend': 'onRequestFriend',
    'request.group.add': 'onRequestGroupAdd',
    'request.group.invite': 'onRequestGroupInvite'
};

const handlers = {};
const logger = signale;
const cq = new CQWebSocket({
    host: process.env.CQ_HOST || 'localhost',
    port: (process.env.CQ_PORT && parseInt(process.env.CQ_PORT, 10)) || 6700
});
cq.connect();
cq.on('socket.connect', ep => logger.success(`WebSocket 端点 ${uo}${ep}${uc} 连接成功`));
cq.on('socket.error', (ep, err) => {
    logger.fatal(`连接 WebSocket 端点 ${uo}${ep}${uc} 时发生错误`);
    logger.fatal(err);
});

export default class Bot {
    public name: string;
    protected logger: signale.Signale;
    protected db: low.LowdbSync<any>;

    constructor(name: string) {
        this.name = name;
        this.logger = signale.scope(name);
        const dataPath = path.resolve(process.env.CQ_DATA || './data');
        require('fs-extra').ensureDirSync(dataPath);
        this.db = low(new FileSync(path.join(dataPath, `${name}.json`)));
        cq.once('ready', () => {
            [messageEvents, noticeEvents, requestEvents].forEach(events =>
                Object.keys(events).forEach(event => {
                    const handler = this[events[event]];
                    if (typeof handler === 'function') registerHandler(this, event, handler);
                })
            );
            this.logger.info('初始化完成');
        });
    }

    // noinspection JSMethodCanBeStatic
    sendPrivateMessage(user: number | string, message: string) {
        return cq('send_private_msg', {
            user_id: user,
            message
        });
    }

    // noinspection JSMethodCanBeStatic
    sendGroupMessage(group: number | string, message: string) {
        return cq('send_group_msg', {
            group_id: group,
            message
        });
    }

    // noinspection JSMethodCanBeStatic
    sendDiscussMessage(discuss: number | string, message: string) {
        return cq('send_discuss_msg', {
            discuss_id: discuss,
            message
        });
    }
}

const registerHandler = (bot: Bot, event: string, handler: Function): void => {
    if (!handlers.hasOwnProperty(event)) handlers[event] = [];
    handlers[event].push(handler.bind(bot));
    logger.info(`已经为 ${yo}${bot.name}${yc} 模块注册 ${yo}${event}${yc} 事件`);
};

interface Tag {
    name: string;
    params: {
        [key: string]: string;
    };
    begin: number;
    end: number;
}

const parseCQ = (message: string) => {
    const result: Tag[] = [];
    const reCQ = /\[CQ:([a-z]+)((?:,[a-z]+=[^,]+?)*)]/g;
    const reParam = /,([a-z]+)=([^,]+)/g;
    let match: RegExpExecArray | null;
    while ((match = reCQ.exec(message)) !== null) {
        const entry = {
            name: match[1],
            params: {},
            begin: match.index,
            end: reCQ.lastIndex
        };
        let match1: RegExpExecArray | null;
        while ((match1 = reParam.exec(match[2])) !== null) entry.params[match1[1]] = match1[2];
        result.push(entry);
    }
    return result;
};

interface BreakdownResult {
    type: 'command' | 'text' | 'cq';
    name?: string;
    text?: string;
    params?: any;
}

const reSlash = /^\/[\S]/;
const reCommand = /^\/([a-z]+)((?: ?\S+)*)$/i;
const breakdown = (message: string, canBeCommand = true): BreakdownResult[] => {
    message = message.trim();
    if (canBeCommand && message.match(reSlash)) {
        const match = reCommand.exec(message);
        if (match === null) return breakdown(message, false);
        return [
            {
                type: 'command',
                name: match[1].toLowerCase(),
                params: match[2]
                    .split(' ')
                    .filter(s => s.trim() !== '')
                    .map(p => ({
                        raw: p,
                        parts: breakdown(p, false)
                    }))
            }
        ];
    }
    const result: BreakdownResult[] = [];
    const addText = (text: string): void => {
        if (typeof text === 'string' && text.trim() !== '')
            result.push({
                type: 'text',
                text
            });
    };
    const addCq = (tag: Tag): void => {
        result.push({
            type: 'cq',
            name: tag.name,
            params: tag.params
        });
    };
    const cqTags = parseCQ(message);
    let begin = 0;
    let tag: Tag | undefined;
    while ((tag = cqTags.shift()) !== undefined) {
        addText(message.substr(begin, tag.begin - begin));
        addCq(tag);
        begin = tag.end;
    }
    addText(message.substr(begin));
    return result;
};

const createMessageHandler = event => (e, context, tags) => {
    const funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0) return;

    const sender = context.sender;
    sender.type = context.sub_type;
    const message = {
        id: context.message_id,
        message: context.message,
        raw: context.raw_message,
        time: moment.unix(context.time),
        parts: breakdown(context.message)
    };

    switch (context.message_type) {
        case 'private':
            funcs.forEach(func => func(context.user_id, sender, message));
            break;
        case 'discuss':
            funcs.forEach(func => func(context.discuss_id, sender, message));
            break;
        case 'group':
            funcs.forEach(func => func(context.group_id, sender, message));
            break;
    }
};

const createNoticeHandler = event => context => {
    const funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0) return;
    funcs.forEach(func => func());
};

const createRequestHandler = event => context => {
    const funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0) return;
    funcs.forEach(func => func());
};

Object.keys(messageEvents).forEach(event => cq.on(event as any, createMessageHandler(event)));
Object.keys(noticeEvents).forEach(event => cq.on(event as any, createNoticeHandler(event)));
Object.keys(requestEvents).forEach(event => cq.on(event as any, createRequestHandler(event)));
