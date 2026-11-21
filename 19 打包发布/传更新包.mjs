// 只负责一件事：把安装包、blockmap 与 latest.yml 传到 GitHub Release，让自动更新能读到。
// 用法：node "19 打包发布/传更新包.mjs" v0.1.4
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const 根 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const 目录 = path.join(根, "99 构建产物", "发布")
const 标签 = process.argv[2]
if (!标签) {
  console.error("用法：node \"19 打包发布/传更新包.mjs\" v0.1.4")
  process.exit(2)
}

const 凭据 = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
const 字段 = Object.fromEntries(凭据.split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)] }))
const 头 = { Authorization: "Bearer " + 字段.password, Accept: "application/vnd.github+json", "User-Agent": "snowwind" }
const 仓 = "snowwind621/snowwind-novel-agent"

const 发布们 = await (await fetch("https://api.github.com/repos/" + 仓 + "/releases?per_page=20", { headers: 头 })).json()
const 版 = Array.isArray(发布们) ? 发布们.find((r) => r.tag_name === 标签) : null
if (!版) {
  console.error("没找到发布 " + 标签 + "，先在 GitHub 上建 Release")
  process.exit(1)
}

const 文件们 = fs.readdirSync(目录).filter((f) => f.endsWith(".exe") || f.endsWith(".blockmap") || f === "latest.yml")
if (文件们.length === 0) {
  console.error("99 构建产物/发布 里没有可传的文件，先 npm run 打包")
  process.exit(1)
}

for (const 名 of 文件们) {
  const 体 = fs.readFileSync(path.join(目录, 名))
  // 资源上传走 uploads.github.com，不是 api.github.com
  const r = await fetch("https://uploads.github.com/repos/" + 仓 + "/releases/" + 版.id + "/assets?name=" + encodeURIComponent(名), {
    method: "POST",
    headers: { ...头, "Content-Type": 名.endsWith(".yml") ? "text/yaml" : "application/octet-stream" },
    body: 体,
  })
  const j = await r.json()
  console.log(名 + " → " + r.status + " " + (j.state ?? j.message ?? ""))
}
console.log("完成：自动更新会在下次启动 8 秒后检查 " + 标签)