#!/usr/bin/env node
/* يدمج src/core.js داخل src/app.tpl.html ← www/index.html (ملفٌّ واحد يعمل
   موقعاً وتطبيقاً). شغّله بعد أيّ تعديل: node scripts/build-www.js */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const R=join(dirname(fileURLToPath(import.meta.url)),"..");
const W=join(R,"www"), S=join(R,"src");
mkdirSync(W,{recursive:true});
const core=readFileSync(join(S,"core.js"),"utf8");
const tpl=readFileSync(join(S,"app.tpl.html"),"utf8");
if(!tpl.includes("/*@@CORE@@*/"))throw new Error("العلامة مفقودة في القالب");
/* Client ID لتطبيق OAuth (تسجيل الدخول عبر GitHub) — من متغيّر البيئة
   GITHUB_CLIENT_ID، أو ملفّ client-id.txt. ليس سرّاً: يُضمَّن في التطبيق. */
let cid=(process.env.GITHUB_CLIENT_ID||"").trim();
try{ if(!cid)cid=readFileSync(join(R,"client-id.txt"),"utf8").trim() }catch(e){}
if(cid&&!/^[A-Za-z0-9._-]{8,64}$/.test(cid))throw new Error("GITHUB_CLIENT_ID غير صالح");
const out=tpl.replace("/*@@CORE@@*/",()=>core).replace("__GITHUB_CLIENT_ID__",cid||"__GITHUB_CLIENT_ID__");
writeFileSync(join(W,"index.html"),out);
if(!cid)console.log("ℹ بلا GITHUB_CLIENT_ID: زرّ «سجّل الدخول عبر GitHub» مخفي (التوكن يعمل)");
console.log("✓ www/index.html"+(cid?" + تسجيل الدخول عبر GitHub":""));
