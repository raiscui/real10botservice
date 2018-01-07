# 服务器文件更新

## 软件

winscp , putty 等 ssh/sftp 工具

## 1.登陆/ 确认部署环境

1. 使用 类似 putty 的工具 ssh 登陆 服务器, 端口 有两种`22`和`2222`.

   > 用户名: root

   > 密码: `gkdiyesl` or `skcg`

> 有 2222 的是 内部使用 docker 的版本.

2. `22`端口 能进去的, **确认环境**:

   * 输入 `docker ps`
     * 提示没有这个命令的, 是 **本地部署版本**,
   * 输入 `pm2 l`
     * 提示没有这个命令的, 应该是 **docker 部署版本**

   > 这两个命令应该有 1 个能起作用.

3. `22`端口无论怎么尝试进不去的, 进 `2222`端口 , 用户名密码照旧.

   * 如果能进去 ,说明这个是 **docker 部署版本**

## 2. 更新文件

### 2.1 docker 部署版本

1. 如果是 docker 部署版本, 2222 端口是肯定有的,先确认下 docker 运行状况 执行: `docker ps`

   > 应该会有 一个容器在跑,看叙述 可以看出运行了多长时间等

2. 用 winscp 这样类似的 sftp 工具 登陆 服务器的 2222 端口, 用户名密码和 putty 方式一样,因为 sftp 就是 ssh 的 scp.

3. 同时使用 putty 登陆 `2222`端口

4. mqtt server 文件更新:

   * 位置确认 mqttser 文件在这两台机器中,在不同位置

     1. putty 终端输入 `pm2 l` ,看到有一个 mqtt 的服务的话 继续
     2. 输入 `pm2 info mqtt`, 看到 `script path` 这里给的文件位置,主启动脚本文件的位置就是 mqtt server 主文件夹的位置

   * 位置确认后, 用 winscp 进入目录 将新文件拖拽替换

5. 固化更新:

   1. 使用 putty 登陆 `22`端口
   2. 输入 `docker ps` 查看 real9 容器的 ID （最前面的 大概 8-12 位的随即英文数字组合）
   3. 输入 `docker commit -m '更新XXX' -a '你的名字' 容器ID real9:last`

      > 比如 `docker commit -m 'update botser' -a 'rais' 10b35237a391 real9:last`

      * **会等很久** 完了后(意味着终端输入提示符继续闪烁了)可以输入 `docker restart 容器ID` 来重启容器 或者 直接重启电脑

6. docker 部署版本 使用 **重启电脑** 来重启正在 run 的服务
   > putty 中输入 `reboot` 可以重启 linux

### 2.2 本地部署版本 更新文件

1. putty 已经登陆进去了 , ok,现在要同时用 winscp 登陆一下

   > 用 winscp 这样类似的 sftp 工具 登陆 服务器的 2222 端口, 用户名密码和 putty 方式一样,因为 sftp 就是 ssh 的 scp.

2. mqtt server 文件更新:

   * 位置确认 mqttser 文件在这两台机器中,在不同位置

     1. putty 终端输入 `pm2 l` ,看到有一个 mqtt 的服务的话 继续
     2. 输入 `pm2 info mqtt`, 看到 `script path` 这里给的文件位置,主启动脚本文件的位置就是 mqtt server 主文件夹的位置

   * 位置确认后, 用 winscp 进入目录 将新文件拖拽替换

3. 重启服务: putty 输入 `pm2 restart all`

   * 用 `pm2 l` 查看重启后状态

4. 不用重启服务器
   > putty 中输入 `reboot` 可以重启 linux
