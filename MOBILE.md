# التطبيق على أندرويد وآيفون

الموقع نفسه ينلف داخل تطبيق حقيقي بواسطة Capacitor، والبناء كله يصير على GitHub (ما تحتاج حاسبة).

- `capacitor.config.json`: اسم التطبيق والمعرّف (`iq.studentplatform.app`، ما يتغير بعد النشر).
- `android/` و `ios/`: مشروعا التطبيقين.
- `tools/mobile-build.py`: يجمع ملفات الموقع بمجلد `www/` اللي ينحط داخل التطبيق.
- `.github/workflows/android.yml`: ملف تجربة (APK) أو ملف النشر (AAB).
- `.github/workflows/android-keystore.yml`: مرة وحدة، يسوي مفتاح التوقيع.
- `.github/workflows/ios.yml`: يبني الآيفون ويرفعه لـ TestFlight.

بعد أي تعديل بالموقع ما تحتاج تسوي شي للتطبيق غير تشغيل البناء من جديد.
