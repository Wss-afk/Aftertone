# Aftertone

Vue 曲库页 + Spring Boot API + MySQL 歌曲记录 + 本机音乐文件。上传时自动识别音频内容；有效 MP3 保留原文件，M4A、AAC、WAV、FLAC、OGG 等常见音频自动处理为 MP3，再加入曲库。

每个版本的更新、遇到的问题、原因、解决方法与验证结果记录在 [CHANGELOG.md](CHANGELOG.md)。后续计划与暂缓问题记录在 [plan.md](plan.md)。

当前优先完善电脑网页版。曲库管理、搜索、三种播放模式、居中进度条、空格快捷键、封面/专辑/列表时长、收藏及歌单已完成。桌面完整验收、隔离备份恢复和数据库故障验证已通过。手机访问、移动端适配和安卓 App 暂缓。

## 本机环境与当前配置

| 项目 | 检查结果 / 实际使用 |
| --- | --- |
| Java | 系统 JDK 21.0.7，`java`、`javac` 可用 |
| Maven | 系统 3.9.10；项目 Maven Wrapper 固定 3.10.0 |
| Node / npm | 系统 Node 22.17.0、npm 10.9.2；脚本使用项目内 `.tools/node/node.exe` 24.22.2 和系统 npm CLI |
| Vue / Vite | Vue 3.5.45、Vite 8.3.6、TypeScript；版本由 package-lock.json 锁定 |
| 后端 | Spring Boot 4.1.2、Java 21、Spring Data JPA、Flyway MySQL |
| MySQL | 已安装 8.4.5，Windows 服务 `MySQL84`，实际端口 **3308** |
| 应用数据库 | `night_signal`，`utf8mb4`；应用账号 `night_signal_app@127.0.0.1` 仅拥有此库权限 |
| 文件 | `data/music/<UUID>.mp3`，脚本传入绝对路径 |
| 音频处理 | 项目内 FFmpeg / FFprobe 9.0.2，启动脚本自动定位 |

系统 Node 低于 [Vue 当前快速开始要求](https://vuejs.org/guide/quick-start.html)（`^22.18.0 || >=24.12.0`），因此单独下载了项目运行时，没有升级全局 Node。首次复制源码到另一台机器时，先运行 `scripts/setup-node.ps1`，也可自行安装符合要求的 Node。脚本要求系统已经安装 npm。

数据库应用密码随机生成，保存在被 Git 忽略的 `.local/database.json`。现有 MySQL 服务的管理员密码没有保存到源码或本地配置。启动脚本只把应用凭据传入子进程；已有环境变量优先于本地配置。

## 在这台电脑启动

以下命令在项目根目录执行。数据库已初始化，**不需要再次运行初始化脚本**。确认 `MySQL84` 服务处于运行状态：

```powershell
# 从项目根目录执行
Get-Service MySQL84
.\scripts\start-backend.ps1
```

保持这个 PowerShell 窗口运行，另开一个窗口启动前端：

```powershell
# 从项目根目录执行
.\scripts\start-frontend.ps1
```

打开 **http://127.0.0.1:5173/**。选择或拖入音频，点击“上传歌曲”，处理完成后可在曲库点播。底部中央是播放控制和加粗进度条，左侧显示歌曲，右侧提供模式和音量。列表固定为最近上传，默认顺序播放到最后一首停止。刷新曲库会保留当前播放进度。

曲库显示封面、歌名/歌手、专辑与时长。上传读取音频内嵌标签及附带封面；没有标签时显示默认封面、“未知歌手”和“未知专辑”，无法读取时长时显示 `--:--`。点击歌曲右侧“…”→“修改信息”可编辑专辑、选择/更换 JPG 或 PNG 封面（最大 5 MiB），也可移除或撤销尚未保存的封面修改。保存后播放器同步更新，保留音源和进度。

更新后的后端首次启动会为旧歌曲补读专辑、封面和时长，保留已编辑的歌名、歌手与原音频；以前已经丢失的标签无法凭空恢复，需要手动补充。无需重新初始化数据库，Flyway 会自动升级。

前端、后端窗口按 `Ctrl+C` 停止。再次运行以上两条脚本即可重启；歌曲记录与音频不会随进程退出而清空。曲库中的“夜航验证音”“自动处理验证”是本地生成的 30 秒测试音，用于验证同名上传及自动处理格式。

### 批量导入

在“我的曲库”多选音频，或把文件拖入上传区，再点“上传歌曲”。系统依次处理文件，每首最大 25 MiB。列表显示等待、处理、成功、重复或失败，失败项可单独重试。切换曲库、收藏和歌单时会保留本页会话中的导入队列。

内容完全相同的文件会标记为“重复，已跳过”。同名但内容不同的文件可以导入。Flyway V7 记录新上传源文件的 SHA-256。旧曲目可用已保存的音频识别字节相同的文件，过去已经转码的源文件只剩转码后的版本时，重新上传原格式可能无法识别为重复。

上传遇到空间不足或容量暂时不可用时会暂停这批导入，保留失败项和后续等待项。空间恢复后可继续上传或单独重试。

### 收藏与我喜欢的音乐

点击歌曲行或底部播放器的爱心，收藏或取消收藏；两处状态同步，保存中防止重复点击，失败会保留原状态并提示重试。收藏状态保存在 MySQL，刷新页面和重启后端后仍然保留。取消收藏只移出收藏列表，歌曲记录、封面和音频继续保留。

左侧“我喜欢的音乐”集中显示收藏歌曲，顺序沿用最近上传，可按歌名/歌手搜索。没有收藏时提供“去曲库选歌”入口；没有搜索结果与读取失败分别提示。

点击歌曲时确定播放来源：在“我的曲库”点歌使用完整曲库，在“我喜欢的音乐”点歌使用收藏列表。切换页面和搜索只影响浏览，不替换现有队列或打断播放。取消当前歌曲收藏时保留播放与进度，后续切歌使用剩余收藏；单曲循环仍重复当前歌。改换播放来源时重置随机历史，避免跳回另一来源。

### 歌单

在左侧点击「＋ 新建歌单」，输入名称后自动进入该歌单。歌单页有「修改歌单名称」。名称去除首尾空白，支持 1–80 个字符，同名会提示换一个名称。

打开歌单后，点右上角「删除歌单」并确认。删除会清理该歌单及其中的关联，歌曲文件、收藏和其他歌单中的曲目保留。当前歌曲可继续播放。

点选一首歌后，在底部播放器的歌名旁点击爱心右边的列表加号，即可把当前歌曲加入歌单，暂停时也能使用。同一首歌可分别加入多个歌单，每个歌单按加入顺序排列，同一曲目只出现一次。在歌单内用歌曲菜单的「从此歌单移出」只移除这条关联，曲库音频、收藏和其他歌单仍可访问。通过「删除歌曲」确认从曲库删除时，对应关联一并清理。

从歌单点歌后使用整个歌单作为播放来源。搜索和浏览其他页面不切换队列，移出正在播放的歌曲会保留当前进度，下一首从原位置继续。名称和曲目顺序保存在 MySQL，Flyway V6 在启动时为现有数据库新增歌单表。

### 播放模式、进度与键盘

右侧模式图标每点一次，依次切换“顺序播放 → 单曲循环 → 随机播放 → 顺序播放”。列表箭头表示顺序，带 1 的循环箭头表示单曲，交叉箭头表示随机；悬停提示当前模式和下一种模式。模式与音量横向分组，去掉常驻说明和音量百分比，百分比可悬停查看。各模式规则如下：

| 模式 | 播完后的行为 | 手动上下首 |
| --- | --- | --- |
| 顺序播放 | 按最近上传顺序继续，末曲结束后停止 | 按曲库顺序切换，边界不循环 |
| 单曲循环 | 重复当前歌曲 | 仍可按曲库顺序切换 |
| 随机播放 | 从当前播放来源（完整曲库或收藏）随机选择其他歌曲，不连续重复当前歌曲；只有一首时停止 | 上一首返回历史，下一首先沿历史前进，没有前进记录时再随机选择 |

切换模式不重新加载音频，不改变当前进度和播放/暂停状态。模式记在当前浏览器中，刷新后保留，但不会自动开始播放。随机历史仅保留在当前页面，已删除的歌曲会被跳过。

中央进度条使用薄荷绿显示已播放部分，两侧显示当前时间和总时长。拖动时预览位置，松开后跳转；暂停时拖动也保持暂停。进度条聚焦时可用方向键、Home、End 等浏览器滑块按键调整位置。尚未读取到有效时长时禁止跳转。右侧保留音量和静音控制，零音量时取消静音会恢复最近的非零音量。

选好歌曲后按空格切换播放/暂停；当前歌曲行或进度条聚焦时也可用。搜索、文本编辑、模式图标、菜单及操作弹窗保留各自的键盘行为，空格不会误暂停；模式按钮聚焦时空格或 Enter 切换模式。按住空格不会反复切换播放状态，组合键和输入法组合输入也不触发全局快捷键。

### 搜索曲库

在歌曲列表上方输入歌名或歌手，即时筛选当前曲库；支持部分名称、中文、忽略英文大小写和全角/半角差异。多个关键词用空格分开，所有关键词都须在歌名或歌手中找到；不搜索原始下载文件名。输入仅为空白时显示全部歌曲。

搜索时显示匹配数量和曲库总数，找不到时提示“没有匹配的歌曲”。点击输入框右侧清空按钮、按 Esc，或在无结果提示中选择“查看全部歌曲”，恢复最近上传列表。输入框按 Enter 不会提交或跳转页面。

搜索只筛选当前页面的歌曲；在收藏页只匹配收藏。当前歌即使被隐藏也会继续播放；上一首、下一首和连播遵循所选模式及点歌时确定的播放来源，随机候选也来自该来源。列表下方提示当前规则。刷新曲库、上传后刷新、修改信息或单首删除后，会继续应用当前搜索词；切换页面清空搜索，重新加载页面回到全部曲库且不自动播放。

当前使用已加载曲库在网页内筛选，无需每次输入都请求服务器；本次不涉及数据库或后端接口变更。

### 删除一首歌

点击歌曲行右侧“…”菜单中的“删除歌曲”，核对确认框中的歌名，再选择“确认删除”。每次只处理选中的一首歌，删除曲库保存的音频文件，电脑上用于上传的原始文件保留。点击“取消”或按 Esc 不删除。

删除当前歌曲会停止并清空播放器；删除其他歌曲保留当前播放进度。删除失败时显示可重试的错误，并恢复原播放状态。

### 修改歌曲信息与操作菜单

点击歌曲行右侧的“…”打开菜单，选择“修改信息”编辑歌名和歌手，选择“删除歌曲”进入单首删除确认框。菜单支持方向键、Esc 和点击外部关闭，打开菜单不会开始或切换播放。

列表第一行显示歌名，第二行显示歌手；播放器也显示这两个字段。歌手为空时显示“未知歌手”。“修改信息”中选择“保存修改”或按 Enter 保存，“取消”或 Esc 放弃编辑。歌名自动全选便于输入；歌名为 1–255 个 Unicode 字符，歌手可留空、最多 255 个字符，均去掉首尾空白并拒绝内部控制字符。保存期间避免重复提交，失败保留输入供重试。信息保存到 MySQL，刷新和重启后保留；修改不改变音源、进度、原文件名、上传时间或歌曲顺序。

Flyway V3 增加独立 artist 字段，旧记录默认为空，不猜测文件名中的哪一段是歌手。新上传会读取原音频内嵌的标题与歌手标签，自动转码时也保留这些信息供入库；标签缺失或不可读时，歌名使用文件名，歌手留空，可在菜单中补充。已有音频曾经丢失的标签不会自动恢复。

默认只监听本机。手机和局域网访问暂缓；现有 `scripts/start-frontend.ps1 -Lan` 参数保留供后续使用，当前先完成网页版。

## 首次配置数据库 / 手动配置

只有在**新环境且没有同名库、同名应用账号**时执行下列命令。脚本会在终端安全读取管理员密码；创建已有对象会失败，不会重设已有账号的密码：

```powershell
.\scripts\init-database.ps1 -Port 3308
```

也可以自行创建 UTF-8 库和专用账号，再直接提供环境变量：

```powershell
$env:SPRING_DATASOURCE_URL = 'jdbc:mysql://127.0.0.1:3308/night_signal?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true'
$env:SPRING_DATASOURCE_USERNAME = 'night_signal_app'
$env:SPRING_DATASOURCE_PASSWORD = '<应用账号密码>'
$env:APP_MUSIC_DIR = (Join-Path (Get-Location) 'data\music')
.\scripts\start-backend.ps1
```

不使用辅助脚本时，在 `backend` 运行 `.\mvnw.cmd spring-boot:run`，配置从相同环境变量读取。Flyway 在空库上执行 `V1__create_tracks.sql`；之后 Hibernate 只校验，不自动改表。时间统一为 UTC，API 返回 ISO 8601 的 `Z` 时间。

在获得现有 MySQL 凭据前，曾用本机 MySQL 程序创建隔离验证实例（13308）。该实例现已停止，测试记录已迁入当前 3308 库；`.local/mysql/` 中的隔离数据保留，日常启动不需要它。`init-local-db.ps1`、`start-local-db.ps1`、`stop-local-db.ps1` 是没有现有数据库凭据时的开发备用工具，不能与正常初始化流程重复使用。

## 接口与存储

### 容量显示与低空间保护

页面显示曲库播放文件占用的空间、曲库所在磁盘的可用空间，以及默认 5 GB 安全预留线。上传来源文件、MySQL、开发工具等不计入“曲库音频占用”，但都会影响磁盘可用空间。

容量按事件刷新：打开页面、上传完成或失败后、删除成功后、窗口重新获得焦点，以及手动点击“刷新”。当前没有每秒或定时持续轮询，其他软件写入磁盘时，界面数字可能暂时滞后。

后端会在解析上传表单前、写入文件时及音频处理过程中独立检查实际空间，不依赖页面缓存。空间不足返回 `507 INSUFFICIENT_STORAGE`，本次临时文件逐个清理；原有歌曲仍可播放和单首删除。读取容量失败返回 `503 STORAGE_UNAVAILABLE`，不会把未知容量当成零或默认放行上传。

预留线可通过 `APP_STORAGE_MIN_FREE_SPACE` 配置，默认 `5GB`，修改后重启后端生效。这是上传准入规则，不会创建一个 5 GB 的占位文件。开始上传时还会保守预留上传、转码及少量临时开销（当前共 133 MiB），所以可能在剩余空间略多于 5 GB 时暂停新增。

真正需要扩大曲库容量时，可以把音乐目录迁到容量更大的磁盘：停止后端，备份数据库和音乐目录，复制音乐文件到新目录，修改 `APP_MUSIC_DIR` 后重启并核对歌曲及播放。当前没有自动迁移或批量清理旧文件的脚本。

### 自动音频格式处理

日常上传直接选择原音频即可。即使内容实际是 M4A/AAC、扩展名却写成 `.mp3`，后端也会根据内容识别，自动生成可播放的 MP3 后保存。有效 MP3 的字节保持原样；其他格式会进行有损转码。原文件保留在用户电脑上，曲库保存处理后的播放文件，数据库记录其实际大小；`originalFilename` 保留上传时的名字。

支持的容器包括 MP3、M4A/MP4、AAC、WAV、FLAC、OGG/Opus、WebM、WMA 和 AIFF，以本机 FFmpeg 能解码的音轨为准。没有可读取音轨、损坏或不支持的文件返回明确错误。

当前电脑已准备项目内的便携 FFmpeg，无需全局安装。新环境执行一次：

```powershell
.\scripts\setup-ffmpeg.ps1
```

脚本从 [Windows FFmpeg 构建源](https://www.gyan.dev/ffmpeg/builds/) 下载并校验 SHA-256，放入 `.tools/ffmpeg/`。启动脚本自动设置 `APP_FFMPEG_PATH` 和 `APP_FFPROBE_PATH`；手动启动 JAR 时可自行提供这两个环境变量，或将工具加入 PATH。

处理默认最多 120 秒、输出最多 100 MiB，可用 `APP_AUDIO_TIMEOUT_SECONDS`、`APP_AUDIO_MAX_OUTPUT_BYTES` 配置。处理失败时逐个清理本次临时文件，成功转换后才插入记录。`scripts/convert-to-mp3.ps1` 保留为可选的命令行工具，网页上传无需手动转换。

| 接口 | 行为 |
| --- | --- |
| `POST /api/v1/tracks` | multipart 字段 `file`，成功返回 `201` 和歌曲信息。网页使用 `?skipDuplicates=true`，内容重复时返回 `409 DUPLICATE_TRACK`。 |
| `GET /api/v1/tracks` | `createdAt DESC, id DESC`，空库返回 `[]` |
| `GET /api/v1/storage` | 曲库音频字节数、磁盘总量/可用空间、预留线和是否允许新增上传 |
| `DELETE /api/v1/tracks/{id}` | 单首删除成功 `204`；未知或已删除 ID `404`；文件占用 `409 DELETE_FAILED` |
| `PATCH /api/v1/tracks/{id}/favorite` | JSON `{ "favorite": true/false }` 显式设置收藏状态，成功 `200` 只返回 id、favorite；重复请求保持目标值。缺字段 `400 INVALID_FAVORITE`，不存在或正在删除 `404`，保存失败 `500 FAVORITE_SAVE_FAILED` |
| `PATCH /api/v1/tracks/{id}` | JSON `{ "title": "歌名", "artist": "歌手", "album": "专辑" }`，成功 `200` 返回歌曲；无效字段 `400 INVALID_TITLE/INVALID_ARTIST/INVALID_ALBUM`；不存在或正在删除 `404`；保存失败 `500 RENAME_FAILED`。省略 artist/album 保留原值，空字符串清空 |
| `PUT /api/v1/tracks/{id}/information` | multipart 文本字段 title、artist、album，及可选 cover 图片 / removeCover 布尔值；文字与封面在同一数据库事务内保存。无效图片 `415`，图片超限 `413`，像素超限 `422` |
| `GET /api/v1/tracks/{id}/cover?v=版本` | 归一化 JPEG 封面；无封面或旧版本 URL 返回 `404`，不返回音频内的任意附件 |
| `GET /api/v1/tracks/{id}/audio` | MP3 完整响应 `200`、分段 `206`、无效范围 `416`、未知 ID `404` |

上传单文件 25 MiB、请求 26 MiB。后端校验 ID3v2 长度，用 MPEG 解析器识别有效 MP3；其他内容经 FFprobe 检查音轨、FFmpeg 处理后再验证。读取范围只允许本机文件及常见二进制媒体容器。不信任扩展名或客户端 MIME。数据库及播放响应的 MIME 固定为 `audio/mpeg`。转码前读取标题、歌手、专辑和附带封面，时长使用最终播放文件的数据。

Flyway V4 增加 album、duration_seconds、cover_version、details_scanned 字段和 track_artwork 表。封面归一化为最长边 512 像素的 JPEG，单独存入 MySQL，列表只返回带版本号的 URL。专辑和手动封面操作原子保存，单首歌曲删除时封面通过外键级联清理。手动图片先检查真实格式、5 MiB 大小和尺寸上限（1600 万像素、单边 8192 像素），再解码缩图。容量面板的“曲库音频占用”只统计音频，不包含数据库里的封面。

Flyway V5 增加 favorite 字段，已有歌曲默认未收藏；列表与上传/编辑响应包含 favorite。收藏接口使用行锁与事务，只修改收藏字段，不读取、改写或删除音频。功能验收见 [收藏验收](docs/favorites-verification.md)。

本次封面、专辑和时长的测试及重启验收见 [封面与专辑验收](docs/track-details-verification.md)。备份应同时包含数据库与音乐目录。

临时文件与正式文件位于同一音乐目录，验证后以原子移动生成 UUID 文件。单实例通过目录锁避免并发实例共用音乐目录。读取验证 UUID 键、规范路径、符号链接和解析后的实际父目录。数据库事务提交后才返回成功；确认回滚删除本次文件，提交结果未知时保留文件并记录键供核对。启动时不会清空或批量清理文件。

Flyway V2 增加删除状态字段：先提交删除意图，再删除明确的 UUID 文件，最后清理记录。文件删除失败时恢复可见记录；删除状态提交结果不明确时保留音频。启动恢复只检查未完成的记录：文件仍在则恢复曲库，文件已无则完成数据库清理，不自动删除音频文件。

统一应用错误返回 `application/problem+json`，包括 `status`、`title`、`detail`、`code`。Vite 代理保留 Range 头与状态，并对超限上传保持连接以转发可读的 `413` 错误。

## 构建与验证

后端测试不依赖运行中的 MySQL；自动转换集成测试使用本机 FFmpeg。没有提供 FFmpeg 时会跳过转换集成测试，普通 MP3 与存储测试仍会运行：

```powershell
Set-Location .\backend
. '..\scripts\common.ps1'
Set-AudioToolPaths
.\mvnw.cmd test
.\mvnw.cmd package
```

前端构建与 TypeScript 检查：

```powershell
# 从项目根目录执行
. .\scripts\common.ps1
Push-Location frontend
& $NodeRuntime $NpmCli test
& $NodeRuntime $NpmCli run build
Pop-Location
```

前后端运行时，可重复检查保留的测试记录（第二次上传的 ID 为 2）：

```powershell
# 从项目根目录执行
& .\.tools\node\node.exe .\scripts\verify-api.mjs 2 '.local/test-audio/夜航验证音.mp3'
```

脚本检查直连和代理的完整文件哈希、首段/尾段、无效 Range、未知 ID、空文件、伪 MP3、裸 ID3 和超限响应。无效上传应不新增记录；结果写入 `.local/api-verification.json`。生成另一份测试音可参考 `scripts/generate-test-audio.mjs` 的安装说明；单元测试使用仓库内已生成的两秒音频，无需再次安装编码器。

首次开发验收与桌面交付验收分别记录在 [首次开发验收](docs/first-step-verification.md) 和 [桌面交付验收](docs/desktop-acceptance-verification.md)。正式部署待处理，手机验收暂缓。

自动格式识别、转换及重启播放验收见 [docs/audio-processing-verification.md](docs/audio-processing-verification.md)。

单首删除、文件占用、重启恢复及浏览器确认/取消验收见 [docs/single-delete-verification.md](docs/single-delete-verification.md)。`scripts/verify-single-delete.mjs` 仅接受 18080 上的空隔离测试曲库，不能对日常曲库执行。

容量显示、正常空间、模拟低空间及直连/代理提前拒绝上传验收见 [docs/storage-capacity-verification.md](docs/storage-capacity-verification.md)。`scripts/verify-storage-capacity.mjs` 只连接隔离的 18080/15173 测试入口。

歌曲重命名、播放连续性及重启保留验收见 [docs/track-rename-verification.md](docs/track-rename-verification.md)。`scripts/verify-track-rename.mjs` 使用隔离测试入口及生成的测试音，不对日常歌曲改名。

“…”菜单、歌手信息、标签导入及转码后保留验收见 [docs/track-information-verification.md](docs/track-information-verification.md)。`scripts/verify-track-information.mjs` 使用隔离测试入口和生成的带标签音频。

按歌名/歌手搜索、清空、无结果提示及完整队列保持验收见 [docs/library-search-verification.md](docs/library-search-verification.md)。

三种模式、居中进度、空格快捷键及真实浏览器循环/随机验收见 [docs/playback-controls-verification.md](docs/playback-controls-verification.md)。

模式图标直接切换及右侧控件间距验收见 [docs/player-icon-layout-verification.md](docs/player-icon-layout-verification.md)。

## 文件分工

- `frontend/src/App.vue`：曲库页面、唯一音频元素与播放状态。
- `frontend/src/api/tracks.ts`：相对路径 API 与错误读取。
- `frontend/src/components/UploadPanel.vue`、`TrackList.vue`：上传与列表。
- `frontend/src/style.css`、`vite.config.ts`：界面主题、响应式布局与开发代理。
- `frontend/src/components/DeleteTrackDialog.vue`：单首删除确认、取消和失败重试。
- `frontend/src/components/RenameTrackDialog.vue`：歌名与歌手编辑、校验、取消及保存状态。
- `frontend/src/components/TrackActions.vue`：歌曲“…”菜单、修改/删除入口及键盘操作。
- `frontend/src/components/PlayerControls.vue` 与 `player.css`：中央播放按钮、时间和可拖动进度条及播放器布局。
- `frontend/src/components/PlaybackModeButton.vue`：三种模式图标、单击循环切换和模式提示。
- `frontend/src/composables/usePlaybackQueue.ts`：播放模式、随机候选与播放历史，不使用搜索结果作为队列。
- `frontend/src/components/StorageStatusPanel.vue` 与 `api/storage.ts`：容量显示、刷新和低空间状态。
- `backend/src/main/java/com/nightsignal/track/`：实体、仓储、接口、事务、磁盘存储、内容校验、错误响应。
- `backend/src/main/java/com/nightsignal/track/AudioProcessor.java`：内容识别、自动转码、超时及输出限制。
- `StorageCapacity.java`、`StorageController.java`、`UploadCapacityFilter.java`：磁盘容量读取、查询接口及上传前保护。
- `backend/src/main/resources/application.yml` 与 `db/migration/V1__create_tracks.sql`：环境配置、版本化建表。
- `backend/src/test/`：音频内容与存储测试、原创测试音。
- `scripts/`：启动、初始化与验收脚本。
- `.gitignore`：排除凭据、运行时、数据库文件、音频与构建产物。
- `CHANGELOG.md`：按版本记录更新、问题、原因、解决与验收。
- `plan.md`：后续开发顺序与暂缓问题。

Maven Wrapper 保留；Windows 脚本修复了普通目录下 `Target` 为空时的判断，并关闭了包装器下载目录的递归清理，保留其临时缓存以遵守项目的逐文件删除约束。
