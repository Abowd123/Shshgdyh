/* اختبارٌ بلا شبكة: ZIP مولَّد + GitHub وهميّ (مع أخطاء حدّ معدّل عشوائية).
   التشغيل: node tests/core.test.mjs */
import {readFileSync} from "node:fs";
import {deflateRawSync} from "node:zlib";
const code=readFileSync(new URL("../src/core.js",import.meta.url),"utf8");
const M=new Function(code+";return {fileSource,readZip,uploadZip,listRepos,deviceLogin};")();
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log("✗ "+m))};

/* كاتب ZIP صغير: deflate + stored + صلاحية تنفيذ + جذر مشترك */
function crc(b){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}
 let x=~0;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (~x)>>>0}
function zip(files){
 const parts=[],cd=[];let off=0;
 for(const f of files){
  const name=Buffer.from(f.name), raw=Buffer.from(f.data), comp=f.store?raw:deflateRawSync(raw), m=f.store?0:8;
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(m,8);
  h.writeUInt32LE(crc(raw),14);h.writeUInt32LE(comp.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
  parts.push(h,name,comp);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(m,10);
  c.writeUInt32LE(crc(raw),16);c.writeUInt32LE(comp.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);
  c.writeUInt32LE(((f.mode||0o100644)<<16)>>>0,38);c.writeUInt32LE(off,42);cd.push(c,name);
  off+=30+name.length+comp.length;
 }
 const cdb=Buffer.concat(cd),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);
 e.writeUInt32LE(cdb.length,12);e.writeUInt32LE(off,16);
 return Buffer.concat([...parts,cdb,e]);
}
const big="x".repeat(500000);
const files=[
 {name:"proj-main/README.md",data:"# مرحبا"},
 {name:"proj-main/gradlew",data:"#!/bin/sh\necho hi\n",mode:0o100755},
 {name:"proj-main/src/a/b/c/deep.js",data:"export const x=1;\n"},
 {name:"proj-main/img/logo.png",data:Buffer.from([137,80,78,71,0,1,2,3,255]),store:true},
 {name:"proj-main/__MACOSX/._junk",data:"junk"},
 {name:"proj-main/empty.txt",data:""},
 ...Array.from({length:30},(_,i)=>({name:`proj-main/big/f${i}.txt`,data:big}))
];
const buf=zip(files);
const src=M.fileSource(new File([buf],"proj-main.zip"));
const trees={t_old:{"keep.txt":{path:"keep.txt",content:"old"},"README.md":{path:"README.md",content:"old readme"}}},blobs={};let n=0;let EMPTY_INIT=0,LAST_PATCH=null,LAST_COMMIT=null;
const R=(j,s=200)=>({ok:true,status:s,json:async()=>j,headers:{get:()=>null}});
const F=async(url,o)=>{
 const p=url.replace("https://api.github.com",""),b=o.body?JSON.parse(o.body):null;
 if(o.method==="POST"&&p.endsWith("/blobs")&&Math.random()<.3)return {ok:false,status:403,json:async()=>({message:"secondary rate limit"}),headers:{get:()=>"0"}};
 if(p==="/user")return R({login:"me"});
 if(p==="/user/repos")return b.name==="taken"?{ok:false,status:422,json:async()=>({message:"exists"}),headers:{get:()=>null}}
  :R({full_name:"me/"+b.name,default_branch:"main",html_url:"https://github.com/me/"+b.name},201);
 if(p.startsWith("/user/repos?"))return R([{full_name:"me/a",private:true,default_branch:"main",html_url:"u",permissions:{push:true}},{full_name:"o/ro",private:false,default_branch:"main",html_url:"u",permissions:{push:false}}]);
 if(p==="/repos/me/old")return R({full_name:"me/old",default_branch:"dev",html_url:"https://github.com/me/old",permissions:{push:true}});
 if(p==="/repos/me/empty")return R({full_name:"me/empty",default_branch:"main",html_url:"https://github.com/me/empty",permissions:{push:true}});
 if(p==="/repos/me/empty/git/ref/heads/main"&&!EMPTY_INIT)return {ok:false,status:409,json:async()=>({message:"Git Repository is empty."}),headers:{get:()=>null}};
 if(p==="/repos/me/empty/contents/.zip2github"){EMPTY_INIT=1;return R({commit:{sha:"i"}},201)}
 if(p==="/repos/me/old/git/commits/old")return R({tree:{sha:"t_old"}});
 if(p==="/repos/me/old/git/ref/heads/dev")return R({object:{sha:"old"}});
 if(p.includes("/git/ref/heads/"))return R({object:{sha:"h"}});
 if(o.method==="PATCH"){LAST_PATCH={p,b};return R({})}
 if(p.endsWith("/git/blobs")){const s="b"+n++;blobs[s]=b.content;return R({sha:s},201)}
 if(p.endsWith("/git/trees")){const s="t"+n++,t={...(b.base_tree?trees[b.base_tree]:{})};for(const e of b.tree)t[e.path]=e;trees[s]=t;return R({sha:s},201)}
 if(p.endsWith("/git/commits")){trees.final=trees[b.tree];LAST_COMMIT=b;return R({sha:"c".repeat(40)},201)}
 if(o.method==="PATCH")return R({});
 throw new Error(p);
};
const r=await M.uploadZip({src,name:"x",priv:true,token:"t",fetch:F,fastRetry:true});
const T=trees.final, P=Object.keys(T);
ok(P.length===35,"35 ملفاً (بلا __MACOSX) — جاء "+P.length);
ok(!P.some(p=>p.startsWith("proj-main/")),"الجذر المشترك أزيل");
ok(T["gradlew"].mode==="100755","gradlew قابل للتنفيذ");
ok(T["src/a/b/c/deep.js"].content==="export const x=1;\n","المجلدات المتداخلة والمحتوى");
ok(T["README.md"].content==="# مرحبا","UTF-8 عربي");
ok(T["empty.txt"]&&T["empty.txt"].content==="","الملف الفارغ");
ok(Buffer.from(blobs[T["img/logo.png"].sha],"base64").equals(Buffer.from([137,80,78,71,0,1,2,3,255])),"الثنائي سليم رغم أخطاء الحدّ");
ok(T["big/f29.txt"].content.length===500000,"الملفات الكبيرة");
ok(Object.keys(trees).filter(k=>k!=="final").length>=2,"الشجرة على دفعات");
ok(r.url==="https://github.com/me/x","رابط المستودع");
try{await M.uploadZip({src,name:"taken",priv:true,token:"t",fetch:F,fastRetry:true});ok(false,"422")}
catch(e){ok(/يوجد مستودع/.test(e.message),"اسم مستخدم → رسالة واضحة")}
const ac=new AbortController(); ac.abort();
try{await M.uploadZip({src,name:"y",priv:true,token:"t",fetch:F,fastRetry:true,signal:ac.signal});ok(false,"abort")}
catch(e){ok(/أُلغي/.test(e.message),"الإلغاء")}
 /* مستودع موجود: دمج */
const m1=await M.uploadZip({src,mode:"existing",repo:"https://github.com/me/old.git",replace:false,message:"تحديث",token:"t",fetch:F,fastRetry:true});
ok(trees.final["keep.txt"]&&trees.final["keep.txt"].content==="old","الدمج يُبقي القديم");
ok(trees.final["README.md"].content==="# مرحبا","الدمج يحدّث الموجود");
ok(LAST_COMMIT.parents[0]==="old"&&LAST_COMMIT.message==="تحديث","الأب ورسالة الالتزام");
ok(LAST_PATCH.p.endsWith("/heads/dev")&&LAST_PATCH.b.force===false,"fast-forward على الفرع الافتراضي");
ok(m1.full==="me/old","الرابط بصيغة URL مقبول");
 /* استبدال */
await M.uploadZip({src,mode:"existing",repo:"me/old",replace:true,token:"t",fetch:F,fastRetry:true});
ok(!trees.final["keep.txt"]&&Object.keys(trees.final).length===35,"الاستبدال يطابق الـ ZIP");
 /* مستودع فارغ */
await M.uploadZip({src,mode:"existing",repo:"me/empty",replace:false,token:"t",fetch:F,fastRetry:true});
ok(EMPTY_INIT===1&&LAST_COMMIT.parents[0]==="i"&&!trees.final[".zip2github"],"المستودع الفارغ");
try{await M.uploadZip({src,mode:"existing",repo:"bad",token:"t",fetch:F,fastRetry:true});ok(false,"bad")}catch(e){ok(/owner\/name/.test(e.message),"صيغة خاطئة")}
const L=await M.listRepos({token:"t",fetch:F});
ok(L.length===1&&L[0].full==="me/a","قائمة المستودعات: القابلة للكتابة فقط");
 /* صلاحية workflow: ZIP فيه .github/workflows */
{const wz=M.fileSource(new File([zip([{name:"p/.github/workflows/a.yml",data:"name: x\n"},{name:"p/a.txt",data:"a"}])],"w.zip"));
 const mk=(scopes,treeFail)=>async(url,o)=>{
  const p=url.replace("https://api.github.com","");
  if(p==="/user")return {ok:true,status:200,json:async()=>({login:"me"}),headers:{get:h=>h==="x-oauth-scopes"?scopes:null}};
  if(treeFail&&p.endsWith("/git/trees"))return {ok:false,status:404,json:async()=>({message:"Not Found"}),headers:{get:()=>null}};
  return F(url,o);
 };
 let created=0; const Fc=mk("repo",false), Fw=async(u,o)=>{if(u.endsWith("/user/repos"))created++;return Fc(u,o)};
 try{await M.uploadZip({src:wz,name:"w",priv:true,token:"t",fetch:Fw,fastRetry:true});ok(false,"noscope")}
 catch(e){ok(/workflow/.test(e.message)&&created===0,"بلا workflow: رسالة واضحة قبل إنشاء المستودع")}
 const g=await M.uploadZip({src:wz,name:"w",priv:true,token:"t",fetch:mk("repo, workflow",false),fastRetry:true});
 ok(g.files===2,"مع workflow يمرّ");
 const g2=await M.uploadZip({src:wz,name:"w",priv:true,token:"t",fetch:mk(null,false),fastRetry:true});
 ok(g2.files===2,"توكن دقيق (بلا ترويسة) يمرّ");
 try{await M.uploadZip({src:wz,name:"w",priv:true,token:"t",fetch:mk(null,true),fastRetry:true});ok(false,"404")}
 catch(e){ok(/workflow/.test(e.message),"404 على الشجرة → رسالة workflow")}
 /* ZIP عاديّ + 404 لا يُنسَب خطأً إلى workflow */
 try{await M.uploadZip({src,name:"w2",priv:true,token:"t",fetch:async(u,o)=>u.endsWith("/git/trees")?{ok:false,status:404,json:async()=>({message:"Not Found"}),headers:{get:()=>null}}:F(u,o),fastRetry:true});ok(false,"plain404")}
 catch(e){ok(!/workflow/.test(e.message),"404 بلا workflow في الـ ZIP يبقى كما هو")}
}
/* Device Flow */
{let polls=0, shown=null;
 const post=async(u,b)=>{
  if(u.endsWith("/device/code")){global.__sc=b.scope}
  if(u.endsWith("/device/code"))return {device_code:"dc",user_code:"ABCD-1234",verification_uri:"https://github.com/login/device",interval:5,expires_in:900};
  polls++; if(polls===1)return {error:"authorization_pending"}; if(polls===2)return {error:"slow_down",interval:10};
  if(polls===3)throw new Error("net"); return {access_token:"gho_x"};
 };
 const tok=await M.deviceLogin({clientId:"cid",post,onCode:d=>shown=d.user_code,wait:async()=>{}});
 ok(global.__sc==="repo workflow","Device Flow يطلب repo + workflow");
 ok(tok==="gho_x"&&shown==="ABCD-1234","Device Flow: كود ثم توكن رغم pending/slow_down/انقطاع");
 try{await M.deviceLogin({clientId:"cid",post:async u=>u.endsWith("/device/code")?{device_code:"d",interval:1}:{error:"access_denied"},wait:async()=>{}});ok(false,"deny")}
 catch(e){ok(/رفضت/.test(e.message),"Device Flow: الرفض")}
 try{await M.deviceLogin({clientId:"",post});ok(false,"noid")}catch(e){ok(/Client ID/.test(e.message),"Device Flow: بلا Client ID")}
}
console.log(fail?`✗ ${pass}/${pass+fail}`:`✓ ${pass}/${pass} نجحت`); if(fail)process.exit(1);
