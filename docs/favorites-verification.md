# 收藏功能验收

日期：2026-11-07。范围：本地电脑网页版的单人曲库，未实施歌单或手机功能。

## 更新与使用

- 歌曲行和底部播放器各有爱心按钮，点击收藏/取消收藏，两个入口同步，保存中禁用重复提交。收藏不启动播放，取消收藏不删除歌曲、封面或音频。
- 左侧“我喜欢的音乐”显示收藏数量与列表，沿用最近上传顺序。收藏页只搜索收藏的歌名/歌手，提供空收藏、无匹配、加载失败与保存失败提示。
- 点歌时确定播放来源：完整曲库或收藏。切页与搜索不改变当前队列；收藏来源支持原有顺序、单曲循环、随机与历史返回。
- 取消当前歌曲收藏保留播放与进度，临时保留它作为队列位置，之后切歌只使用剩余收藏；单曲循环仍重复当前歌曲。删除歌曲则沿用原单首删除与确认流程。

## 保存与并发

Flyway V5 自动增加 `tracks.favorite BIT(1) NOT NULL DEFAULT 0`。已有歌曲默认未收藏，无需重新初始化数据库。歌曲列表、上传、编辑响应包含 favorite。

`PATCH /api/v1/tracks/{id}/favorite` 接收显式布尔值并返回 `{id, favorite}`。同一目标重复请求保持相同状态，避免网络重试把收藏反向切换。事务锁定单条有效记录，只修改收藏字段；不存在或正在删除时 404，缺少状态时 400，保存失败时提供刷新确认提示。

前端只合并收藏字段，避免覆盖已更新的歌名和专辑。列表和播放器同一首歌在请求期间均禁用爱心；过期列表请求不能覆盖新状态。失败保留原爱心状态，允许重试或刷新确认。

## 测试结果

- 前端 103 项全部通过，TypeScript 检查及生产构建通过。新增 23 项覆盖收藏入口、同步、搜索、空状态、三种播放模式、来源切换、取消当前收藏、删除、请求失败/重试、重复点击和刷新竞态。
- 后端 73 项全部通过，无跳过，JAR 打包通过。新增 11 项覆盖显式设置、重复请求、400/404、删除中记录、事务失败、提交不确定性，以及收藏不读写音频或封面。
- 使用独立 MySQL 测试库（13308）、独立音乐目录、后端 18080 与前端 15173，沿用已生成的四首测试音。未向日常曲库上传或删除歌曲，也未代替用户选择日常收藏。
- 真实接口验证收藏、取消、重复请求、非法/未知记录反馈；其他歌曲字段保持一致。重启后完整响应保持一致，封面可读取，所有音频 SHA-256 不变，Range 返回 206。
- 实际浏览器验证收藏页只展示两首已收藏测试音，搜索隐藏其中一首时仍可按收藏队列切歌。取消正在播放歌曲的收藏，进度从 6.290592 秒继续至 6.605256 秒，音源保持 `/api/v1/tracks/8/audio`；下一首跳过未收藏的 id=7，播放 id=6。
- 浏览器重新加载后再次看到两首收藏，点击后能解码播放 90 秒测试音。1440 像素桌面视口下页面及播放器歌曲信息无横向溢出，爱心、菜单和音量控件无重叠。
- 主服务已自动迁移 V5，三首日常歌曲默认未收藏，已有 ID、歌名、歌手、专辑、封面、上传时间、大小与音源均保持，三份音频 SHA-256 不变。日常收藏空状态与播放器入口已实际检查，Window 可播放。

验收结束已暂停测试音频，恢复临时浏览器视口。启动仍使用 `scripts/start-backend.ps1` 和 `scripts/start-frontend.ps1`，无需新增环境配置。

## 修改文件

| 范围 | 文件 |
| --- | --- |
| 数据库与接口 | V5__track_favorites.sql、Track.java、TrackResponse.java、TrackService.java、TrackController.java、FavoriteTrackRequest.java、FavoriteTrackResponse.java |
| 前端 | App.vue、api/tracks.ts、TrackList.vue、FavoriteButton.vue、usePlaybackQueue.ts、favorites.css、main.ts |
| 自动测试 | favorites.test.ts、tracks-api.test.ts、既有歌曲夹具、TrackFavoriteServiceTest.java、TrackFavoriteControllerTest.java、TrackRenameControllerTest.java |
| 文档 | README.md、CHANGELOG.md、plan.md、本验收记录 |

界面记录：[收藏页（生成测试音）](favorites-test-preview.jpg)、[日常曲库及播放器爱心](favorites-library-preview.jpg)。
