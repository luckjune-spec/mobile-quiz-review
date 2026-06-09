import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "..");
const appDir = path.join(process.cwd(), "app");
const outputFile = path.join(appDir, "data.js");
const offlineManifestFile = path.join(appDir, "offline-manifest.js");
const appToWorkspacePrefix = "../..";

const sources = [
  "阿虎医考口腔组织病理学",
  "阿虎医考口腔解剖生理学",
  "阿虎医考口腔正畸学",
  "阿虎口腔内科学",
  "阿虎口腔修复学",
  "阿虎口腔颌面外科学",
  "阿虎医考题库汇总",
  "补充题库/口腔修复补充",
  "补充题库/口腔颌面外科补充"
];

const questions = [];
const offlineAssets = new Set([
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./sw.js",
  "./offline-manifest.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-512.png"
]);

for (const source of sources) {
  const absoluteDir = path.join(workspaceRoot, source);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));

  for (const fileName of files) {
    const absoluteFile = path.join(absoluteDir, fileName);
    const raw = await fs.readFile(absoluteFile, "utf8");
    const relativeFile = toPosix(path.relative(workspaceRoot, absoluteFile));
    const relativeDir = toPosix(path.relative(workspaceRoot, absoluteDir));
    const parsed = parseMarkdownQuestion({
      raw,
      subject: source,
      relativeFile,
      relativeDir
    });
    questions.push(...parsed);
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  total: questions.length,
  subjects: sources,
  questions
};

await fs.writeFile(
  outputFile,
  `window.QUIZ_DATA = ${JSON.stringify(payload)};\n`,
  "utf8"
);

const offlineManifest = {
  version: payload.generatedAt,
  fileCount: offlineAssets.size,
  files: [...offlineAssets].sort()
};

await fs.writeFile(
  offlineManifestFile,
  `self.__OFFLINE_MANIFEST__ = ${JSON.stringify(offlineManifest)};\n`,
  "utf8"
);

console.log(`Built ${questions.length} questions into ${path.relative(process.cwd(), outputFile)}`);

function parseMarkdownQuestion({ raw, subject, relativeFile, relativeDir }) {
  if (raw.includes("**题干**")) {
    return parseSimpleQuestion({ raw, subject, relativeFile, relativeDir });
  }
  return parseStructuredQuestion({ raw, subject, relativeFile, relativeDir });
}

function parseSimpleQuestion({ raw, subject, relativeFile, relativeDir }) {
  const number = firstMatch(raw, /\*\*页码\*\*\s+(\d+)\//) || firstMatch(raw, /# .*?(\d+)/);
  const prompt = between(raw, "**题干**", "**选项**").trim();
  const optionsText = between(raw, "**选项**", "**正确答案**").trim();
  const answer = (between(raw, "**正确答案**", "**官方解析**").trim().match(/[A-E]+/) || [""])[0];
  const explanation = after(raw, "**官方解析**").trim();
  const options = parseOptions(optionsText);
  const typeName = firstMatch(prompt, /^\[([^\]]+)\]/m) || "";
  const content = prompt.replace(/^\[[^\]]+\]/, "").trim();

  return [
    buildQuestion({
      id: `${subject}::${number || path.basename(relativeFile, ".md")}`,
      subject,
      questionNo: number || path.basename(relativeFile, ".md"),
      groupId: "",
      typeName,
      stem: "",
      prompt: content,
      options,
      answer,
      explanation,
      relativeFile,
      relativeDir,
      subIndex: null
    })
  ];
}

function parseStructuredQuestion({ raw, subject, relativeFile, relativeDir }) {
  const questionNo = firstMatch(raw, /题号：`?([^`\n]+)`?/) || path.basename(relativeFile, ".md");
  const typeName = firstMatch(raw, /题型：`?([^`\n]+)`?/) || "";
  const groupId = firstMatch(raw, /组ID：`?([^`\n]+)`?/) || "";
  const stem = sectionBetween(raw, "## 共用题干", "## 题目内容");
  const content = sectionBetween(raw, "## 题目内容", "## 官方解析");
  const explanation = after(raw, "## 官方解析").trim();
  const blocks = splitStructuredContent(content);

  if (blocks.length === 0) {
    return [];
  }

  if (blocks.length === 1) {
    const parsed = parseQuestionBlock(blocks[0]);
    return [
      buildQuestion({
        id: `${subject}::${questionNo}`,
        subject,
        questionNo,
        groupId,
        typeName,
        stem,
        prompt: parsed.prompt,
        options: parsed.options,
        answer: parsed.answer,
        explanation,
        relativeFile,
        relativeDir,
        subIndex: null
      })
    ];
  }

  return blocks
    .map((block, index) => {
      const parsed = parseQuestionBlock(block);
      return buildQuestion({
        id: `${subject}::${questionNo}::${index + 1}`,
        subject,
        questionNo,
        groupId,
        typeName,
        stem,
        prompt: parsed.prompt,
        options: parsed.options,
        answer: parsed.answer,
        explanation,
        relativeFile,
        relativeDir,
        subIndex: index + 1
      });
    })
    .filter(Boolean);
}

function buildQuestion({
  id,
  subject,
  questionNo,
  groupId,
  typeName,
  stem,
  prompt,
  options,
  answer,
  explanation,
  relativeFile,
  relativeDir,
  subIndex
}) {
  const imageRefs = collectImageRefs(stem + "\n" + prompt + "\n" + options.map((item) => item.text).join("\n"), relativeDir);
  imageRefs.forEach((item) => offlineAssets.add(item));

  return {
    id,
    subject,
    questionNo: String(questionNo),
    groupId,
    typeName,
    subIndex,
    stem: renderRichText(stem, relativeDir),
    prompt: renderRichText(prompt, relativeDir),
    options: options.map((option) => ({
      key: option.key,
      text: renderRichText(option.text, relativeDir)
    })),
    answer: answer.trim(),
    explanation: renderRichText(explanation, relativeDir),
    sourceFile: relativeFile,
    imageRefs
  };
}

function splitStructuredContent(content) {
  const normalized = content.trim();
  if (!normalized) {
    return [];
  }

  const matches = [...normalized.matchAll(/(?:^|\n)（(\d+)）/g)];
  if (matches.length === 0) {
    return [normalized];
  }

  return matches.map((match, index) => {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    return normalized.slice(start, end).trim();
  });
}

function parseQuestionBlock(block) {
  const answerMatches = [...block.matchAll(/正确答案[:：]\s*([A-E]+)/g)];
  const answer = answerMatches.length > 0 ? answerMatches[answerMatches.length - 1][1] : "";
  const body = block.replace(/正确答案[:：]\s*[A-E]+\s*/g, "").trim();
  const optionMatches = [...body.matchAll(/(?:^|\n)([A-E])[.．]\s*([\s\S]*?)(?=(?:\n[A-E][.．]\s)|$)/g)];

  if (optionMatches.length === 0) {
    return { prompt: body, options: [], answer };
  }

  const firstOptionIndex = optionMatches[0].index;
  const prompt = body.slice(0, firstOptionIndex).replace(/^（\d+）/, "").trim();
  const options = optionMatches.map((match) => ({
    key: match[1],
    text: match[2].trim()
  }));

  return { prompt, options, answer };
}

function parseOptions(text) {
  return [...text.matchAll(/(?:^|\n)([A-E])\s+([\s\S]*?)(?=(?:\n[A-E]\s)|$)/g)].map((match) => ({
    key: match[1],
    text: match[2].trim()
  }));
}

function renderRichText(text, relativeDir) {
  const normalized = (text || "").trim();
  if (!normalized) {
    return "";
  }

  const withImages = normalized.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g, (_match, before, src, after) => {
    const joined = encodeURI(`${appToWorkspacePrefix}/${toPosix(path.join(relativeDir, src))}`);
    return `<img ${before}src="${joined}"${after}>`;
  });

  return withImages
    .split("\n")
    .map((line) => line.trimEnd())
    .join("<br>");
}

function collectImageRefs(text, relativeDir) {
  return [...text.matchAll(/<img\s+[^>]*src="([^"]+)"/g)].map((match) => encodeURI(`${appToWorkspacePrefix}/${toPosix(path.join(relativeDir, match[1]))}`));
}

function sectionBetween(text, startMarker, endMarker) {
  if (!text.includes(startMarker)) {
    return "";
  }
  return between(text, startMarker, endMarker).trim();
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    return "";
  }
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  return (end === -1 ? text.slice(from) : text.slice(from, end)).trim();
}

function after(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) {
    return "";
  }
  return text.slice(start + marker.length);
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : "";
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
