type Handler = (res: CQResponse) => void;
type ErrorHandler = (err: Error) => void;
type Options = number | { timeout: number };

export interface CQHTTPAnonymous {
    id: number;
    name: string;
    flag: string;
}

export interface CQHTTPSender {
    user_id?: number;
    nickname?: string;
    sex?: 'male' | 'female' | 'unknown';
    age?: number;
    card?: string;
    area?: string;
    level?: string;
    role?: 'owner' | 'admin' | 'member';
    title?: string;
}

export interface CQHTTPData {
    post_type: string;
    time: number;
    self_id: number;
}

export interface CQHTTPMessage extends CQHTTPData {
    post_type: 'message';
    message_type: string;
    message_id: number;
    user_id: number;
    message: any;
    raw_message: string;
    font: number;
    sender: CQHTTPSender;
}

export interface CQHTTPPrivateMessage extends CQHTTPMessage {
    message_type: 'private';
    sub_type: 'friend' | 'group' | 'discuss' | 'other';
}

export interface CQHTTPGroupMessage extends CQHTTPMessage {
    message_type: 'group';
    sub_type: 'normal' | 'anonymous' | 'notice';
    group_id: number;
    anonymous: null | CQHTTPAnonymous;
}

export interface CQHTTPDiscussMessage extends CQHTTPMessage {
    message_type: 'discuss';
    discuss_id: number;
}

export interface CQHTTPNoticeMessage extends CQHTTPData {
    [key: string]: any;
    post_type: 'notice';
    notice_type: string;
    sub_type?: string;
    group_id: number;
    user_id: number;
    operator_id?: number;
}

export interface CQHTTPRequestMessage extends CQHTTPData {
    [key: string]: any;
    post_type: 'request';
    request_type: string;
    sub_type?: string;
    user_id: number;
    group_id?: number;
}

export interface CQResponse {
    status: string;
    retcode: number;
    data: any;
}

export interface CQCode {
    type: string;
    data: null | {
        [key: string]: string;
    };
}

export interface CQTag {
    [key: string]: any;
    tagName: string;
    data: Readonly<any>;
    modifier: any;
    equals(another: CQTag): boolean;
    coerce(): CQTag;
    toString(): string;
    valueOf(): string;
    toJSON(): CQCode;
}

export type ArrayMessage = (CQTag | CQCode | string)[];

export interface CQEvent {
    messageFormat: 'string' | 'array';
    getMessage(): string | ArrayMessage;
    setMessage(msg: string | ArrayMessage): void;
    appendMessage(msg: string | CQTag | CQCode): void;
    hasMessage(): boolean;
    stopPropagation(): void;
    onResponse(handler: Handler, options?: Options): void;
    onResponse(options?: Options): void;
    onError(handler: ErrorHandler): void;
}

type ListenerResult = void | Promise<void>;
type MessageListenerResult =
    | ListenerResult
    | string
    | Promise<string>
    | ArrayMessage
    | Promise<ArrayMessage>;

export type Listener = (
    context: CQHTTPNoticeMessage | CQHTTPRequestMessage
) => ListenerResult;

export type MessageListener = (
    e: CQEvent,
    context: CQHTTPPrivateMessage | CQHTTPGroupMessage | CQHTTPDiscussMessage,
    tags: CQTag[]
) => MessageListenerResult;
