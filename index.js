require('dotenv').config();

const path = require('path');
const style = require('ansi-styles');
const signale = require('signale');
const moment = require('moment');
const CQWebSocket = require('cq-websocket').CQWebSocket;
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

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
const registerHandler = (bot, event, handler) => {
    if (!handlers.hasOwnProperty(event))
        handlers[event] = [];
    handlers[event].push(handler.bind(bot));
    logger.info(`已经为 ${yo}${bot.name}${yc} 模块注册 ${yo}${event}${yc} 事件`);
};

const parseCQ = message => {
    const result = [];
    const reCQ = /\[CQ:([a-z]+)((?:,[a-z]+=[^,]+?)*)]/g;
    const reParam = /,([a-z]+)=([^,]+)/g;
    let match;
    while ((match = reCQ.exec(message)) !== null) {
        const entry = {
            name: match[1],
            params: {},
            begin: match.index,
            end: reCQ.lastIndex
        };
        let match1;
        while ((match1 = reParam.exec(match[2])) !== null)
            entry.params[match1[1]] = match1[2];
        result.push(entry);
    }
    return result;
};

const reSlash = /^\/[\S]/;
const reCommand = /^\/([a-z]+)((?: ?\S+)*)$/i;
const breakdown = (message, canBeCommand = true) => {
    message = message.trim();
    if (canBeCommand && message.match(reSlash)) {
        const match = reCommand.exec(message);
        if (match === null)
            return breakdown(message, false);
        return [{
            type: 'command',
            name: match[1].toLowerCase(),
            params: match[2].split(' ')
                            .filter(s => s.trim() !== '')
                            .map(p => ({
                                raw: p,
                                parts: breakdown(p, false)
                            }))
        }];
    }
    const result = [];
    const addText = text => {
        if (typeof text === 'string' && text.trim() !== '')
            result.push({
                type: 'text',
                text
            });
    };
    const addCq = tag => result.push({
        type: 'cq',
        name: tag.name,
        params: tag.params
    });
    const cqTags = parseCQ(message);
    let begin = 0;
    let tag;
    while ((tag = cqTags.shift()) !== undefined) {
        addText(message.substr(begin, tag.begin - begin));
        addCq(tag);
        begin = tag.end;
    }
    addText(message.substr(begin));
    return result;
};

const bot = new CQWebSocket({
    host: process.env.CQ_HOST || 'localhost',
    port: process.env.CQ_PORT || '6700'
});
bot.connect();
bot.on('socket.connect', ep => logger.success(`WebSocket 端点 ${uo}${ep}${uc} 连接成功`));
bot.on('socket.error', (ep, err) => {
    logger.fatal(`连接 WebSocket 端点 ${uo}${ep}${uc} 时发生错误`);
    logger.fatal(err);
});

const createMessageHandler = event => (e, context, tags) => {
    const funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;

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
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;
    funcs.forEach(func => func());
};

const createRequestHandler = event => context => {
    const funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;
    funcs.forEach(func => func());
};

Object.keys(messageEvents).forEach(event => bot.on(event, createMessageHandler(event)));
Object.keys(noticeEvents).forEach(event => bot.on(event, createNoticeHandler(event)));
Object.keys(requestEvents).forEach(event => bot.on(event, createRequestHandler(event)));

module.exports = class Bot {
    constructor(name) {
        this.name = name;
        this.logger = signale.scope(name);
        const dataPath = path.resolve(process.env.CQ_DATA || './data');
        require('fs-extra').ensureDirSync(dataPath);
        this.db = low(new FileSync(path.join(dataPath, `${name}.json`)));
        bot.once('ready', () => {
            [messageEvents, noticeEvents, requestEvents].forEach(events => Object.keys(events).forEach(event => {
                const handler = this[events[event]];
                if (typeof handler === 'function')
                    registerHandler(this, event, handler);
            }));
            this.logger.info('初始化完成');
        });
    }

    // noinspection JSMethodCanBeStatic
    sendPrivateMessage(user, message) {
        return bot('send_private_msg', {
            user_id: user,
            message
        });
    }

    // noinspection JSMethodCanBeStatic
    sendGroupMessage(group, message) {
        return bot('send_group_msg', {
            group_id: group,
            message
        });
    }

    // noinspection JSMethodCanBeStatic
    sendDiscussMessage(discuss, message) {
        return bot('send_discuss_msg', {
            discuss_id: discuss,
            message
        });
    }
};
