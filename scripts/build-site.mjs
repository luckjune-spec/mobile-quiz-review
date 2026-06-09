import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const workspaceRoot = path.resolve(projectRoot, "..");
const appRoot = path.join(projectRoot, "app");
const distRoot = path.join(projectRoot, "dist");
const quizRoot = path.join(distRoot, "quiz");

const imageSourceDirs = [
  "阿虎医考口腔组织病理学/assets",
  "阿虎医考口腔解剖生理学/assets",
  "阿虎医考口腔正畸学/assets",
  "阿虎口腔内科学/assets",
  "阿虎口腔修复学/assets",
  "阿虎口腔颌面外科学/assets",
  "补充题库/口腔修复补充/assets",
  "补充题库/口腔颌面外科补充/assets"
];

await fs.rm(distRoot, { recursive: true, force: true });
await copyDir(appRoot, quizRoot);

for (const dir of imageSourceDirs) {
  await copyDir(path.join(workspaceRoot, dir), path.join(distRoot, dir));
}

await fs.writeFile(
  path.join(distRoot, "index.html"),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=./quiz/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>副高刷题</title>
  </head>
  <body>
    <p>正在打开 <a href="./quiz/">副高刷题网页</a>…</p>
  </body>
</html>
`,
  "utf8"
);

await fs.writeFile(path.join(distRoot, ".nojekyll"), "", "utf8");

console.log(`Built site into ${path.relative(projectRoot, distRoot)}`);

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, destinationPath);
      continue;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }
}
