# 一步一程 · 杨金帅 Marshal

一个以个人成长和徒步手记为主线的中文个人主页。作者侧栏、履历、手记归档和徒步统计使用原生 HTML、CSS、JavaScript 实现，无构建依赖。

## 网站与源码

- 网站：https://yangjinshuai.github.io/
- 静态网站源码包：`marshal-github-site.zip`，解压后的网站文件位于 `dist/`。
- 本仓库的 GitHub Actions 会在 `main` 分支有更新时解压源码包，并自动发布到 GitHub Pages。

本地预览：

```bash
unzip -q marshal-github-site.zip
python3 -m http.server 4173 --directory dist
```

然后打开 `http://localhost:4173`。请通过 HTTP 访问，直接双击 HTML 无法正确读取 JSON 数据。

## 内容与编辑

- `dist/content.json` 存放个人资料、履历和手记。当前内容包括杨金帅 / Marshal、2026.07 至今 SPS，以及 2026-10-18 苏州窑底桂花徒步记录。
- 里程、用时、爬升未知时使用 `null`；没有照片时为空数组。主题风景图不代表本人拍摄或到访。
- 网站内可通过“内容管理”编辑个人介绍，通过“写记录”新增徒步或成长随记。手记详情支持编辑、删除和照片放大。
- 每条徒步记录支持一张路线记录图和最多四张风景 / 自拍照片。单张不超过 15 MB，保存时压缩为最长边 1600 px 的 JPEG。
- 页面编辑保存在当前设备、当前网站域名的浏览器 IndexedDB 中，刷新后仍保留，但不会同步到其他设备或访客。没有账户系统、云数据库或照片云存储。
- “管理与备份”可导出 / 导入包含图片的 JSON。导入会替换当前浏览器内容。
- 要发布更新：先在网站导出 JSON，然后替换 `dist/content.json`；更新页面文件后，在仓库根目录重新打包 `dist/` 并提交：

```bash
zip -q -r marshal-github-site.zip dist
```

推送到 `main` 后，GitHub Actions 会重新部署。已经保存过本地编辑内容的浏览器需要导入新 JSON 才能同步更新。

## 灵感与图片

参考了 [Paco](https://github.com/pacocoursey/paco) 的个人表达和 [Tailwind Nextjs Starter Blog](https://github.com/timlrx/tailwind-nextjs-starter-blog) 的内容组织；本项目未复制这两个仓库的代码。

首页只展示真实手记，不添加示例记录或个人照片占位图。累计徒步次数和距离始终根据已录入的手记统计，未填写距离时显示“待记录”，不估算数据。
