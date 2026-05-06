#!/usr/bin/env node
const fs   = require("fs");
const path = require("path");
const https = require("https");

const TOKEN  = process.env.GH_TOKEN || "";
const OWNER  = "sshjddhhd-svg";
const REPO   = "suny";
const BRANCH = "main";

const ROOT = path.join(__dirname, "..");

const IGNORE = new Set([
  "node_modules", ".git", "data", ".env", ".DS_Store", ".local",
  "Fca_Database", "backups"
]);

function shouldIgnore(relPath) {
  const parts = relPath.split("/");
  for (const part of parts) {
    if (IGNORE.has(part)) return true;
    if (part.endsWith(".log")) return true;
  }
  return false;
}

function getAllFiles(dir, base = "") {
  const results = [];
  let items;
  try { items = fs.readdirSync(dir); } catch { return results; }
  for (const item of items) {
    const rel  = base ? `${base}/${item}` : item;
    const full = path.join(dir, item);
    if (shouldIgnore(rel)) continue;
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) results.push(...getAllFiles(full, rel));
      else results.push(rel);
    } catch {}
  }
  return results;
}

function ghRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.github.com",
      path:     `/repos/${OWNER}/${REPO}${endpoint}`,
      method,
      headers: {
        "Authorization":        `Bearer ${TOKEN}`,
        "Accept":               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent":           "jarfis-bot-push",
        "Content-Type":         "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getFileSha(filePath) {
  const res = await ghRequest("GET", `/contents/${filePath}?ref=${BRANCH}`);
  if (res.status === 200 && res.data.sha) return res.data.sha;
  return null;
}

async function upsertFile(filePath, content, sha) {
  const body = {
    message: `update: ${filePath}`,
    content: Buffer.from(content).toString("base64"),
    branch:  BRANCH,
  };
  if (sha) body.sha = sha;
  return ghRequest("PUT", `/contents/${filePath}`, body);
}

async function deleteFile(filePath, sha) {
  const body = { message: `remove: ${filePath}`, sha, branch: BRANCH };
  return ghRequest("DELETE", `/contents/${filePath}`, body);
}

async function getRepoTree() {
  const res = await ghRequest("GET", `/git/trees/${BRANCH}?recursive=1`);
  if (res.status !== 200) return [];
  return (res.data.tree || []).filter(f => f.type === "blob").map(f => f.path);
}

async function main() {
  console.log(`\n🚀 Pushing to github.com/${OWNER}/${REPO} (${BRANCH})\n`);

  const localFiles = getAllFiles(ROOT);
  const remoteFiles = await getRepoTree();

  console.log(`📁 Local: ${localFiles.length} files | Remote: ${remoteFiles.length} files\n`);

  // الملفات التي يجب حذفها من GitHub (موجودة هناك لكن محذوفة محلياً)
  const localSet = new Set(localFiles);
  const toDelete = remoteFiles.filter(f => {
    if (f.startsWith("node_modules/") || f.startsWith(".git/") || f.startsWith(".local/")) return false;
    // احذف أوامر قديمة غير موجودة محلياً
    if (f.startsWith("src/commands/") && !localSet.has(f)) return true;
    return false;
  });

  // حذف الملفات القديمة
  for (const file of toDelete) {
    try {
      const sha = await getFileSha(file);
      if (sha) {
        const res = await deleteFile(file, sha);
        if (res.status === 200) console.log(`  🗑️  deleted: ${file}`);
        else console.error(`  ✘ delete failed: ${file} — ${res.status}`);
      }
    } catch (e) { console.error(`  ✘ ${file} — ${e.message}`); }
    await new Promise(r => setTimeout(r, 100));
  }

  // رفع/تحديث الملفات المحلية
  let success = 0, failed = 0;
  for (const file of localFiles) {
    try {
      const content = fs.readFileSync(path.join(ROOT, file));
      const sha     = await getFileSha(file);
      const res     = await upsertFile(file, content, sha);
      if (res.status === 200 || res.status === 201) {
        console.log(`  ✔ ${file}`);
        success++;
      } else {
        console.error(`  ✘ ${file} — ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
        failed++;
      }
    } catch (e) { console.error(`  ✘ ${file} — ${e.message}`); failed++; }
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\n${failed === 0 ? "🎉" : "⚠️"} Done: ${success} pushed, ${failed} failed`);
  if (failed === 0) console.log(`✅ https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
