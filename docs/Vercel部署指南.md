# Vercel 网站部署指南

本项目已经整理为 Vercel 可部署的静态网站。Vercel 只发布平台前端和轻量训练展示资源，不发布完整训练集、`runs/`、模型权重或训练包。

## 1. 本地检查

```bash
npm run check
npm run build
```

构建成功后会生成：

```text
dist-site/
```

Vercel 会把 `dist-site/` 作为网站输出目录。

也可以直接运行一键脚本：

```powershell
.\scripts\deploy_vercel.ps1
```

这个脚本会依次完成检查、构建、登录检测、项目绑定和生产部署。

## 2. 登录 Vercel

如果命令行没有登录：

```bash
npx vercel login
```

命令会打开浏览器授权。请使用 Edge 中已经登录的 Vercel 账号完成确认。

## 3. 首次绑定项目

```bash
npx vercel link
```

推荐项目名：

```text
elephant-thermal-risk-platform
```

如果 Vercel 询问是否链接现有项目，已有项目就选已有项目；没有就创建新项目。

## 4. 生产部署

```bash
npx vercel --prod
```

部署成功后，命令行会返回一个 `https://...vercel.app` 地址。打开后使用默认账号登录：

```text
admin / 123456
commander / 123456
patrol / 123456
```

## 5. 更新训练结果后重新部署

模型训练完成后，把新结果替换到：

```text
public/training-results/elephant/
```

然后重新执行：

```bash
npm run build
npx vercel --prod
```

## 6. 当前部署边界

- 网站部署：Vercel 静态托管。
- 数据存储：浏览器 `localStorage` 原型数据库。
- 训练：本机 GPU、实验室服务器或云端 GPU 环境。
- 模型权重：不上传 Vercel。
- 真实无人机/司空 2：需要后续用真实接口授权、媒体网关和边缘端服务接入。
