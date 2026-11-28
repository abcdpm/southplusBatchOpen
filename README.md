# southplusBatchOpen

南+ South Plus 的油猴（Tampermonkey）脚本。

- `southplus-batch-open.user.js`：板块列表页 / 搜索结果页批量打开帖子、记录已读帖子。

## 功能

在板块列表页（例如 `https://south-plus.net/thread.php?fid-4.html`，即「免空资源区」-「实用动画」）或搜索结果页（`https://south-plus.net/search.php`）中：

- 每个帖子名左侧自动添加一个复选框，可逐个勾选。
- 页面**左下角**提供两个按钮：
  - **批量选择未选页面**：勾选当前页所有未勾选的未读帖子。
  - **取消选择**：取消所有已勾选。
- 页面**右下角**提供：
  - **打开已选页面**：逐个在新标签页打开所有已勾选帖子，并记录为已读。
- 使用 `localStorage` 保存所有已打开（已读）的帖子（`read.php?tid-XXXX.html`）。
- **已读帖子**：整行背景置灰、复选框变灰且默认不勾选（不可选中）。

## 安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开扩展面板 → 「添加新脚本」，将 `southplus-batch-open.user.js` 的内容复制进去并保存。
   或直接将 `.user.js` 文件拖入浏览器（Tampermonkey 会提示安装）。
3. 打开 `https://south-plus.net/thread.php?fid-4.html` 即可看到效果。

## 匹配范围

脚本支持主域名及常见镜像域名（`south-plus.net`、`www.south-plus.net` 以及其它 `*.plus.net` 镜像）：

| 页面 | 作用 |
| --- | --- |
| `http(s)://south-plus.net/thread.php*` | 板块列表页，注入复选框与工具栏 |
| `http(s)://www.south-plus.net/thread.php*` | 同上（www 域名） |
| `http(s)://south-plus.net/search.php*` | 搜索结果页，注入复选框与工具栏 |
| `http(s)://www.south-plus.net/search.php*` | 同上（www 域名） |
| `http(s)://south-plus.net/read.php*` | 帖子详情页，打开即记录为已读 |
| `http(s)://www.south-plus.net/read.php*` | 同上（www 域名） |
| `*://*/thread.php*`（@include） | 任意镜像域名的板块列表页 |
| `*://*/search.php*`（@include） | 任意镜像域名的搜索结果页 |
| `*://*/read.php*`（@include） | 任意镜像域名的帖子详情页 |

> 脚本运行时会先通过页面标题（含「South Plus / 南+」）或 `<base#headbase>` 判断是否确为南+论坛，避免误在其他站点生效。

## 已读数据存储

- 存储位置：`localStorage`，键名 `southplus_read_threads`。
- 值为帖子 tid 的 JSON 数组，例如 `["3018038","3018085"]`。
- 清空已读记录：在浏览器控制台执行
  `localStorage.removeItem('southplus_read_threads');` 后刷新页面。

## 说明

- 「打开已选页面」优先使用 `GM_openInTab` 在后台打开标签页；若不可用则回退 `window.open`。
- 为避免浏览器拦截批量弹窗，打开标签页之间有约 350ms 间隔。

## 测试

回归测试使用 Node 内置测试运行器 + jsdom，覆盖：

- `thread.php` 列表页注入复选框与工具栏（并回归验证不会被误判为 read 页）；
- `search.php` 搜索结果页同样注入；
- 带 `-fpage-` 的链接能正确提取 tid；
- 已读帖子置灰、复选框禁用且默认不勾选；
- `read.php` 页面打开即记录已读；
- 批量选择 / 取消选择 / 打开已选 按钮行为。

运行：

```bash
npm install
npm test
```

