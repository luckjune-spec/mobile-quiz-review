# 副高口腔手机刷题网页

这个网页适合手机复习，支持：

- 按题库随机刷题
- 自动收集错题
- 只练错题
- 导出错题 Markdown，方便继续问错误原因和相关知识点
- 导出当前筛选题库
- 一次缓存后离线使用
- 支持题干里的本地图片

## 打开方式

最省事的方法：

1. 双击 [启动刷题.command](/Users/luckjune/Documents/知识库副高/手机刷题网页/启动刷题.command)
2. 电脑浏览器会自动打开网页
3. 会弹出一个小提示框，直接显示电脑地址和手机地址
4. 如果检测到手机地址，还会自动帮你复制好
5. 现在固定入口是 `http://localhost:4173/quiz/`

更建议用启动文件，不建议直接双击 `index.html`，因为离线缓存和图片路径都依赖浏览器通过本地网页地址访问。

## 离线使用

1. 第一次联网打开网页
2. 点击页面顶部的“缓存离线题库”
3. 等待页面提示“离线题库已经缓存完成”
4. 后面手机离线、不同网络，甚至没网，也能继续刷题

如果你用 iPhone：

1. 用 Safari 打开网页
2. 点分享
3. 选择“添加到主屏幕”

这样以后就能像普通 App 一样打开。

## GitHub 部署

如果你要让手机真正离线缓存，建议走 GitHub Pages 的 `https` 地址。

这套文件已经帮你准备好了：

- 自动部署工作流：[deploy-pages.yml](/Users/luckjune/Documents/知识库副高/手机刷题网页/.github/workflows/deploy-pages.yml)
- 发布包生成脚本：[build-site.mjs](/Users/luckjune/Documents/知识库副高/手机刷题网页/scripts/build-site.mjs)

推荐步骤：

1. 在 GitHub 新建一个仓库
2. 把 [手机刷题网页](/Users/luckjune/Documents/知识库副高/手机刷题网页) 这个目录里的内容上传到仓库根目录
3. 到 GitHub 仓库的 `Settings -> Pages`
4. 把 `Source` 设为 `GitHub Actions`
5. 提交一次代码到 `main`
6. 等待 Actions 跑完
7. 打开生成出来的 `https://...github.io/.../quiz/`

本地也可以先生成一次发布包：

```bash
cd "/Users/luckjune/Documents/知识库副高/手机刷题网页"
npm run build
```

生成结果在 [dist](/Users/luckjune/Documents/知识库副高/手机刷题网页/dist)。

注意：

- 手机上的离线缓存要用 `https` 地址打开
- 局域网 `http://192.168...` 地址通常不能启用离线缓存
- GitHub Pages 部署后，手机上建议用 Safari 打开，再点“添加到主屏幕”

## 题库直达

网页会把当前题目写进地址栏参数里，所以你之后回看某一道题会更方便。

## 导出说明

导出的错题文件里会包含：

- 题库来源
- 题号
- 你的答案
- 正确答案
- 题目和选项
- 官方解析
- 图片资源路径

你把导出的 Markdown 发给我，或者直接贴其中某一道题，我就可以继续帮你分析错误原因和相关知识点。
