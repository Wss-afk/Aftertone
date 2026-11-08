# 首次开发验收记录

日期：2026-11-06，Europe/Madrid。

目标：按开发计划末尾首次开发的五件事，完成一个 MP3 从网页上传到 MySQL/磁盘持久保存，再在后端重启后从网页播放。

## 环境

- JDK 21.0.7；系统 Maven 3.9.10，Maven Wrapper 3.10.0。
- 系统 Node 22.17.0 不满足当前 Vue 脚手架要求；使用官方 Node 24.22.2 单独运行，已核对官方 SHA-256。
- MySQL 8.4.5，现有 MySQL84 服务监听 3308；创建 `night_signal` 库和只访问该库的 `night_signal_app@127.0.0.1`。
- 先在隔离 MySQL 13308 验证，得到现有服务凭据后切到 3308，重新上传并重启验收。隔离服务已停止。

## 结果

| 检查 | 结果 |
| --- | --- |
| 前端 TypeScript 与生产构建 | 通过 |
| 后端编译、打包与 4 项单元测试 | 通过 |
| 空库 Flyway V1、JPA validate | 通过；3308 和隔离库均实际从空库启动 |
| 网页选择并上传中文文件名 MP3 | 成功；`201`，记录与 UUID 文件同时存在 |
| 同名文件重复上传 | 两个不同 ID、不同 UUID 文件，均保留 |
| 重启后曲库 | ID 1、2 均可读取，排序为最近上传 |
| 浏览器播放 | 音频可解码，播放时间推进，`readyState=4`，`paused=false`，无 media error |
| 直连及 Vite 代理完整读取 | `200`、audio/mpeg、Accept-Ranges，SHA-256 与原文件相同 |
| 首段和尾段 | `206`、正确 Content-Range，字节内容匹配 |
| 格式错误及越界 Range | `416`，包含 `bytes */480653` |
| 不存在的歌曲带 Range | `404`，TRACK_NOT_FOUND |
| 缺少文件、空文件 | `400`，FILE_REQUIRED / EMPTY_FILE |
| 文本伪装 MP3、裸 ID3 | `415`，UNSUPPORTED_AUDIO |
| 文件与请求超限 | `413`，UPLOAD_TOO_LARGE；直连和代理均返回可读 JSON |
| 无效上传后的曲库与目录 | 记录数量未增加，无上传临时文件残留 |

测试音是本地生成的 440 Hz 原创正弦波，不含第三方歌曲。长度约 30.040813 秒，480653 字节，SHA-256：

```text
598e02660594e309171cdeb81c63a0f785870acaa0ab8f573d28edad806425e7
```

在 3308 库连接及后端重启后，浏览器实际播放 `/api/v1/tracks/2/audio`，观测到 `currentTime=8.099951`、`duration=30.040813`、`readyState=4`、`paused=false`，无音频错误。随后暂停。页面截图保存在 [first-step-preview.jpg](first-step-preview.jpg)。

## 已修复的问题

- Maven Wrapper 在受限环境读取普通目录的空 Target 属性时失败，已加空值判断。
- 超限请求中 Tomcat 提前关闭连接，客户端无法读取 413；调整请求吞入行为。
- 代理透传 Connection: close 会中断尚未发完的大文件请求；Vite 对 413 保持连接并继续读取请求体。
- MP3 校验只解析音频帧，不让无须读取的 ID3 元数据内容影响有效音频的验证；裸标签和错误长度仍会拒绝。

## 范围

浏览器检查使用本机内置浏览器，包括重启后的真实音频解码与播放进度。没有把下载音频成功等同于听到实体扬声器声音。安卓实机、三首歌完整连播、事务异常注入、备份恢复和正式发布尚未验收。
