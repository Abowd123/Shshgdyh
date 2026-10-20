#!/usr/bin/env node
/* ═══ تعديلاتُ android/ بعد `npx cap add android` ═══ (آمنٌ للتكرار)
   · ينسخ الشيفرة الأصلية من native/android/ (الجسر + MainActivity)
   · AndroidManifest: استقبالُ ZIP من «مشاركة» و«فتح بواسطة» + adjustResize
   · build.gradle: مكتبةُ التشفير، والإصدارُ من package.json ورقمُ البناء
   · variables.gradle: minSdk 23 (يلزم Android Keystore المشفّر)
   التشغيل: node scripts/android-patch.js [versionCode] */
import {readFileSync,writeFileSync,existsSync,copyFileSync,mkdirSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const A=join(ROOT,"android");
if(!existsSync(A)){console.error("لا مجلد android/ ، شغّل npx cap add android أولاً");process.exit(1)}
const pkg=JSON.parse(readFileSync(join(ROOT,"package.json"),"utf8"));
const cfg=JSON.parse(readFileSync(join(ROOT,"capacitor.config.json"),"utf8"));
const code=Math.max(1,parseInt(process.argv[2]||process.env.VERSION_CODE||"1",10)||1);
const edit=(p,fn)=>{const f=join(A,p); writeFileSync(f,fn(readFileSync(f,"utf8")))};

/* ١. الشيفرة الأصلية */
const jdir=join(A,"app/src/main/java",...cfg.appId.split("."));
mkdirSync(jdir,{recursive:true});
for(const f of ["MainActivity.java","ZipBridgePlugin.java","UploadService.java"])
 copyFileSync(join(ROOT,"native/android",f),join(jdir,f));
console.log("✓ الجسر الأصلي");

/* ٢. المانيفست */
const FILTERS=`
            <!-- z2g:share -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="application/zip" />
                <data android:mimeType="application/x-zip-compressed" />
                <data android:mimeType="application/x-zip" />
                <data android:mimeType="application/octet-stream" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:mimeType="application/zip" />
                <data android:mimeType="application/x-zip-compressed" />
                <data android:mimeType="application/x-zip" />
            </intent-filter>`;
edit("app/src/main/AndroidManifest.xml",m=>{
 if(!m.includes("windowSoftInputMode"))
  m=m.replace(/<activity\b/,'<activity\n            android:windowSoftInputMode="adjustResize"');
 if(!m.includes("z2g:share")){
  const i=m.indexOf("</intent-filter>");
  if(i<0)throw new Error("لم أجد intent-filter الرئيسي في المانيفست");
  m=m.slice(0,i+16)+FILTERS+m.slice(i+16);
 }
 if(!m.includes("z2g:service"))
  m=m.replace(/<\/application>/,`    <!-- z2g:service -->
        <service android:name=".UploadService" android:exported="false"
            android:foregroundServiceType="dataSync" />
    </application>`);
 for(const perm of ["POST_NOTIFICATIONS","FOREGROUND_SERVICE","FOREGROUND_SERVICE_DATA_SYNC","WAKE_LOCK"])
  if(!m.includes(`android.permission.${perm}"`))
   m=m.replace(/<\/manifest>\s*$/,`    <uses-permission android:name="android.permission.${perm}" />\n</manifest>\n`);
 return m;
});
console.log("✓ AndroidManifest: مشاركة/فتح ZIP + خدمة الخلفية + adjustResize");

/* ٣. build.gradle */
edit("app/build.gradle",s=>{
 s=s.replace(/versionCode\s+\d+/,`versionCode ${code}`)
    .replace(/versionName\s+"[^"]*"/,`versionName "${pkg.version}"`);
 if(!s.includes("security-crypto"))
  s=s.replace(/dependencies\s*\{/,'dependencies {\n    implementation "androidx.security:security-crypto:1.1.0-alpha06"');
 return s;
});
console.log(`✓ build.gradle: ${pkg.version} (${code}) + security-crypto`);

/* ٤. minSdk */
if(existsSync(join(A,"variables.gradle")))
 edit("variables.gradle",s=>s.replace(/minSdkVersion\s*=\s*\d+/,m=>{
  const n=+m.match(/\d+/)[0]; return n<23?"minSdkVersion = 23":m}));
console.log("✓ minSdk ≥ 23");
