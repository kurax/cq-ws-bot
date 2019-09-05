"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
var style = __importStar(require("ansi-styles"));
var cq_websocket_1 = __importDefault(require("cq-websocket"));
var lowdb_1 = __importDefault(require("lowdb"));
var FileSync_1 = __importDefault(require("lowdb/adapters/FileSync"));
var moment_1 = __importDefault(require("moment"));
var path = __importStar(require("path"));
var signale_1 = __importDefault(require("signale"));
var uo = style.underline.open;
var uc = style.underline.close;
var yo = style.yellow.open;
var yc = style.yellow.close;
signale_1.default.config({
    displayTimestamp: true,
    displayDate: true
});
var messageEvents = {
    'message.private': 'onMessagePrivate',
    'message.discuss': 'onMessageDiscuss',
    'message.discuss.@': 'onMessageDiscussAt',
    'message.discuss.@.me': 'onMessageDiscussAtMe',
    'message.group': 'onMessageGroup',
    'message.group.@': 'onMessageGroupAt',
    'message.group.@.me': 'onMessageGroupAtMe'
};
var noticeEvents = {
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
var requestEvents = {
    'request.friend': 'onRequestFriend',
    'request.group.add': 'onRequestGroupAdd',
    'request.group.invite': 'onRequestGroupInvite'
};
var handlers = {};
var logger = signale_1.default;
var cq = new cq_websocket_1.default({
    host: process.env.CQ_HOST || 'localhost',
    port: (process.env.CQ_PORT && parseInt(process.env.CQ_PORT, 10)) || 6700
});
cq.connect();
cq.on('socket.connect', function (ep) { return logger.success("WebSocket \u7AEF\u70B9 " + uo + ep + uc + " \u8FDE\u63A5\u6210\u529F"); });
cq.on('socket.error', function (ep, err) {
    logger.fatal("\u8FDE\u63A5 WebSocket \u7AEF\u70B9 " + uo + ep + uc + " \u65F6\u53D1\u751F\u9519\u8BEF");
    logger.fatal(err);
});
var Bot = /** @class */ (function () {
    function Bot(name) {
        var _this = this;
        this.name = name;
        this.logger = signale_1.default.scope(name);
        var dataPath = path.resolve(process.env.CQ_DATA || './data');
        require('fs-extra').ensureDirSync(dataPath);
        this.db = lowdb_1.default(new FileSync_1.default(path.join(dataPath, name + ".json")));
        cq.once('ready', function () {
            [messageEvents, noticeEvents, requestEvents].forEach(function (events) {
                return Object.keys(events).forEach(function (event) {
                    var handler = _this[events[event]];
                    if (typeof handler === 'function')
                        registerHandler(_this, event, handler);
                });
            });
            _this.logger.info('初始化完成');
        });
    }
    // noinspection JSMethodCanBeStatic
    Bot.prototype.sendPrivateMessage = function (user, message) {
        return cq('send_private_msg', {
            user_id: user,
            message: message
        });
    };
    // noinspection JSMethodCanBeStatic
    Bot.prototype.sendGroupMessage = function (group, message) {
        return cq('send_group_msg', {
            group_id: group,
            message: message
        });
    };
    // noinspection JSMethodCanBeStatic
    Bot.prototype.sendDiscussMessage = function (discuss, message) {
        return cq('send_discuss_msg', {
            discuss_id: discuss,
            message: message
        });
    };
    return Bot;
}());
exports.default = Bot;
var registerHandler = function (bot, event, handler) {
    if (!handlers.hasOwnProperty(event))
        handlers[event] = [];
    handlers[event].push(handler.bind(bot));
    logger.info("\u5DF2\u7ECF\u4E3A " + yo + bot.name + yc + " \u6A21\u5757\u6CE8\u518C " + yo + event + yc + " \u4E8B\u4EF6");
};
var parseCQ = function (message) {
    var result = [];
    var reCQ = /\[CQ:([a-z]+)((?:,[a-z]+=[^,]+?)*)]/g;
    var reParam = /,([a-z]+)=([^,]+)/g;
    var match;
    while ((match = reCQ.exec(message)) !== null) {
        var entry = {
            name: match[1],
            params: {},
            begin: match.index,
            end: reCQ.lastIndex
        };
        var match1 = void 0;
        while ((match1 = reParam.exec(match[2])) !== null)
            entry.params[match1[1]] = match1[2];
        result.push(entry);
    }
    return result;
};
var reSlash = /^\/[\S]/;
var reCommand = /^\/([a-z]+)((?: ?\S+)*)$/i;
var breakdown = function (message, canBeCommand) {
    if (canBeCommand === void 0) { canBeCommand = true; }
    message = message.trim();
    if (canBeCommand && message.match(reSlash)) {
        var match = reCommand.exec(message);
        if (match === null)
            return breakdown(message, false);
        return [
            {
                type: 'command',
                name: match[1].toLowerCase(),
                params: match[2]
                    .split(' ')
                    .filter(function (s) { return s.trim() !== ''; })
                    .map(function (p) { return ({
                    raw: p,
                    parts: breakdown(p, false)
                }); })
            }
        ];
    }
    var result = [];
    var addText = function (text) {
        if (typeof text === 'string' && text.trim() !== '')
            result.push({
                type: 'text',
                text: text
            });
    };
    var addCq = function (tag) {
        result.push({
            type: 'cq',
            name: tag.name,
            params: tag.params
        });
    };
    var cqTags = parseCQ(message);
    var begin = 0;
    var tag;
    while ((tag = cqTags.shift()) !== undefined) {
        addText(message.substr(begin, tag.begin - begin));
        addCq(tag);
        begin = tag.end;
    }
    addText(message.substr(begin));
    return result;
};
var createMessageHandler = function (event) { return function (e, context, tags) {
    var funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;
    var sender = context.sender;
    sender.type = context.sub_type;
    var message = {
        id: context.message_id,
        message: context.message,
        raw: context.raw_message,
        time: moment_1.default.unix(context.time),
        parts: breakdown(context.message)
    };
    switch (context.message_type) {
        case 'private':
            funcs.forEach(function (func) { return func(context.user_id, sender, message); });
            break;
        case 'discuss':
            funcs.forEach(function (func) { return func(context.discuss_id, sender, message); });
            break;
        case 'group':
            funcs.forEach(function (func) { return func(context.group_id, sender, message); });
            break;
    }
}; };
var createNoticeHandler = function (event) { return function (context) {
    var funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;
    funcs.forEach(function (func) { return func(); });
}; };
var createRequestHandler = function (event) { return function (context) {
    var funcs = handlers[event];
    if (!Array.isArray(funcs) || funcs.length === 0)
        return;
    funcs.forEach(function (func) { return func(); });
}; };
Object.keys(messageEvents).forEach(function (event) { return cq.on(event, createMessageHandler(event)); });
Object.keys(noticeEvents).forEach(function (event) { return cq.on(event, createNoticeHandler(event)); });
Object.keys(requestEvents).forEach(function (event) { return cq.on(event, createRequestHandler(event)); });
