# ZIP إلى GitHub

ارفع ملف ZIP إلى مستودع GitHub **جديد أو موجود** بكل ملفاته ومجلداته في التزامٍ واحد.
يعمل **موقعاً** (افتح `www/index.html`) و**تطبيق أندرويد** (APK).

## في التطبيق
- **شارك أي ملف ZIP** من تيليجرام أو واتساب أو مدير الملفات ← اختر «ZIP إلى GitHub».
- التوكن يُحفظ **مشفّراً في Android Keystore** (خيار «تذكّر التوكن»).
- الذاكرة محدودة مهما كبر الـ ZIP: يُقرأ ملفاً ملفاً من القرص، والشجرة تُبنى على دفعات.
- الشاشة تبقى مضاءة أثناء الرفع، وإشعارٌ عند الانتهاء، وزرّ الرجوع يلغي بتأكيد.
- **الرفع يكمل في الخلفية**: إشعار بالتقدّم، والتطبيق لا يُقتل لو خرجت منه.
- **مستودع موجود**: «دمج» (إضافة وتحديث، والباقي يبقى) أو «استبدال كامل» (يطابق الـ ZIP). يعمل حتى على المستودع الفارغ.
- **سجلّ** بآخر ٣٠ عملية رفع، وزرّ «↻ تحديث» يرفع للمستودع نفسه مرة أخرى.
- **تسجيل الدخول عبر GitHub** بكود بدل لصق التوكن (يحتاج إعداداً لمرّة واحدة، أدناه).
- يحافظ على صلاحية التنفيذ (`gradlew`)، ويزيل المجلد الجذري المشترك، ويتجاهل `__MACOSX`.

## الحصول على الـ APK (بلا Android Studio)
1. ارفع محتوى هذا المجلد إلى مستودع GitHub (الفرع `main`)، **ومعه المجلد المخفي `.github`**.
   ⚠️ رفع `.github/workflows` يحتاج توكناً بصلاحيتَي **repo + workflow** (وإلا يردّ GitHub بـ 404). [أنشئ توكناً جاهزاً](https://github.com/settings/tokens/new?scopes=repo,workflow&description=zip-to-github).
2. Settings ← Actions ← General ← Workflow permissions ← **Read and write**.
3. Actions ← **Android APK** ← Run workflow.
4. بعد ~١٠ دقائق: صفحة **Releases** ← `ZipToGitHub-N.apk`.

### تسجيل الدخول عبر GitHub (اختياري، مرّة واحدة)
1. GitHub ← Settings ← Developer settings ← **OAuth Apps** ← New OAuth App.
   الاسم: ZIP إلى GitHub · Homepage و Callback: أي رابط (مثل `https://github.com`).
2. بعد الإنشاء فعّل **Enable Device Flow** واحفظ، وانسخ **Client ID** (ليس سرّاً، لا تحتاج Client Secret).
3. في مستودع التطبيق: Settings ← Secrets and variables ← Actions ← **Variables** ← New:
   الاسم `OAUTH_CLIENT_ID` والقيمة الـ Client ID. ثم أعد تشغيل البناء.
بدونه يبقى التطبيق يعمل بالتوكن عادياً، والزرّ مخفي. (محلياً: ضع الـ Client ID في `client-id.txt`.)

### إصدارٌ موقَّع (اختياري)
يلزم للتحديث فوق النسخة السابقة دون حذفها، ولـ Google Play:
```sh
keytool -genkey -v -keystore z2g.jks -alias z2g -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 z2g.jks   # ← قيمة ANDROID_KEYSTORE_BASE64
```
وأضف في Settings ← Secrets and variables ← Actions:
`ANDROID_KEYSTORE_BASE64` · `ANDROID_KEYSTORE_PASSWORD` · `ANDROID_KEY_ALIAS` · `ANDROID_KEY_PASSWORD`.
**لا ترفع ملف `.jks` إلى المستودع.**

## البنية
| المسار | الدور |
|---|---|
| `src/core.js` | قارئ ZIP بلا مكتبات (ZIP64) + منطق الرفع إلى GitHub |
| `src/app.tpl.html` | الواجهة وربط الجسر الأصلي |
| `www/index.html` | الناتج (ملف واحد): `node scripts/build-www.js` |
| `native/android/ZipBridgePlugin.java` | استلام المشاركة · القراءة المجزّأة · Keystore · إبقاء الشاشة · الخلفية |
| `native/android/UploadService.java` | خدمة أمامية (dataSync) بإشعار تقدّم + WakeLock |
| `scripts/android-patch.js` | يطبّق تعديلات المانيفست وGradle بعد `cap add android` |
| `tests/core.test.mjs` | اختبار بلا شبكة: ZIP مولَّد + GitHub وهمي |

## محلياً
```sh
npm install && npm test
npx cap add android && node scripts/android-patch.js && npm run android:apk
```
