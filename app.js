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
const isIsci = kadro => kadro === 'isci'; // kadrosu boş olan memur gibi (1:1) hesaplanır

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

// ---------- İŞÇİ İCAP İZNİ: (Saat × 1,6) / 7,5 = Gün ----------
// Daire başkanlığı: 14 sa 10 dk icap × 1,6 / 7,5 = 3 "gün" ve bu 3 gün, 1 nöbet günü (24 saat) izne denk gelir.
// Yani formülden çıkan her "gün" 8 saatlik bir iş günüdür; 3 gün = 24 saat = 1 tam nöbet günü izin.
// Hesap tam sayı aritmetiğiyle yapılır (dk × 16 / 4500). Gün, toplam icap üzerinden aşağı yuvarlanır.
const IZIN_GUN_DK = 24 * 60;          // 1 tam izin günü = 24 saatlik nöbet günü
const ISCI_IS_GUNU_DK = 8 * 60;       // formüldeki her "gün" = 8 saat izin
const ISCI_GUN_ICAP_DK = 4500 / 16;   // 1 formül günü için gereken icap = 281,25 dk
const ISCI_TAM_GUN_ICAP_DK = 3 * ISCI_GUN_ICAP_DK; // 24 saat izin için gereken icap = 843,75 dk (14 sa 3 dk 45 sn)
function iscideGunHak(toplamDk) { return Math.floor(Math.round((toplamDk || 0) * 16) / 4500); }
function icapGunKatki(dk) { return (dk || 0) * 16 / 4500; } // tek icabın formül günü (bilgi amaçlı)

// Dönüş: işçi → { isci:true, toplamDk, kullanilanDk, hakGun, hakDk, kalanDk, tamGun, sonrakiTamGunDk, ilerleme }
//        memur → { isci:false, toplamDk, kullanilanDk, kalanDk }
function bakiyeHesapla(icaplar, izinler, kadro) {
  const toplamDk = (icaplar || []).reduce((s, k) => s + (k.toplam_dakika || 0), 0);
  const kullanilanDk = (izinler || []).reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0);
  if (isIsci(kadro)) {
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

function bakiyeDokumHtml(b, kadro, kompakt = false) {
  const eksi = bakiyeEksiMi(b);
  const uyari = !kadro ? `<div class="uyari" style="margin-top:10px">⚠️ <span>Kadronuz (memur/işçi) seçilmemiş. Yöneticinize bildirin; o zamana kadar icap süreniz 1'e 1 hesaplanır.</span></div>` : '';
  const aciklama = (baslik, metin) => `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--blue)">${baslik}</summary><div style="font-size:12.5px;line-height:1.55;color:var(--text);margin-top:8px">${metin}</div></details>`;

  if (b.isci) {
    if (kompakt) {
      return `<div class="dokum"><div class="dokum-satir kalan ${eksi ? 'eksi' : ''}"><span>Kullanabileceğiniz izin</span><b>${dkYaz(b.kalanDk)}</b></div>
        <div class="dokum-satir"><span>Tam izin günü (24 saat)</span><b>${b.tamGun} gün</b></div></div>`;
    }
    const alt = eksi ? 'Eksi bakiye'
      : b.tamGun > 0 ? `${b.tamGun} tam gün (24 saat) izin kullanabilirsiniz`
      : 'Tam gün (24 saat) izin için biraz daha icap gerekiyor';
    const hero = `<div class="bakiye-hero ${eksi ? 'eksi' : ''}">
        <div class="bakiye-hero-etiket">KAZANDIĞINIZ İZİN</div>
        <div class="bakiye-hero-deger" style="font-size: clamp(28px, 9vw, 38px);">${dkYaz(b.kalanDk)}</div>
        <div class="bakiye-hero-alt" style="margin-top:4px">${alt}</div>
        <div style="margin-top:14px;text-align:left">
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:5px"><span>Bir sonraki 24 saatlik izne</span><b>${dkYaz(b.sonrakiTamGunDk)} icap kaldı</b></div>
          <div style="height:8px;border-radius:99px;background:rgba(0,0,0,.12);overflow:hidden"><div style="height:100%;width:${Math.round(b.ilerleme * 100)}%;background:var(--green);border-radius:99px"></div></div>
        </div>
        <div class="bakiye-hero-alt" style="margin-top:10px">${kadroRozet(kadro)}</div>
      </div>`;
    return `${hero}<div class="dokum">
        <div class="dokum-satir"><span>Toplam icap süreniz</span><b>${dkYaz(b.toplamDk)}</b></div>
        <div class="dokum-satir"><span>Kazandığınız izin (toplam)</span><b>${dkYaz(b.hakDk)}</b></div>
        <div class="dokum-satir"><span>Kullandığınız izin</span><b>${dkYaz(b.kullanilanDk)}</b></div>
      </div>
      ${aciklama('Nasıl hesaplanır?', `İcap süresi (Saat × 1,6) ÷ 7,5 formülüyle gün sayısına çevrilir. Her tamamlanan gün <b>8 saat</b> izin yazılır.<br>Örnek: <b>14 saat 10 dk icap = 3 gün = 24 saat (1 tam nöbet günü) izin.</b><br>İzin, 24 saatlik tam gün olarak kullanılır. 1 tam gün için gereken icap yaklaşık 14 saat 4 dakikadır.`)}${uyari}`;
  }

  if (kompakt) {
    return `<div class="dokum"><div class="dokum-satir kalan ${eksi ? 'eksi' : ''}"><span>Kullanabileceğiniz izin</span><b>${dkYaz(b.kalanDk)}</b></div></div>`;
  }
  const hero = `<div class="bakiye-hero ${eksi ? 'eksi' : ''}">
      <div class="bakiye-hero-etiket">KULLANABİLECEĞİNİZ İZİN</div>
      <div class="bakiye-hero-deger" style="font-size: clamp(26px, 8vw, 34px);">${dkYaz(b.kalanDk)}</div>
      <div class="bakiye-hero-alt" style="margin-top:8px">${kadroRozet(kadro)}</div>
    </div>`;
  return `${hero}<div class="dokum">
      <div class="dokum-satir"><span>Toplam icap süreniz</span><b>${dkYaz(b.toplamDk)}</b></div>
      <div class="dokum-satir"><span>Kullandığınız izin</span><b>${dkYaz(b.kullanilanDk)}</b></div>
    </div>
    ${aciklama('Nasıl hesaplanır?', `Memur personelde icap süreniz kadar izin kullanırsınız: <b>1 saat icap = 1 saat izin</b>.`)}${uyari}`;
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
    if (error) console.error("Log Eklenemedi:", error.message);
  } catch (e) { console.error("Log Hatası:", e); }
}

// ---------- GİRİŞ & KAYIT ----------
document.getElementById('girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('girisEmail').value.trim();
  const sifre = document.getElementById('girisSifre').value;
  document.getElementById('girisHata').innerText = 'Giriş yapılıyor...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: sifre });
  if (error) document.getElementById('girisHata').innerText = "Hatalı e-posta veya şifre!";
  else oturumBaslat(data.user);
});

document.getElementById('kayitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('kayitEmail').value.trim();
  const sifre = document.getElementById('kayitSifre').value;
  const hataEl = document.getElementById('kayitHata');
  hataEl.innerText = '';
  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  hataEl.innerText = 'Kontrol ediliyor...';
  const { data: personel } = await sb.from('personel').select('id, auth_user_id').eq('email', email).single();
  if (!personel) return hataEl.innerText = "Bu e-posta sistemde kayıtlı değil. Yöneticinize başvurun.";
  if (personel.auth_user_id) return hataEl.innerText = "Bu hesap zaten oluşturulmuş.";

  const { error } = await sb.auth.signUp({ email, password: sifre });
  if (error) return hataEl.innerText = "Kayıt hatası: " + error.message;

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
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz Personeli";
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

// ---------- ANA PANEL ----------
async function panelYukle() {
  if (!mevcutPersonel) return;

  const { data: aktifler } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  document.getElementById('aktifIcapSayisi').innerText = aktifler ? aktifler.length : 0;
  const aktifPano = document.getElementById('aktifIcapPano');
  if (aktifPano) aktifPano.style.display = (aktifler && aktifler.length > 0) ? 'flex' : 'none';
  
  try {
    const { data: ayarTaze } = await sb.from('sistem_ayarlari').select('*').eq('id', 1).single();
    if (ayarTaze) sistemAyar = ayarTaze;
  } catch (e) {}
  document.getElementById('kpiVardiya').innerText = (sistemAyar.aktif_vardiya || '–') + '. Vardiya';
  nobetCiz();

  let aHtml = '';
  if (aktifler && aktifler.length > 0) {
    let rows = '';
    aktifler.forEach(a => {
      const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
      const bas = a.personel.ad_soyad.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
      rows += `<div class="aktif-satir">
        <div class="aktif-avatar">${esc(bas)}</div>
        <div class="aktif-bilgi">
          <div class="aktif-isim">${esc(a.personel.ad_soyad)}</div>
          ${a.gorev_aciklamasi ? `<div class="aktif-gorev-metin">${esc(a.gorev_aciklamasi)}</div>` : ''}
          <div class="aktif-alt">${rolRozet(a.personel.rol)}<span class="aktif-saat">Başlama ${saatYaz(a.baslama_zamani)}</span></div>
        </div>
        <span class="rozet r-yesil aktif-sure" data-baslama="${esc(a.baslama_zamani)}">${sureYaz(dk)}</span>
      </div>`;
    });
    aHtml = `<div class="aktif-liste">${rows}</div>`;
  } else { aHtml = '<div class="bos">Şu an icapta personel yok.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  const { data: hazirHam } = await sb.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString());

  const hazirlar = (hazirHam || []).filter(h => h.vardiya !== sistemAyar.aktif_vardiya);
  const bayatlar = (hazirHam || []).filter(h => h.vardiya === sistemAyar.aktif_vardiya);
  if (bayatlar.length > 0 && ['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(mevcutPersonel.rol)) {
    sb.from('hazir_icapcilar').update({ durum: 'iptal' }).in('id', bayatlar.map(b => b.id)).then(() => {});
  }

  const { data: icapGecmis } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('baslama_zamani', { ascending: false });
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
          <td><div class="hucre-isim">${tarihYaz(x.data.izin_tarihi)}</div><div class="hucre-alt">${esc(x.data.aciklama || 'İzin kullanımı')}</div></td>
          <td class="sag eksi">-${isIsci(mevcutPersonel.kadro) ? gunYaz(x.data.talep_edilen_dakika / IZIN_GUN_DK) : dkYaz(x.data.talep_edilen_dakika)}</td></tr>`;
      }
    });
    
    if(rows){
        gecmisHtml = `<div class="tbl-wrap scroll" style="margin-top:16px;"><table class="tbl" style="min-width:0"><thead><tr><th>Tür</th><th>Detay</th><th class="sag">Süre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else { gecmisHtml = ''; }
  } else { gecmisHtml = ''; }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="kart">
      ${baslikHtml('💼', 'İcap Bakiyem')}
      ${bakiyeDokumHtml(bakiye, mevcutPersonel.kadro)}
      ${gecmisHtml}
    </div>`;

  await rolIcerikCiz(aktifler, hazirlar);

  let logHtml = '';
  try {
    const { data: loglar } = await sb.from('log_kayitlari').select('*').order('ne_zaman', { ascending: false }).limit(10);
    if (loglar && loglar.length > 0) {
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

  if (kendiAktif) {
    gorevHtml += `<div class="icap-kart aktif-gorev">
      <div class="icap-ust"><div class="icap-ikon yesil"><span class="canli"></span></div>
        <div><div class="icap-baslik">İcap Göreviniz Devam Ediyor</div><div class="icap-alt">Başlama: ${saatYaz(kendiAktif.baslama_zamani)}${kendiAktif.gorev_aciklamasi ? ' · ' + esc(kendiAktif.gorev_aciklamasi) : ''}</div></div></div>
      <div class="zaman" data-baslama="${esc(kendiAktif.baslama_zamani)}">00:00:00</div>
      <button type="button" class="icap-bitir" onclick="icapBitir('${kendiAktif.id}')">⏹ İCAP GÖREVİNİ BİTİR</button>
    </div>`;
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
    </div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let secilenlerHtml = '';
    const ilgiliHazirlar = hazirlar?.filter(h => {
      if (rol === 'vardiya_cavusu') return h.vardiya === mevcutPersonel.vardiya;
      return true; 
    });

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
      secilenlerHtml = `<div class="ekip-bos">Henüz icap ekibi seçilmedi.<br>İstirahat dönemi için 1 Er ve 1 Şoför seçin.</div>`;
    }

    const ekipSayi = ilgiliHazirlar?.length || 0;
    gorevHtml += `<div class="kart ekip-panel">
      <div class="panel-ust"><div class="panel-ikon">${IKON.ekip}</div>
        <div class="panel-ust-metin"><div class="panel-baslik">İcap Görevli Personel</div><div class="panel-alt">Nöbet dışı vardiyaların icap ekipleri</div></div>
        ${ekipSayi > 0 ? `<span class="rozet r-yesil">${ekipSayi} ekip</span>` : ''}</div>
      ${secilenlerHtml}
      <button type="button" class="ekip-degistir" onclick="hazirIcapciModalAc()">${IKON.ekip}<span>${ekipSayi > 0 ? 'Görevli Personeli Değiştir' : 'Görevli Personel Seç'}</span></button>
    </div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let query = sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya, kadro)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    const { data: bekleyenler } = await query;
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenSayi += bekleyenler.length;
      bekleyenler.forEach(b => {
        let ekBilgi = '';

        bHtml += `<div class="onay-item">
          <div class="onay-ust"><div><div class="hucre-isim">${esc(b.personel.ad_soyad)}</div><div class="hucre-alt">${esc(rolAd(b.personel.rol))} ${kadroRozet(b.personel.kadro)}</div></div>
            <div style="text-align:right"><span class="rozet r-turuncu">${dkYaz(b.toplam_dakika)}</span>${ekBilgi}</div></div>
          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'icap')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'icap')">✕ Reddet</button></div></div>`;
      });
    } else { bHtml = '<div class="bos">Onay bekleyen icap yok.</div>'; }
    html += `<div class="kart" id="onayIcapKart">${baslikHtml('⏳', 'Onay Bekleyen İcaplar', bekleyenler && bekleyenler.length ? `<span class="rozet r-turuncu">${bekleyenler.length}</span>` : '')}${bHtml}</div>`;

    let izinQuery = sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol, kadro)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') izinQuery = izinQuery.eq('personel.vardiya', mevcutPersonel.vardiya).eq('eksi_bakiye_mi', false);
    if (rol === 'grup_amiri' || rol === 'super_admin') izinQuery = izinQuery.or(`eksi_bakiye_mi.eq.true,personel.rol.in.(gunduz_85,gunduz_816)`);
    
    const { data: izinler } = await izinQuery;
    let iHtml = '';
    
    if (izinler && izinler.length > 0) {
      bekleyenSayi += izinler.length;
      
      for (const b of izinler) {
        const { data: pIcaps } = await sb.from('icap_gorevleri').select('*').eq('personel_id', b.personel_id).eq('durum', 'onaylandi');
        const { data: pIzins } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', b.personel_id).eq('durum', 'onaylandi');
        const pBakiye = bakiyeHesapla(pIcaps, pIzins, b.personel.kadro);
        
        const isciMi = isIsci(b.personel.kadro);
        const talepMetin = isciMi ? `${gunYaz(b.talep_edilen_dakika / IZIN_GUN_DK)} (${dkYaz(b.talep_edilen_dakika)})` : dkYaz(b.talep_edilen_dakika);
        const sonraMetin = dkYaz(pBakiye.kalanDk - b.talep_edilen_dakika);
        const sonraEksi = (pBakiye.kalanDk - b.talep_edilen_dakika) < 0;
        const mevcutMetin = dkYaz(pBakiye.kalanDk);

        iHtml += `<div class="onay-item" style="border-left-color:var(--violet)">
          <div class="onay-ust">
            <div>
              <div class="hucre-isim">${esc(b.personel.ad_soyad)}</div>
              <div class="hucre-alt">Tarih: ${esc(b.izin_tarihi)} ${kadroRozet(b.personel.kadro)} ${b.eksi_bakiye_mi ? '<span class="rozet r-kirmizi">Eksi Bakiye</span>' : ''}</div>
            </div>
            <span class="rozet r-mor">Talep: ${talepMetin}</span>
          </div>
          
          <div style="margin-top:10px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
               <span>Mevcut hak:</span> <b>${mevcutMetin}</b>
            </div>
            <div class="dokum-satir sonra ${sonraEksi ? 'eksi' : ''}"><span>Onaylanırsa kalan:</span><b>${sonraMetin}</b></div>
          </div>

          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'izin')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'izin')">✕ Reddet</button></div>
        </div>`;
      }
    } else { iHtml = '<div class="bos">Onay bekleyen izin talebi yok.</div>'; }
    html += `<div class="kart" id="onayIzinKart">${baslikHtml('📅', 'Onay Bekleyen İzinler', izinler && izinler.length ? `<span class="rozet r-mor">${izinler.length}</span>` : '')}${iHtml}</div>`;
  }

  el.innerHTML = html;
  hizliIslemleriCiz(rol, bekleyenSayi);
  const gk = document.getElementById('icapGorevKart');
  if (gk) gk.innerHTML = gorevHtml;
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

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  const guncelle = { bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null };
  
  let { error } = await sb.from('icap_gorevleri').update(guncelle).eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { 
    toast("İcap bitirildi", "basari"); 
    await logEkle("İcabı Bitirdi", `Süre: ${dk} dk`); 
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
async function izinModalAc() {
  const kid = mevcutPersonel.id;
  const [{ data: icaps }, { data: izins }, { data: bekleyen }] = await Promise.all([
    sb.from('icap_gorevleri').select('*').eq('personel_id', kid).eq('durum', 'onaylandi'),
    sb.from('icap_izin_talepleri').select('*').eq('personel_id', kid).eq('durum', 'onaylandi'),
    sb.from('icap_izin_talepleri').select('*').eq('personel_id', kid).eq('durum', 'onay_bekliyor')
  ]);
  const bakiye = bakiyeHesapla(icaps, izins, mevcutPersonel.kadro);
  const bekleyenDk = (bekleyen || []).reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0);
  // Onay bekleyen talepler de düşülür: aynı hakla iki kez izin istenemesin
  anlikKalanBakiye = bakiye.kalanDk - bekleyenDk;
  const isci = bakiye.isci;
  const bekleyenNot = bekleyenDk > 0 ? `<div class="hucre-alt" style="margin-top:4px">Onay bekleyen talepleriniz: ${isci ? gunYaz(bekleyenDk / IZIN_GUN_DK) : dkYaz(bekleyenDk)} (düşüldü)</div>` : '';

  const giris = isci
    ? `<div class="form-grup">
         <label>Kaç gün izin kullanacaksınız?</label>
         <input type="number" id="izinGun" min="1" step="1" value="1" inputmode="numeric" oninput="izinHesapGuncelle()">
         <div class="hucre-alt" style="margin-top:4px">1 gün = 24 saat (tam nöbet günü). İşçi personel yalnızca tam gün izin kullanabilir.</div>
       </div>`
    : `<div class="form-grup">
         <label>Talep Etmek İstediğiniz İzin (Saat)</label>
         <input type="number" id="izinSaat" min="1" step="0.5" value="24" inputmode="decimal" oninput="izinHesapGuncelle()">
       </div>`;

  const html = `<div class="modal aktif" id="izinModal"><div class="modal-content">
    <h3 style="color:var(--violet)">📅 İcap İzni Talebi</h3>
    <div style="margin-bottom:12px">${bakiyeDokumHtml(bakiye, mevcutPersonel.kadro, true)}${bekleyenNot}</div>
    ${giris}
    <div class="dokum" style="margin-bottom:16px;">
       <div class="dokum-satir ilave"><span>Bu talep:</span><b id="hesaplananIzin"></b></div>
       <div class="dokum-satir toplam" style="border-bottom:none;"><span>İşlem sonrası kalan:</span><b id="kalanIzin"></b></div>
    </div>
    <div class="uyari" style="margin-bottom:12px; background:#e8f0fa; color:var(--blue); border-color:#cfe0f3;">
      ℹ️ <span>Talebiniz yetkili amire onay için iletilecektir.</span>
    </div>
    <div class="form-grup"><label>Tarih</label><input type="date" id="izinTarih" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-grup"><label>Açıklama</label><input type="text" id="izinAciklama" placeholder="İzin Açıklaması?"></div>
    <button type="button" class="btn btn-mor" onclick="izinTalepEt()">✓ Talebi Gönder</button>
    <button type="button" class="btn btn-link" onclick="document.getElementById('izinModal').remove()">İptal</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  izinHesapGuncelle();
}

// Formdaki talebi dakikaya çevirir (işçi: tam gün, memur: saat)
function izinTalepDakika() {
  if (isIsci(mevcutPersonel.kadro)) {
    const g = Math.floor(parseFloat(document.getElementById('izinGun')?.value) || 0);
    return g > 0 ? g * IZIN_GUN_DK : 0;
  }
  const s = parseFloat(document.getElementById('izinSaat')?.value) || 0;
  return s > 0 ? Math.round(s * 60) : 0;
}

window.izinHesapGuncelle = function() {
  const isci = isIsci(mevcutPersonel.kadro);
  const dk = izinTalepDakika();
  const sonra = anlikKalanBakiye - dk;
  document.getElementById('hesaplananIzin').innerText = isci ? `${gunYaz(dk / IZIN_GUN_DK)} (${dk / 60} saat)` : dkYaz(dk);
  const el = document.getElementById('kalanIzin');
  el.innerText = dkYaz(sonra);
  el.style.color = sonra < 0 ? 'var(--red)' : 'var(--blue)';
};

async function izinTalepEt() {
  const isci = isIsci(mevcutPersonel.kadro);
  const toplamDk = izinTalepDakika();
  if (toplamDk <= 0) return toast(isci ? "En az 1 gün girin." : "Geçerli süre girin.");
  const tarih = document.getElementById('izinTarih').value;
  if (!tarih) return toast("Tarih seçin.");
  const eksiMi = (anlikKalanBakiye - toplamDk) < 0;

  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if (!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek ve talep Grup Amiri onayına gidecek. Devam edilsin mi?")) return;
  }

  const { error } = await sb.from('icap_izin_talepleri').insert([{
      personel_id: mevcutPersonel.id,
      talep_edilen_dakika: toplamDk,
      izin_tarihi: tarih,
      aciklama: document.getElementById('izinAciklama').value,
      eksi_bakiye_mi: eksiMi
  }]);
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
    if (!erler.some(p => p.id === mevcutPersonel.id)) erler.push(mevcutPersonel);
    if (!soforler.some(p => p.id === mevcutPersonel.id)) soforler.push(mevcutPersonel);
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
          <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol / Nitelik</th><th>Kadro</th><th>Vardiya</th><th>Durum</th><th class="sag">Sil</th></tr></thead>
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
    rows = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#8d97a5;">Bu vardiyada kayıtlı personel bulunamadı.</td></tr>';
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
        <td>${rolRozet(p.rol)} <br><small style="color:#666">${nitelikAd}</small></td>
        <td>${kadroSec}</td>
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
  const email = document.getElementById('addEmail').value;
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
    kadro: kadro
  }]);
  
  if (error) toast("Hata: " + error.message);
  else { toast("Personel başarıyla eklendi.", "basari"); await logEkle("Personel Ekledi", ad); adminTab('personel'); }
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
