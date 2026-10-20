/*@@CORE-BEGIN*/
/* ═══ مصادرُ القراءة ═══ كلُّها {size, name, read(off,len)→Uint8Array}
   فلا يُحمَّل الـ ZIP كاملاً في الذاكرة أبداً: يُقرأ الدليلُ المركزيّ من
   النهاية ثم كلُّ ملفٍّ وحده. */
function fileSource(f){
 return {size:f.size,name:f.name,
  async read(off,len){return new Uint8Array(await f.slice(off,off+len).arrayBuffer())}};
}
async function nativeSource(info,bridge,url){
 /* ملفٌّ وصل من قائمة المشاركة: نجرّب Range عبر الخادم المحلّي، وإلّا الجسر */
 const size=info.size, name=info.name||"shared.zip";
 if(url){
  try{
   const r=await fetch(url,{headers:{Range:"bytes=0-0"}});
   if(r.status===206){ await r.arrayBuffer();
    return {size,name,async read(off,len){
     const q=await fetch(url,{headers:{Range:`bytes=${off}-${off+len-1}`}});
     if(q.status!==206)throw new Error("قراءة جزئية فشلت");
     return new Uint8Array(await q.arrayBuffer());
    }};
   }
  }catch(e){}
 }
 return {size,name,async read(off,len){
  const r=await bridge.read({path:info.path,offset:off,length:len});
  const s=atob(r.data||""), u=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);
  return u;
 }};
}

/* ═══ قارئ ZIP بلا مكتبات (ZIP64 مدعوم) ═══ */
async function readZip(src){
 const tailLen=Math.min(src.size,65557+22);
 const tailOff=src.size-tailLen;
 const tail=await src.read(tailOff,tailLen);
 const tv=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
 let e=-1;
 for(let i=tail.length-22;i>=0;i--)if(tv.getUint32(i,true)===0x06054b50){e=i;break}
 if(e<0)throw new Error("الملف ليس ZIP صالحاً");
 let count=tv.getUint16(e+10,true), cdSize=tv.getUint32(e+12,true), cdOff=tv.getUint32(e+16,true);
 if(cdOff===0xFFFFFFFF||count===0xFFFF||cdSize===0xFFFFFFFF){
  const l=e-20;
  if(l<0||tv.getUint32(l,true)!==0x07064b50)throw new Error("ZIP64 تالف");
  const zOff=Number(tv.getBigUint64(l+8,true));
  const z=await src.read(zOff,56), zv=new DataView(z.buffer,z.byteOffset,z.byteLength);
  if(zv.getUint32(0,true)!==0x06064b50)throw new Error("ZIP64 تالف");
  count=Number(zv.getBigUint64(32,true)); cdSize=Number(zv.getBigUint64(40,true)); cdOff=Number(zv.getBigUint64(48,true));
 }
 const cd=await src.read(cdOff,cdSize), dv=new DataView(cd.buffer,cd.byteOffset,cd.byteLength);
 const utf=new TextDecoder("utf-8"), out=[]; let p=0;
 for(let n=0;n<count;n++){
  if(dv.getUint32(p,true)!==0x02014b50)throw new Error("الدليل المركزي تالف");
  const flags=dv.getUint16(p+8,true), method=dv.getUint16(p+10,true);
  let csize=dv.getUint32(p+20,true), usize=dv.getUint32(p+24,true);
  const nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true);
  const ext=dv.getUint32(p+38,true); let lho=dv.getUint32(p+42,true);
  const name=utf.decode(cd.subarray(p+46,p+46+nl));
  let x=p+46+nl; const xe=x+xl;
  while(x+4<=xe){
   const id=dv.getUint16(x,true), sz=dv.getUint16(x+2,true);
   if(id===1){let q=x+4;
    if(usize===0xFFFFFFFF){usize=Number(dv.getBigUint64(q,true));q+=8}
    if(csize===0xFFFFFFFF){csize=Number(dv.getBigUint64(q,true));q+=8}
    if(lho===0xFFFFFFFF)lho=Number(dv.getBigUint64(q,true));
   }
   x+=4+sz;
  }
  p=xe+cl;
  const unix=(ext>>>16)&0xFFFF, type=unix&0xF000;
  if(name.endsWith("/")||type===0x4000)continue;
  if(flags&1)throw new Error("الملف مشفّر بكلمة مرور: "+name);
  out.push({name,method,csize,usize,lho,exec:!!(unix&0o111)&&type!==0xA000,link:type===0xA000});
 }
 return {entries:out,
  async data(en){
   const h=await src.read(en.lho,30), hv=new DataView(h.buffer,h.byteOffset,h.byteLength);
   if(hv.getUint32(0,true)!==0x04034b50)throw new Error("ترويسة تالفة: "+en.name);
   const s=en.lho+30+hv.getUint16(26,true)+hv.getUint16(28,true);
   const raw=await src.read(s,en.csize);
   if(en.method===0)return raw;
   if(en.method!==8)throw new Error("ضغطٌ غير مدعوم ("+en.method+"): "+en.name);
   const ds=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
   return new Uint8Array(await new Response(ds).arrayBuffer());
  }};
}
const SKIP=/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\.git\//;
function stripRoot(names){
 if(!names.length)return "";
 const f=names[0].split("/")[0];
 return names.every(n=>n.includes("/")&&n.split("/")[0]===f)?f+"/":"";
}
function asText(b){
 if(b.length>1024*1024)return null;
 for(let i=0,n=Math.min(b.length,8000);i<n;i++)if(b[i]===0)return null;
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}catch(e){return null}
}
function b64(b){
 let s="";const C=0x8000;
 for(let i=0;i<b.length;i+=C)s+=String.fromCharCode.apply(null,b.subarray(i,i+C));
 return btoa(s);
}
const cleanName=s=>String(s||"").trim().replace(/\s+/g,"-").replace(/[^A-Za-z0-9._-]/g,"").replace(/^\.+/,"").slice(0,100);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ═══ عميل GitHub: إعادةُ محاولةٍ عند حدّ المعدّل/أخطاء الخادم/انقطاع الشبكة ═══ */
function ghClient(o){
 const API=o.api||"https://api.github.com", F=o.fetch||fetch, signal=o.signal, log=o.log||(()=>{});
 const chk=()=>{if(signal&&signal.aborted)throw new Error("أُلغي الرفع")};
 async function gh(method,path,body,tries=6){
  for(let a=0;;a++){
   chk(); let r;
   try{
    r=await F(API+path,{method,signal,headers:{"Authorization":"Bearer "+o.token,
     "Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",
     ...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
   }catch(e){chk(); if(a<tries){await sleep(o.fastRetry?1:1000*(a+1));continue} throw new Error("تعذّر الاتصال بـ GitHub، تحقّق من الإنترنت")}
   if(r.ok){
    if(path==="/user"){const h=r.headers&&r.headers.get&&r.headers.get("x-oauth-scopes"); gh.scopes=typeof h==="string"?h:null}
    return r.status===204?null:r.json();
   }
   const j=await r.json().catch(()=>({}));
   const ra=+(r.headers.get&&r.headers.get("retry-after"))||0;
   const lim=r.status===429||(r.status===403&&/rate limit|abuse|secondary/i.test(j.message||""));
   if((lim||r.status>=500||(r.status===404&&method==="GET"&&a<3&&tries>0))&&a<tries){
    const w=ra?ra*1000:Math.min(30000,1500*2**a);
    if(lim)log(`⏳ حدّ GitHub المؤقت، انتظار ${Math.round(w/1000)} ث`);
    await sleep(o.fastRetry?1:w); continue;
   }
   const err=new Error(j.message||("HTTP "+r.status)); err.status=r.status; throw err;
  }
 }
 gh.chk=chk;
 return gh;
}
/* مستودعاتُ المستخدم (مالكاً أو متعاوناً)، الأحدثُ أوّلاً */
async function listRepos(o){
 const gh=ghClient(o), out=[];
 for(let page=1;page<=10;page++){
  const r=await gh("GET",`/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`);
  out.push(...r.filter(x=>!x.archived&&x.permissions&&x.permissions.push).map(x=>({full:x.full_name,priv:x.private,branch:x.default_branch,url:x.html_url})));
  if(r.length<100)break;
 }
 return out;
}

/* ═══ الرفع ═══
   o.mode: "new" (مستودعٌ جديد) أو "existing" (o.repo = "owner/name")
   o.replace: في الموجود، true = المستودعُ يصير مطابقاً للـ ZIP، false = إضافةٌ/تحديثٌ فقط
   النصوصُ داخل الشجرة مباشرةً والثنائياتُ blobs بالتوازي؛ الشجرةُ على دفعاتٍ
   أثناء القراءة (ذاكرةٌ محدودة)؛ التزامٌ واحد. */
async function uploadZip(o){
 const {src,name,priv,signal}=o, mode=o.mode||"new";
 const say=o.status||(()=>{}), log=o.log||(()=>{}), prog=o.progress||(()=>{});
 const gh=ghClient({...o,log}), chk=gh.chk;
 const t0=Date.now();
 say("قراءة الملف…");
 const zip=await readZip(src);
 const ents=zip.entries.filter(e=>!SKIP.test(e.name));
 const root=stripRoot(ents.map(e=>e.name));
 if(root)log("المجلد الجذري «"+root+"» أُزيل، الملفات في جذر المستودع");
 if(!ents.length)throw new Error("الـ ZIP فارغ");
 const big=ents.filter(e=>e.usize>100*1048576);
 if(big.length)throw new Error("GitHub يرفض الملفات فوق 100 م.ب: "+big.map(e=>e.name).join("، "));
 log(`📦 ${ents.length} ملف`);

 say("التحقق من التوكن…");
 const me=await gh("GET","/user").catch(e=>{throw new Error(e.status===401?"التوكن غير صالح أو منتهي":e.message)});
 log("👤 "+me.login);
 /* GitHub يرفض (404) أيَّ كتابةٍ في .github/workflows بلا صلاحية «workflow» حتى مع repo */
 const hasWf=ents.some(e=>/^\.github\/workflows\//.test(e.name.slice(root.length)));
 const WF_MSG="الـ ZIP فيه .github/workflows لكنّ التوكن بلا صلاحية «workflow». أنشئ توكناً جديداً بصلاحيتَي repo و workflow (للتوكن الدقيق: Workflows ← Read and write) أو سجّل الدخول عبر GitHub من جديد، ثم أعد المحاولة";
 const wfErr=e=>hasWf&&e&&(e.status===404||e.status===403)?Object.assign(new Error(WF_MSG+" ["+e.message+"]"),{status:e.status}):e;
 if(hasWf&&typeof gh.scopes==="string"&&!/(^|[\s,])workflow(?=[\s,]|$)/.test(gh.scopes))throw new Error(WF_MSG);
 let repo, full, br, head=null, baseTree=null;
 if(mode==="new"){
  say("إنشاء المستودع…");
  try{repo=await gh("POST","/user/repos",{name,private:priv,auto_init:true})}
  catch(e){
   if(e.status===422)throw new Error(`يوجد مستودع باسم «${name}» في حسابك، اختر اسماً آخر أو استعمل «مستودع موجود»`);
   if(e.status===403||e.status===404)throw new Error("التوكن لا يملك صلاحية إنشاء مستودعات (repo)");
   throw e;
  }
  full=repo.full_name; br=repo.default_branch||"main";
  log("✓ "+full+(priv?" (خاص)":" (عام)"),"ok");
  for(let a=0;a<10&&!head;a++){try{head=(await gh("GET",`/repos/${full}/git/ref/heads/${br}`,null,0)).object.sha}catch(e){chk();await sleep(o.fastRetry?1:800)}}
  if(!head)throw new Error("المستودع لم يجهز بعد، أعد المحاولة");
 }else{
  full=String(o.repo||"").trim().replace(/^https?:\/\/github\.com\//,"").replace(/\.git$/,"").replace(/\/+$/,"");
  if(!/^[\w.-]+\/[\w.-]+$/.test(full))throw new Error("اكتب المستودع بالشكل owner/name");
  say("فتح المستودع…");
  try{repo=await gh("GET",`/repos/${full}`)}
  catch(e){throw new Error(e.status===404?`لم أجد «${full}» أو التوكن لا يصل إليه`:e.message)}
  if(repo.permissions&&!repo.permissions.push)throw new Error("لا تملك صلاحية الكتابة في "+full);
  br=o.branch||repo.default_branch||"main";
  try{
   head=(await gh("GET",`/repos/${full}/git/ref/heads/${br}`,null,0)).object.sha;
   if(!o.replace)baseTree=(await gh("GET",`/repos/${full}/git/commits/${head}`)).tree.sha;
  }catch(e){
   if(e.status!==404&&e.status!==409)throw e;
   /* مستودعٌ فارغ: Git Data API لا يعمل قبل أوّل التزام، فنُنشئه بملفٍّ مؤقّت */
   log("المستودع فارغ، أنشأتُ التزاماً أوّلياً");
   const c=await gh("PUT",`/repos/${full}/contents/.zip2github`,{message:"init",content:"Cg==",branch:br});
   head=c.commit.sha;
  }
  log("✓ "+full+" ← "+br+(o.replace?" (استبدال كامل)":" (دمج: إضافة وتحديث)"),"ok");
 }
 prog(.04);

 /* دفعاتُ الشجرة: تُرسَل متسلسلةً كلّما تجاوز المعلَّقُ ~8 م.ب */
 let tree=baseTree, pend=[], pendSz=0, chain=Promise.resolve(), nText=0, nBin=0, treeCalls=0;
 const flush=()=>{
  if(!pend.length)return chain;
  const batch=pend; pend=[]; pendSz=0;
  chain=chain.then(async()=>{
   const body={tree:batch}; if(tree)body.base_tree=tree;
   tree=(await gh("POST",`/repos/${full}/git/trees`,body).catch(e=>{throw wfErr(e)})).sha; treeCalls++;
  });
  return chain;
 };
 const add=(it,sz)=>{pend.push(it); pendSz+=sz+it.path.length+64;
  if(pendSz>8e6||pend.length>=3000)return flush()};

 let done=0; const total=ents.length; let i=0;
 say(`رفع الملفات 0/${total}…`);
 const worker=async()=>{
  while(i<ents.length){
   const e=ents[i++]; chk();
   const path=e.name.slice(root.length);
   if(path){
    const bytes=await zip.data(e);
    const mode=e.link?"120000":e.exec?"100755":"100644";
    const txt=e.link?new TextDecoder().decode(bytes):asText(bytes);
    if(txt!==null){nText++; await add({path,mode,type:"blob",content:txt},txt.length)}
    else{
     const r=await gh("POST",`/repos/${full}/git/blobs`,{content:b64(bytes),encoding:"base64"});
     nBin++; await add({path,mode,type:"blob",sha:r.sha},0);
    }
   }
   done++; say(`رفع الملفات ${done}/${total}…`); prog(.04+.88*done/total);
  }
 };
 await Promise.all(Array.from({length:Math.min(4,ents.length)},worker));
 await flush(); await chain;
 if(!tree)throw new Error("لا ملفات بعد إزالة الجذر");
 log(`📝 ${nText} نصّي · 🧱 ${nBin} ثنائي · 🌳 ${treeCalls} دفعة شجرة`);
 say("إنشاء الالتزام…");
 const msg=(o.message||"").trim()||("رفع "+(src.name||"zip"));
 const commit=await gh("POST",`/repos/${full}/git/commits`,{message:msg,tree,parents:[head]}).catch(e=>{throw wfErr(e)});
 try{await gh("PATCH",`/repos/${full}/git/refs/heads/${br}`,{sha:commit.sha,force:mode==="new"})}
 catch(e){ if(e.status===422)throw new Error("الفرع تغيّر أثناء الرفع (دفعٌ من مكانٍ آخر)، أعد المحاولة"); throw wfErr(e) }
 prog(1);
 return {url:repo.html_url,full,branch:br,mode,files:nText+nBin,sec:((Date.now()-t0)/1000).toFixed(1),commit:commit.sha};
}

/* ═══ تسجيل الدخول عبر GitHub (Device Flow) ═══
   post(url, body) → JSON. في التطبيق عبر CapacitorHttp (نقاطُ Device Flow
   لا تدعم CORS، فلا تعمل من موقعٍ عادي). */
async function deviceLogin({clientId,post,onCode,signal,scope="repo workflow",wait=sleep}){
 if(!clientId)throw new Error("لم يُضبَط Client ID لتطبيق OAuth");
 const d=await post("https://github.com/login/device/code",{client_id:clientId,scope});
 if(!d||!d.device_code)throw new Error((d&&(d.error_description||d.error))||"تعذّر بدء تسجيل الدخول، تأكّد من تفعيل Device Flow في تطبيق OAuth");
 onCode&&onCode(d);
 let iv=(d.interval||5)*1000; const until=Date.now()+(d.expires_in||900)*1000;
 while(Date.now()<until){
  await wait(iv);
  if(signal&&signal.aborted)throw new Error("أُلغي تسجيل الدخول");
  let r;
  try{r=await post("https://github.com/login/oauth/access_token",{client_id:clientId,device_code:d.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"})}
  catch(e){continue}
  r=r||{};
  if(r.access_token)return r.access_token;
  if(r.error==="authorization_pending")continue;
  if(r.error==="slow_down"){iv=((r.interval||0)*1000)||iv+5000;continue}
  if(r.error==="access_denied")throw new Error("رفضتَ الإذن في GitHub");
  if(r.error==="expired_token")break;
  throw new Error(r.error_description||r.error||"فشل تسجيل الدخول");
 }
 throw new Error("انتهت مهلة الكود، أعد المحاولة");
}
/*@@CORE-END*/
