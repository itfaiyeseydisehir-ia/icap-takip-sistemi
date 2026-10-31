// ============================================================
// SEYDİŞEHİR İTFAİYESİ - İCAP TAKİP SİSTEMİ (Kurumsal Arayüz)
// ============================================================

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  const hedef = document.getElementById(id);
  if (hedef) hedef.classList.add('aktif');
}

window.onerror = function (msg, url, line) {
  alert("SİSTEM HATASI: " + msg + "\nSatır: " + line);
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

  // Aktif icaplar
  const { data: aktifler } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  document.getElementById('aktifIcapSayisi').innerText = aktifler ? aktifler.length : 0;
  document.getElementById('kpiVardiya').innerText = (sistemAyar.aktif_vardiya || '–') + '. Vardiya';

  let aHtml = '';
  if (aktifler && aktifler.length > 0) {
    let rows = '';
    aktifler.forEach(a => {
      const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
      rows += `<tr>
        <td><div class="hucre-isim">${esc(a.personel.ad_soyad)}</div>${a.gorev_aciklamasi ? `<div class="hucre-alt">${esc(a.gorev_aciklamasi)}</div>` : ''}</td>
        <td>${rolRozet(a.personel.rol)}</td>
        <td>${saatYaz(a.baslama_zamani)}</td>
        <td class="sag"><span class="rozet r-yesil">${sureYaz(dk)}</span></td>
      </tr>`;
    });
    aHtml = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Personel</th><th>Görev</th><th>Başlama</th><th class="sag">Süre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else { aHtml = '<div class="bos">Şu an icapta personel yok.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  // Hazır icapçılar
  const { data: hazirlar } = await sb.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString());
  let hHtml = '';
  if (hazirlar && hazirlar.length > 0) {
    hazirlar.forEach(h => {
      hHtml += `<div class="ekip"><div class="ekip-no">${esc(h.vardiya)}</div><div><b>${esc(h.vardiya)}. Vardiya İstirahat Ekibi</b><small>👨‍🚒 ${esc(h.er.ad_soyad)} &nbsp;·&nbsp; 🚛 ${esc(h.sofor.ad_soyad)}</small></div></div>`;
    });
  } else { hHtml = '<div class="bos">Aktif hazır icapçı ekibi bulunmuyor.</div>'; }
  document.getElementById('hazirIcapcilarKart').innerHTML = `<div class="kart">${baslikHtml('🚨', 'Hazır İcapçı Ekibi')}${hHtml}</div>`;

  // Bakiye
  const { data: icapGecmis } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('baslama_zamani', { ascending: false });
  const { data: izinGecmis } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('izin_tarihi', { ascending: false });

  const toplam = icapGecmis ? icapGecmis.reduce((s, x) => s + (x.toplam_dakika || 0), 0) : 0;
  const kullanilan = izinGecmis ? izinGecmis.reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0) : 0;
  const kalan = toplam - kullanilan;
  const kpiB = document.getElementById('kpiBakiye');
  kpiB.innerText = (kalan < 0 ? '-' : '') + sureYaz(kalan);
  kpiB.style.color = kalan < 0 ? '#c8102e' : '#12805c';

  const tumGecmis = [];
  if (icapGecmis) icapGecmis.forEach(g => tumGecmis.push({ tip: 'icap', tarih: g.baslama_zamani, data: g }));
  if (izinGecmis) izinGecmis.forEach(g => tumGecmis.push({ tip: 'izin', tarih: g.izin_tarihi + 'T00:00:00', data: g }));
  tumGecmis.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));

  let gecmisHtml = '';
  if (tumGecmis.length > 0) {
    let rows = '';
    tumGecmis.forEach(x => {
      if (x.tip === 'icap') {
        rows += `<tr>
          <td><span class="rozet r-yesil">İcap</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.baslama_zamani)}</div><div class="hucre-alt">${saatYaz(x.data.baslama_zamani)} - ${saatYaz(x.data.bitis_zamani)}${x.data.gorev_aciklamasi ? ' · ' + esc(x.data.gorev_aciklamasi) : ''}</div></td>
          <td class="sag artı">+${sureYaz(x.data.toplam_dakika)}</td></tr>`;
      } else {
        rows += `<tr>
          <td><span class="rozet r-mor">İzin</span></td>
          <td><div class="hucre-isim">${tarihYaz(x.data.izin_tarihi)}</div><div class="hucre-alt">${esc(x.data.aciklama || 'İzin kullanımı')}</div></td>
          <td class="sag eksi">-${sureYaz(x.data.talep_edilen_dakika)}</td></tr>`;
      }
    });
    gecmisHtml = `<div class="tbl-wrap scroll"><table class="tbl" style="min-width:0"><thead><tr><th>Tür</th><th>Detay</th><th class="sag">Süre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else { gecmisHtml = '<div class="bos">Henüz icap / izin kaydı yok.</div>'; }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="kart">
      ${baslikHtml('💼', 'İcap / İzin Bakiyem')}
      <div class="bakiye-grid">
        <div class="bakiye-item"><div class="bakiye-etiket">Biriken</div><div class="bakiye-deger">${sureYaz(toplam)}</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kullanılan</div><div class="bakiye-deger">${sureYaz(kullanilan)}</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kalan</div><div class="bakiye-deger" style="color:${kalan < 0 ? '#c8102e' : '#12805c'}">${kalan < 0 ? '-' : ''}${sureYaz(kalan)}</div></div>
      </div>
      ${gecmisHtml}
    </div>`;

  await rolIcerikCiz(aktifler, hazirlar);

  // Loglar
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
    logKutu.style.display = 'block';
    logKutu.innerHTML = `${baslikHtml('📜', 'Sistem Hareketleri')}<div class="scroll">${logHtml}</div>`;
  }
}

// ---------- ROL BAZLI İÇERİK ----------
async function rolIcerikCiz(aktifler, hazirlar) {
  const el = document.getElementById('rolIcerik');
  const rol = mevcutPersonel.rol;
  let html = '';
  let bekleyenSayi = 0;
  let gorevHtml = '';

  if (rol === 'super_admin') {
    html += `<div class="kart admin-kart">
      ${baslikHtml('🛠️', 'Süper Admin Yönetim Paneli')}
      <p>Personel ekleme, sistem ayarları ve yedek yönetimi.</p>
      <button type="button" class="btn btn-primary" style="margin:0" onclick="adminPaneliAc()">Yönetim Panelini Aç</button>
    </div>`;
  }

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
    const hizli = ['🔥 Yangın', '📍🔦⛑️ Arama Kurtarma', '🔒<img src="pompa.png" style="height:20px; vertical-align:middle; margin-left:2px; margin-right:4px;"> <br> Diğer Görevler'];
    gorevHtml += `<div class="icap-kart ${!baslatabilir ? 'kilitli' : ''}">
      <div class="icap-ust"><div class="icap-ikon">🚨</div>
        <div><div class="icap-baslik">Yeni İcap Görevi</div><div class="icap-alt">Görev türünü seçin, tek dokunuşla başlatın</div></div></div>
      ${!baslatabilir ? `<div class="uyari">⚠️ <span>${esc(uyari)}</span></div>` : ''}
      <div class="hizli-sec">${hizli.map(h => `<button type="button" class="hizli-btn" ${!baslatabilir ? 'disabled' : ''} onclick="hizliAciklama(this)">${h}</button>`).join('')}</div>
      <textarea id="gorevAciklama" rows="2" placeholder="Açıklama (isteğe bağlı) — örn: Mahalle, adres..." ${!baslatabilir ? 'disabled' : ''}></textarea>
      <button type="button" class="icap-baslat" onclick="icapBaslat()" ${!baslatabilir ? 'disabled' : ''}>▶ İCAP GÖREVİNİ BAŞLAT</button>
    </div>`;

    html += `<div class="kart">
      ${baslikHtml('📅', 'İcap İzni Kullan')}
      <button type="button" class="btn btn-mor" style="margin:0" onclick="izinModalAc()">Yeni İzin Talebi Oluştur</button>
    </div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let query = sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    const { data: bekleyenler } = await query;
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenSayi += bekleyenler.length;
      bekleyenler.forEach(b => {
        bHtml += `<div class="onay-item">
          <div class="onay-ust"><div><div class="hucre-isim">${esc(b.personel.ad_soyad)}</div><div class="hucre-alt">${esc(rolAd(b.personel.rol))}</div></div><span class="rozet r-turuncu">${sureYaz(b.toplam_dakika)}</span></div>
          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'icap')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'icap')">✕ Reddet</button></div></div>`;
      });
    } else { bHtml = '<div class="bos">Onay bekleyen icap yok.</div>'; }
    html += `<div class="kart">${baslikHtml('⏳', 'Onay Bekleyen İcaplar', bekleyenler && bekleyenler.length ? `<span class="rozet r-turuncu">${bekleyenler.length}</span>` : '')}${bHtml}</div>`;

    let izinQuery = sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') izinQuery = izinQuery.eq('personel.vardiya', mevcutPersonel.vardiya).eq('eksi_bakiye_mi', false);
    if (rol === 'grup_amiri' || rol === 'super_admin') izinQuery = izinQuery.or(`eksi_bakiye_mi.eq.true,personel.rol.in.(gunduz_85,gunduz_816)`);
    const { data: izinler } = await izinQuery;
    let iHtml = '';
    if (izinler && izinler.length > 0) {
      bekleyenSayi += izinler.length;
      izinler.forEach(b => {
        iHtml += `<div class="onay-item" style="border-left-color:var(--violet)">
          <div class="onay-ust"><div><div class="hucre-isim">${esc(b.personel.ad_soyad)}</div><div class="hucre-alt">Tarih: ${esc(b.izin_tarihi)} ${b.eksi_bakiye_mi ? '<span class="rozet r-kirmizi">Eksi Bakiye</span>' : ''}</div></div><span class="rozet r-mor">${sureYaz(b.talep_edilen_dakika)}</span></div>
          <div class="onay-btnler"><button type="button" class="btn btn-success" onclick="onayla('${b.id}', 'izin')">✓ Onayla</button><button type="button" class="btn btn-danger" onclick="reddet('${b.id}', 'izin')">✕ Reddet</button></div></div>`;
      });
    } else { iHtml = '<div class="bos">Onay bekleyen izin talebi yok.</div>'; }
    html += `<div class="kart">${baslikHtml('📅', 'Onay Bekleyen İzinler', izinler && izinler.length ? `<span class="rozet r-mor">${izinler.length}</span>` : '')}${iHtml}</div>`;

    html += `<div class="kart">${baslikHtml('🚨', 'Hazır İcapçı Seçimi')}
      <p class="alt-not">İstirahat dönemi için 1 Er ve 1 Şoför seçin.</p>
      <button type="button" class="btn btn-mavi" style="margin:0" onclick="hazirIcapciModalAc()">Personel Seç</button>
    </div>`;

    const bugun = new Date().toISOString().split('T')[0];
    const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    html += `<div class="kart">${baslikHtml('📊', 'Raporlama')}
      <div class="form-satir">
        <div class="form-grup"><label>Başlangıç</label><input type="date" id="raporBaslangic" value="${otuzGunOnce}"></div>
        <div class="form-grup"><label>Bitiş</label><input type="date" id="raporBitis" value="${bugun}"></div>
      </div>
      <button type="button" class="btn btn-outline" style="margin:0" onclick="raporCsvIndir()">⬇ Detaylı CSV İndir</button>
    </div>`;
  }

  document.getElementById('kpiBekleyen').innerText = ['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol) ? bekleyenSayi : '–';
  el.innerHTML = html;
  const gk = document.getElementById('icapGorevKart');
  if (gk) gk.innerHTML = gorevHtml;
  sayacGuncelle();
}

// ---------- HIZLI İCAP YARDIMCILARI ----------
function hizliAciklama(btn) {
  const ta = document.getElementById('gorevAciklama');
  if (!ta) return;
  const secili = btn.classList.contains('secili');
  document.querySelectorAll('.hizli-btn').forEach(b => b.classList.remove('secili'));
  if (secili) { ta.value = ''; return; }
  btn.classList.add('secili');
  ta.value = btn.innerText.replace(/^[^\p{L}]+/u, '').trim();
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
  else { toast("İcap başlatıldı", "basari"); await logEkle("İcap Başlattı", aciklama); }
}

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  const { error } = await sb.from('icap_gorevleri').update({ bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null }).eq('id', id);
  if (error) toast("Hata: " + error.message);
  else { toast("İcap bitirildi", "basari"); await logEkle("İcabı Bitirdi", `Süre: ${dk} dk`); }
}

async function onayla(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  await sb.from(tablo).update({ durum: 'onaylandi', onaylayan_id: mevcutPersonel.id, onay_zamani: new Date().toISOString() }).eq('id', id);
  toast("Onaylandı", "basari");
  await logEkle(tip === 'icap' ? "İcap Onayladı" : "İzin Onayladı");
  panelYukle();
}

async function reddet(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const sebep = prompt("Red sebebi:");
  if (sebep === null) return;
  await sb.from(tablo).update({ durum: 'reddedildi', onaylayan_id: mevcutPersonel.id, red_sebebi: sebep }).eq('id', id);
  toast("Reddedildi");
  await logEkle(tip === 'icap' ? "İcap Reddetti" : "İzin Reddetti", sebep);
  panelYukle();
}

// ---------- MODALLAR ----------
function izinModalAc() {
  const html = `<div class="modal aktif" id="izinModal"><div class="modal-content">
    <h3 style="color:var(--violet)">📅 İzin Talebi</h3>
    <div class="form-satir">
      <div class="form-grup"><label>Süre (Saat)</label><input type="number" id="izinSaat" min="0" value="1"></div>
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
  const { data: icaps } = await sb.from('icap_gorevleri').select('toplam_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const { data: izins } = await sb.from('icap_izin_talepleri').select('talep_edilen_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const bakiye = (icaps || []).reduce((s, x) => s + (x.toplam_dakika || 0), 0) - (izins || []).reduce((s, x) => s + (x.talep_edilen_dakika || 0), 0);
  const eksiMi = toplamDk > bakiye;
  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if (!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek. Sadece Grup Amiri onaylayabilir. Onaylıyor musunuz?")) return;
  }
  await sb.from('icap_izin_talepleri').insert([{ personel_id: mevcutPersonel.id, talep_edilen_dakika: toplamDk, izin_tarihi: document.getElementById('izinTarih').value, aciklama: document.getElementById('izinAciklama').value, eksi_bakiye_mi: eksiMi }]);
  document.getElementById('izinModal').remove();
  toast("İzin talebi gönderildi.", "basari");
  await logEkle("İzin Talebi Oluşturdu", `${s}s ${d}dk`);
  panelYukle();
}

async function hazirIcapciModalAc() {
  let vardiyaSecimiHtml = '';
  if (mevcutPersonel.rol !== 'vardiya_cavusu') {
    vardiyaSecimiHtml = `<div class="form-grup"><label>Hangi Vardiya İçin?</label><select id="secVardiya" onchange="hazirPersonelleriGetir()"><option value="1">1. Vardiya</option><option value="2">2. Vardiya</option><option value="3">3. Vardiya</option></select></div>`;
  } else {
    vardiyaSecimiHtml = `<input type="hidden" id="secVardiya" value="${mevcutPersonel.vardiya}">`;
  }
  const html = `<div class="modal aktif" id="hazirModal"><div class="modal-content">
    <h3>🚨 Hazır İcapçı Seçimi</h3>
    <p class="alt-not">48 saatlik istirahat dönemi için 1 Er ve 1 Şoför seçiniz.</p>
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
  const { data: personeller } = await sb.from('personel').select('*').eq('vardiya', vardiya);
  const liste = personeller || [];
  const erler = liste.filter(p => p.rol === 'itfaiye_eri');
  const soforler = liste.filter(p => p.rol === 'itfaiye_soforu');
  document.getElementById('hazirPersonelAlan').innerHTML = `
    <div class="form-grup"><label>İtfaiye Eri</label><select id="secEr">${erler.length ? erler.map(e => `<option value="${e.id}">${esc(e.ad_soyad)}</option>`).join('') : '<option value="">Er bulunamadı</option>'}</select></div>
    <div class="form-grup"><label>İtfaiye Şoförü</label><select id="secSofor">${soforler.length ? soforler.map(s => `<option value="${s.id}">${esc(s.ad_soyad)}</option>`).join('') : '<option value="">Şoför bulunamadı</option>'}</select></div>`;
}

async function hazirKaydet() {
  const vardiya = parseInt(document.getElementById('secVardiya').value);
  const erId = document.getElementById('secEr').value;
  const soforId = document.getElementById('secSofor').value;
  if (!erId || !soforId) return toast("Lütfen personel seçin.");
  const simdi = new Date(); const bitis = new Date(simdi.getTime() + (48 * 60 * 60 * 1000));
  await sb.from('hazir_icapcilar').insert([{ vardiya: vardiya, er_personel_id: erId, sofor_personel_id: soforId, baslangic_zamani: simdi.toISOString(), bitis_zamani: bitis.toISOString(), secen_cavus_id: mevcutPersonel.id }]);
  document.getElementById('hazirModal').remove();
  toast("Hazır icapçılar belirlendi.", "basari");
  await logEkle("Hazır İcapçı Seçti", `${vardiya}. Vardiya`);
}

// ---------- SÜPER ADMİN PANELİ ----------
function adminPaneliAc() {
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
  adminTab('personel');
}

async function adminTab(tab) {
  const el = document.getElementById('adminIcerik');
  document.getElementById('tabBtnPersonel')?.classList.toggle('aktif', tab === 'personel');
  document.getElementById('tabBtnAyarlar')?.classList.toggle('aktif', tab === 'ayarlar');
  el.innerHTML = '<div class="bos">Yükleniyor...</div>';

  if (tab === 'personel') {
    const { data: personeller } = await sb.from('personel').select('*').order('rol').order('vardiya');
    let rows = '';
    (personeller || []).forEach(p => {
      const vardiyaAd = p.vardiya ? p.vardiya + ". Vardiya" : "Gündüz";
      const durum = p.auth_user_id ? '<span class="rozet r-yesil">Aktif</span>' : '<span class="rozet r-turuncu">Kayıt Bekliyor</span>';
      rows += `<tr>
        <td class="hucre-isim">${esc(p.ad_soyad)}</td>
        <td>${esc(p.email)}</td>
        <td>${rolRozet(p.rol)}</td>
        <td>${vardiyaAd}</td>
        <td>${durum}</td>
        <td class="sag"><button type="button" class="sil-btn" onclick="personelSil('${p.id}')" title="Sil">🗑️</button></td>
      </tr>`;
    });

    el.innerHTML = `
      <div class="panel-kutu">
        <h4>Yeni Personel Ekle</h4>
        <div class="form-satir" style="margin-top:12px">
          <div class="form-grup"><label>Ad Soyad</label><input type="text" id="addAd" placeholder="Örn: Ahmet Yılmaz"></div>
          <div class="form-grup"><label>E-posta</label><input type="email" id="addEmail" placeholder="ahmet@gmail.com"></div>
          <div class="form-grup"><label>Rol</label>
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
          <div class="form-grup"><label>Vardiya</label>
            <select id="addVardiya">
              <option value="">Gündüz / Yok</option>
              <option value="1">1. Vardiya</option>
              <option value="2">2. Vardiya</option>
              <option value="3">3. Vardiya</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-success" style="margin:0;width:auto" onclick="personelEkle()">➕ Personeli Kaydet</button>
      </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>Vardiya</th><th>Durum</th><th class="sag">Sil</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

async function personelEkle() {
  const ad = document.getElementById('addAd').value;
  const email = document.getElementById('addEmail').value;
  const rol = document.getElementById('addRol').value;
  const vardiya = document.getElementById('addVardiya').value;
  if (!ad || !email) return toast("Lütfen tüm alanları doldurun.");
  const { error } = await sb.from('personel').insert([{ ad_soyad: ad, email: email, rol: rol, vardiya: vardiya ? parseInt(vardiya) : null }]);
  if (error) toast("Hata: " + error.message);
  else { toast("Personel başarıyla eklendi.", "basari"); await logEkle("Personel Ekledi", ad); adminTab('personel'); }
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

  const { data: icaps } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'onaylandi').gte('baslama_zamani', basISO).lte('baslama_zamani', bitISO);
  if (!icaps || !icaps.length) return toast("Seçilen tarihlerde onaylanmış icap yok.");

  let csv = "Personel,Rol,Gorev Aciklamasi,Baslangic,Bitis,Sure(Dakika)\n";
  icaps.forEach(i => {
    const aciklama = (i.gorev_aciklamasi || "").replace(/"/g, '""');
    csv += `"${i.personel.ad_soyad}","${i.personel.rol}","${aciklama}","${new Date(i.baslama_zamani).toLocaleString('tr-TR')}","${new Date(i.bitis_zamani).toLocaleString('tr-TR')}",${i.toplam_dakika}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `icap_raporu_${bas}_${bit}.csv`; link.click();
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
        toast("Hazır icapçılar yükleniyor...", "basari");
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
