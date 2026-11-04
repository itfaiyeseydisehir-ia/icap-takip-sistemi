// ============================================================
// SEYDİŞEHİR İTFAİYESİ - İCAP TAKİP SİSTEMİ (Kurumsal Arayüz)
// ============================================================

// ⚠️ LÜTFEN BURAYA KENDİ GITHUB RAW RESİM LİNKLERİNİZİ YAPIŞTIRIN ⚠️
const IKN_YANGIN = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/yangin.png';
const IKN_KURTARMA = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/kask.png';
const IKN_DIGER = 'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/dalgic.png';
// ============================================================

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

// ---------- YARDIMCILAR ----------
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

// ---------- İCAP HAK HESABI (MEMUR 1x / İŞÇİ FORMÜLLÜ) ----------
const ISCI_CARPAN = 1.6;
const GUNLUK_SAAT = 7.5;
const VARDIYA_SAAT = 8;

function kadroAd(kadro) { return kadro === 'memur' ? 'Memur' : 'İşçi'; }
function kadroRozet(kadro) {
  return `<span class="rozet ${kadro === 'memur' ? 'r-mavi' : 'r-turuncu'}">${kadroAd(kadro)}</span>`;
}

function saatYazGun(saat) {
  if (isNaN(saat) || saat === 0) return '0 Saat';
  const isaret = saat < 0 ? '−' : '';
  saat = Math.abs(saat);
  let saatTam = Math.floor(saat);
  let dakika = Math.round((saat - saatTam) * 60);
  
  if (dakika === 60) { dakika = 0; saatTam += 1; }

  let res = isaret;
  if (saatTam > 0) res += `${saatTam} Saat `;
  if (dakika > 0) res += `${dakika} Dk`;
  return res.trim() || '0 Saat';
}

function bakiyeHesapla(icaplar, izinler, kadro) {
  let esasSaat = 0;
  let hakSaat = 0;
  let gunSayisi = 0;

  (icaplar || []).forEach(k => {
    const ham = (k.toplam_dakika || 0) / 60;
    esasSaat += ham;
    
    if (kadro === 'isci') {
      // İşçi: (Saat x 1.6) / 7.5 = Gün -> Tam güne yuvarla -> 8 ile çarp
      const g = Math.floor((ham * ISCI_CARPAN) / GUNLUK_SAAT);
      hakSaat += g * VARDIYA_SAAT;
      gunSayisi += g;
    } else {
      // Memur: Birebir (1x)
      hakSaat += ham;
    }
  });
  
  const kullanilanSaat = (izinler || []).reduce((s, x) => s + (x.talep_edilen_dakika || 0) / 60, 0);
  const kalanSaat = hakSaat - kullanilanSaat;
  
  return { esasSaat, hakSaat, kullanilanSaat, kalanSaat, gunSayisi };
}

function bakiyeDokumHtml(b, kadro, kompakt = false) {
  const eksi = b.kalanSaat < 0;
  const kalanTxt = saatYazGun(b.kalanSaat);
  
  // Kalan bakiye 24 saatin katlarıysa yanına "X Gün" ibaresi ekleyelim (Sadece işçiler için mantıklı)
  const kalanGunTxt = (kadro === 'isci' && b.kalanSaat > 0 && b.kalanSaat % 8 === 0) ? ` (${b.kalanSaat / 8} Gün)` : '';
  
  const hero = kompakt ? '' : `<div class="bakiye-hero ${eksi ? 'eksi' : ''}">
      <div class="bakiye-hero-etiket">KALAN BAKİYE</div>
      <div class="bakiye-hero-deger" style="font-size: clamp(24px, 7vw, 32px);">${kalanTxt}${kalanGunTxt}</div>
      <div class="bakiye-hero-alt">${kadroRozet(kadro)}</div>
    </div>`;

  return `${hero}<div class="dokum">
      <div class="dokum-satir"><span>Esas İcap</span><b>${saatYazGun(b.esasSaat)}</b></div>
      <div class="dokum-satir ilave"><span>Hak Edilen İzin</span><b>${kadro === 'isci' ? b.gunSayisi + ' Gün ' : ''}(${saatYazGun(b.hakSaat)})</b></div>
      <div class="dokum-satir toplam"><span>Toplam Hak</span><b>${saatYazGun(b.hakSaat)}</b></div>
      <div class="dokum-satir"><span>Kullanılan İzin</span><b>−${saatYazGun(b.kullanilanSaat)}</b></div>
      ${kompakt ? `<div class="dokum-satir kalan ${eksi ? 'eksi' : ''}"><span>Kalan Bakiye</span><b>${kalanTxt}${kalanGunTxt}</b></div>` : ''}
    </div>`;
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
  if (icapGecmis) icapGecmis.forEach(g => tumGecmis.push({ tip: 'icap', tarih: g.baslama_zamani, data: g }));
  if (izinGecmis) izinGecmis.forEach(g => tumGecmis.push({ tip: 'izin', tarih: g.izin_tarihi + 'T00:00:00', data: g }));
  tumGecmis.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));

  let gecmisHtml = '';
  if (tumGecmis.length > 0) {
    let rows = '';
    tumGecmis.forEach(x => {
      if (x.tip === 'icap') {
        const hamSaat = (x.data.toplam_dakika || 0) / 60;
        let hakSaat = 0;
        let ekBilgi = '';
        
        if (mevcutPersonel.kadro === 'isci') {
          const g = Math.floor((hamSaat * ISCI_CARPAN) / GUNLUK_SAAT);
          hakSaat = g * VARDIYA_SAAT;
          if (g > 0) ekBilgi = `<div class="sure-formul">${g} Gün</div>`;
        } else {
          hakSaat = hamSaat;
        }

        const sureHtml = `<div class="artı">+${saatYazGun(hakSaat)}</div>${ekBilgi}`;

        rows += `<tr>
          <td><span class="rozet r-yesil">İcap</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.baslama_zamani)}</div><div class="hucre-alt">${saatYaz(x.data.baslama_zamani)} - ${saatYaz(x.data.bitis_zamani)}${x.data.gorev_aciklamasi ? ' · ' + esc(x.data.gorev_aciklamasi) : ''}</div></td>
          <td class="sag">${sureHtml}</td></tr>`;
      } else {
        rows += `<tr>
          <td><span class="rozet r-mor">İzin</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.izin_tarihi)}</div><div class="hucre-alt">${esc(x.data.aciklama || 'İzin kullanımı')}</div></td>
          <td class="sag eksi">-${saatYazGun(x.data.talep_edilen_dakika / 60)}</td></tr>`;
      }
    });
    gecmisHtml = `<div class="tbl-wrap scroll"><table class="tbl" style="min-width:0"><thead><tr><th>Tür</th><th>Detay</th><th class="sag">Süre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else { gecmisHtml = '<div class="bos">Henüz icap / izin kaydı yok.</div>'; }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="kart">
      ${baslikHtml('💼', 'İcap / İzin Bakiyem')}
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
        const hamSaat = (b.toplam_dakika || 0) / 60;
        let hakSaat = 0;
        let ekBilgi = '';

        if (b.personel.kadro === 'isci') {
           const g = Math.floor((hamSaat * ISCI_CARPAN) / GUNLUK_SAAT);
           hakSaat = g * VARDIYA_SAAT;
           ekBilgi = `<div class="sure-formul">Hak: ${g} Gün (${saatYazGun(hakSaat)})</div>`;
        } else {
           hakSaat = hamSaat;
           ekBilgi = `<div class="sure-formul">Hak: ${saatYazGun(hakSaat)}</div>`;
        }

        bHtml += `<div class="onay-item">
          <div class="onay-ust"><div><div class="hucre-isim">${esc(b.personel.ad_soyad)}</div><div class="hucre-alt">${esc(rolAd(b.personel.rol))} ${kadroRozet(b.personel.kadro)}</div></div>
            <div style="text-align:right"><span class="rozet r-turuncu">${sureYaz(b.toplam_dakika)}</span>${ekBilgi}</div></div>
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
        
        const talepSaat = (b.talep_edilen_dakika || 0) / 60;
        const sonraKalan = pBakiye.kalanSaat - talepSaat;

        iHtml += `<div class="onay-item" style="border-left-color:var(--violet)">
          <div class="onay-ust">
            <div>
              <div class="hucre-isim">${esc(b.personel.ad_soyad)}</div>
              <div class="hucre-alt">Tarih: ${esc(b.izin_tarihi)} ${kadroRozet(b.personel.kadro)} ${b.eksi_bakiye_mi ? '<span class="rozet r-kirmizi">Eksi Bakiye</span>' : ''}</div>
            </div>
            <span class="rozet r-mor">Talep: ${saatYazGun(talepSaat)}</span>
          </div>
          
          <div style="margin-top:10px">${bakiyeDokumHtml(pBakiye, b.personel.kadro, true)}
            <div class="dokum-satir sonra ${sonraKalan < 0 ? 'eksi' : ''}"><span>Onaylanırsa kalan</span><b>${saatYazGun(sonraKalan)}</b></div>
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

// ---------- HIZLI İŞLEMLER (BUTON IZGARASI) ----------
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
  ekle('a-yesil', IKON.bakiye, 'Bakiyem', "panelAc('kisiselBakiyeKart','İcap / İzin Bakiyem')");
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

function sayacGuncelle() {
  document.querySelectorAll('[data-baslama]').forEach(el => {
    const sn = Math.max(0, Math.floor((Date.now() - new Date(el.dataset.baslama).getTime()) / 1000));
    const p = n => String(n).padStart(2, '0');
    el.innerText = `${p(Math.floor(sn / 3600))}:${p(Math.floor((sn % 3600) / 60))}:${p(sn % 60)}`;
  });
}
setInterval(sayacGuncelle, 1000);

// ---------- İŞLEMLER ----------
async function icapBaslat() {
  const aciklama = document.getElementById('gorevAciklama').value;
  const { error } = await sb.from('icap_gorevleri').insert([{ personel_id: mevcutPersonel.id, vardiya: mevcutPersonel.vardiya, gorev_aciklamasi: aciklama, durum: 'aktif' }]);
  if (error) toast("Hata: " + error.message);
  else { toast("İcap başlatıldı", "basari"); await logEkle("İcap Başlattı", aciklama); panelYukle(); }
}

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  const guncelle = { bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null };
  
  let { error } = await sb.from('icap_gorevleri').update(guncelle).eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { toast("İcap bitirildi", "basari"); await logEkle("İcabı Bitirdi", `Süre: ${dk} dk`); panelYukle(); }
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
  const { data: icaps } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const { data: izins } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const bakiye = bakiyeHesapla(icaps, izins, mevcutPersonel.kadro);

  const html = `<div class="modal aktif" id="izinModal"><div class="modal-content">
    <h3 style="color:var(--violet)">📅 İzin Talebi</h3>
    
    <div style="margin-bottom:16px">${bakiyeDokumHtml(bakiye, mevcutPersonel.kadro, true)}</div>
    
    <div class="uyari" style="margin-bottom:12px; background:#e8f0fa; color:var(--blue); border-color:#cfe0f3;">
      ℹ️ <span>${mevcutPersonel.kadro === 'isci' ? 'Kurum kuralı: İşçi için 1 Gün İzin = 8 Saat (1 Nöbet Dilimi).' : 'Kurum kuralı: Memur için birebir (1 Saat = 1 Saat) izin.'}</span>
    </div>

    <div class="form-satir">
      <div class="form-grup"><label>Süre (Saat)</label><input type="number" id="izinSaat" min="0" value="${mevcutPersonel.kadro === 'isci' ? '8' : '1'}"></div>
      <div class="form-grup"><label>Dakika</label><input type="number" id="izinDakika" min="0" max="59" value="0"></div>
    </div>
    <div class="form-grup"><label>Tarih</label><input type="date" id="izinTarih" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-grup"><label>Açıklama</label><input type="text" id="izinAciklama" placeholder="İzin Açıklaması?"></div>
    <button type="button" class="btn btn-mor" onclick="izinTalepEt()">Talebi Gönder</button>
    <button type="button" class="btn btn-link" onclick="document.getElementById('izinModal').remove()">İptal</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function izinTalepEt() {
  const s = parseInt(document.getElementById('izinSaat').value || 0);
  const d = parseInt(document.getElementById('izinDakika').value || 0);
  const toplamDk = (s * 60) + d;
  if (toplamDk <= 0) return toast("Geçerli süre girin.");

  const { data: icaps } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const { data: izins } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const bakiye = bakiyeHesapla(icaps, izins, mevcutPersonel.kadro).kalanSaat;

  const eksiMi = (toplamDk / 60) > bakiye;
  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if (!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek. Sadece Grup Amiri onaylayabilir. Onaylıyor musunuz?")) return;
  }
  await sb.from('icap_izin_talepleri').insert([{ personel_id: mevcutPersonel.id, talep_edilen_dakika: toplamDk, izin_tarihi: document.getElementById('izinTarih').value, aciklama: document.getElementById('izinAciklama').value, eksi_bakiye_mi: eksiMi }]);
  document.getElementById('izinModal').remove();
  toast("İzin talebi gönderildi.", "basari");
  await logEkle("İzin Talebi Oluşturdu", `${s}s ${d}dk`);
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
  if (!confirm(`${p?.ad_soyad || 'Personel'} kadrosu "${kadroAd(kadro)}" olarak değiştirilsin mi?\n\nOnaylanmış geçmiş icap kayıtlarının hakkı değişmez; yeni hesaplama yöntemi yalnızca bundan sonra onaylanacak icaplara uygulanır.`)) return yenile();
  
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

  let csv = "Personel,Rol,Kadro,Gorev Aciklamasi,Baslangic,Bitis,Esas Sure(Saat),Hak Edilen (Saat)\n";
  let topEsas = 0, topHak = 0;
  icaps.forEach(i => {
    const ham = (i.toplam_dakika || 0) / 60;
    let hakSaat = 0;
    
    if (i.personel.kadro === 'isci') {
      const g = Math.floor((ham * ISCI_CARPAN) / GUNLUK_SAAT);
      hakSaat = g * VARDIYA_SAAT;
    } else {
      hakSaat = ham;
    }
    
    topEsas += ham; topHak += hakSaat;
    const aciklama = (i.gorev_aciklamasi || "").replace(/"/g, '""');
    csv += `"${i.personel.ad_soyad}","${rolAd(i.personel.rol)}","${kadroAd(i.personel.kadro)}","${aciklama}","${new Date(i.baslama_zamani).toLocaleString('tr-TR')}","${new Date(i.bitis_zamani).toLocaleString('tr-TR')}",${ham.toFixed(2)},${hakSaat.toFixed(2)}\n`;
  });
  csv += `"TOPLAM","","","","","",${topEsas.toFixed(2)},${topHak.toFixed(2)}\n`;
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
if (sb) { sb.auth.getSession().then(({ data: { session } }) => { if (session) oturumBaslat(session.user); }); }
