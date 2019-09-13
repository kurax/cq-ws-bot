const reSlash = /^\/[\S]/;
const reCommand = /^\/([a-z]+)((?: ?\S+)*)$/i;

export interface MessagePart {
    type: 'command' | 'text' | 'cq';
    name?: string;
    text?: string;
    params?: any;
}

type Tag = {
    name: string;
    params: {
        [key: string]: string;
    };
    begin: number;
    end: number;
};

function parseCQ(message: string) {
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
        while ((match1 = reParam.exec(match[2])) !== null)
            entry.params[match1[1]] = match1[2];
        result.push(entry);
    }
    return result;
}

function parser(message: string, canBeCommand = true): MessagePart[] {
    message = message.trim();
    if (canBeCommand && message.match(reSlash)) {
        const match = reCommand.exec(message);
        if (match === null) return parser(message, false);
        return [
            {
                type: 'command',
                name: match[1].toLowerCase(),
                params: match[2]
                    .split(' ')
                    .filter(s => s.trim() !== '')
                    .map(p => ({
                        raw: p,
                        parts: parser(p, false)
                    }))
            }
        ];
    }
    const result: MessagePart[] = [];
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
}

export default parser;
