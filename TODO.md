# TODO — QəbulFit

## 1. Fənlər, mövzular və ilkin sual bazası

- [x] Tətbiqdə iki əsas fənn olmalıdır: İnformatika və Məntiq.
- [x] İnformatika üçün aşağıdakı 18 mövzu yaradılmalı, nömrə və adlar olduğu kimi qorunmalıdır:
  1. İnformatika və Onun Əsas Anlayışları
  2. Say Sistemləri
  3. EHM (Hardware)
  4. Kompüterin Texniki Təminatı
  5. Alqoritm (Brainware)
  6. Proqram Təminatı (Software)
  7. Əməliyyat Sistemləri
  8. Windows 11
  9. MS Word 2019
  10. MS Excel 2019
  11. MS PowerPoint 2019
  12. Verilənlər Bazası (VBİS)
  13. MS Access 2019
  14. Kompüter Qrafikası
  15. Kompüter Şəbəkələri
  16. İnternet Qlobal Şəbəkələri
  17. Elektron Hökumət
  18. İnformasiya Təhlükəsizliyi
- [x] Məntiq üçün aşağıdakı 20 əsas mövzu yaradılmalı, nömrə və adlar olduğu kimi qorunmalıdır:
  1. Şifrələr
  2. Riyazi Əməllər
  3. Şəklin Analizi
  4. Əməllər (Qeyri-Aşkar Operatorlar)
  5. Şəkil Münasibətləri
  6. Ardıcıllıqlar
     - 6.1. Sıralar (6-cı mövzunun alt mövzusu)
  7. Şəkil Ardıcıllıqları
  8. Mətnin Məntiqi Təhlili
  9. Rebus
  10. Şəkil Cədvəlləri
  11. Cədvəllər
  12. Analogiya-Anagram
  13. Hesab Əməlləri
  14. Tərəzilər
  15. Sahə-Perimetr
  16. Müstəvi Təsəvvür
  17. Cədvəl-Qrafik-Diaqram
  18. Fəza Fiqurları
  19. Tənqidi Mühakimə Məsələləri
  20. Riyazi Məsələlər
- [x] 21–24-cü bölmələrdəki model imtahanları mövzu siyahısına daxil edilməməlidir. Mövzuların adları və nömrələri qorunmalıdır. Özbaşına yeni mövzu yaradılmamalıdır.
- [x] Hazırda 2010–2011-ci illərə aid "2010-11.pdf" faylı təqdim edilib. Bu fayldakı 50 sualın hamısı İnformatika fənninə aiddir: 2010-cu il – 25 sual; 2011-ci il – 25 sual. Bu 50 sualın hamısını İnformatika fənninin uyğun mövzularına təsnif et.
- [x] Vacib: Bu fayldan Məntiq bölməsinə heç bir sual əlavə etmə. Məntiq fənni və onun mövzuları tətbiqdə hazır vəziyyətdə olsun, lakin hələlik boş qalsın. Gələcəkdə həmin fənnə aid faylları ayrıca yükləyəcəyəm.

## 2. PDF yükləmə, çıxarış və mənbənin qorunması

- [x] İstifadəçi bir və ya bir neçə PDF faylı yükləyə bilməlidir.
- [x] Faylın hansı illərə aid olduğu müəyyənləşdirilməlidir.
- [x] PDF-dən suallar, cavab variantları, şəkillər, cədvəllər, düsturlar və digər vacib elementlər çıxarılmalıdır.
- [x] Sualın orijinal görünüşü və məzmunu qorunmalıdır.
- [x] Skan edilmiş PDF-lər üçün OCR texnologiyasından istifadə edilməlidir.
- [x] Sualın hansı ilin imtahanından və hansı nömrə ilə götürüldüyü saxlanmalıdır.
- [x] Sualın orijinal mətni dəyişdirilməməlidir. OCR zamanı yaranan səhvlər aşkarlanarsa, düzəliş təklif edilməli və orijinal mənbə ilə müqayisə imkanı saxlanmalıdır.
- [x] Şəkildən asılı olan suallarda şəkil mütləq qorunmalıdır. Şəkil çıxarıla bilmirsə, həmin sual itirilməməli, yoxlanış üçün işarələnməlidir.
- [x] Yükləmə interfeysi hər PDF üçün gözlənilən sual sayını istəyə bağlı qəbul edir; çıxarış sayı bu göstərici ilə uyğun gəlmirsə və ya AI tamlığı təsdiqləmirsə, nəticə yoxlanış üçün işarələnir.
- [x] Sual çıxmayan fayl uğurlu kimi göstərilmir; PDF `failed`, `uploaded`, `completed` və ya `needs_review` olduqda admin onu yenidən emal edə bilər. Təkrar emal mövcud sual qeydlərini dəyişmir, yalnız çatışmayanları əlavə edir.
- [x] Admin imtahan PDF mənbəyini və yalnız həmin fayla aid sualları tranzaksiyada bazadan silə bilər; əl ilə əlavə edilmiş sualların mənbəsi qorunur və storage-dakı PDF obyekti silinmir.

## 3. AI təsnifatı, düzəliş və təkrarın qarşısının alınması

- [x] Hər sualın məzmunu təhlil edilməlidir.
- [x] Sual uyğun mövzuya yerləşdirilməlidir.
- [x] Təsnifat yalnız açar sözlərə əsaslanmamalı, sualın məntiqi və yoxladığı bilik nəzərə alınmalıdır.
- [x] Bir neçə mövzuya uyğun gələn suallarda əsas mövzu seçilməlidir.
- [x] Əminlik aşağıdırsa, sual avtomatik təsnif edilmək əvəzinə yoxlanış üçün işarələnməlidir.
- [x] İstifadəçi sualın mövzusunu əl ilə dəyişə bilməlidir.
- [x] Eyni sualın təkrar yüklənməsi mümkün qədər müəyyən edilməlidir.
- [x] İş zamanı heç bir sualı səssizcə buraxma, məzmununu dəyişdirmə və ya cavabını uydurma. Əgər sualın oxunması və ya mövzuya aid edilməsi şübhəlidirsə, onu ayrıca yoxlanış siyahısına yerləşdir.

## 4. Sual qeydləri, mənbə və davamlı saxlanma

- [x] Hər sual üçün aşağıdakı məlumatlar saxlanmalıdır: Fənn; Mövzu; Alt mövzu (olduğu halda); İmtahan ili; Sual nömrəsi; Sualın tam mətni; Cavab variantları; Şəkil, cədvəl və ya düstur; Düzgün cavab (yalnız etibarlı mənbədən məlumdursa); Mənbə PDF faylı; Təsnifatın yoxlanış statusu.
- [x] Düzgün cavabı məlum olmayan suallarda sistem cavabı uydurmamalıdır. Belə suallarda cavab yoxlanışı deaktiv edilməli və ya ayrıca yoxlanış statusu göstərilməlidir.
- [x] Suallar məlumat bazasında saxlanmalıdır.
- [x] Məlumatlar yenilənəndə itirilməməlidir.
- [x] Sualın mənbəyi hər zaman görünməlidir.
- [x] Mövcud sualların təkrarlanmasının qarşısı alınmalıdır.
- [x] Sistem gələcəkdə çoxlu sayda PDF və sualı idarə edə bilməlidir.
- [x] Cavab açarı və onun mənbə qeydi sual siyahısı, baxış, review növbəsi və backup cavablarında açıqlanmır; mənbə ilə təsdiqlənmiş cavab yalnız test tamamlandıqdan sonra nəticədə göstərilə bilər.

## 5. Əsas səhifə, fənlər, mövzular və filtrlər

- [x] Müasir, rahat, səliqəli və mobil telefonlarda da düzgün işləyən dizayn hazırla.
- [x] Əsas səhifədə İnformatika; Məntiq; Yüklənmiş imtahanlar; Ümumi sual sayı; Mövzular üzrə sual sayı; Son əlavə edilən suallar göstərilsin.
- [x] İstifadəçi İnformatika bölməsinə daxil olduqda 18 mövzunu, Məntiq bölməsinə daxil olduqda isə 20 mövzunu görməlidir.
- [x] Mövzu seçildikdə həmin mövzuya aid suallar siyahı şəklində göstərilsin.
- [x] Filtrlər: İmtahan ili; Mövzu; Alt mövzu; Sual nömrəsi.
- [x] İstifadəçi istədiyi ilin və ya bütün illərin suallarına baxa bilməlidir.

## 6. Test rejimi və nəticələr

- [x] İstifadəçi mövzu daxilindəki sualları test şəklində həll edə bilməlidir.
- [x] Test rejimində: Suallar ardıcıl göstərilsin; Cavab variantları seçilə bilsin; Cavab seçildikdən sonra növbəti suala keçmək mümkün olsun; Test bitdikdə nəticə göstərilsin; Düzgün və səhv cavabların sayı hesablansın; Faiz göstəricisi təqdim edilsin; Səhv cavablar yenidən nəzərdən keçirilə bilsin; İstifadəçi istəsə, yalnız müəyyən bir ilin suallarını həll etsin.
- [x] Düzgün cavabı məlum olmayan suallarda sistem cavabı uydurmamalıdır. Belə suallarda cavab yoxlanışı deaktiv edilməli və ya ayrıca yoxlanış statusu göstərilməlidir.

## 7. Gələcək genişlənmə imkanları

- [x] Arxitekturanı elə qur ki, gələcəkdə aşağıdakı funksiyalar əlavə edilə bilsin: Yeni illərin PDF fayllarının yüklənməsi; Yeni sualların mövcud mövzulara avtomatik əlavə edilməsi; İstifadəçinin öz sualını əlavə etməsi; Mövzular üzrə statistika; Ən çox səhv edilən suallar; Çətinlik səviyyəsinə görə filtr; Qarışıq sınaq imtahanları; Məntiq sualları üçün rəqəmsal qaralama sahəsi və qələm aləti; Sualların ixracı və ehtiyat nüsxəsi.

## 8. İşlək tətbiq və texniki keyfiyyət

- [x] Tətbiq həqiqətən işlək olmalıdır, yalnız dizayn maketi olmamalıdır.
- [x] PDF yükləmə və emal prosesi real işləməlidir.
- [x] Mövzular üzrə təsnifat yoxlanıla və düzəldilə bilməlidir.
- [x] Mobil və kompüter ekranlarına uyğunlaşmalıdır.
- [x] Sualın mənbəyi hər zaman görünməlidir.
- [x] İş zamanı heç bir sualı səssizcə buraxma, məzmununu dəyişdirmə və ya cavabını uydurma. Əgər sualın oxunması və ya mövzuya aid edilməsi şübhəlidirsə, onu ayrıca yoxlanış siyahısına yerləşdir.


## 9. Dizayn və layout düzəlişləri — kontent dəyişmədən

- [x] Viewport və ümumi hizalanma: `<meta name="viewport" content="width=device-width, initial-scale=1">` təsdiq et. Maksimum məzmun enini 1200px mərkəzlə, yan boşluqları (padding) bütün bölmələrdə eyni saxla — indi bəzi bloklar kənara yapışır, bəziləri aralıqdadır.
- [x] Uzun sual mətnləri: Hər sual kartında ilk 2–3 sətirdən artıq mətni gizlət, altında “Əsas mətni aç / Bağla” düyməsi qoy. Kart hündürlüyü eyni qalsın ki, siyahıda boş yerlər yaranmasın.
- [x] Cədvəl olan suallar: Cədvəl sınıq görünməsin deyə, onu ayrıca blokda, üfüqi scroll ilə göstər (`overflow-x: auto`). Cədvəl eni kartdan böyük olsa belə düzəni pozulmasın.
- [x] Mövzu paylanması: “Ən çox sual olan mövzular” siyahısını yatay scroll edilən çiplər sırasına çevir — mətn sıxışıb qalmasın, çiplər arasında bərabər boşluq (8px) olsun.
- [x] İcmal statistikası: Telefonda (480px-dən aşağı) 4 statistik kart 2×2 grid düzülüşündə olsun. Masaüstündə bir sıra 4 kart.
- [x] Yapışqan PDF düyməsi: Sual kartları siyahısında “PDF yüklə” düyməsi scroll zamanı da əlçatan olsun — kartın içində yuxarı yapışqan vəziyyətdə qalsın.
- [x] Alt naviqasiya: İcmal / Fənlər / PDF / Yoxlanış bölmələri üçün aşağıda 4 tab-lı naviqasiya əlavə et (yalnız mobil görünüşdə, hündürlük ~56px, ikon + qısa mətn). Aktiv tab fərqlənsin.
- [x] Boşluq balansı: Bölmələr arası boşluq (margin) bütün səhifədə 32–48px arası eyni olsun. “Yoxlanışda 3 sual” banneri uzun scroll-da kiçik badge-ə çevrilsin, tam en tutmasın.
- [x] Düymələr və toxunuş hədəfləri: Bütün kliklənən elementlərin hündürlüyü minimum 44px olsun, kartlar arası minimum 12px boşluq.
- [x] Şriftlər: Sual mətni minimum 16px, kiçik etiketlər minimum 12px. Uzun mövzu adları iki sətirdə kəsiləndə ellipsis (…) ilə bitir.
- [x] Yekun: kontent və funksionallıq eyni qalmalı, yalnız vizual boşluqlar, düzən və mobil uyğunluq düzəldilməlidir.


## 10. Responsive CSS ziddiyyətlərinin aradan qaldırılması və dərc

- [x] `qebulfit-design-fix.css` faylını axtardım; tapılmadığı üçün verilməyən patch məzmununu uydurmadım, göstərilən CSS ziddiyyətlərini birbaşa `client/src/index.css` faylında düzəltdim.
- [x] `index.css`-də 525–538-ci sətirlər ətrafındakı statistik kartları 4 sütuna qaytaran ziddiyyətli `@media` qaydalarını sildim.
- [x] 1420px və 1200px container enlərindən yalnız birini saxladım: yeganə `max-width` 1200px-dir.
- [x] `pnpm build` və yoxlamaları işlətdim; asılılıqlar artıq quraşdırılmış olduğundan `pnpm install` lazım olmadı.
- [x] 375px emulyasiyada statistikanın 2×2 düzülüşünü, alt naviqasiya yazılarının oxunaqlılığını və sual kartlarının sıxlığını yoxladım.
- [x] Yayımlandıqdan sonra canlı saytı yenidən yoxladım; link aşağıdadır.
- [ ] Real telefonda ayrıca yoxla: agent fiziki telefona çıxış əldə edə bilmədiyi üçün bunu istifadəçi canlı linkdə təsdiqləyə bilər.


## 11. Mobil kartlarda mətn və rəqəm düzülüşü

- [x] Kartdakı rəqəm həmişə sağ tərəfdə, mətn isə solda ayrıca bloklarda yerləşməlidir.
- [x] Mətn və rəqəm arasında görünən `gap`/boşluq olmalıdır.
- [x] Uzun mətn kart sərhədindən çıxmamalı, sözlər uyğun sətirdə qırılmalıdır.
- [x] Düzülüş `Flexbox` və ya `CSS Grid` ilə `space-between` və `center` hizalanmasını təmin etməlidir.
- [x] Mövcud tətbiq texnologiyasına uyğun React komponenti və adi CSS istifadə edilməli; kontent və rəqəmlərin dəyəri dəyişdirilməməlidir.


## 12. Son suallar siyahısında mobil overflow-un aradan qaldırılması

- [x] Son suallar kartında başlıq mobil ölçüdə bir sətrə sıxılmamalı; kart daxilində maksimum 2 sətirdə qırılmalıdır.
- [x] Sual nömrəsi, mətn və ox üçün `minmax(0, 1fr)`-li grid və minimum en sıfır olan mətn sütunu istifadə edilməlidir.
- [x] Uzun və bitişik mətn kart sərhədindən və ekran enindən kənara çıxmamalıdır; il və mövzu metadatası sətirə keçə bilməlidir.
- [x] Sual məzmunu, nömrələr və imtahan ili dəyişdirilməməlidir.
- [x] 375px enində mobil görünüşdə üfüqi daşma olmamalı və siyahı kartları düzgün düzülməlidir.


## 13. Gemini emalı və idarəetmə əməliyyatları yalnız admin üçün

- [x] İstifadəçi seçimi: “Yalnız mən/admin istifadə etsin — əvvəl giriş qoruması əlavə et (tövsiyə olunur).”
- [x] Public ziyarətçilər suallara baxa və testləri həll edə bilər; PDF yükləmə, AI emalı və yenidən emal, əl ilə sual əlavə etmə, yoxlanış və cavab açarının dəyişdirilməsi yalnız admin üçün əlçatan olmalıdır.
- [x] İcazə server tərəfində yoxlanmalıdır; yalnız düymə və marşrutları gizlətmək kifayət deyil. Manus OAuth identifikasiyası və admin rolu istifadə edilməlidir.
- [x] API açarı yalnız server mühitində saxlanmalı, brauzerə, kod deposuna və loglara çıxmamalıdır. Gemini API açarı istifadəçinin təhlükəsiz giriş kartı ilə verilməlidir.
- [x] Admin hesabı yalnız təhlükəsiz konfiqurasiya edilmiş Manus hesabı ilə uyğun gələndə admin sayılmalıdır; admin e-poçtu mənbə koduna yazılmamalıdır.
- [x] PDF məzmunu Gemini 3.8 Flash ilə OCR/təsnifat üçün Google-a göndərilməlidir; qeyri-müəyyən suallar və etibarsız cavab açarları əvvəlki qaydada yoxlanış üçün saxlanmalıdır.
- [x] Gemini-yə yüklənmiş müvəqqəti PDF emaldan sonra silinməlidir; Gemini açarı və ya admin identifikatoru yoxdursa, emal və idarəetmə əməliyyatları uğursuz şəkildə açıq yox, bağlı qalmalıdır.
- [x] Protected Preview-də `/uploads` giriş ekranı və icazəsiz PDF upload üçün HTTP 401 yoxlanıldı; admin identity matcher və tRPC admin proseduru regression test-ləri keçdi.
- [ ] İlk admin Manus sessiyası ilə giriş edib, nümunə PDF-i Gemini-də emal etdir və nəticəni yoxlanış növbəsində təsdiqlə. Bu yoxlamada authenticated admin sessiyası olmadığı üçün real PDF Google-a göndərilmədi.

## 14. Yüksək əminlikli sualların toplu təsdiqi

- [x] Yoxlanış səhifəsində admin yalnız `reviewNote`-u boş olan, ili/nömrəsi məlum, ən azı bir variantı, təyin edilmiş fənni və əsas mövzusu olan `needs_review` suallar içindən confidence-i `0.95` və yuxarı olanların sayını görə bilməlidir.
- [x] Bir düymə ilə yalnız yuxarıdakı eyni şərtlərə uyğun suallar `checked` kimi işarələnməlidir; say və təsdiq query-ləri ortaq şərt işlətməlidir.
- [x] Toplu təsdiqləmə sualın mətnini, mövzu təyinatını və cavab açarını dəyişməməli; yalnız yoxlanış statusunu dəyişməlidir.
- [x] Say serverdən hesablanmalı, əməliyyat admin identifikasiyası ilə qorunmalı və təsdiq zamanı say dəyişibsə köhnə say əsasında əməliyyat aparılmamalıdır.
- [x] `uncertain=true` olan yeni idxal sualında `reviewNote` boş qalmamalı; qeyddə yoxlanış səbəbi göstərilməlidir.

Yekun yoxlama: `pnpm check` və `pnpm build` keçdi; `pnpm test` — 9 faylda 51 test keçdi. Toplu təsdiq üçün canlı admin əməliyyatı başladılmadı.


## 15. Answer-key PDF importu və təhlükəsiz uyğunlaşdırma

- [x] Admin imtahan sualı PDF-indən ayrı cavab açarı PDF-i yükləyə, fənni seçə və il göstəricisini istəyə görə verə bilməlidir.
- [x] Gemini yalnız açıq şəkildə çap olunmuş sual nömrəsi, imtahan ili, cavab işarəsi və PDF səhifəsini çıxarmalı; sualı həll etməməli və cavab uydurmamalıdır.
- [x] Cavab açarı yalnız eyni fənn + PDF-də çap olunmuş il + sual nömrəsi üzrə tək sualla dəqiq uyğun gələndə, cavab işarəsi həmin sualın mövcud variantlarından biri olanda və AI əminliyi ən azı 95% olanda dəqiq uyğunluq təklifi kimi göstərilməlidir; AI heç bir cavabı özü yazmamalı, admin təsdiqi tələb olunmalıdır.
- [x] İl/sual nömrəsi çatışmayan, AI əminliyi 95%-dən aşağı, variant işarəsi uyğun olmayan, birdən çox sualla uyğun gələn və ya mövcud cavab açarı ilə ziddiyyət yaradan sətirlər avtomatik tətbiq edilməməli, ayrıca admin yoxlanışında göstərilməlidir.
- [x] Cavab açarı PDF-i, orijinal fayl adı və səhifə istinadı məlumat bazasında saxlanmalı; təsdiqlənmiş cavabda etibarlı mənbə kimi görünməlidir.
- [x] Bu import və cavab təsdiqi yalnız konfiqurasiya olunmuş admin üçün açıq olmalı; cavab açarı public API-dən sızmamalı və test bitənədək gizli qalmalıdır.

Yekun yoxlama: `pnpm check`, `pnpm build`, health/route manifest və icazəsiz upload/private PDF üçün HTTP 401 yoxlamaları keçdi; `pnpm test` — 9 faylda 51 test keçdi. Canlı Gemini cavab açarı PDF importu aparılmadı; bu sessiyada nümunə PDF təqdim edilməyib.


## 16. Cavab açarının test tamamlanana qədər gizli qalması

- [x] Test başlayanda server həmin testin tam sual siyahısına bağlı, müddəti bitən server sessiyası yaratmalıdır.
- [x] Nəticə endpoint-i yalnız həmin sessiyanın bütün sual identifikatorları üzrə seçim (variant və ya boş cavab) göndərilib test bitdikdə cavab açarını qaytarmalı; sessiyasız, natamam, təkrar istifadə edilmiş, sual siyahısı dəyişmiş və ya başqa suallı cəhd rədd edilməl.
- [x] Public sual və test API-ləri test başlamazdan və bitməzdən əvvəl nə düzgün variantı, nə də cavab açarının mövcudluğu barədə məlumatı açıqlamalıdır.

Yekun yoxlama: `practiceSessions` cədvəli shared DB-yə yalnız yeni cədvəl kimi əlavə edildi; public redaction, tam sual dəsti, müddətin bitməsi və birdəfəlik istifadə kod/test ilə yoxlanıldı.
