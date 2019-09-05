# cq-ws-bot

通过 [CoolQ](https://cqp.cc/) 以及 [CoolQ HTTP API](https://cqhttp.cc/) 实现基于 http 的 QQ 机器人基础类。

主要功能：

-   封装所有聊天事件，提供便利 API。
-   解析 CQ 消息格式，提供分析后的数据。
-   反斜杠开头的消息会被当作命令看待，并解析命令参数。
-   提供基于 LowDB 的文件数据库，以及基于 Signale 的日志功能。

环境变量：

-   CQ_HOST - CoolQ 服务的地址，默认值 `localhost`
-   CQ_PORT - CoolQ 服务的端口，默认值 `6700`
-   CQ_DATA - LowDB 数据文件的存放目录，默认值 `./data`
