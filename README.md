# 奈斯留学 GEO 测试站

这是一个零依赖静态站，适合部署到 GitHub Pages、Cloudflare Pages 或 Netlify。

## 当前测试地址

GitHub Pages:

- https://hanpei0918.github.io/nice-study-geo-demo/

上线前仍需由机构确认：地址、电话、品牌主体、服务范围、团队资料、社媒链接、二维码与联系方式。不要在页面中填写未经确认的电话、资质、合作院校、录取结果或学生评价。

## 为何这个页面更适合被联网搜索/AI读取

- 主要正文直接写在 HTML 中，没有依赖客户端渲染
- 使用清晰的 H1/H2/FAQ 语义结构
- 包含 `LocalBusiness`、`EducationalOrganization`、`WebPage` 和 `FAQPage` 的 JSON-LD
- 提供 `robots.txt` 与 `sitemap.xml`
- 用自然语言回答“东莞留学机构怎么选”“奈斯留学提供什么服务”等检索型问题
- 不使用隐藏文字、关键词堆砌、虚假评分或保证录取等高风险写法

## 部署到 GitHub Pages

1. 新建或使用 GitHub 仓库，例如 `nice-study-geo-demo`。
2. 上传这三个文件到仓库根目录。
3. GitHub 仓库 → Settings → Pages → Source 选择 `Deploy from a branch`。
4. 选择 `main` 分支和 `/ (root)`，保存。
5. 等待 GitHub Pages 生成访问地址。
6. 正式使用时：在 Pages 的 Custom domain 填入你的独立域名，并在域名服务商添加 GitHub 提供的 DNS 记录。
7. 如果后续绑定独立域名，需要同步更新 `index.html`、`robots.txt` 和 `sitemap.xml` 中的 canonical、Open Graph URL、JSON-LD URL 和 sitemap 地址。

## 建议的验证顺序

1. 用手机和电脑打开页面，检查文字、FAQ、地址是否正确。
2. 在 Bing Webmaster Tools 和 Google Search Console 验证站点、提交 sitemap。
3. 在网页标题或正文加入一个独有且真实的品牌短语，便于后续验证搜索引擎发现。
4. 先测试品牌词：`东莞奈斯留学`、`一步奈斯留学服务`。
5. 再测试场景词：`东莞留学机构怎么选`、`东莞国际教育规划`。

## 不应承诺的事项

页面发布和收录只能提升被发现、被理解和被引用的可能性，不能保证任何模型在任何提问下推荐或固定排名。
