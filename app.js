// ============================================================
// SEYDİŞEHİR İTFAİYESİ - İCAP TAKİP SİSTEMİ (Kurumsal Arayüz)
// ============================================================

const IKN_YANGIN = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/yangin.png';
const IKN_KURTARMA = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/kask.png';
const IKN_DIGER = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/dalgic.png';

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  const hedef = document.getElementById(id);
  if (hedef) hedef.classList.add('aktif');
}

window.onerror = function (msg, url, line) {
  console.error("SİSTEM HATASI: " + msg + "\nSatır: " + line);
  return false;
};

const SUPABASE_URL = "https://avrdeswpdubsonijbajt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cmRlc3dwZHVic29uaWpiYWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjMzODEsImV4cCI6MjEwODY5OTM4MX0.2bnmnhjk6g3fS9zEOda552GZpZ6TjY0889pd9DT6zl4";

let sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) {}

const KARA_LISTE = ['123456','111111','000000','654321','123123','121212','112233','123321','111222','222333','123654','147258','159753','987654','999999','000111','123789','456123'];
let mevcutPersonel = null;
let sistemAyar = { aktif_vardiya: 1 };
let realtimeKanal = null;
let anlikKalanBakiye = 0; // izin formu için: kalan izin DAKİKASI (onay bekleyenler düşülmüş)

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sureYaz(dk) { dk = Math.abs(dk || 0); return `${Math.floor(dk / 60)}s ${dk % 60}dk`; }
function saatYaz(t) { return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
function tarihYaz(t) { return new Date(t).toLocaleDateString('tr-TR'); }
function rolAd(rol) {
  const m = { itfaiye_eri: 'İtfaiye Eri', itfaiye_soforu: 'İtfaiye Şoförü', vardiya_cavusu: 'Vardiya Çavuşu', grup_amiri: 'Grup Amiri', gunduz_85: 'Gündüz 8/5', gunduz_816: 'Gündüz 8/16', super_admin: 'Süper Admin' };
  return m[rol] || rol;
}
function rolRozet(rol) {
  const renk = { itfaiye_eri: 'r-mavi', itfaiye_soforu: 'r-turuncu', vardiya_cavusu: 'r-mor', grup_amiri: 'r-kirmizi', super_admin: 'r-kirmizi' }[rol] || 'r-gri';
  return `<span class="rozet ${renk}">${esc(rolAd(rol))}</span>`;
}
function baslikHtml(simge, metin, sag = '') {
  return `<div class="kart-baslik"><div class="kart-baslik-simge">${simge}</div>${metin}${sag ? `<div class="sag">${sag}</div>` : ''}</div>`;
}

// ---------- HESAPLAMALAR ----------

function kadroAd(kadro) { return kadro === 'isci' ? 'İşçi' : kadro === 'memur' ? 'Memur' : 'Kadro Seçilmemiş'; }
function kadroRozet(kadro) {
  const renk = kadro === 'isci' ? 'r-turuncu' : kadro === 'memur' ? 'r-mavi' : 'r-gri';
  return `<span class="rozet ${renk}">${kadroAd(kadro)}</span>`;
}
// Hesap/kullandırım kuralı: işçi ve (MEMUR_DA_FORMUL açıksa) memur aynı formülü kullanır
const isIsci = kadro => ISCI_FORMUL && (MEMUR_DA_FORMUL || kadro === 'isci');

// Dakikayı "X Saat Y Dk" yazar (işaretli)
function dkYaz(dk) {
  dk = Math.round(dk || 0);
  const isaret = dk < 0 ? '−' : '';
  dk = Math.abs(dk);
  const s = Math.floor(dk / 60), m = dk % 60;
  let res = '';
  if (s > 0) res += `${s} Saat `;
  if (m > 0) res += `${m} Dk`;
  return isaret + (res.trim() || '0 Dk');
}
function saatYazGun(saat) { return dkYaz((saat || 0) * 60); }
function sayiTr(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
function gunYaz(g) {
  g = Math.round((g || 0) * 100) / 100;
  return `${g < 0 ? '−' : ''}${sayiTr(Math.abs(g))} gün`;
}

// ---------- İCAP İZNİ KURALI (İşçi + Memur) ----------
// İŞÇİ: 14 saat 10 dakika icap görevini tamamlayan personele 24 saat (1 nöbet günü) izin. MEMUR: 1'e 1 (MEMUR_DA_FORMUL = false).
// Formül karşılığı: (Saat × 1,6) / 7,5 = gün; 14 sa 10 dk ≈ 3 gün ve 3 gün = 24 saat (her gün 8 saat izin).
// Eşik DAİRE BAŞKANLIĞININ BELİRTTİĞİ 14 sa 10 dk (850 dk) alınır; ara değerler orantılı: 850 / 3 = 283,33 dk = 8 saat izin.
// Eşiği değiştirmek için yalnızca TAM_GUN_ICAP_DK değerini değiştirmek yeterlidir.
// Hesap tam sayı aritmetiğiyle yapılır; gün, toplam icap üzerinden aşağı yuvarlanır.
// Memur için de aynı kural uygulansın mı? false = memur 1'e 1
// ISCI_FORMUL = false → işçi de memur gibi 1'e 1 çalışır: 24 saat icap = 24 saat izin (hak edilen izin = icap süresi, izin saat cinsinden talep edilir).
// 14 saat 10 dakika (850 dk) yalnızca evrak/dilekçede görünen resmî rakamdır, program hesabında kullanılmaz.
// Eski formüle (14 sa 10 dk = 24 saat izin) dönmek için true yapın.
const ISCI_FORMUL = false;
const MEMUR_DA_FORMUL = false; // memur: 1 saat icap = 1 saat izin (24 saat icap → 24 saat izin hakkı, kullanınca 24 saat düşer); işçi: 14 sa 10 dk → 24 saat
const IZIN_GUN_DK = 24 * 60;          // 1 tam izin günü = 24 saatlik nöbet günü
const ISCI_IS_GUNU_DK = 8 * 60;       // her "gün" = 8 saat izin
const TAM_GUN_ICAP_DK = 850;          // 24 saat izin için gereken icap: 14 saat 10 dakika
const ISCI_GUN_ICAP_DK = TAM_GUN_ICAP_DK / 3;      // 8 saat izin için gereken icap = 283,33 dk
const ISCI_TAM_GUN_ICAP_DK = TAM_GUN_ICAP_DK;
function iscideGunHak(toplamDk) { return Math.floor(Math.round((toplamDk || 0) * 3) / TAM_GUN_ICAP_DK); }
function icapGunKatki(dk) { return (dk || 0) * 3 / TAM_GUN_ICAP_DK; } // tek icabın gün karşılığı (bilgi amaçlı)

// Dönüş: işçi → { isci:true, toplamDk, kullanilanDk, hakGun, hakDk, kalanDk, tamGun, sonrakiTamGunDk, ilerleme }
//        memur → { isci:false, toplamDk, kullanilanDk, kalanDk }
// İcap bakiyeleri YILLIK'tır: her yıl 1 Ocak'ta sıfırlanır, bir sonraki yıla devretmez.
// Bir icap, BAŞLADIĞI yıla; bir izin, İZİN TARİHİNİN yılına sayılır.
const bakiyeYili = () => new Date().getFullYear();
const yilOf = z => (typeof z === 'string' && /^\d{4}-/.test(z)) ? parseInt(z.slice(0, 4), 10) : new Date(z).getFullYear();
function bakiyeHesapla(icaplar, izinler, kadro, yil = bakiyeYili()) {
  icaplar = (icaplar || []).filter(k => yilOf(k.baslama_zamani) === yil);
  izinler = (izinler || []).filter(x => yilOf(x.izin_tarihi) === yil);
  const toplamDk = (icaplar || []).reduce((s, k) => s + (k.toplam_dakika || 0), 0);
  const kullanilanDk = (izinler || []).reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0);
  if (isIsci(kadro) || MEMUR_DA_FORMUL) {
    const hakGun = iscideGunHak(toplamDk);
    const hakDk = hakGun * ISCI_IS_GUNU_DK;
    const kalanDk = hakDk - kullanilanDk;
    const tamGun = Math.max(0, Math.floor(kalanDk / IZIN_GUN_DK));
    // Bir sonraki 24 saatlik izin günü için kaç formül günü (8 saat) daha gerekiyor?
    const artik = ((kalanDk % IZIN_GUN_DK) + IZIN_GUN_DK) % IZIN_GUN_DK;
    const gerekliGun = (IZIN_GUN_DK - artik) / ISCI_IS_GUNU_DK;
    const sonrakiTamGunDk = Math.max(0, (hakGun + gerekliGun) * ISCI_GUN_ICAP_DK - toplamDk);
    const ilerleme = Math.max(0, Math.min(1, 1 - sonrakiTamGunDk / (gerekliGun === 3 ? ISCI_TAM_GUN_ICAP_DK : Math.max(gerekliGun, 1) * ISCI_GUN_ICAP_DK)));
    return { isci: true, toplamDk, kullanilanDk, hakGun, hakDk, kalanDk, tamGun, sonrakiTamGunDk, ilerleme };
  }
  return { isci: false, toplamDk, kullanilanDk, kalanDk: toplamDk - kullanilanDk };
}
const bakiyeEksiMi = b => b.kalanDk < 0;
// Memur ve işçi AYNI kuralla çalışır: hak 1'e 1 hesaplanır, izin yalnızca 24 saatlik tam gün (24-48-72 saat...) periyotlarla talep edilir.
const izinGunluk = kadro => true;

function bakiyeDokumHtml(b, kadro, kompakt = false) {
  const eksi = bakiyeEksiMi(b);
  const hakDk = b.isci ? b.hakDk : b.toplamDk;           // hak edilen izin (dakika)
  const gunluk = izinGunluk(kadro);
  const tamGun = b.isci ? b.tamGun : Math.max(0, Math.floor(b.kalanDk / IZIN_GUN_DK));
  const sonrakiTamGunDk = b.isci ? b.sonrakiTamGunDk : (b.kalanDk < 0 ? IZIN_GUN_DK - b.kalanDk : IZIN_GUN_DK - (b.kalanDk % IZIN_GUN_DK));
  const uyari = !kadro ? `<div class="uyari" style="margin-top:10px">⚠️ <span>Kadronuz (memur/işçi) seçilmemiş. Yöneticinize bildirin.</span></div>` : '';
  const aciklama = (metin) => `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--blue)">Nasıl hesaplanır?</summary><div style="font-size:12.5px;line-height:1.55;color:var(--text);margin-top:8px">${metin}</div></details>`;

  if (kompakt) {
    return `<div class="dokum"><div class="dokum-satir kalan ${eksi ? 'eksi' : ''}"><span>Kalan izin</span><b>${dkYaz(b.kalanDk)}</b></div></div>`;
  }
  const hesapMetin = b.isci
    ? `Daire başkanlığı uygulaması: <b>14 saat 10 dakika icap görevini tamamlayan personele 24 saat izin</b> verilir.<br>Ara süreler orantılıdır: her 4 saat 43 dakika icap = 8 saat izin. İzin 24 saatlik tam gün olarak kullanılır.`
    : (gunluk ? `<b>24 saat icap = 24 saat izin</b> hakkı doğar. İzin <b>24 saatlik periyotlar</b> halinde (24 - 48 - 72 saat…) talep edilir; talep için en az 24 saatlik icap bakiyesi gerekir.` : `İcap süreniz kadar izin kullanırsınız: <b>1 saat icap = 1 saat izin</b> (24 saat icap = 24 saat izin).`);
  return `<div class="dokum">
      <div class="dokum-satir"><span>İcap Saati</span><b>${dkYaz(b.toplamDk)}</b></div>
      <div class="dokum-satir eksi"><span>Kullanılan İzin</span><b>${dkYaz(b.kullanilanDk)}</b></div>
      <div class="dokum-satir kalan ${eksi ? 'eksi' : ''}"><span>Kalan İzin</span><b>${dkYaz(b.kalanDk)}</b></div>
    </div>
    ${gunluk ? `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
      ${tamGun > 0 ? `<div style="display:flex;align-items:center;gap:12px;background:#e8f6ee;border:1px solid #bfe3cd;border-radius:12px;padding:12px 14px">
        <div style="font-size:22px">✅</div>
        <div><div style="font-size:11px;font-weight:800;letter-spacing:.06em;color:#2f7d4f">KULLANILABİLİR İZİN</div>
        <div style="font-size:16px;font-weight:800;color:#1c5a37">${tamGun} tam gün (${tamGun * 24} saat)</div></div></div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;background:#fff8ea;border:1px solid #f1dcae;border-radius:12px;padding:12px 14px">
        <div style="font-size:22px">⏳</div>
        <div><div style="font-size:11px;font-weight:800;letter-spacing:.06em;color:#9a6a12">${tamGun > 0 ? 'SONRAKİ 24 SAATLİK İZNE KALAN İCAP' : '24 SAATLİK İZNE KALAN İCAP'}</div>
        <div style="font-size:18px;font-weight:800;color:#6b4708">${dkYaz(sonrakiTamGunDk)}</div></div></div>
    </div>` : ''}
    <div style="margin-top:10px"><span class="rozet r-mavi">${MEMUR_DA_FORMUL ? 'İşçi / Memur' : kadroAd(kadro)}</span></div>
    ${aciklama(hesapMetin + `<br><br>İcap bakiyeleri <b>her yıl 1 Ocak'ta sıfırlanır</b>, bir sonraki yıla devretmez. (Şu an: ${bakiyeYili()} yılı bakiyesi)`)}${uyari}`;
}

function toast(msg, tip = 'hata') {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.style.background = tip === 'hata' ? '#9a0c23' : '#12805c';
  t.classList.add('gorunur');
  setTimeout(() => t.classList.remove('gorunur'), 3000);
}

// ---------- LOG ----------
async function logEkle(islem, aciklama = "") {
  if (!mevcutPersonel) return;
  try {
    const { error } = await sb.from('log_kayitlari').insert([{
      personel_id: mevcutPersonel.id,
      ad_soyad_snapshot: mevcutPersonel.ad_soyad,
      islem: islem,
      aciklama: aciklama
    }]);
    if (error) { console.error("Log Eklenemedi:", error.message); if (!window.__logUyarildi) { window.__logUyarildi = true; toast("Sistem hareketi kaydedilemedi: " + error.message); } }
  } catch (e) { console.error("Log Hatası:", e); }
}

// ---------- GİRİŞ & KAYIT ----------
document.getElementById('girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('girisEmail').value.trim().toLowerCase();
  const sifre = document.getElementById('girisSifre').value;
  document.getElementById('girisHata').innerText = 'Giriş yapılıyor...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: sifre });
  if (error) document.getElementById('girisHata').innerText = "Hatalı e-posta veya şifre!";
  else oturumBaslat(data.user);
});

document.getElementById('kayitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('kayitEmail').value.trim().toLowerCase();
  const sifre = document.getElementById('kayitSifre').value;
  const hataEl = document.getElementById('kayitHata');
  hataEl.innerText = '';
  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  hataEl.innerText = 'Kontrol ediliyor...';
  const { data: personel } = await sb.from('personel').select('id, auth_user_id').ilike('email', email.replace(/[\\%_]/g, m => '\\' + m)).maybeSingle();
  if (!personel) return hataEl.innerText = "Bu e-posta sistemde kayıtlı değil. Yöneticinize başvurun.";
  if (personel.auth_user_id) return hataEl.innerText = "Bu hesap zaten oluşturulmuş.";

  const { error } = await sb.auth.signUp({ email, password: sifre });
  if (error) {
    if (/already registered/i.test(error.message || '')) {
      // Bu e-posta ile daha önce giriş hesabı açılmış (örn. kayıt yarım kalmış): aynı şifreyle girip personel kaydına bağla
      const { data: g, error: gHata } = await sb.auth.signInWithPassword({ email, password: sifre });
      if (gHata || !g?.user) return hataEl.innerText = "Bu e-posta ile daha önce hesap açılmış. Önceki 6 haneli şifrenizle giriş yapın; hatırlamıyorsanız yöneticiden hesabınızın sıfırlanmasını isteyin.";
      const { error: bagHata } = await sb.rpc('hesabi_bagla');
      if (bagHata) return hataEl.innerText = "Hesap bağlanamadı (yönetici SQL güncellemesini çalıştırmalı): " + bagHata.message;
      return oturumBaslat(g.user);
    }
    return hataEl.innerText = "Kayıt hatası: " + error.message;
  }

  const { data: loginData } = await sb.auth.signInWithPassword({ email, password: sifre });
  if (loginData) oturumBaslat(loginData.user);
});

// ---------- OTURUM ----------
async function oturumBaslat(user) {
  const { data } = await sb.from('personel').select('*').eq('auth_user_id', user.id).single();
  if (!data) { alert("Personel kaydınız bulunamadı!"); return cikisYap(); }

  mevcutPersonel = data;
  const { data: ayar } = await sb.from('sistem_ayarlari').select('*').eq('id', 1).single();
  if (ayar) sistemAyar = ayar;

  document.getElementById('ustIsim').innerText = mevcutPersonel.ad_soyad;
  document.getElementById('ustRol').innerText = rolAd(mevcutPersonel.rol).toUpperCase();
  document.getElementById('ustVardiya').innerHTML = `<b class="ust-ad">${esc(mevcutPersonel.ad_soyad)} · </b><span class="ust-vrd">${mevcutPersonel.vardiya ? mevcutPersonel.vardiya + '. Vardiya' : 'Gündüz Personeli'}</span>`;
  const bas = mevcutPersonel.ad_soyad.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('ustAvatar').innerText = bas || '–';

  ekranDegistir('ekranUygulama');
  panelYukle();
  realtimeBaslat();
}

async function cikisYap() {
  if (realtimeKanal) await sb.removeChannel(realtimeKanal);
  await sb.auth.signOut();
  mevcutPersonel = null;
  document.title = 'Seydişehir İtfaiyesi - İcap Takip'; // Başlığı sıfırla
  ekranDegistir('ekranGiris');
}

function realtimeBaslat() {
  if (realtimeKanal) sb.removeChannel(realtimeKanal);
  realtimeKanal = sb.channel('icap-degisim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'icap_gorevleri' }, () => panelYukle())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hazir_icapcilar' }, () => panelYukle())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'log_kayitlari' }, () => panelYukle())
    .subscribe();
}

// ---------- İCAP AŞAMALARI: YOLDA → İSTASYONDA ----------
// Personel "İcap Görevini Başlat"a basınca yola çıkar (yolda); istasyona varınca "İstasyondayım"a basar (aktif icap görevli).
// istasyona_varis_zamani boşsa personel yoldadır. Sütun veritabanında henüz yoksa eski davranış korunur (herkes istasyonda sayılır).
function varisKolonuVar(liste) { return !liste || liste.length === 0 || ('istasyona_varis_zamani' in liste[0]); }
function istasyondaMi(a, kolonVar) { return !kolonVar || !!a.istasyona_varis_zamani; }
function aktifSatirHtml(a, durum, sureGizle = false) {
  const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
  const ad = a.personel?.ad_soyad || '';
  const bas = ad.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const yolda = durum === 'yolda';
  const durumRozet = yolda
    ? '<span class="rozet r-turuncu" style="font-size:13px;padding:5px 12px;font-weight:800"><span style="font-size:16px;vertical-align:-1px">🚗</span> Yolda</span>'
    : '';
  const saatler = `<span class="aktif-saat">Başlama ${saatYaz(a.baslama_zamani)}${!yolda && a.istasyona_varis_zamani ? ' · Varış ' + saatYaz(a.istasyona_varis_zamani) : ''}</span>`;
  const meta = [rolAd(a.personel?.rol), a.gorev_aciklamasi].filter(Boolean).map(esc).join(' · ');
  return `<div class="aktif-satir${yolda ? '' : ' ist'}">
        <div class="aktif-avatar">${esc(bas)}</div>
        <div class="aktif-bilgi">
          <div class="aktif-isim">${esc(ad)}</div>
          <div class="aktif-meta">${meta}</div>
          <div class="aktif-alt">${durumRozet}${saatler}</div>
        </div>
        ${sureGizle ? '' : `<span class="rozet r-yesil aktif-sure" data-baslama="${esc(a.baslama_zamani)}">${sureYaz(dk)}</span>`}
      </div>`;
}

// ---------- ANA PANEL ----------
async function panelYukle() {
  if (!mevcutPersonel) return;

  const { data: aktifler } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  const kolonVar = varisKolonuVar(aktifler);
  const istasyondakiler = (aktifler || []).filter(a => istasyondaMi(a, kolonVar));
  document.getElementById('aktifIcapSayisi').innerText = istasyondakiler.length;
  const aktifPano = document.getElementById('aktifIcapPano');
  if (aktifPano) aktifPano.style.display = istasyondakiler.length > 0 ? 'flex' : 'none';
  
  try {
    const { data: ayarTaze } = await sb.from('sistem_ayarlari').select('*').eq('id', 1).single();
    if (ayarTaze) sistemAyar = ayarTaze;
  } catch (e) {}
  document.getElementById('kpiVardiya').innerText = (sistemAyar.aktif_vardiya || '–') + '. Vardiya';
  nobetCiz();

  let aHtml = '';
  if (istasyondakiler.length > 0) {
    aHtml = `<div class="aktif-liste kompakt">${istasyondakiler.map(a => aktifSatirHtml(a, 'istasyonda')).join('')}</div>`;
  } else { aHtml = '<div class="bos">Şu an istasyonda icap görevli personel yok.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  let hazirHam = null;
  try {
    const r = await sb.rpc('hazir_icapci_listesi');   // tüm personelin ekipleri adlarıyla görebilmesi için (SQL güncellemesi)
    if (!r.error && Array.isArray(r.data)) hazirHam = r.data.map(h => ({ ...h, er: { ad_soyad: h.er_ad }, sofor: { ad_soyad: h.sofor_ad } }));
  } catch (e) { hazirHam = null; }
  if (!hazirHam) ({ data: hazirHam } = await sb.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString()));

  const hazirlar = (hazirHam || []).filter(h => h.vardiya !== sistemAyar.aktif_vardiya);
  const bayatlar = (hazirHam || []).filter(h => h.vardiya === sistemAyar.aktif_vardiya);
  if (bayatlar.length > 0 && ['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(mevcutPersonel.rol)) {
    sb.from('hazir_icapcilar').update({ durum: 'iptal' }).in('id', bayatlar.map(b => b.id)).then(() => {});
  }

  const { data: icapGecmis } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('baslama_zamani', { ascending: false });
  const { data: bekleyenIcaplarim } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onay_bekliyor').order('baslama_zamani', { ascending: false });
  const { data: izinGecmis } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('izin_tarihi', { ascending: false });

  const bakiye = bakiyeHesapla(icapGecmis, izinGecmis, mevcutPersonel.kadro);

  const tumGecmis = [];
  if (icapGecmis) icapGecmis.forEach(g => {
      tumGecmis.push({ tip: 'icap', tarih: g.baslama_zamani, data: g });
  });
  if (izinGecmis) izinGecmis.forEach(g => {
      tumGecmis.push({ tip: 'izin', tarih: g.izin_tarihi + 'T00:00:00', data: g });
  });
  tumGecmis.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));

  let gecmisHtml = '';
  if (tumGecmis.length > 0) {
    let rows = '';
    tumGecmis.forEach(x => {
      if (x.tip === 'icap') {
        let sureHtml = `<div style="font-weight:800; font-size:13px; color:var(--text);">${dkYaz(x.data.toplam_dakika)}</div>`;

        rows += `<tr>
          <td><span class="rozet r-yesil">İcap</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.baslama_zamani)}</div><div class="hucre-alt">${saatYaz(x.data.baslama_zamani)} - ${saatYaz(x.data.bitis_zamani)}${x.data.gorev_aciklamasi ? ' · ' + esc(x.data.gorev_aciklamasi) : ''}</div></td>
          <td class="sag">${sureHtml}</td></tr>`;
      } else {
        rows += `<tr>
          <td><span class="rozet r-mor">İzin</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.izin_tarihi)}</div><div class="hucre-alt">${esc(x.data.aciklama || 'İzin kullanımı')}</div>${mevcutPersonel.kadro === 'memur' ? `<button type="button" class="cizelge-btn" onclick="izinCizelgeIndir('${x.data.id}')">📄 Mesai Çizelgesi (Excel)</button>` : ''}</td>
          <td class="sag eksi">-${izinGunluk(mevcutPersonel.kadro) ? gunYaz(x.data.talep_edilen_dakika / IZIN_GUN_DK) : dkYaz(x.data.talep_edilen_dakika)}</td></tr>`;
      }
    });
    
    if(rows){
        gecmisHtml = `<div class="tbl-wrap scroll" style="margin-top:16px;"><table class="tbl" style="min-width:0"><thead><tr><th>Tür</th><th>Detay</th><th class="sag">Süre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else { gecmisHtml = ''; }
  } else { gecmisHtml = ''; }

  // Henüz onaylanmamış icaplar: bakiyeye onaydan sonra eklenir
  let bekleyenHtml = '';
  if (bekleyenIcaplarim && bekleyenIcaplarim.length) {
    const toplamBekleyen = bekleyenIcaplarim.reduce((t, g) => t + (g.toplam_dakika || 0), 0);
    const satirlar = bekleyenIcaplarim.map(g => `<tr>
        <td><div class="hucre-isim">${tarihYaz(g.baslama_zamani)}</div><div class="hucre-alt">${saatYaz(g.baslama_zamani)} - ${g.bitis_zamani ? saatYaz(g.bitis_zamani) : ''}${g.gorev_aciklamasi ? ' · ' + esc(g.gorev_aciklamasi) : ''}</div></td>
        <td class="sag"><div style="font-weight:800;font-size:13px">${dkYaz(g.toplam_dakika)}</div></td></tr>`).join('');
    bekleyenHtml = `<div style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <b style="font-size:14px">⏳ Onay Bekleyen İcaplarım</b><span class="rozet r-turuncu">${bekleyenIcaplarim.length} icap · ${dkYaz(toplamBekleyen)}</span>
      </div>
      <div class="hucre-alt" style="margin-bottom:6px">Amiriniz onayladığında bakiyenize eklenir.</div>
      <div class="tbl-wrap scroll"><table class="tbl" style="min-width:0"><thead><tr><th>İcap</th><th class="sag">Süre</th></tr></thead><tbody>${satirlar}</tbody></table></div>
    </div>`;
  }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="kart">
      ${baslikHtml('💼', 'İcap Bakiyem')}
      ${bakiyeDokumHtml(bakiye, mevcutPersonel.kadro)}
      ${bekleyenHtml}
      ${gecmisHtml}
    </div>`;

  await rolIcerikCiz(aktifler, hazirlar);

  let logHtml = '';
  try {
    const { data: loglar, error: logHata } = await sb.from('log_kayitlari').select('*').order('ne_zaman', { ascending: false }).limit(10);
    if (logHata) { console.error('Log okunamadı:', logHata.message); logHtml = `<div class="bos">Loglar okunamadı: ${esc(logHata.message)}</div>`; }
    else if (loglar && loglar.length > 0) {
      loglar.forEach(l => {
        logHtml += `<div class="log-item"><div class="log-nokta"></div><div>
          <div><strong>${esc(l.ad_soyad_snapshot)}</strong> · <span class="log-islem">${esc(l.islem)}</span></div>
          <div class="log-zaman">${tarihYaz(l.ne_zaman)} ${saatYaz(l.ne_zaman)}${l.aciklama ? ' · ' + esc(l.aciklama) : ''}</div>
        </div></div>`;
      });
    } else { logHtml = '<div class="bos">Henüz sistem hareketi yok.</div>'; }
  } catch (err) { logHtml = '<div class="bos">Loglar yüklenemedi.</div>'; }

  const logKutu = document.getElementById('logPenceresi');
  if (logKutu) {
    logKutu.innerHTML = `${baslikHtml('📜', 'Sistem Hareketleri')}<div class="scroll">${logHtml}</div>`;
  }
  panelYenile();
}

// ---------- ROL BAZLI İÇERİK ----------
async function rolIcerikCiz(aktifler, hazirlar) {
  const el = document.getElementById('rolIcerik');
  const rol = mevcutPersonel.rol;
  let html = '';
  let bekleyenSayi = 0;
  let gorevHtml = '';

  const kendiAktif = aktifler?.find(a => a.personel_id === mevcutPersonel.id);

  // GRUP 1 — İcap Görevi Başlatan Personel: yola çıkıp henüz istasyona varmamış personel (+ kendi icap kontrollerim)
  const kolonVar = varisKolonuVar(aktifler);
  const yoldakiler = (aktifler || []).filter(a => !istasyondaMi(a, kolonVar));
  let baslatanHtml = '';
  if (yoldakiler.length > 0 || kendiAktif) {
    const kendiVardi = kendiAktif ? istasyondaMi(kendiAktif, kolonVar) : false;
    // Yalnızca yoldakiler listelenir; istasyona varanlar aşağıdaki "Aktif İcap Görevindeki Personel" panosunda görünür (tekrar yok)
    const kendiRows = yoldakiler.map(a => aktifSatirHtml(a, 'yolda', !!kendiAktif && a.id === kendiAktif.id)).join('');
    const sadeceKendim = kendiAktif && kendiVardi && yoldakiler.length === 0;
    let kontrol = '';
    if (kendiAktif) {
      const sayacStil = kendiVardi ? ' style="font-size:38px;margin:6px 0 10px"' : '';
      const banner = kendiVardi
        ? `<div style="background:#e3f6ec;border:1px solid #9fd8b9;color:#17653f;border-radius:12px;padding:12px 14px;font-size:15px;font-weight:800;text-align:center;margin-bottom:12px;line-height:1.4">✅ İstasyondasınız<br><span style="font-weight:600;font-size:13.5px">Aktif icap görevlisi olarak listelendiniz</span></div>`
        : `<div style="background:#fff3d6;border:1px solid #f1c453;color:#7a4b00;border-radius:12px;padding:12px 14px;font-size:15px;font-weight:800;text-align:center;margin-bottom:12px;line-height:1.45"><span style="font-size:20px;vertical-align:-2px">🚗</span> İstasyona gidiyorsunuz<br><span style="font-weight:600;font-size:14px">Vardığınızda “İstasyondayım” butonuna basın</span></div>`;
      kontrol = `<div class="zaman"${sayacStil} data-baslama="${esc(kendiAktif.baslama_zamani)}">00:00:00</div>
        ${banner}
        ${kendiVardi || !kolonVar ? '' : `<button type="button" class="icap-baslat" onclick="istasyondayim('${kendiAktif.id}')" style="margin-bottom:10px">📍 İSTASYONDAYIM</button>`}
        <button type="button" class="icap-bitir" onclick="icapBitir('${kendiAktif.id}')">⏹ İCAP GÖREVİNİ BİTİR</button>
        <details class="manuel-kutu" id="mbDetay">
          <summary><span class="manuel-simge">🕒</span><span class="manuel-baslik">Bitiş Saatini Manuel Gir</span><span class="manuel-ok">⌄</span></summary>
          <div class="manuel-ic">
            <div class="manuel-not">Başlama: ${esc(tarihYaz(kendiAktif.baslama_zamani))} ${esc(saatYaz(kendiAktif.baslama_zamani))}. Görevin gerçekte bittiği zamanı seçin.</div>
            <div class="manuel-grup"><div class="manuel-grup-baslik">BİTİŞ</div>
              <div class="manuel-satir">
                <label><span>Tarih</span>${tarihInputHtml('mbGun', `manuelBitisOzet('${kendiAktif.id}')`)}</label>
                <label><span>Saat</span><input type="time" id="mbSaat" step="60" onchange="manuelBitisOzet('${kendiAktif.id}')"></label>
              </div>
            </div>
            <div class="manuel-ozet" id="mbOzet">Bitiş saatini seçin.</div>
            <button type="button" class="icap-bitir manuel-kaydet-bitir" onclick="icapBitirManuel('${kendiAktif.id}')">⏹ BU SAATTE BİTİR</button>
          </div>
        </details>`;
    }
    const baslik = sadeceKendim ? 'İcap Göreviniz Devam Ediyor' : 'İcap Görevi Başlatan Personel';
    const alt = sadeceKendim ? `İstasyondasınız · Başlama ${saatYaz(kendiAktif.baslama_zamani)}` : `${yoldakiler.length} personel yolda`;
    baslatanHtml = `<div class="icap-kart aktif-gorev">
      <div class="icap-ust"><div class="icap-ikon yesil"><span class="canli"></span></div>
        <div><div class="icap-baslik">${baslik}</div><div class="icap-alt">${alt}</div></div></div>
      ${kendiRows ? `<div class="aktif-liste" style="margin:4px 0 12px;color:#0f172a">${kendiRows}</div>` : ''}
      ${kontrol}
    </div>`;
  }
  if (kendiAktif) {
    // Kendi icap kartı aşağıda "İcap Görevi Başlatan Personel" grubunda gösterilir
  } else {
    let baslatabilir = true; let uyari = "";
    const suAn = new Date(); const gun = suAn.getDay(); const saat = suAn.getHours();
    if (rol === 'gunduz_85') {
      if (gun >= 1 && gun <= 5 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz (08:00-17:00)."; }
    } else if (rol === 'gunduz_816') {
      if (gun !== 4 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz. Perşembe tam gün icaplısınız."; }
    } else if (mevcutPersonel.vardiya) {
      if (mevcutPersonel.vardiya === sistemAyar.aktif_vardiya) { baslatabilir = false; uyari = "Şu an nöbetçi vardiyadasınız. Asli görevinizdesiniz."; }
    }
    
    const hizliGorevler = [
      { metin: 'Yangın', resim: IKN_YANGIN, emoji: '🔥' },
      { metin: 'Arama Kurtarma', resim: IKN_KURTARMA, emoji: '🆘' },
      { metin: 'Diğer Görevler', resim: IKN_DIGER, emoji: '🚰' }
    ];

    gorevHtml += `<div class="icap-kart ${!baslatabilir ? 'kilitli' : ''}">
      <div class="icap-ust"><div class="icap-ikon">🚨</div>
        <div class="icap-ust-metin"><div class="icap-baslik">Yeni İcap Görevi</div><div class="icap-alt">Görev türünü seçin, tek dokunuşla başlatın</div></div>
        <span class="durum-pil ${baslatabilir ? 'hazir' : 'kilit'}">${baslatabilir ? '● HAZIR' : '🔒 KİLİTLİ'}</span></div>
      ${!baslatabilir ? `<div class="uyari">⚠️ <span>${esc(uyari)}</span></div>` : ''}
      <div class="adim-etiket">GÖREV TÜRÜ</div>
      <div class="hizli-sec">
        ${hizliGorevler.map(h => `
          <button type="button" class="hizli-btn" data-metin="${h.metin}" ${!baslatabilir ? 'disabled' : ''} onclick="hizliAciklama(this)">
            <img src="${h.resim}" alt="${h.metin}" onerror="this.style.display='none'; this.nextElementSibling.style.fontSize='36px'; this.nextElementSibling.innerText = '${h.emoji}';">
            <span>${h.metin}</span>
          </button>`).join('')}
      </div>
      <div class="adim-etiket">AÇIKLAMA</div>
      <textarea id="gorevAciklama" rows="2" placeholder="Açıklama (isteğe bağlı) — örn: Mahalle, adres..." ${!baslatabilir ? 'disabled' : ''}></textarea>
      <button type="button" class="icap-baslat" onclick="icapBaslat()" ${!baslatabilir ? 'disabled' : ''}>▶ İCAP GÖREVİNİ BAŞLAT</button>
      <details class="manuel-kutu" id="mnDetay">
        <summary><span class="manuel-simge">🕒</span><span class="manuel-baslik">Manuel İcap Girişi</span><span class="manuel-ok">⌄</span></summary>
        <div class="manuel-ic">
          <div class="manuel-not">İcap görevini panelden başlatmayı unutursanız manuel giriş panelinden başlama ve bitiş tarih ve saatlerini girebilirsiniz. Kaydedilen bilgiler onaya gider.</div>
          <div class="manuel-grup"><div class="manuel-grup-baslik">BAŞLAMA</div>
            <div class="manuel-satir">
              <label><span>Tarih</span>${tarihInputHtml('mnGunB', 'manuelOzetGuncelle()')}</label>
              <label><span>Saat</span><input type="time" id="mnSaatB" step="60" onchange="manuelOzetGuncelle()"></label>
            </div>
          </div>
          <div class="manuel-grup"><div class="manuel-grup-baslik">BİTİŞ</div>
            <div class="manuel-satir">
              <label><span>Tarih</span>${tarihInputHtml('mnGunS', 'manuelOzetGuncelle()')}</label>
              <label><span>Saat</span><input type="time" id="mnSaatS" step="60" onchange="manuelOzetGuncelle()"></label>
            </div>
          </div>
          <div class="manuel-ozet" id="mnOzet">Başlama ve bitiş saatini seçin.</div>
          <button type="button" class="manuel-kaydet" onclick="icapManuelKaydet()">✓ MANUEL İCABI KAYDET</button>
        </div>
      </details>
    </div>`;
  }

  {
    // İcap Görevli Personel paneli: tüm personel görür (nöbetçi vardiya, çağrı yapılacak ekipleri bilmelidir).
    // Ekip seçme/düzenleme yalnızca nöbet dışı vardiyanın çavuşu ve yöneticilerdedir; diğerleri salt okunur görür.
    const yoneticiMi = ['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol);
    const nobetciCavus = rol === 'vardiya_cavusu' && mevcutPersonel.vardiya === sistemAyar.aktif_vardiya;
    const salt = !yoneticiMi || nobetciCavus;
    // Herkes tüm nöbet dışı vardiyaların ekiplerini görür; değiştirme/ekleme çavuşta yalnızca kendi vardiyası için açılır
    const ilgiliHazirlar = [...(hazirlar || [])].sort((x, y) => x.vardiya - y.vardiya);
    let secilenlerHtml = '';

    if (ilgiliHazirlar && ilgiliHazirlar.length > 0) {
      ilgiliHazirlar.forEach(h => {
        const erAd = h.er?.ad_soyad || 'Silinmiş Personel';
        const soforAd = h.sofor?.ad_soyad || 'Silinmiş Personel';
        
        secilenlerHtml += `<div class="ekip-kart v${h.vardiya}">
          <div class="ekip-rozet">${h.vardiya}<small>VARDİYA</small></div>
          <div class="ekip-uyeler">
            <div class="ekip-uye"><span class="ekip-uye-ikon">${IKON.er}</span><div><div class="ekip-uye-rol">İTFAİYE ERİ</div><div class="ekip-uye-ad">${esc(erAd)}</div></div></div>
            <div class="ekip-uye"><span class="ekip-uye-ikon">${IKON.sofor}</span><div><div class="ekip-uye-rol">İTFAİYE ŞOFÖRÜ</div><div class="ekip-uye-ad">${esc(soforAd)}</div></div></div>
          </div>
          ${rol === 'super_admin' ? `<div class="ekip-islem">
            <button type="button" class="ikon-btn" title="Düzenle" onclick="hazirIcapciModalAc(${h.vardiya})">${IKON.duzenle}</button>
            <button type="button" class="ikon-btn sil" title="Sil" onclick="icapciEkipSil('${h.id}')">${IKON.sil}</button>
          </div>` : ''}
        </div>`;
      });
    } else {
      secilenlerHtml = salt ? `<div class="ekip-bos">Henüz icap ekibi seçilmedi.</div>` : `<div class="ekip-bos">Henüz icap ekibi seçilmedi.<br>İstirahat dönemi için 1 Er ve 1 Şoför seçin.</div>`;
    }

    const ekipSayi = ilgiliHazirlar?.length || 0;
    gorevHtml += `<div class="kart ekip-panel">
      <div class="panel-ust"><div class="panel-ikon">${IKON.ekip}</div>
        <div class="panel-ust-metin"><div class="panel-baslik">İcap Görevli Personel</div><div class="panel-alt">Nöbet dışı vardiyaların icap ekipleri</div></div>
        ${ekipSayi > 0 ? `<span class="rozet r-yesil">${ekipSayi} ekip</span>` : ''}</div>
      ${secilenlerHtml}
      ${salt ? '' : `<button type="button" class="ekip-degistir" onclick="hazirIcapciModalAc()">${IKON.ekip}<span>${ekipSayi > 0 ? 'Görevli Personeli Değiştir' : 'Görevli Personel Seç'}</span></button>`}
    </div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let query = sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya, kadro)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    let { data: bekleyenler } = await query;
    // Vardiya çavuşu yalnızca Er/Şoför icaplarını onaylar; çavuş icaplarını (kendisininki dahil) Grup Amiri onaylar
    if (rol === 'vardiya_cavusu') bekleyenler = (bekleyenler || []).filter(b => b.personel?.rol !== 'vardiya_cavusu');
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenSayi += bekleyenler.length;
      bekleyenler.forEach(b => {
        let ekBilgi = '';
        const aralik = b.bitis_zamani ? `${tarihYaz(b.baslama_zamani)} ${saatYaz(b.baslama_zamani)} → ${tarihYaz(b.bitis_zamani)} ${saatYaz(b.bitis_zamani)}` : '';

        bHtml += `<div class="onay-item">
          <div class="onay-ust"><div><div class="hucre-isim">${esc(b.personel.ad_soyad)}</div><div class="hucre-alt">${esc(rolAd(b.personel.rol))} ${kadroRozet(b.personel.kadro)}</div>
            ${aralik ? `<div class="hucre-alt" style="margin-top:4px">${esc(aralik)}</div>` : ''}${b.gorev_aciklamasi ? `<div class="hucre-alt">${esc(b.gorev_aciklamasi)}</div>` : ''}</div>
            <div style="text-align:right"><span class="rozet r-turuncu">${dkYaz(b.toplam_dakika)}</span>${ekBilgi}</div></div>
          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'icap')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'icap')">✕ Reddet</button></div></div>`;
      });
    } else { bHtml = '<div class="bos">Onay bekleyen icap yok.</div>'; }
    html += `<div class="kart" id="onayIcapKart">${baslikHtml('⏳', 'Onay Bekleyen İcaplar', bekleyenler && bekleyenler.length ? `<span class="rozet r-turuncu">${bekleyenler.length}</span>` : '')}${bHtml}</div>`;

    let izinQuery = sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol, kadro)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') izinQuery = izinQuery.eq('personel.vardiya', mevcutPersonel.vardiya).eq('eksi_bakiye_mi', false);
    if (rol === 'grup_amiri' || rol === 'super_admin') izinQuery = izinQuery.or(`eksi_bakiye_mi.eq.true,personel.rol.in.(gunduz_85,gunduz_816)`);
    
    let { data: izinler } = await izinQuery;
    izinler = (izinler || []).filter(b => b.personel);
    let iHtml = '';
    
    if (izinler && izinler.length > 0) {
      bekleyenSayi += izinler.length;
      
      for (const b of izinler) {
        const { data: pIcaps } = await sb.from('icap_gorevleri').select('*').eq('personel_id', b.personel_id).eq('durum', 'onaylandi');
        const { data: pIzins } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', b.personel_id).eq('durum', 'onaylandi');
        const pBakiye = bakiyeHesapla(pIcaps, pIzins, b.personel.kadro, yilOf(b.izin_tarihi));
        
        const isciMi = izinGunluk(b.personel.kadro);
        const talepMetin = isciMi ? `${gunYaz(b.talep_edilen_dakika / IZIN_GUN_DK)} (${dkYaz(b.talep_edilen_dakika)})` : dkYaz(b.talep_edilen_dakika);
        const sonraMetin = dkYaz(pBakiye.kalanDk - b.talep_edilen_dakika);
        const sonraEksi = (pBakiye.kalanDk - b.talep_edilen_dakika) < 0;
        const mevcutMetin = dkYaz(pBakiye.kalanDk);
        const cakisanlar = await izinCakismalariGetir(b.personel_id, b.personel.vardiya, b.izin_tarihi, b.talep_edilen_dakika, b.id);
        const cakismaHtml = cakisanlar.length ? `<div class="izin-cakisma" style="margin:10px 0 0">⚠️ <b>Çakışma:</b> Aynı vardiyadan başka personel de bu tarihlerde izinli/izin talebinde.<br>${cakismaSatirlari(cakisanlar)}</div>` : '';

        iHtml += `<div class="onay-item" style="border-left-color:var(--violet)">
          <div class="onay-ust">
            <div>
              <div class="hucre-isim">${esc(b.personel.ad_soyad)}</div>
              <div class="hucre-alt">Tarih: ${esc(izinAraligiYazi(b.izin_tarihi, b.talep_edilen_dakika))} ${kadroRozet(b.personel.kadro)} ${b.eksi_bakiye_mi ? '<span class="rozet r-kirmizi">Eksi Bakiye</span>' : ''}</div>
            </div>
            <span class="rozet r-mor">Talep: ${talepMetin}</span>
          </div>
          
          ${Array.isArray(b.secilen_icaplar) && b.secilen_icaplar.length ? `<div style="margin-top:10px;padding:9px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12.5px;line-height:1.55;color:#0c4a6e"><b>🧾 Seçilen icaplar:</b><br>${b.secilen_icaplar.map(s => { const ic = (pIcaps || []).find(x => x.id === s.icap_id); return ic ? `• ${esc(tarihYaz(ic.baslama_zamani))} ${esc(saatYaz(ic.baslama_zamani))}${ic.bitis_zamani ? '–' + esc(saatYaz(ic.bitis_zamani)) : ''} · <b>${dkYaz(s.dk)}</b>${s.dk < ic.toplam_dakika ? ' (icabın bir kısmı)' : ''}` : '• (icap kaydı bulunamadı)'; }).join('<br>')}</div>` : ''}
          ${b.aciklama && String(b.aciklama).trim() ? `<div style="margin-top:10px;padding:9px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;font-size:13px;line-height:1.45;color:#3b2a74"><b>💬 Açıklama:</b> ${esc(b.aciklama)}</div>` : ''}
          <div style="margin-top:10px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
               <span>Mevcut hak:</span> <b>${mevcutMetin}</b>
            </div>
            <div class="dokum-satir sonra ${sonraEksi ? 'eksi' : ''}"><span>Onaylanırsa kalan:</span><b>${sonraMetin}</b></div>
          </div>

          ${cakismaHtml}
          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'izin')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'izin')">✕ Reddet</button></div>
        </div>`;
      }
    } else { iHtml = '<div class="bos">Onay bekleyen izin talebi yok.</div>'; }
    html += `<div class="kart" id="onayIzinKart">${baslikHtml('📅', 'Onay Bekleyen İzinler', izinler && izinler.length ? `<span class="rozet r-mor">${izinler.length}</span>` : '')}${iHtml}</div>`;
  }

  el.innerHTML = html;
  hizliIslemleriCiz(rol, bekleyenSayi);
  const gk = document.getElementById('icapGorevKart');
  const b1 = document.getElementById('icapBaslatanKart');
  const pano = document.getElementById('aktifIcapPano');
  const grup = document.getElementById('icapGrup');
  if (b1 && grup) {
    // Sıra: 1) İcap Görevi Başlatan Personel  2) Aktif icap panosu  3) diğer kartlar (Yeni İcap Görevi vb.)
    const _formDurum = formDurumKaydet();
    b1.innerHTML = baslatanHtml;
    if (gk) gk.innerHTML = gorevHtml;
    formDurumYukle(_formDurum);
    if (baslatanHtml) grup.append(b1, pano, gk); else grup.append(pano, gk, b1);
  } else if (gk) {
    gk.innerHTML = baslatanHtml + gorevHtml; // eski index.html ile de panel kaybolmasın
  }
  sayacGuncelle();
}

// ---------- HIZLI İŞLEMLER ----------
const IKON = {
  er: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  sofor: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 14.5V21M9.8 11 3.4 9.8M14.2 11l6.4-1.2"/></svg>',
  duzenle: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  sil: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  izin: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>',
  ekip: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  onay: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  izinOnay: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  rapor: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M8 17V9M13 17V5M18 17v-6"/></svg>',
  bakiye: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/></svg>',
  log: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  yedek: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/></svg>',
  ayar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

function nobetCiz() {
  const v = sistemAyar.aktif_vardiya;
  const chips = document.getElementById('nobetChips');
  if (chips) chips.innerHTML = [1, 2, 3].map(n => `<div class="nobet-chip ${n === v ? 'aktif' : ''}" title="${n}. Vardiya">${n}</div>`).join('');
  const t = document.getElementById('nobetTarih');
  if (t) t.innerText = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

let acikPanel = null;

function panelAc(kaynakId, baslik) {
  if (!document.getElementById(kaynakId)) return toast("Bu bölüm şu an görüntülenemiyor.");
  document.getElementById('panelModal')?.remove();
  acikPanel = { kaynakId, baslik };
  const html = `<div class="modal aktif" id="panelModal" onclick="if(event.target===this)panelKapat()"><div class="modal-content" style="max-width:560px">
    <div class="modal-baslik"><h3>${esc(baslik)}</h3><button type="button" class="btn btn-outline btn-sm" onclick="panelKapat()">Kapat ✕</button></div>
    <div id="panelModalGovde" class="panel-govde"></div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  panelYenile();
  if (navigator.vibrate) navigator.vibrate(10);
}

function panelKapat() {
  acikPanel = null;
  document.getElementById('panelModal')?.remove();
}

function panelYenile() {
  if (!acikPanel) return;
  const govde = document.getElementById('panelModalGovde');
  const kaynak = document.getElementById(acikPanel.kaynakId);
  if (govde && kaynak) govde.innerHTML = kaynak.innerHTML;
}

function hizliIslemleriCiz(rol, bekleyenSayi) {
  const kutu = document.getElementById('hizliIslemler');
  if (!kutu) return;
  const yonetici = ['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol);
  const tuslar = [];
  const ekle = (renk, ikon, metin, onclick, sayac = 0) => tuslar.push({ renk, ikon, metin, onclick, sayac });

  if (yonetici) ekle('a-mavi', IKON.ekip, 'İcap Personeli Seç', 'hazirIcapciModalAc()');
  ekle('a-yesil', IKON.bakiye, 'Bakiyem', "panelAc('kisiselBakiyeKart','İcap Bakiyem')");
  ekle('a-mor', IKON.izin, 'İzin Talebi', 'izinModalAc()');
  if (yonetici) {
    const icapSay = document.querySelectorAll('#onayIcapKart .onay-item').length;
    const izinSay = document.querySelectorAll('#onayIzinKart .onay-item').length;
    ekle('a-turuncu', IKON.onay, 'İcap Onayları', "panelAc('onayIcapKart','Onay Bekleyen İcaplar')", icapSay);
    ekle('a-kehribar', IKON.izinOnay, 'İzin Onayları', "panelAc('onayIzinKart','Onay Bekleyen İzinler')", izinSay);
    ekle('a-pembe', IKON.rapor, 'Raporlar', 'raporModalAc()');
    ekle('a-yesil', IKON.rapor, 'Memur Çizelgesi', 'cizelgeListeAc()');
  }
  ekle('a-lacivert', IKON.log, 'Sistem Hareketleri', "panelAc('logPenceresi','Sistem Hareketleri')");
  if (yonetici) ekle('a-petrol', IKON.yedek, 'Buluta Yedekle', 'veriYedekle()');
  if (rol === 'super_admin') {
    ekle('a-kirmizi', IKON.admin, 'Yönetim Paneli', 'adminPaneliAc()');
    ekle('a-lacivert', IKON.ayar, 'Sistem Ayarları', "adminPaneliAc('ayarlar')");
  }

  const butonlar = tuslar.map(t => {
    const sayacHtml = (t.sayac && t.sayac > 0) ? `<div class="aksiyon-sayac">${t.sayac}</div>` : '';
    return `<button type="button" class="aksiyon-btn ${t.renk}" onclick="${t.onclick}">${sayacHtml}${t.ikon}<span>${t.metin}</span></button>`;
  }).join('');

  kutu.innerHTML = `<div class="hizli-islem-kart">
    <div class="hizli-islem-baslik">Hızlı İşlemler <span>${esc(rolAd(rol))}</span></div>
    <div class="aksiyon-grid">${butonlar}</div>
  </div>`;
}

function raporModalAc() {
  if (document.getElementById('raporModal')) return;
  const bugun = new Date().toISOString().split('T')[0];
  const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const html = `<div class="modal aktif" id="raporModal"><div class="modal-content">
    <h3>📊 Raporlama</h3>
    <p class="alt-not">Onaylanmış icap kayıtlarını tarih aralığına göre CSV olarak indirin.</p>
    <div class="form-satir">
      <div class="form-grup"><label>Başlangıç</label><input type="date" id="raporBaslangic" value="${otuzGunOnce}"></div>
      <div class="form-grup"><label>Bitiş</label><input type="date" id="raporBitis" value="${bugun}"></div>
    </div>
    <button type="button" class="btn btn-primary" onclick="raporCsvIndir()">⬇ Detaylı CSV İndir</button>
    <button type="button" class="btn btn-link" onclick="document.getElementById('raporModal').remove()">Kapat</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function hizliAciklama(btn) {
  const ta = document.getElementById('gorevAciklama');
  if (!ta) return;
  const secili = btn.classList.contains('secili');
  document.querySelectorAll('.hizli-btn').forEach(b => b.classList.remove('secili'));
  if (secili) { ta.value = ''; return; }
  btn.classList.add('secili');
  ta.value = btn.dataset.metin; 
  if (navigator.vibrate) navigator.vibrate(15);
}

// ---------- SAYAÇ + ARKA PLAN WIDGET'I ----------
// Tarayıcı, sayfa arka plana alınınca zamanlayıcıları dondurur ve medya bildirimini yalnızca SES ÇALARKEN gösterir.
// Bu yüzden icap sürerken duyulmayacak kadar sessiz bir ses döngüsü çalınır; böylece
//  1) telefonun kilit ekranı / bildirim çubuğunda "İcap Görevi" medya kartı (canlı sayaç) görünür,
//  2) uygulama arka plana alınsa bile sayaç güncellenmeye devam eder.
// Ek olarak (izin verilirse) bildirim çubuğuna kalıcı bir "İcap devam ediyor" bildirimi bırakılır.
// Not: icap süresi sunucudaki başlama zamanından hesaplanır; widget kapansa bile görev ve süre kaybolmaz.
const widget = { audio: null, aktif: false, baslama: null, sonBildirim: 0 };

function sessizSesUret() {
  // 1 sn, 8 kHz, 8 bit mono WAV; duyulmayacak kadar küçük titreşim (tam sıfır "sessiz" sayılıp medya oturumu açılmayabilir)
  const n = 8000, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
  const yaz = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  yaz(0, 'RIFF'); dv.setUint32(4, 36 + n, true); yaz(8, 'WAVE'); yaz(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  yaz(36, 'data'); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + (i % 2 ? 1 : -1);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function widgetSesBaslat() {
  try {
    if (!widget.audio) {
      widget.audio = new Audio(sessizSesUret());
      widget.audio.loop = true;
      widget.audio.volume = 0.05;
      widget.audio.setAttribute('playsinline', '');
    }
    if (widget.audio.paused) {
      const p = widget.audio.play();
      if (p && p.catch) p.catch(() => { widget.bekleyenDokunus = true; }); // dokunuş (kullanıcı etkileşimi) gerekebilir
    }
  } catch (e) { console.error('Widget ses hatası', e); }
}

function widgetBildirimIzni() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}

// Bildirim çubuğu için tek renkli (beyaz) küçük simge: Android bunu sistem rengiyle boyar
let _rozetUrl = null;
function widgetRozetUrl() {
  if (_rozetUrl !== null) return _rozetUrl;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath();
    g.moveTo(48, 6); g.bezierCurveTo(52, 28, 78, 38, 78, 62); g.bezierCurveTo(78, 80, 64, 90, 48, 90);
    g.bezierCurveTo(32, 90, 18, 80, 18, 62); g.bezierCurveTo(18, 50, 26, 42, 32, 34);
    g.bezierCurveTo(34, 44, 38, 48, 42, 50); g.bezierCurveTo(40, 32, 42, 18, 48, 6); g.fill();
    _rozetUrl = c.toDataURL('image/png');
  } catch (e) { _rozetUrl = undefined; }
  return _rozetUrl;
}

async function widgetBildirimGuncelle(sureStr, zorla = false) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!zorla && Date.now() - widget.sonBildirim < 30000) return; // en fazla 30 sn'de bir
    widget.sonBildirim = Date.now();
    const kisaSure = sureStr.slice(0, 5); // SS:DD
    const secenek = {
      body: `Süre: ${kisaSure}  ·  Başlama: ${saatYaz(widget.baslama)}\nSeydişehir İtfaiyesi İcap Takip`,
      tag: 'icap-aktif', renotify: false, silent: true, requireInteraction: true,
      icon: IKN_YANGIN, badge: widgetRozetUrl(), timestamp: new Date(widget.baslama).getTime()
    };
    const baslik = 'İcap Görevi Devam Ediyor';
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) await reg.showNotification(baslik, secenek);
    else new Notification(baslik, secenek);
  } catch (e) { console.error('Widget bildirim hatası', e); }
}

async function widgetBildirimKapat() {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.getNotifications) (await reg.getNotifications({ tag: 'icap-aktif' })).forEach(n => n.close());
  } catch (e) {}
}

function widgetKapat() {
  widget.aktif = false; widget.baslama = null; widget.denendi = false;
  try { if (widget.audio) widget.audio.pause(); } catch (e) {}
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } catch (e) {}
  }
  document.title = 'Seydişehir İtfaiyesi - İcap Takip';
  widgetBildirimKapat();
}

function widgetGuncelle(sn, sureStr) {
  document.title = `⏱️ ${sureStr} | İcap Görevi`;
  if ('mediaSession' in navigator) {
    try {
      if (!widget.aktif || !navigator.mediaSession.metadata) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `İcap Görevi: ${sureStr}`, artist: mevcutPersonel?.ad_soyad || 'İtfaiye Personeli',
          album: 'Seydişehir İtfaiyesi', artwork: [{ src: IKN_YANGIN, sizes: '192x192', type: 'image/png' }]
        });
        // Kullanıcı "duraklat"a basarsa ses durur; icap süresince çalmaya devam etmesi için geri başlat
        navigator.mediaSession.setActionHandler('pause', () => widgetSesBaslat());
        navigator.mediaSession.setActionHandler('play', () => widgetSesBaslat());
        ['stop', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'].forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) {} });
      } else {
        navigator.mediaSession.metadata.title = `İcap Görevi: ${sureStr}`;
      }
      navigator.mediaSession.playbackState = 'playing';
      // Bildirim kartındaki ilerleme çubuğu geçen süreyi kendiliğinden saydırır
      if (navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({ duration: Math.max(sn + 43200, 43200), position: sn, playbackRate: 1 });
      }
    } catch (e) { console.error('mediaSession hatası', e); }
  }
  widget.aktif = true;
  if (!widget.denendi) { widget.denendi = true; widgetSesBaslat(); } // sayfa yenilendiyse otomatik çalmayı dener, olmazsa ilk dokunuşta başlar
  widgetBildirimGuncelle(sureStr);
}

function sayacGuncelle() {
  const p = n => String(n).padStart(2, '0');
  const bicim = sn => `${p(Math.floor(sn / 3600))}:${p(Math.floor((sn % 3600) / 60))}:${p(sn % 60)}`;
  let kendiSn = null;

  document.querySelectorAll('[data-baslama]').forEach(el => {
    const sn = Math.max(0, Math.floor((Date.now() - new Date(el.dataset.baslama).getTime()) / 1000));
    el.innerText = bicim(sn);
    if (el.classList.contains('zaman')) { kendiSn = sn; widget.baslama = el.dataset.baslama; } // yalnızca KENDİ icap sayacı widget'a yansır
  });

  if (kendiSn !== null) widgetGuncelle(kendiSn, bicim(kendiSn));
  else if (widget.aktif) widgetKapat();
}
setInterval(sayacGuncelle, 1000);
// Sayfa yenilenince tarayıcı sesi kendiliğinden başlatmaz: ilk dokunuşta widget'ı canlandır
document.addEventListener('pointerdown', () => { if (widget.aktif && (!widget.audio || widget.audio.paused)) widgetSesBaslat(); if (widget.aktif) widgetBildirimIzni(); }, { passive: true });
// Uygulamaya dönüldüğünde sayaç anında düzelsin
document.addEventListener('visibilitychange', () => { if (!document.hidden) sayacGuncelle(); });

// ---------- İŞLEMLER ----------
async function icapBaslat() {
  // Ses ve bildirim izni kullanıcı dokunuşu sırasında istenmelidir: butona basılır basılmaz başlat
  widgetSesBaslat(); widgetBildirimIzni();
  const aciklama = document.getElementById('gorevAciklama').value;
  const { error } = await sb.from('icap_gorevleri').insert([{ personel_id: mevcutPersonel.id, vardiya: mevcutPersonel.vardiya, gorev_aciklamasi: aciklama, durum: 'aktif' }]);
  if (error) { widgetKapat(); toast("Hata: " + error.message); }
  else { toast("İcap başlatıldı", "basari"); widget.sonBildirim = 0; await logEkle("İcap Başlattı", aciklama); panelYukle(); }
}

async function istasyondayim(id) {
  const { error } = await sb.from('icap_gorevleri').update({ istasyona_varis_zamani: new Date().toISOString() }).eq('id', id);
  if (error) {
    if (['42703', 'PGRST204'].includes(error.code) || /istasyona_varis/.test(error.message || '')) return toast("Veritabanı güncellemesi gerekli (SQL dosyası çalıştırılmalı).");
    return toast("Hata: " + error.message);
  }
  toast("İstasyona varışınız kaydedildi. Aktif icap görevlisiniz.", "basari");
  await logEkle("İstasyona Vardı");
  panelYukle();
}

async function icapBitir(id, manuelBitis = null) {
  if (!manuelBitis && !confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const bitisAn = manuelBitis || new Date();
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((bitisAn - new Date(data.baslama_zamani)) / 60000);
  if (dk <= 0) return toast("Bitiş zamanı başlama zamanından sonra olmalı.");
  // Er/Şoför icabını vardiya çavuşu, Vardiya Çavuşu icabını Grup Amiri onaylar; yalnız Grup Amiri/Süper Admin kendi icabı otomatik onaylanır
  const otomatikOnay = ['grup_amiri', 'super_admin'].includes(mevcutPersonel.rol);
  const guncelle = { bitis_zamani: bitisAn.toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null };
  
  let { error } = await sb.from('icap_gorevleri').update(guncelle).eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { 
    toast("İcap bitirildi", "basari"); 
    await logEkle(manuelBitis ? "İcabı Manuel Bitirdi" : "İcabı Bitirdi", `Süre: ${dk} dk${manuelBitis ? ' · Bitiş: ' + manuelBitis.toLocaleString('tr-TR') : ''}`); 
    widgetKapat();
    panelYukle(); 
  }
}

async function onayla(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const guncelle = { durum: 'onaylandi', onaylayan_id: mevcutPersonel.id, onay_zamani: new Date().toISOString() };
  
  let { error } = await sb.from(tablo).update(guncelle).eq('id', id);
  if (error) return toast("Onaylanamadı: " + error.message);
  
  toast("Onaylandı", "basari");
  await logEkle(tip === 'icap' ? "İcap Onayladı" : "İzin Onayladı");
  panelYukle();
}

async function reddet(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const sebep = prompt("Red sebebi:");
  if (sebep === null) return;
  
  const { error } = await sb.from(tablo).update({ durum: 'reddedildi', onaylayan_id: mevcutPersonel.id, red_sebebi: sebep }).eq('id', id);
  if (error) return toast("Reddedilemedi: " + error.message);

  toast("Reddedildi");
  await logEkle(tip === 'icap' ? "İcap Reddetti" : "İzin Reddetti", sebep);
  panelYukle();
}

// ---------- MODALLAR ----------

// ============================================================
// MANUEL İCAP GİRİŞİ (başlatmayı / bitirmeyi unutanlar için)
// Saat girişi telefonun saat seçicisiyle (alarm kurar gibi) yapılır; elle yazılan hatalı format olmaz.
// Gün seçimi yalnızca bugün ve son MANUEL_GERI_GUN gün ile sınırlıdır.
// ============================================================
const MANUEL_GERI_GUN = 3;                // en fazla kaç gün öncesine manuel giriş yapılabilir (bugün dahil değil)

function yerelTarih(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function gunSecenekleriHtml(geriGun) {
  const adlar = ['Bugün', 'Dün', '2 gün önce', '3 gün önce', '4 gün önce'];
  let o = '';
  for (let i = 0; i <= geriGun; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    o += `<option value="${yerelTarih(d)}">${adlar[i] || i + ' gün önce'} · ${d.toLocaleDateString('tr-TR')}</option>`;
  }
  return o;
}
function tarihInputHtml(id, onchange) {
  const bugun = new Date(), min = new Date(); min.setDate(min.getDate() - MANUEL_GERI_GUN);
  return `<input type="date" id="${id}" value="${yerelTarih(bugun)}" min="${yerelTarih(min)}" max="${yerelTarih(bugun)}" onchange="${onchange}">`;
}
function tarihSaatOku(gunId, saatId) {
  const g = document.getElementById(gunId)?.value, s = document.getElementById(saatId)?.value;
  if (!g || !s || !/^\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${g}T${s}:00`);
  return isNaN(d) ? null : d;
}

// Panel yeniden çizilirken (canlı güncelleme) yarım kalan form bozulmasın
const FORM_ALANLARI = ['mnGunB', 'mnSaatB', 'mnGunS', 'mnSaatS', 'mbGun', 'mbSaat', 'gorevAciklama'];
const FORM_DETAYLARI = ['mnDetay', 'mbDetay'];
function formDurumKaydet() {
  const o = { alan: {}, acik: {} };
  FORM_ALANLARI.forEach(id => { const e = document.getElementById(id); if (e) o.alan[id] = e.value; });
  FORM_DETAYLARI.forEach(id => { const e = document.getElementById(id); if (e) o.acik[id] = e.open; });
  return o;
}
function formDurumYukle(o) {
  if (!o) return;
  FORM_ALANLARI.forEach(id => { const e = document.getElementById(id); if (e && o.alan[id] !== undefined) e.value = o.alan[id]; });
  FORM_DETAYLARI.forEach(id => { const e = document.getElementById(id); if (e && o.acik[id]) e.open = true; });
  if (document.getElementById('mnOzet')) manuelOzetGuncelle();
}

function manuelOzetGuncelle() {
  const b = tarihSaatOku('mnGunB', 'mnSaatB'), s = tarihSaatOku('mnGunS', 'mnSaatS');
  const el = document.getElementById('mnOzet');
  if (!el) return;
  if (!b || !s) { el.className = 'manuel-ozet'; el.innerText = 'Başlama ve bitiş saatini seçin.'; return; }
  const dk = Math.round((s - b) / 60000);
  if (dk <= 0) { el.className = 'manuel-ozet hata'; el.innerText = 'Bitiş, başlamadan sonra olmalı.'; return; }
  if (s > new Date()) { el.className = 'manuel-ozet hata'; el.innerText = 'Bitiş zamanı gelecekte olamaz.'; return; }
  el.className = 'manuel-ozet tamam';
  el.innerText = `Toplam süre: ${dkYaz(dk)}`;
}

async function icapManuelKaydet() {
  const b = tarihSaatOku('mnGunB', 'mnSaatB'), s = tarihSaatOku('mnGunS', 'mnSaatS');
  if (!b || !s) return toast("Başlama ve bitiş saatini seçin.");
  const dk = Math.round((s - b) / 60000);
  if (dk <= 0) return toast("Bitiş zamanı başlamadan sonra olmalı.");
  if (s > new Date()) return toast("Bitiş zamanı gelecekte olamaz.");

  // Kendi diğer icap kayıtlarıyla çakışma kontrolü
  const arama = new Date(b.getTime() - 48 * 3600 * 1000).toISOString();
  const { data: mevcut } = await sb.from('icap_gorevleri').select('baslama_zamani, bitis_zamani, durum').eq('personel_id', mevcutPersonel.id).in('durum', ['aktif', 'onay_bekliyor', 'onaylandi']).gte('baslama_zamani', arama);
  const cakisan = (mevcut || []).find(k => {
    const k1 = new Date(k.baslama_zamani), k2 = k.bitis_zamani ? new Date(k.bitis_zamani) : new Date(8640000000000000);
    return b < k2 && s > k1;
  });
  if (cakisan) return toast("Bu saat aralığı mevcut bir icap kaydınızla çakışıyor.");

  const aciklama = (document.getElementById('gorevAciklama')?.value || '').trim();
  const bas = `${tarihYaz(b)} ${saatYaz(b)}`, bit = `${tarihYaz(s)} ${saatYaz(s)}`;
  if (!confirm(`Manuel icap kaydedilsin mi?\n\nBaşlama: ${bas}\nBitiş: ${bit}\nSüre: ${dkYaz(dk)}`)) return;

  // Er/Şoför icabını vardiya çavuşu, Vardiya Çavuşu icabını Grup Amiri onaylar; yalnız Grup Amiri/Süper Admin kendi icabı otomatik onaylanır
  const otomatikOnay = ['grup_amiri', 'super_admin'].includes(mevcutPersonel.rol);
  const { error } = await sb.from('icap_gorevleri').insert([{
    personel_id: mevcutPersonel.id,
    vardiya: mevcutPersonel.vardiya,
    gorev_aciklamasi: '[MANUEL] ' + aciklama,
    baslama_zamani: b.toISOString(),
    bitis_zamani: s.toISOString(),
    toplam_dakika: dk,
    durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor',
    onaylayan_id: otomatikOnay ? mevcutPersonel.id : null,
    onay_zamani: otomatikOnay ? new Date().toISOString() : null
  }]);
  if (error) return toast("Manuel icap kaydedilemedi: " + error.message);

  toast(otomatikOnay ? "Manuel icap kaydedildi." : "Manuel icap onaya gönderildi.", "basari");
  await logEkle("Manuel İcap Girdi", `${bas} → ${bit} (${dkYaz(dk)})`);
  panelYukle();
}

async function manuelBitisOzet(id) {
  const el = document.getElementById('mbOzet'); if (!el) return;
  const s = tarihSaatOku('mbGun', 'mbSaat');
  if (!s) { el.className = 'manuel-ozet'; el.innerText = 'Bitiş saatini seçin.'; return; }
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.round((s - new Date(data.baslama_zamani)) / 60000);
  if (dk <= 0) { el.className = 'manuel-ozet hata'; el.innerText = 'Bitiş, başlamadan sonra olmalı.'; return; }
  if (s > new Date()) { el.className = 'manuel-ozet hata'; el.innerText = 'Bitiş zamanı gelecekte olamaz.'; return; }
  el.className = 'manuel-ozet tamam'; el.innerText = `Toplam süre: ${dkYaz(dk)}`;
}

async function icapBitirManuel(id) {
  const s = tarihSaatOku('mbGun', 'mbSaat');
  if (!s) return toast("Bitiş saatini seçin.");
  if (s > new Date()) return toast("Bitiş zamanı gelecekte olamaz.");
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.round((s - new Date(data.baslama_zamani)) / 60000);
  if (dk <= 0) return toast("Bitiş zamanı başlamadan sonra olmalı.");
  if (!confirm(`İcap şu zamanda bitirilsin mi?\n\nBitiş: ${tarihYaz(s)} ${saatYaz(s)}\nSüre: ${dkYaz(dk)}`)) return;
  await icapBitir(id, s);
}

// ============================================================
// MEMUR FAZLA ÇALIŞMA MESAİ CETVELİ (Excel)
// Onaylı memur izin talebini karşılayan icap kayıtları (eskiden yeniye, FIFO) şablona otomatik doldurulur.
// ============================================================
const CETVEL_BIRIM = 'İTFAİYE DAİRE BAŞKANLIĞI';
const CETVEL_NEDEN = 'VARDİYA TATİLİNDE  ÇALIŞMA';
const CETVEL_SAYFA_SATIR = 8;

function cetvelSureYaz(dk) {
  const s = Math.floor(dk / 60), m = dk % 60;
  if (s && m) return `${s} SAAT ${m} DAKİKA`;
  return s ? `${s} SAAT` : `${m} DAKİKA`;
}

function exceljsYukle() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    sc.onload = res; sc.onerror = () => rej(new Error('Excel kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).'));
    document.head.appendChild(sc);
  });
}

// Seçilen izin talebini karşılayan icap parçalarını bulur.
// Talepte personelin seçtiği icaplar (secilen_icaplar) varsa onlar; eski taleplerde (seçimsiz) en eski icaptan başlayarak otomatik karşılanır.
// Aynı icabı birden çok izin kullanırsa, parçalar icabın başından itibaren sırayla (izin sırasına göre) dizilir.
async function cetvelParcalari(personelId, izinId) {
  const [{ data: icaps }, { data: izins }] = await Promise.all([
    sb.from('icap_gorevleri').select('*').eq('personel_id', personelId).eq('durum', 'onaylandi').order('baslama_zamani', { ascending: true }),
    sb.from('icap_izin_talepleri').select('*').eq('personel_id', personelId).eq('durum', 'onaylandi').order('izin_tarihi', { ascending: true }).order('onay_zamani', { ascending: true })
  ]);
  const hedefIzin = (izins || []).find(x => x.id === izinId);
  const yil = hedefIzin ? yilOf(hedefIzin.izin_tarihi) : bakiyeYili();   // bakiye yıllık: yalnız aynı yılın icapları karşılar
  const liste = (icaps || []).filter(k => yilOf(k.baslama_zamani) === yil && (k.toplam_dakika || 0) > 0);
  const harita = {}, imlec = {}, kalan = {};
  liste.forEach(k => { harita[k.id] = k; imlec[k.id] = 0; kalan[k.id] = k.toplam_dakika; });
  const parcaAl = (k, dk, hedefe) => {
    const al = Math.min(dk, kalan[k.id]); if (al <= 0) return 0;
    if (hedefe) hedefe.push({ baslangic: new Date(new Date(k.baslama_zamani).getTime() + imlec[k.id] * 60000), dk: al, icapId: k.id });
    imlec[k.id] += al; kalan[k.id] -= al; return al;
  };
  for (const iz of (izins || []).filter(x => yilOf(x.izin_tarihi) === yil)) {
    const secili = []; let ihtiyac = iz.talep_edilen_dakika || 0;
    const hedef = iz.id === izinId ? secili : null;
    if (Array.isArray(iz.secilen_icaplar) && iz.secilen_icaplar.length) {
      for (const s of iz.secilen_icaplar) { const k = harita[s.icap_id]; if (k) ihtiyac -= parcaAl(k, s.dk, hedef); }
    } else {
      for (const k of liste) { if (ihtiyac <= 0) break; ihtiyac -= parcaAl(k, ihtiyac, hedef); }
    }
    if (iz.id === izinId) return { parcalar: secili, eksik: Math.max(0, ihtiyac), izin: iz };
  }
  return null;
}

function cetvelSayfaYaz(wb, ad, satirlar, baslaNo, tanzim, kisi) {
  const ws = wb.addWorksheet(ad, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } } });
  const gen = [6.14, 8.29, 12.57, 22, 23.14, 16.29, 18.57, 13.29, 17.71, 19.71];
  gen.forEach((w, i) => ws.getColumn(i + 1).width = w);
  const T = 'Times New Roman', C = 'Calibri';
  const med = { style: 'medium' }, thin = { style: 'thin' };
  const tamKenar = (st) => ({ left: st, right: st, top: st, bottom: st });

  ws.mergeCells('A1:I1');
  const a1 = ws.getCell('A1'); a1.value = 'FAZLA ÇALIŞMA MESAİ CETVELİ';
  a1.font = { name: T, size: 12, bold: true }; a1.alignment = { horizontal: 'center', vertical: 'middle' }; a1.border = tamKenar(med);
  const j1 = ws.getCell('J1'); j1.value = 'TANZİM TARİH ' + tanzim;
  j1.font = { name: T, size: 12, bold: true }; j1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; j1.border = tamKenar(med);
  ws.getRow(1).height = 31.95;

  ['SIRA NO', 'SİCİL NO', 'TARİH', 'AD SOYAD', 'BİRİMİ', 'MESAİ NEDENİ', 'BAŞLAMA SAATİ', 'BİTİŞ SAATİ', 'TOPLAM (SAAT)', 'İMZA'].forEach((t, i) => {
    const c = ws.getCell(2, i + 1); c.value = t;
    c.font = { name: T, size: 12 }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = tamKenar(med);
  });
  ws.getRow(2).height = 36;

  for (let i = 0; i < CETVEL_SAYFA_SATIR; i++) {
    const r = 3 + i, s = satirlar[i];
    ws.getRow(r).height = 43.2;
    const deger = [baslaNo + i, s ? kisi.sicil : null, s ? s.tarih : null, s ? kisi.ad : null, CETVEL_BIRIM, CETVEL_NEDEN, s ? s.bas : null, s ? s.bit : null, s ? s.toplam : null, null];
    deger.forEach((v, k) => {
      const c = ws.getCell(r, k + 1); c.value = v;
      c.font = { name: C, size: k === 0 ? 12 : 11, bold: k === 0 };
      c.alignment = { horizontal: k === 4 ? undefined : 'center', vertical: 'middle', wrapText: k === 5 };
      c.border = { left: k === 0 ? med : thin, right: k === 9 ? med : thin, top: thin, bottom: i === CETVEL_SAYFA_SATIR - 1 ? med : thin };
      if (k === 6 || k === 7) c.numFmt = 'h:mm';
    });
  }

  [['C', 'D', 'KOORDİNASYON AMİRİ'], ['F', 'G', 'ŞUBE MÜDÜRÜ'], ['I', 'J', 'İTFAİYE DAİRESİ BAŞKANI']].forEach(([k1, k2, unvan]) => {
    [[13, unvan], [14, 'Kaşe '], [15, 'İmza']].forEach(([r, t]) => {
      ws.mergeCells(`${k1}${r}:${k2}${r}`);
      const c = ws.getCell(`${k1}${r}`); c.value = t; c.font = { name: C, size: 11 }; c.alignment = { horizontal: 'center' };
    });
  });
  ws.pageSetup.printArea = 'A1:J17';
  return ws;
}

// Her satır TEK takvim gününde olmalı: gece yarısını geçen veya 24 saatlik parçalar günlere bölünür
// (örn. 12.11 20:50 → 13.11 20:50 = 12.11 20:50–24:00 ve 13.11 00:00–20:50). Gün sonu "24:00" yazılır.
function cetvelSatirlaraBol(parcalar) {
  const satirlar = [];
  const dkOf = d => (d.getHours() * 60 + d.getMinutes()) / 1440;
  const trTarih = d => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  [...parcalar].sort((x, y) => x.baslangic - y.baslangic).forEach(p => {   // çizelge tarih sırasına göre
    let cur = new Date(p.baslangic), kalan = Math.round(p.dk);
    while (kalan > 0) {
      const gunSonu = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      const buGun = Math.min(kalan, Math.round((gunSonu - cur) / 60000));
      const bitis = new Date(cur.getTime() + buGun * 60000);
      satirlar.push({ tarih: trTarih(cur), bas: dkOf(cur), bit: bitis.getTime() >= gunSonu.getTime() ? '24:00' : dkOf(bitis), toplam: cetvelSureYaz(buGun) });
      cur = bitis; kalan -= buGun;
    }
  });
  return satirlar;
}

async function izinCizelgeIndir(izinId) {
  try {
    toast("Çizelge hazırlanıyor...", "basari");
    await exceljsYukle();
    const { data: iz, error } = await sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, sicil_no, kadro)').eq('id', izinId).single();
    if (error || !iz) return toast("İzin kaydı okunamadı.");
    if (iz.durum !== 'onaylandi') return toast("Çizelge yalnızca onaylanmış izinler için alınabilir.");
    if (iz.personel.kadro !== 'memur') return toast("Bu çizelge yalnızca memur personel içindir.");

    const sonuc = await cetvelParcalari(iz.personel_id, izinId);
    if (!sonuc || sonuc.parcalar.length === 0) return toast("Bu izni karşılayan icap kaydı bulunamadı.");

    const satirlar = cetvelSatirlaraBol(sonuc.parcalar);
    const kisi = { ad: (iz.personel.ad_soyad || '').toLocaleUpperCase('tr-TR'), sicil: iz.personel.sicil_no ? (isNaN(iz.personel.sicil_no) ? iz.personel.sicil_no : Number(iz.personel.sicil_no)) : null };
    const tanzim = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '/');

    const wb = new ExcelJS.Workbook();
    const sayfaSayisi = Math.ceil(satirlar.length / CETVEL_SAYFA_SATIR);
    for (let s = 0; s < sayfaSayisi; s++) {
      cetvelSayfaYaz(wb, `Sayfa${s + 1}`, satirlar.slice(s * CETVEL_SAYFA_SATIR, (s + 1) * CETVEL_SAYFA_SATIR), s * CETVEL_SAYFA_SATIR + 1, tanzim, kisi);
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dosyaAd = `FAZLA_MESAI_CETVELI_${kisi.ad.replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g, '_')}_${iz.izin_tarihi}.xlsx`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = dosyaAd; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);

    if (!iz.personel.sicil_no) toast("Çizelge indirildi. Sicil no tanımlı değil: yönetici panelinden girilmeli.", "basari");
    else if (sonuc.eksik > 0) toast(`İndirildi. Uyarı: izin ${dkYaz(sonuc.eksik)} fazla (icap karşılığı yok).`, "basari");
    else toast("Fazla mesai çizelgesi indirildi.", "basari");
    await logEkle("Mesai Çizelgesi İndirdi", `${iz.personel.ad_soyad} · ${iz.izin_tarihi}`);
  } catch (e) { toast("Çizelge oluşturulamadı: " + e.message); }
}

// Yöneticiler için: onaylı memur izinlerinin listesi
async function cizelgeListeAc() {
  if (document.getElementById('cizelgeModal')) return;
  const { data } = await sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, kadro)').eq('durum', 'onaylandi').order('izin_tarihi', { ascending: false }).limit(150);
  const liste = (data || []).filter(x => x.personel?.kadro === 'memur');
  const satirlar = liste.length ? liste.map(x => `<div class="onay-item" style="border-left-color:var(--blue)">
      <div class="onay-ust"><div><div class="hucre-isim">${esc(x.personel.ad_soyad)}</div><div class="hucre-alt">İzin tarihi: ${esc(tarihYaz(x.izin_tarihi + 'T00:00:00'))} · ${dkYaz(x.talep_edilen_dakika)}</div></div></div>
      <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="izinCizelgeIndir('${x.id}')">📄 Excel Çizelge İndir</button></div></div>`).join('')
    : '<div class="bos">Onaylanmış memur izni yok.</div>';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal aktif" id="cizelgeModal"><div class="modal-content">
    <h3>📄 Memur Fazla Mesai Çizelgeleri</h3>${satirlar}
    <button type="button" class="btn btn-link" onclick="document.getElementById('cizelgeModal').remove()">Kapat</button></div></div>`);
}

async function izinModalAc() {
  const kid = mevcutPersonel.id;
  const [{ data: icaps }, { data: izins }, { data: bekleyen }] = await Promise.all([
    sb.from('icap_gorevleri').select('*').eq('personel_id', kid).eq('durum', 'onaylandi'),
    sb.from('icap_izin_talepleri').select('*').eq('personel_id', kid).eq('durum', 'onaylandi'),
    sb.from('icap_izin_talepleri').select('*').eq('personel_id', kid).eq('durum', 'onay_bekliyor')
  ]);
  const bakiye = bakiyeHesapla(icaps, izins, mevcutPersonel.kadro);
  const bekleyenDk = (bekleyen || []).filter(x => yilOf(x.izin_tarihi) === bakiyeYili()).reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0);
  // Onay bekleyen talepler de düşülür: aynı hakla iki kez izin istenemesin
  anlikKalanBakiye = bakiye.kalanDk - bekleyenDk;
  const isci = izinGunluk(mevcutPersonel.kadro);
  const bekleyenNot = bekleyenDk > 0 ? `<div class="hucre-alt" style="margin-top:4px">Onay bekleyen talepleriniz: ${isci ? gunYaz(bekleyenDk / IZIN_GUN_DK) : dkYaz(bekleyenDk)} (düşüldü)</div>` : '';

  const giris = isci
    ? `<div class="form-grup">
         <label>Kaç gün izin kullanacaksınız?</label>
         <input type="number" id="izinGun" min="1" step="1" value="1" inputmode="numeric" oninput="izinHesapGuncelle()">
         <div class="hucre-alt" style="margin-top:4px">1 gün = 24 saat. İzin yalnızca 24 saatlik periyotlar halinde (1 gün = 24 saat, 2 gün = 48 saat…) talep edilebilir. Talep için en az 24 saatlik icap bakiyesi gerekir.</div>
       </div>`
    : `<div class="form-grup">
         <label>Talep Etmek İstediğiniz İzin (Saat)</label>
         <input type="number" id="izinSaat" min="1" step="0.5" value="24" inputmode="decimal" oninput="izinHesapGuncelle()">
       </div>`;

  const izinIcapKalanlar = icapKalanHesapla(icaps, [...(izins || []), ...(bekleyen || [])]);
  izinIcapSecim = { liste: izinIcapKalanlar, secili: [] };
  const izinIcapSecimHtml = `<div class="form-grup"><label>İzne Sayılacak İcaplar</label>
      <div class="hucre-alt" style="margin:-2px 0 8px">Yaptığınız icaplardan seçerek izin süresini (24 saat) tamamlayın. Seçilen icaplar çizelgeye satır satır yazılır; son icaptan gereken kısım alınır, kalanı bakiyenizde kalır.</div>
      <div id="izinSecimDurum" class="icap-sec-durum"></div>
      <div class="icap-sec-liste" id="izinIcapListe">${izinIcapListeHtml()}</div>
      ${izinIcapKalanlar.length ? '<button type="button" class="btn btn-link" style="padding:6px 0" onclick="izinIcapOtomatikSec()">⚡ En eski icaplardan otomatik seç</button>' : ''}
    </div>`;
  const html = `<div class="modal aktif" id="izinModal"><div class="modal-content">
    <h3 style="color:var(--violet)">📅 İcap İzni Talebi</h3>
    <div style="margin-bottom:12px">${bakiyeDokumHtml(bakiye, mevcutPersonel.kadro, true)}${bekleyenNot}</div>
    ${giris}
    <div class="dokum" style="margin-bottom:16px;">
       <div class="dokum-satir ilave"><span>Bu talep:</span><b id="hesaplananIzin"></b></div>
       <div class="dokum-satir toplam" style="border-bottom:none;"><span>İşlem sonrası kalan:</span><b id="kalanIzin"></b></div>
    </div>
    ${izinIcapSecimHtml}
    <div class="uyari" style="margin-bottom:12px; background:#e8f0fa; color:var(--blue); border-color:#cfe0f3;">
      ℹ️ <span>Talebiniz yetkili amire onay için iletilecektir.</span>
    </div>
    <div class="form-grup"><label>Tarih</label><input type="date" id="izinTarih" value="${new Date().toISOString().split('T')[0]}" min="${bakiyeYili()}-01-01" max="${bakiyeYili()}-12-31" onchange="izinHesapGuncelle()"></div>
    <div class="izin-cakisma" id="izinCakisma" style="display:none"></div>
    <div class="form-grup"><label>Açıklama</label><input type="text" id="izinAciklama" placeholder="İzin Açıklaması?"></div>
    <button type="button" class="btn btn-mor" onclick="izinTalepEt()">✓ Talebi Gönder</button>
    <button type="button" class="btn btn-link" onclick="document.getElementById('izinModal').remove()">İptal</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  izinHesapGuncelle();
}

// ---------- İZİN İÇİN İCAP SEÇİMİ ----------
let izinIcapSecim = { liste: [], secili: [] };

// Her icabın izinlerde kullanılmış kısmını düşerek kalan dakikaları verir (eski seçimsiz izinler en eski icaptan karşılanmış sayılır)
function icapKalanHesapla(icaplar, izinler, yil = bakiyeYili()) {
  const liste = (icaplar || []).filter(k => yilOf(k.baslama_zamani) === yil && (k.toplam_dakika || 0) > 0)
    .sort((x, y) => new Date(x.baslama_zamani) - new Date(y.baslama_zamani));
  const kalan = {}; liste.forEach(k => kalan[k.id] = k.toplam_dakika);
  const izl = (izinler || []).filter(x => yilOf(x.izin_tarihi) === yil).sort((x, y) => String(x.izin_tarihi).localeCompare(String(y.izin_tarihi)));
  izl.filter(x => Array.isArray(x.secilen_icaplar) && x.secilen_icaplar.length).forEach(x =>
    x.secilen_icaplar.forEach(s => { if (kalan[s.icap_id] !== undefined) kalan[s.icap_id] = Math.max(0, kalan[s.icap_id] - (s.dk || 0)); }));
  izl.filter(x => !(Array.isArray(x.secilen_icaplar) && x.secilen_icaplar.length)).forEach(x => {
    let ihtiyac = x.talep_edilen_dakika || 0;
    for (const k of liste) { if (ihtiyac <= 0) break; const al = Math.min(kalan[k.id], ihtiyac); kalan[k.id] -= al; ihtiyac -= al; }
  });
  return liste.filter(k => kalan[k.id] > 0).map(k => ({ id: k.id, bas: k.baslama_zamani, bit: k.bitis_zamani, toplam: k.toplam_dakika, kalan: kalan[k.id], aciklama: k.gorev_aciklamasi }));
}
function izinIcapListeHtml() {
  if (!izinIcapSecim.liste.length) return '<div class="bos" style="padding:12px">Bu yıl izne sayılabilecek onaylı icap yok.</div>';
  return izinIcapSecim.liste.map(k => {
    const sira = izinIcapSecim.secili.indexOf(k.id) + 1;
    return `<label class="icap-sec-satir${sira ? ' secili' : ''}">
      <input type="checkbox" ${sira ? 'checked' : ''} onchange="izinIcapToggle('${k.id}')">
      <span class="icap-sec-bilgi"><b>${esc(tarihYaz(k.bas))}</b> · ${esc(saatYaz(k.bas))}${k.bit ? ' → ' + (tarihYaz(k.bit) !== tarihYaz(k.bas) ? '<b>' + esc(tarihYaz(k.bit)) + '</b> · ' : '') + esc(saatYaz(k.bit)) : ''}${String(k.aciklama || '').replace('[MANUEL]', '').trim() ? '<br><small style="color:#64748b">' + esc(String(k.aciklama).replace('[MANUEL]', '').trim()) + '</small>' : ''}</span>
      <span class="icap-sec-sure">${dkYaz(k.kalan)}${k.kalan < k.toplam ? '<small>/' + dkYaz(k.toplam) + '</small>' : ''}</span></label>`;
  }).join('');
}
// Seçim planı: tıklama sırasıyla hedef süre dolana kadar alır; son icaptan yalnız gereken kısım kullanılır
function izinSecimPlani() {
  const hedef = izinTalepDakika();
  let ihtiyac = hedef, fazla = false; const parcalar = [];
  izinIcapSecim.secili.forEach(id => {
    const k = izinIcapSecim.liste.find(x => x.id === id); if (!k) return;
    if (ihtiyac <= 0) { fazla = true; return; }
    const al = Math.min(k.kalan, ihtiyac); parcalar.push({ icap_id: id, dk: al }); ihtiyac -= al;
  });
  return { hedef, parcalar, eksik: Math.max(0, ihtiyac), fazla, secilen: hedef - Math.max(0, ihtiyac) };
}
function izinIcapSecimGoster() {
  const p = izinSecimPlani(), el = document.getElementById('izinSecimDurum'); if (!el) return;
  let cls = 'icap-sec-durum', metin;
  if (!izinIcapSecim.secili.length) metin = `Hedef: ${dkYaz(p.hedef)} · henüz icap seçilmedi`;
  else if (p.fazla) { cls += ' hata'; metin = `Fazla icap seçtiniz — ${dkYaz(p.hedef)} doldu. Son seçilenleri kaldırın.`; }
  else if (p.eksik > 0) { cls += ' eksik'; metin = `Seçilen: ${dkYaz(p.secilen)} / ${dkYaz(p.hedef)} · ${dkYaz(p.eksik)} daha seçin`; }
  else { cls += ' tamam'; metin = `✓ ${dkYaz(p.hedef)} tamamlandı`; }
  el.className = cls; el.innerText = metin;
  const l = document.getElementById('izinIcapListe'); if (l) l.querySelectorAll('.icap-sec-satir').forEach((s, i) => s.classList.toggle('secili', izinIcapSecim.secili.includes(izinIcapSecim.liste[i]?.id)));
}
window.izinIcapToggle = function(id) {
  const i = izinIcapSecim.secili.indexOf(id);
  if (i >= 0) izinIcapSecim.secili.splice(i, 1); else izinIcapSecim.secili.push(id);
  izinIcapSecimGoster();
};
window.izinIcapOtomatikSec = function() {
  const hedef = izinTalepDakika(); let top = 0; izinIcapSecim.secili = [];
  for (const k of izinIcapSecim.liste) { if (top >= hedef) break; izinIcapSecim.secili.push(k.id); top += k.kalan; }
  const l = document.getElementById('izinIcapListe'); if (l) l.innerHTML = izinIcapListeHtml();
  izinIcapSecimGoster();
};

// Formdaki talebi dakikaya çevirir (işçi: tam gün, memur: saat)
function izinTalepDakika() {
  if (izinGunluk(mevcutPersonel.kadro)) {
    const g = Math.floor(parseFloat(document.getElementById('izinGun')?.value) || 0);
    return g > 0 ? g * IZIN_GUN_DK : 0;
  }
  const s = parseFloat(document.getElementById('izinSaat')?.value) || 0;
  return s > 0 ? Math.round(s * 60) : 0;
}


// ---------- İZİN ÇAKIŞMA KONTROLÜ (aynı vardiya personeli) ----------
const gunEkle = (tarih, n) => { const d = new Date(tarih + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tarihTR = t => String(t).split('-').reverse().join('.');
function izinAraligiYazi(tarih, dk) { const [c1, c2] = izinAraligi(tarih, dk); return c1 === c2 ? tarihTR(c1) : tarihTR(c1) + ' → ' + tarihTR(c2); }
function izinAraligi(tarih, dk) { const gun = Math.max(1, Math.ceil((dk || 0) / IZIN_GUN_DK)); return [tarih, gunEkle(tarih, gun - 1)]; }
// Aynı vardiyadaki diğer personelin (onaylı veya onay bekleyen) izinleriyle tarih çakışması
async function izinCakismalariGetir(personelId, vardiya, tarih, dk, haricId = null) {
  if (!vardiya || !tarih) return [];
  const [b1, b2] = izinAraligi(tarih, dk);
  try {
    const { data, error } = await sb.from('icap_izin_talepleri')
      .select('id, personel_id, izin_tarihi, talep_edilen_dakika, durum, personel:personel_id(ad_soyad, vardiya)')
      .in('durum', ['onay_bekliyor', 'onaylandi']).gte('izin_tarihi', gunEkle(b1, -30)).lte('izin_tarihi', b2);
    if (error) return [];
    return (data || []).filter(x => x.personel && x.personel.vardiya === vardiya && x.personel_id !== personelId && x.id !== haricId)
      .filter(x => { const [c1, c2] = izinAraligi(x.izin_tarihi, x.talep_edilen_dakika); return c1 <= b2 && c2 >= b1; });
  } catch (e) { return []; }
}
const cakismaSatirlari = liste => liste.map(x => {
  const [c1, c2] = izinAraligi(x.izin_tarihi, x.talep_edilen_dakika);
  return `• <b>${esc(x.personel.ad_soyad)}</b> — ${tarihTR(c1)}${c2 !== c1 ? ' → ' + tarihTR(c2) : ''} (${x.durum === 'onaylandi' ? 'onaylı izin' : 'onay bekliyor'})`;
}).join('<br>');
window.izinCakismaGuncelle = async function() {
  const el = document.getElementById('izinCakisma'); if (!el) return;
  const tarih = document.getElementById('izinTarih')?.value, dk = izinTalepDakika();
  const liste = await izinCakismalariGetir(mevcutPersonel.id, mevcutPersonel.vardiya, tarih, dk);
  if (!document.getElementById('izinCakisma')) return;
  el.innerHTML = liste.length ? `⚠️ <b>Çakışma uyarısı:</b> Aynı vardiyadan başka personel de bu tarihlerde izinli/izin talebinde.<br>${cakismaSatirlari(liste)}` : '';
  el.style.display = liste.length ? 'block' : 'none';
};

window.izinHesapGuncelle = function() {
  const isci = izinGunluk(mevcutPersonel.kadro);
  const dk = izinTalepDakika();
  const sonra = anlikKalanBakiye - dk;
  document.getElementById('hesaplananIzin').innerText = isci ? `${gunYaz(dk / IZIN_GUN_DK)} (${dk / 60} saat)` : dkYaz(dk);
  const el = document.getElementById('kalanIzin');
  el.innerText = dkYaz(sonra);
  el.style.color = sonra < 0 ? 'var(--red)' : 'var(--blue)';
  window.izinCakismaGuncelle && izinCakismaGuncelle();
  izinIcapSecimGoster();
};

async function izinTalepEt() {
  const isci = izinGunluk(mevcutPersonel.kadro);
  const toplamDk = izinTalepDakika();
  if (toplamDk <= 0) return toast(isci ? "En az 1 gün girin." : "Geçerli süre girin.");
  const tarih = document.getElementById('izinTarih').value;
  if (!tarih) return toast("Tarih seçin.");
  if (yilOf(tarih) !== bakiyeYili() || yilOf(izinAraligi(tarih, toplamDk)[1]) !== bakiyeYili())
    return toast(`İcap bakiyeleri her yıl 1 Ocak'ta sıfırlanır. İzin tarihleri ${bakiyeYili()} yılı içinde olmalıdır.`);
  const eksiMi = (anlikKalanBakiye - toplamDk) < 0;

  // İcap seçimi: bakiyesi yeterli personel izin süresini (24 saat) seçtiği icaplarla tamamlamak zorunda
  const plan = izinSecimPlani();
  if (plan.fazla) return toast("Fazla icap seçtiniz. İzin süresi dolduktan sonraki icapların seçimini kaldırın.");
  if (!eksiMi && plan.eksik > 0) return toast(`İzin süresini tamamlamak için ${dkYaz(plan.eksik)} daha icap seçin.`);

  const cakisanlar = await izinCakismalariGetir(mevcutPersonel.id, mevcutPersonel.vardiya, tarih, toplamDk);
  if (cakisanlar.length) {
    const ad = cakisanlar.map(x => `• ${x.personel.ad_soyad} (${tarihTR(x.izin_tarihi)}${x.durum === 'onaylandi' ? ', onaylı' : ', onay bekliyor'})`).join('\n');
    if (!confirm(`⚠️ ÇAKIŞMA: Aynı vardiyadan şu personel bu tarihlerde izinli/izin talebinde:\n\n${ad}\n\nYine de talep gönderilsin mi? (Vardiya çavuşu çakışmayı görerek karar verecek.)`)) return;
  }

  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if (!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek ve talep Grup Amiri onayına gidecek. Devam edilsin mi?")) return;
  }

  const kayit = {
      personel_id: mevcutPersonel.id,
      talep_edilen_dakika: toplamDk,
      izin_tarihi: tarih,
      aciklama: document.getElementById('izinAciklama').value,
      eksi_bakiye_mi: eksiMi
  };
  let { error } = await sb.from('icap_izin_talepleri').insert([{ ...kayit, secilen_icaplar: plan.parcalar }]);
  if (error && /secilen_icaplar/.test(error.message || '')) {
    // SQL güncellemesi henüz çalıştırılmamış: seçimsiz (eski) kayıt olarak gönder
    ({ error } = await sb.from('icap_izin_talepleri').insert([kayit]));
  }
  if (error) return toast("Talep gönderilemedi: " + error.message);

  document.getElementById('izinModal').remove();
  toast("İzin talebiniz iletildi.", "basari");
  await logEkle("İzin Talebi Oluşturdu", isci ? `${toplamDk / IZIN_GUN_DK} gün` : dkYaz(toplamDk));
  panelYukle();
}

async function hazirIcapciModalAc(varsayilanVardiya = null) {
  if (document.getElementById('hazirModal')) return;

  if (mevcutPersonel.rol === 'vardiya_cavusu') {
    if (!mevcutPersonel.vardiya) return toast("Vardiyanız sistemde tanımlı değil. Yöneticinize başvurun.");
    if (parseInt(mevcutPersonel.vardiya) === sistemAyar.aktif_vardiya) {
      return toast("Vardiyanız şu anda 24 saat esaslı nöbette olduğu için icapçı seçimi yapamazsınız. Lütfen nöbet değişimini bekleyin.");
    }
  }

  let vardiyaSecimiHtml = '';
  if (mevcutPersonel.rol !== 'vardiya_cavusu') {
    const v1 = sistemAyar.aktif_vardiya === 1;
    const v2 = sistemAyar.aktif_vardiya === 2;
    const v3 = sistemAyar.aktif_vardiya === 3;
    let defaultSec = varsayilanVardiya || (v1 ? 2 : (v2 ? 3 : 1));

    vardiyaSecimiHtml = `<div class="form-grup"><label>Hangi Vardiya İçin?</label><select id="secVardiya" onchange="hazirPersonelleriGetir()">
      <option value="1" ${v1 ? 'disabled' : (defaultSec === 1 ? 'selected' : '')}>1. Vardiya ${v1 ? '(Nöbette)' : ''}</option>
      <option value="2" ${v2 ? 'disabled' : (defaultSec === 2 ? 'selected' : '')}>2. Vardiya ${v2 ? '(Nöbette)' : ''}</option>
      <option value="3" ${v3 ? 'disabled' : (defaultSec === 3 ? 'selected' : '')}>3. Vardiya ${v3 ? '(Nöbette)' : ''}</option>
    </select></div>`;
  } else {
    vardiyaSecimiHtml = `<input type="hidden" id="secVardiya" value="${mevcutPersonel.vardiya}">`;
  }
  const html = `<div class="modal aktif" id="hazirModal"><div class="modal-content">
    <h3>🚨 İcap Görevli Personel Seçimi</h3>
    <p class="alt-not">İstirahat dönemi için 1 Er ve 1 Şoför seçiniz.</p>
    ${vardiyaSecimiHtml}
    <div id="hazirPersonelAlan"></div>
    <button type="button" class="btn btn-primary" onclick="hazirKaydet()">Seçimi Onayla</button>
    <button type="button" class="btn btn-link" onclick="document.getElementById('hazirModal').remove()">İptal</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  hazirPersonelleriGetir();
}

async function hazirPersonelleriGetir() {
  const vardiya = parseInt(document.getElementById('secVardiya').value);
  if (isNaN(vardiya)) {
    document.getElementById('hazirPersonelAlan').innerHTML = '<div class="bos">Geçersiz vardiya. Lütfen yöneticinize başvurun.</div>';
    return;
  }

  if (vardiya === sistemAyar.aktif_vardiya) {
    document.getElementById('hazirPersonelAlan').innerHTML = `<div class="uyari" style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:12px; border-radius:8px;">⚠️ <span><b>${vardiya}. Vardiya</b> şu anda 24 saat esaslı nöbette olduğu için icapçı seçilemez.</span></div>`;
    return;
  }

  const { data: personeller } = await sb.from('personel').select('*').eq('vardiya', vardiya);
  const liste = personeller || [];
  const filtrelenmisListe = liste.filter(p => p.rol !== 'grup_amiri');
  
  let erler = filtrelenmisListe.filter(p => p.nitelik === 'er');
  let soforler = filtrelenmisListe.filter(p => p.nitelik === 'sofor');

  if (mevcutPersonel.rol === 'vardiya_cavusu' && parseInt(mevcutPersonel.vardiya) === vardiya) {
    // Çavuş yalnızca kendi niteliğine göre listelenir (Er ise Er listesinde, Şoför ise Şoför listesinde)
    const nitelik = mevcutPersonel.nitelik;
    if ((nitelik === 'er' || !nitelik) && !erler.some(p => p.id === mevcutPersonel.id)) erler.push(mevcutPersonel);
    if (nitelik === 'sofor' && !soforler.some(p => p.id === mevcutPersonel.id)) soforler.push(mevcutPersonel);
  }
  
  document.getElementById('hazirPersonelAlan').innerHTML = `
    <div class="form-grup"><label>İtfaiye Eri / Çavuş</label>
      <select id="secEr">
        ${erler.length ? erler.map(e => `<option value="${e.id}">${esc(e.ad_soyad)} (${esc(rolAd(e.rol))})</option>`).join('') : '<option value="">Er bulunamadı</option>'}
      </select>
    </div>
    <div class="form-grup"><label>İtfaiye Şoförü / Çavuş</label>
      <select id="secSofor">
        ${soforler.length ? soforler.map(s => `<option value="${s.id}">${esc(s.ad_soyad)} (${esc(rolAd(s.rol))})</option>`).join('') : '<option value="">Şoför bulunamadı</option>'}
      </select>
    </div>`;
}

async function hazirKaydet() {
  const vardiya = parseInt(document.getElementById('secVardiya').value);
  const erId = document.getElementById('secEr')?.value;
  const soforId = document.getElementById('secSofor')?.value;

  if (isNaN(vardiya)) return toast("Geçersiz vardiya. Lütfen yöneticinize başvurun.");
  if (vardiya === sistemAyar.aktif_vardiya) return toast("Nöbetçi vardiya (24 saat esaslı) icapçı olarak seçilemez!");
  if (mevcutPersonel.rol === 'vardiya_cavusu' && vardiya !== parseInt(mevcutPersonel.vardiya)) return toast("Vardiya çavuşu yalnızca kendi vardiyasının icap ekibini değiştirebilir.");
  if (!erId || !soforId) return toast("Lütfen personel seçin. (Er veya Şoför bulunamadıysa yöneticinize başvurun)");
  if (erId === soforId) return toast("Er ve Şoför aynı kişi olamaz. Lütfen farklı kişiler seçin."); 
  
  const simdi = new Date(); 
  const bitis = new Date(simdi.getTime() + (48 * 60 * 60 * 1000));

  const { data: yeniKayit, error: insertError } = await sb.from('hazir_icapcilar').insert([{ 
    vardiya: vardiya, 
    er_personel_id: erId, 
    sofor_personel_id: soforId, 
    baslangic_zamani: simdi.toISOString(), 
    bitis_zamani: bitis.toISOString(), 
    secen_cavus_id: mevcutPersonel.id,
    durum: 'aktif'
  }]).select();

  if (insertError) {
    toast("Kayıt hatası: " + insertError.message);
    return; 
  }

  if (yeniKayit && yeniKayit.length > 0) {
    await sb.from('hazir_icapcilar')
      .update({ durum: 'iptal' })
      .eq('vardiya', vardiya)
      .eq('durum', 'aktif')
      .neq('id', yeniKayit[0].id);
  }

  document.getElementById('hazirModal').remove();
  toast("İcapçılar belirlendi.", "basari");
  await logEkle("İcapçı Seçti", `${vardiya}. Vardiya`);
  panelYukle();
}

async function icapciEkipSil(id) {
  if (!confirm("Bu İcap Ekibini iptal etmek/silmek istediğinize emin misiniz?")) return;
  const { error } = await sb.from('hazir_icapcilar').update({ durum: 'iptal' }).eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { 
    toast("İcap Ekibi silindi.", "basari"); 
    await logEkle("İcap Ekibi Sildi", "Süper Admin İşlemi"); 
    panelYukle(); 
  }
}

// ---------- SÜPER ADMİN PANELİ ----------
function adminPaneliAc(sekme = 'personel') {
  document.getElementById('adminModal')?.remove();
  const html = `<div class="modal aktif" id="adminModal" style="align-items:flex-start;padding-top:20px"><div class="modal-content" style="max-width:860px">
    <div class="modal-baslik">
      <h3>🛠️ Yönetim Paneli</h3>
      <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('adminModal').remove()">Kapat ✕</button>
    </div>
    <div class="sekmeler">
      <button type="button" class="sekme aktif" id="tabBtnPersonel" onclick="adminTab('personel')">👥 Personel</button>
      <button type="button" class="sekme" id="tabBtnAyarlar" onclick="adminTab('ayarlar')">⚙️ Sistem Ayarları</button>
    </div>
    <div id="adminIcerik"></div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  adminTab(sekme);
}

async function adminTab(tab) {
  const el = document.getElementById('adminIcerik');
  document.getElementById('tabBtnPersonel')?.classList.toggle('aktif', tab === 'personel');
  document.getElementById('tabBtnAyarlar')?.classList.toggle('aktif', tab === 'ayarlar');
  el.innerHTML = '<div class="bos">Yükleniyor...</div>';

  if (tab === 'personel') {
    const { data: personeller } = await sb.from('personel').select('*').order('rol').order('vardiya');
    window._adminPersonelListesi = personeller || []; 

    el.innerHTML = `
      <div class="panel-kutu">
        <h4>Yeni Personel Ekle</h4>
        <div class="form-satir" style="margin-top:12px">
          <div class="form-grup"><label>Ad Soyad</label><input type="text" id="addAd" placeholder="Örn: Ahmet Yılmaz"></div>
          <div class="form-grup"><label>E-posta</label><input type="email" id="addEmail" placeholder="ahmet@gmail.com"></div>
          <div class="form-grup"><label>Rol (Yetki)</label>
            <select id="addRol">
              <option value="itfaiye_eri">İtfaiye Eri</option>
              <option value="itfaiye_soforu">İtfaiye Şoförü</option>
              <option value="vardiya_cavusu">Vardiya Çavuşu</option>
              <option value="grup_amiri">Grup Amiri</option>
              <option value="gunduz_85">Gündüz 8/5</option>
              <option value="gunduz_816">Gündüz 8/16</option>
              <option value="super_admin">Süper Admin</option>
            </select>
          </div>
          <div class="form-grup"><label>Görev Niteliği</label>
            <select id="addNitelik">
              <option value="er">Er</option>
              <option value="sofor">Şoför</option>
              <option value="yok">Yok (İdari)</option>
            </select>
          </div>
          <div class="form-grup"><label>Vardiya</label>
            <select id="addVardiya">
              <option value="">Gündüz / Yok</option>
              <option value="1">1. Vardiya</option>
              <option value="2">2. Vardiya</option>
              <option value="3">3. Vardiya</option>
            </select>
          </div>
          <div class="form-grup"><label>Sicil No (memur çizelgesi için)</label><input type="text" id="addSicil" inputmode="numeric" placeholder="Örn: 4143"></div>
          <div class="form-grup"><label>Kadro (Hak Çarpanı)</label>
            <select id="addKadro">
              <option value="isci">İşçi (Şirket Personeli)</option>
              <option value="memur">Memur (Birebir)</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-success" style="margin:0;width:auto" onclick="personelEkle()">➕ Personeli Kaydet</button>
      </div>

      <div class="panel-kutu" style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:12px 16px;">
        <h4 style="margin:0; font-size:14px; color:#30363d;">Personel Listesi</h4>
        <select id="adminVardiyaFiltre" onchange="filtrelePersonelListesi(this.value)" style="width:auto; padding:8px 12px; border-radius:8px; border:1.5px solid #d5dce5; font-size:13px; font-weight:700; color:#18202b; outline:none;">
          <option value="tumu">Tüm Personel</option>
          <option value="1">1. Vardiya</option>
          <option value="2">2. Vardiya</option>
          <option value="3">3. Vardiya</option>
          <option value="gunduz">Gündüz Personeli</option>
        </select>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol / Nitelik</th><th>Kadro</th><th>Sicil No</th><th>Vardiya</th><th>Durum</th><th class="sag">Sil</th></tr></thead>
          <tbody id="adminPersonelTbody"></tbody>
        </table>
      </div>`;

    filtrelePersonelListesi('tumu');
    
  } else if (tab === 'ayarlar') {
    el.innerHTML = `
      <div class="panel-kutu">
        <h4>Aktif Vardiya</h4>
        <p class="alt-not">Otomasyonun kaçırdığı durumlarda aktif vardiyayı manuel değiştirebilirsiniz.</p>
        <div class="form-grup"><label>Şu Anki Aktif Vardiya</label><input type="number" id="ayarVardiya" value="${sistemAyar.aktif_vardiya}" min="1" max="3" style="max-width:120px"></div>
        <button type="button" class="btn btn-primary" style="width:auto;margin:0" onclick="ayarKaydet()">Ayarları Güncelle</button>
      </div>
      <div class="panel-kutu" style="background:var(--green-soft);border-color:#c3e6d6">
        <h4 style="color:var(--green)">📦 Yedek Yönetimi</h4>
        <p class="alt-not">Sistem her gece 22:00'de otomatik yedek alır. En son yedeği indirebilir veya daha önce aldığınız bir yedeği geri yükleyebilirsiniz.</p>
        <button type="button" class="btn btn-success" style="width:auto" onclick="sonYedegiIndir()">⬇ En Son Yedeği İndir</button>
        <hr style="border:0;border-top:1px dashed #b5dccb;margin:14px 0">
        <div class="uyari">⚠️ <span>Dikkat: Geri yükleme işlemi mevcut verilerle çakışabilir.</span></div>
        <input type="file" id="yedekGeriYukleInput" accept=".json" style="display:none" onchange="yedekGeriYukleIslem(event)">
        <button type="button" class="btn btn-kirmizi" style="width:auto;margin:0" onclick="yedekGeriYukleTetikle()">⬆ Yedek Dosyası Seç ve Geri Yükle</button>
      </div>`;
  }
}

function filtrelePersonelListesi(secim) {
  const tbody = document.getElementById('adminPersonelTbody');
  if (!tbody || !window._adminPersonelListesi) return;

  let filtrelenmisListe = window._adminPersonelListesi;

  if (secim !== 'tumu') {
    if (secim === 'gunduz') {
      filtrelenmisListe = filtrelenmisListe.filter(p => p.vardiya === null || p.vardiya === undefined);
    } else {
      filtrelenmisListe = filtrelenmisListe.filter(p => p.vardiya === parseInt(secim));
    }
  }

  let rows = '';
  if (filtrelenmisListe.length === 0) {
    rows = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#8d97a5;">Bu vardiyada kayıtlı personel bulunamadı.</td></tr>';
  } else {
    filtrelenmisListe.forEach(p => {
      const vardiyaAd = p.vardiya ? p.vardiya + ". Vardiya" : "Gündüz";
      const durum = p.auth_user_id ? '<span class="rozet r-yesil">Aktif</span>' : '<span class="rozet r-turuncu">Kayıt Bekliyor</span>';
      const nitelikAd = p.nitelik === 'sofor' ? '🚛 Şoför' : (p.nitelik === 'er' ? '👨‍🚒 Er' : '');
      const kadroSec = `<select class="kadro-sec" onchange="personelKadroDegistir('${p.id}', this.value)">
          ${!p.kadro ? '<option value="" selected disabled>Seçiniz</option>' : ''}
          <option value="isci" ${p.kadro === 'isci' ? 'selected' : ''}>İşçi</option>
          <option value="memur" ${p.kadro === 'memur' ? 'selected' : ''}>Memur</option>
        </select>`;

      rows += `<tr>
        <td class="hucre-isim">${esc(p.ad_soyad)}</td>
        <td>${esc(p.email)}</td>
        <td>${mevcutPersonel?.rol === 'super_admin' ? rolNitelikSecHtml(p) : `${rolRozet(p.rol)} <br><small style="color:#666">${nitelikAd}</small>`}</td>
        <td>${kadroSec}</td>
        <td><input type="text" class="sicil-input" value="${esc(p.sicil_no || '')}" inputmode="numeric" placeholder="Sicil" onchange="personelSicilKaydet('${p.id}', this.value)"></td>
        <td>${vardiyaAd}</td>
        <td>${durum}</td>
        <td class="sag"><button type="button" class="sil-btn" onclick="personelSil('${p.id}')" title="Sil">🗑️</button></td>
      </tr>`;
    });
  }
  
  tbody.innerHTML = rows;
}

async function personelEkle() {
  const ad = document.getElementById('addAd').value;
  const email = (document.getElementById('addEmail').value || '').trim().toLowerCase();
  const rol = document.getElementById('addRol').value;
  const nitelik = document.getElementById('addNitelik').value;
  const vardiya = document.getElementById('addVardiya').value;
  const kadro = document.getElementById('addKadro').value;
  
  if (!ad || !email) return toast("Lütfen tüm alanları doldurun.");
  
  const { error } = await sb.from('personel').insert([{ 
    ad_soyad: ad, 
    email: email, 
    rol: rol, 
    nitelik: nitelik, 
    vardiya: vardiya ? parseInt(vardiya) : null,
    kadro: kadro,
    sicil_no: (document.getElementById('addSicil')?.value || '').trim() || null
  }]);
  
  if (error) toast("Hata: " + error.message);
  else { toast("Personel başarıyla eklendi.", "basari"); await logEkle("Personel Ekledi", ad); adminTab('personel'); }
}

// ---------- ROL / GÖREV NİTELİĞİ DEĞİŞTİRME (yalnızca Süper Admin) ----------
// Kayıt aynı satırda güncellenir (id değişmez): geçmiş icap, izin ve bakiye kayıtları etkilenmez.
const ROL_SECENEKLERI = [['itfaiye_eri', 'İtfaiye Eri'], ['itfaiye_soforu', 'İtfaiye Şoförü'], ['vardiya_cavusu', 'Vardiya Çavuşu'], ['grup_amiri', 'Grup Amiri'], ['gunduz_85', 'Gündüz 8/5'], ['gunduz_816', 'Gündüz 8/16'], ['super_admin', 'Süper Admin']];
function rolNitelikSecHtml(p) {
  const kendi = mevcutPersonel && mevcutPersonel.id === p.id;
  return `<select class="kadro-sec" ${kendi ? 'disabled title="Kendi rolünüzü değiştiremezsiniz"' : ''} onchange="personelRolDegistir('${p.id}', this.value)">
      ${ROL_SECENEKLERI.map(([k, ad]) => `<option value="${k}" ${p.rol === k ? 'selected' : ''}>${ad}</option>`).join('')}
    </select>
    <select class="kadro-sec" style="margin-top:4px" onchange="personelNitelikDegistir('${p.id}', this.value)">
      <option value="" ${!p.nitelik ? 'selected' : ''}>Nitelik: —</option>
      <option value="er" ${p.nitelik === 'er' ? 'selected' : ''}>👨‍🚒 Er</option>
      <option value="sofor" ${p.nitelik === 'sofor' ? 'selected' : ''}>🚛 Şoför</option>
    </select>`;
}
async function personelRolDegistir(id, rol) {
  const p = (window._adminPersonelListesi || []).find(x => x.id === id);
  const yenile = () => filtrelePersonelListesi(document.getElementById('adminVardiyaFiltre')?.value || 'tumu');
  if (mevcutPersonel?.rol !== 'super_admin') { toast("Bu işlem yalnızca Süper Admin içindir."); return yenile(); }
  if (mevcutPersonel.id === id) { toast("Kendi rolünüzü değiştiremezsiniz."); return yenile(); }
  const adMap = Object.fromEntries(ROL_SECENEKLERI);
  if (!confirm(`${p?.ad_soyad || 'Personel'} rolü "${adMap[rol] || rol}" olarak değiştirilsin mi?\n\nGeçmiş icap, izin ve bakiye kayıtları etkilenmez; yalnızca bundan sonraki yetkileri değişir.`)) return yenile();
  const guncelle = { rol };
  if (rol === 'itfaiye_eri') guncelle.nitelik = 'er';          // Er ↔ Şoför dönüşümünde görev niteliği de uyumlu kalsın
  if (rol === 'itfaiye_soforu') guncelle.nitelik = 'sofor';
  const { error } = await sb.from('personel').update(guncelle).eq('id', id);
  if (error) { toast("Hata: " + error.message); return yenile(); }
  if (p) Object.assign(p, guncelle);
  toast("Rol güncellendi.", "basari");
  await logEkle("Rol Değiştirdi", `${p?.ad_soyad || ''}: ${adMap[rol] || rol}`);
  yenile();
}
async function personelNitelikDegistir(id, nitelik) {
  const p = (window._adminPersonelListesi || []).find(x => x.id === id);
  const yenile = () => filtrelePersonelListesi(document.getElementById('adminVardiyaFiltre')?.value || 'tumu');
  if (mevcutPersonel?.rol !== 'super_admin') { toast("Bu işlem yalnızca Süper Admin içindir."); return yenile(); }
  const ad = nitelik === 'er' ? 'Er' : nitelik === 'sofor' ? 'Şoför' : 'Belirtilmedi';
  if (!confirm(`${p?.ad_soyad || 'Personel'} görev niteliği "${ad}" olarak değiştirilsin mi?\n\nGeçmiş kayıtlar etkilenmez; icap ekibi seçiminde yeni niteliğine göre listelenir.`)) return yenile();
  const { error } = await sb.from('personel').update({ nitelik: nitelik || null }).eq('id', id);
  if (error) { toast("Hata: " + error.message); return yenile(); }
  if (p) p.nitelik = nitelik || null;
  toast("Görev niteliği güncellendi.", "basari");
  await logEkle("Nitelik Değiştirdi", `${p?.ad_soyad || ''}: ${ad}`);
  yenile();
}

async function personelKadroDegistir(id, kadro) {
  const p = (window._adminPersonelListesi || []).find(x => x.id === id);
  const yenile = () => filtrelePersonelListesi(document.getElementById('adminVardiyaFiltre')?.value || 'tumu');
  if (!confirm(`${p?.ad_soyad || 'Personel'} kadrosu "${kadroAd(kadro)}" olarak değiştirilsin mi?\n\nDikkat: Bakiye, personelin tüm geçmiş icap kayıtları üzerinden güncel kadroya göre yeniden hesaplanır.`)) return yenile();
  
  const { error } = await sb.from('personel').update({ kadro }).eq('id', id);
  if (error) { toast("Hata: " + error.message); return yenile(); }
  if (p) p.kadro = kadro;
  if (mevcutPersonel && mevcutPersonel.id === id) { mevcutPersonel.kadro = kadro; panelYukle(); }
  toast("Kadro güncellendi.", "basari");
  await logEkle("Kadro Değiştirdi", `${p?.ad_soyad || ''}: ${kadroAd(kadro)}`);
  yenile();
}

async function personelSicilKaydet(id, deger) {
  const sicil = (deger || '').trim() || null;
  const { error } = await sb.from('personel').update({ sicil_no: sicil }).eq('id', id);
  if (error) return toast("Sicil kaydedilemedi (sicil_no sütunu eklenmiş mi?): " + error.message);
  const p = (window._adminPersonelListesi || []).find(x => x.id === id); if (p) p.sicil_no = sicil;
  toast("Sicil no güncellendi.", "basari");
}

async function personelSil(id) {
  if (!confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
  const { error } = await sb.from('personel').delete().eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { toast("Personel silindi.", "basari"); adminTab('personel'); }
}

async function ayarKaydet() {
  const yeniVardiya = parseInt(document.getElementById('ayarVardiya').value);
  if (![1, 2, 3].includes(yeniVardiya)) return toast("Vardiya 1, 2 veya 3 olabilir.");
  const { error } = await sb.from('sistem_ayarlari').update({ aktif_vardiya: yeniVardiya }).eq('id', 1);
  if (error) toast("Hata: " + error.message);
  else {
    sistemAyar.aktif_vardiya = yeniVardiya;
    await sb.from('hazir_icapcilar').update({ durum: 'iptal' }).eq('vardiya', yeniVardiya).eq('durum', 'aktif');
    panelYukle();
    document.getElementById('kpiVardiya').innerText = yeniVardiya + '. Vardiya';
    toast("Sistem ayarları güncellendi.", "basari");
    await logEkle("Vardiya Değiştirdi", `Yeni: ${yeniVardiya}. Vardiya`);
  }
}

async function raporCsvIndir() {
  const bas = document.getElementById('raporBaslangic').value;
  const bit = document.getElementById('raporBitis').value;
  if (!bas || !bit) return toast("Lütfen tarih aralığı seçin.");
  const basISO = new Date(bas + "T00:00:00").toISOString();
  const bitISO = new Date(bit + "T23:59:59").toISOString();

  const { data: icaps } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, kadro)').eq('durum', 'onaylandi').gte('baslama_zamani', basISO).lte('baslama_zamani', bitISO).order('baslama_zamani', { ascending: true });
  if (!icaps || !icaps.length) return toast("Seçilen tarihlerde onaylanmış icap yok.");

  let csv = "Personel,Rol,Kadro,Gorev Aciklamasi,Baslangic,Bitis,Icap Suresi (Saat),Hesaplanan Gun Katkisi (Isci)\n";
  const ozet = {};
  let topDk = 0;
  icaps.forEach(i => {
    const dk = i.toplam_dakika || 0;
    const isci = isIsci(i.personel.kadro);
    topDk += dk;
    const o = ozet[i.personel_id] || (ozet[i.personel_id] = { ad: i.personel.ad_soyad, kadro: i.personel.kadro, dk: 0 });
    o.dk += dk;
    const aciklama = (i.gorev_aciklamasi || "").replace(/"/g, '""');
    csv += `"${i.personel.ad_soyad}","${rolAd(i.personel.rol)}","${kadroAd(i.personel.kadro)}","${aciklama}","${new Date(i.baslama_zamani).toLocaleString('tr-TR')}","${new Date(i.bitis_zamani).toLocaleString('tr-TR')}",${(dk / 60).toFixed(2)},${isci ? icapGunKatki(dk).toFixed(2) : ''}\n`;
  });
  csv += `"TOPLAM","","","","","",${(topDk / 60).toFixed(2)},\n\n`;
  csv += "OZET (secilen donem),Kadro,Toplam Icap (Saat),Hesaplanan Gun (Isci),Hak Edilen Izin (Saat)\n";
  Object.values(ozet).forEach(o => {
    if (isIsci(o.kadro)) { const g = iscideGunHak(o.dk); csv += `"${o.ad}","${kadroAd(o.kadro)}",${(o.dk / 60).toFixed(2)},${g},${g * 8}\n`; }
    else csv += `"${o.ad}","${kadroAd(o.kadro)}",${(o.dk / 60).toFixed(2)},,${(o.dk / 60).toFixed(2)}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `icap_raporu_${bas}_${bit}.csv`; link.click();
  document.getElementById('raporModal')?.remove();
}

// ---------- YEDEKLEME / GERİ YÜKLEME ----------
async function veriYedekle() {
  toast("Yedek alınıyor, lütfen bekleyin...", "basari");
  try {
    const { error } = await sb.rpc('yedek_al');
    if (error) throw error;
    toast("Sistem başarıyla yedeklendi! (Supabase Bulut)", "basari");
    await logEkle("Manuel Yedek Aldı", "Buluta kaydedildi");
  } catch (e) {
    toast("Yedekleme hatası: " + e.message);
  }
}

async function sonYedegiIndir() {
  toast("Son yedek aranıyor...", "basari");
  const { data, error } = await sb.from('yedekler').select('*').order('tarih', { ascending: false }).limit(1).single();
  if (error || !data) { toast("Henüz kaydedilmiş bir yedek bulunamadı."); return; }

  const str = JSON.stringify(data.veri, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${data.dosya_adi}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Yedek dosyası indirildi.", "basari");
}

function yedekGeriYukleTetikle() { document.getElementById('yedekGeriYukleInput').click(); }

async function yedekGeriYukleIslem(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm("DİKKAT! Mevcut verilerinizin üzerine yedekteki veriler yazılacaktır. İşleme devam etmek istiyor musunuz?")) {
    event.target.value = '';
    return;
  }

  toast("Yedek dosyası okunuyor...", "basari");
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const icerik = JSON.parse(e.target.result);
      if (!icerik.personel || !icerik.icap_gorevleri) throw new Error("Geçersiz yedek dosyası formatı!");

      toast("Personeller yükleniyor...", "basari");
      await sb.from('personel').upsert(icerik.personel, { onConflict: 'id' });

      toast("İcap kayıtları yükleniyor...", "basari");
      await sb.from('icap_gorevleri').upsert(icerik.icap_gorevleri, { onConflict: 'id' });

      if (icerik.izin_talepleri) {
        toast("İzin talepleri yükleniyor...", "basari");
        await sb.from('icap_izin_talepleri').upsert(icerik.izin_talepleri, { onConflict: 'id' });
      }
      if (icerik.hazir_icapcilar) {
        toast("İcapçılar yükleniyor...", "basari");
        await sb.from('hazir_icapcilar').upsert(icerik.hazir_icapcilar, { onConflict: 'id' });
      }
      if (icerik.log_kayitlari) {
        toast("Sistem hareketleri yükleniyor...", "basari");
        try { await sb.from('log_kayitlari').insert(icerik.log_kayitlari); }
        catch (logErr) { console.warn("Bazı loglar zaten mevcut olduğu için atlandı."); }
      }

      toast("Sistem başarıyla geri yüklendi!", "basari");
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      alert("Geri Yükleme Hatası: " + err.message);
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

// Sayfa açılışında oturum kontrolü
if (sb) { sb.auth.getSession().then(({ data: { session } }) => { if (session) sb.auth.getSession().then(({ data: { session } }) => { if (session) oturumBaslat(session.user); }); }); }
