// ============================================================
// SEYDİŞEHİR İTFALYESİ - MODERN ARAYÜZ ENTEGRASYONLU TAM SİSTEM
// ============================================================

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  const hedef = document.getElementById(id);
  if(hedef) hedef.classList.add('aktif');
}

window.onerror = function(msg, url, line, col, error) { alert("HATA: " + msg); return false; };

const SUPABASE_URL = "https://avrdeswpdubsonijbajt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cmRlc3dwZHVic29uaWpiYWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjMzODEsImV4cCI6MjEwODY5OTM4MX0.2bnmnhjk6g3fS9zEOda552GZpZ6TjY0889pd9DT6zl4";

let sb = null; try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) {}
const KARA_LISTE = ['123456','111111','000000','654321','123123','121212','112233','123321','111222','222333','123654','147258','159753','987654','999999','000111','123789','456123'];
let mevcutPersonel = null;
let sistemAyar = { aktif_vardiya: 1 };
let realtimeKanal = null;

function toast(msg, tip='hata') {
  const t = document.getElementById('toast');
  t.innerText = msg; t.style.background = tip === 'hata' ? '#C62828' : '#10B981';
  t.classList.add('gorunur'); setTimeout(()=>t.classList.remove('gorunur'), 3000);
}

// Sadece Telegram kullanacaksak (App ID'leri kaldırdık, şimdilik boş bırakıyoruz)
async function bildirimGonder(baslik, mesaj) { console.log("Bildirim tetiklendi:", baslik, mesaj); }

async function logEkle(islem, aciklama = "") {
  if (!mevcutPersonel) return;
  try { await sb.from('log_kayitlari').insert([{ personel_id: mevcutPersonel.id, ad_soyad_snapshot: mevcutPersonel.ad_soyad, islem: islem, aciklama: aciklama }]); } catch(e) {}
}

// GİRİŞ & KAYIT
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
  const hataEl = document.getElementById('kayitHata'); hataEl.innerText = '';
  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  hataEl.innerText = 'Kontrol ediliyor...';
  const { data: personel } = await sb.from('personel').select('id, auth_user_id').eq('email', email).single();
  if (!personel) return hataEl.innerText = "Bu e-posta sistemde kayıtlı değil. Yöneticinize başvurun.";
  if (personel.auth_user_id) return hataEl.innerText = "Bu hesap zaten oluşturulmuş.";

  const { data, error } = await sb.auth.signUp({ email, password: sifre });
  if (error) return hataEl.innerText = "Kayıt hatası: " + error.message;
  const { data: loginData } = await sb.auth.signInWithPassword({ email, password: sifre });
  if (loginData) oturumBaslat(loginData.user);
});

async function oturumBaslat(user) {
  const { data } = await sb.from('personel').select('*').eq('auth_user_id', user.id).single();
  if (!data) { alert("Personel kaydınız bulunamadı!"); return cikisYap(); }
  mevcutPersonel = data;
  const { data: ayar } = await sb.from('sistem_ayarlari').select('*').eq('id', 1).single();
  if (ayar) sistemAyar = ayar;

  document.getElementById('ustIsim').innerText = mevcutPersonel.ad_soyad;
  document.getElementById('ustRol').innerText = mevcutPersonel.rol.toUpperCase().replace('_', ' ');
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz Çalışanı";

  ekranDegistir('ekranUygulama'); panelYukle(); realtimeBaslat();
}

async function cikisYap() {
  if (realtimeKanal) await sb.removeChannel(realtimeKanal);
  await sb.auth.signOut(); mevcutPersonel = null; ekranDegistir('ekranGiris');
}

function realtimeBaslat() {
  if (realtimeKanal) sb.removeChannel(realtimeKanal);
  realtimeKanal = sb.channel('icap-degisim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'icap_gorevleri' }, () => panelYukle())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hazir_icapcilar' }, () => panelYukle())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'log_kayitlari' }, () => panelYukle())
    .subscribe();
}

async function panelYukle() {
  if (!mevcutPersonel) return;

  // Aktif İcapler
  const { data: aktifler } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  document.getElementById('aktifIcapSayisi').innerText = aktifler ? aktifler.length : 0;
  
  let aHtml = '';
  if (aktifler && aktifler.length > 0) {
    aktifler.forEach(a => {
      const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
      aHtml += `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
        <div>
          <div style="font-weight:800; font-size:14px; color:#0F172A;">${a.personel.ad_soyad}</div>
          <div style="font-size:12px; color:#64748B; margin-top:4px;">Başlangıç: <b>${new Date(a.baslama_zamani).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</b></div>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-yesil" style="margin-bottom:4px;">${a.personel.rol.includes('sofor')?'Şoför':'Er'}</span>
          <div style="font-size:13px; font-weight:800; color:#10B981;">${Math.floor(dk/60)}s ${dk%60}dk</div>
        </div>
      </div>`;
    });
  } else { aHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px; padding:20px;">Şu an görevde personel bulunmuyor.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  // Hazır İcapçılar
  const { data: hazirlar } = await sb.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString());
  let hHtml = '';
  if (hazirlar && hazirlar.length > 0) {
    hazirlar.forEach(h => {
      hHtml += `<div style="background:var(--mavi-acik); border-left:4px solid var(--mavi); padding:16px; border-radius:12px; margin-bottom:12px;">
        <div style="font-weight:800; color:var(--mavi); font-size:13px; margin-bottom:8px;">${h.vardiya}. Vardiya İstirahat Ekibi</div>
        <div style="display:flex; gap:16px; font-size:13px; font-weight:600; color:var(--metin);">
          <div>👨‍🚒 ${h.er.ad_soyad}</div>
          <div>🚛 ${h.sofor.ad_soyad}</div>
        </div>
      </div>`;
    });
  } else { hHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px; padding:20px;">Aktif hazır icapçı ekibi bulunmuyor.</div>'; }
  document.getElementById('hazirIcapcilarKart').innerHTML = `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge">🚨</div>Hazır İcapçı Ekibi</div>${hHtml}</div>`;

  // Bakiye & Geçmiş (Modern Tablo)
  const { data: icapGecmis } = await sb.from('icap_gorevleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('baslama_zamani', { ascending: false });
  const { data: izinGecmis } = await sb.from('icap_izin_talepleri').select('*').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi').order('izin_tarihi', { ascending: false });
  
  const toplam = icapGecmis ? icapGecmis.reduce((s,x)=>s+(x.toplam_dakika||0),0) : 0;
  const kullanilan = izinGecmis ? izinGecmis.reduce((s,x)=>s+(x.talep_edilen_dakika||0),0) : 0;
  const kalan = toplam - kullanilan;

  let gecmisHtml = '';
  const tumGecmis = [];
  if(icapGecmis) icapGecmis.forEach(g => tumGecmis.push({tip: 'icap', tarih: g.baslama_zamani, data: g}));
  if(izinGecmis) izinGecmis.forEach(g => tumGecmis.push({tip: 'izin', tarih: g.izin_tarihi + 'T00:00:00', data: g}));
  tumGecmis.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));

  if (tumGecmis.length > 0) {
    gecmisHtml = `<div class="modern-tablo-wrap"><table class="modern-tablo">
      <thead><tr><th>Tarih / Saat</th><th>İşlem</th><th>Açıklama</th><th>Süre</th></tr></thead><tbody>`;
    tumGecmis.slice(0, 10).forEach(x => {
      if(x.tip === 'icap') {
         gecmisHtml += `<tr>
            <td><div style="font-weight:700;">${new Date(x.data.baslama_zamani).toLocaleDateString('tr-TR')}</div><div style="font-size:11px; color:#64748B;">${new Date(x.data.baslama_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} - ${new Date(x.data.bitis_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div></td>
            <td><span class="badge badge-yesil">İcap</span></td>
            <td style="font-size:12px; color:#64748B;">${x.data.gorev_aciklamasi || 'Belirtilmedi'}</td>
            <td style="font-weight:800; color:#10B981;">+${Math.floor(x.data.toplam_dakika/60)}s ${x.data.toplam_dakika%60}dk</td>
         </tr>`;
      } else {
         gecmisHtml += `<tr>
            <td><div style="font-weight:700;">${new Date(x.data.izin_tarihi).toLocaleDateString('tr-TR')}</div></td>
            <td><span class="badge badge-turuncu">İzin</span></td>
            <td style="font-size:12px; color:#64748B;">${x.data.aciklama || 'İzin kullanımı'}</td>
            <td style="font-weight:800; color:#EF4444;">-${Math.floor(x.data.talep_edilen_dakika/60)}s ${x.data.talep_edilen_dakika%60}dk</td>
         </tr>`;
      }
    });
    gecmisHtml += `</tbody></table></div>`;
  } else { gecmisHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px; padding:20px;">Henüz geçmiş kaydınız bulunmuyor.</div>'; }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="kart">
      <div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--mavi-acik); color:var(--mavi);">💼</div>İcap / İzin Bakiyeniz</div>
      <div class="bakiye-grid">
        <div class="bakiye-item"><div class="bakiye-etiket">Biriken</div><div class="bakiye-deger" style="color:#10B981;">${Math.floor(toplam/60)}s ${toplam%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kullanılan</div><div class="bakiye-deger" style="color:#F59E0B;">${Math.floor(kullanilan/60)}s ${kullanilan%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kalan</div><div class="bakiye-deger" style="color:${kalan<0?'#EF4444':'#3B82F6'}">${Math.floor(Math.abs(kalan)/60)}s ${Math.abs(kalan)%60}dk</div></div>
      </div>
      <div style="margin-top:16px;">${gecmisHtml}</div>
    </div>`;

  rolIcerikCiz(aktifler, hazirlar);

  // Sistem Hareketleri (Zaman Tüneli)
  let logHtml = '';
  try {
    const { data: loglar } = await sb.from('log_kayitlari').select('*').order('ne_zaman', { ascending: false }).limit(5);
    if (loglar && loglar.length > 0) {
      loglar.forEach(l => {
        const t = new Date(l.ne_zaman).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
        logHtml += `<div style="display:flex; gap:12px; margin-bottom:12px;">
          <div style="width:40px; font-size:11px; font-weight:800; color:#94A3B8; text-align:right; padding-top:2px;">${t}</div>
          <div style="flex:1; border-left:2px solid #E2E8F0; padding-left:12px; position:relative;">
            <div style="position:absolute; left:-5px; top:4px; width:8px; height:8px; border-radius:50%; background:var(--kirmizi);"></div>
            <div style="font-size:13px; font-weight:700; color:#0F172A;">${l.ad_soyad_snapshot}</div>
            <div style="font-size:12px; color:#64748B; margin-top:2px;">${l.islem} <span style="color:#94A3B8;">${l.aciklama ? '• '+l.aciklama : ''}</span></div>
          </div>
        </div>`;
      });
    } else { logHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px;">Henüz hareket yok.</div>'; }
  } catch (err) {}
  
  const logKutu = document.getElementById('logPenceresi');
  if (logKutu) {
    logKutu.style.display = 'block'; 
    logKutu.innerHTML = `<div class="kart-baslik"><div class="kart-baslik-simge">📜</div>Sistem Hareketleri</div><div>${logHtml}</div>`;
  }
}

async function rolIcerikCiz(aktifler, hazirlar) {
  const el = document.getElementById('rolIcerik');
  const rol = mevcutPersonel.rol;
  let html = '';

  if (rol === 'super_admin') {
    html += `<div class="kart" style="background:var(--lacivert-koyu); color:#fff; border:none;">
      <div class="kart-baslik" style="color:#fff;"><div class="kart-baslik-simge" style="background:rgba(255,255,255,0.1);">🛠️</div>Süper Admin Paneli</div>
      <button type="button" class="btn btn-mavi" onclick="adminPaneliAc()">🚀 Yönetim Ekranını Aç</button>
    </div>`;
  }

  const kendiAktif = aktifler?.find(a => a.personel_id === mevcutPersonel.id);
  
  if (kendiAktif) {
    html += `<div class="kart" style="border:1.5px solid var(--yesil); background:var(--yesil-acik);">
      <div class="kart-baslik" style="color:var(--yesil);">🟢 Göreviniz Devam Ediyor</div>
      <p style="font-size:14px; font-weight:600; margin-bottom:16px; color:#047857;">Başlangıç: ${new Date(kendiAktif.baslama_zamani).toLocaleTimeString('tr-TR')}</p>
      <button type="button" class="btn btn-danger" onclick="icapBitir('${kendiAktif.id}')">⏹ İcap Görevini Bitir</button>
    </div>`;
  } else {
    let baslatabilir = true; let uyari = "";
    const suAn = new Date(); const gun = suAn.getDay(); const saat = suAn.getHours();
    
    if (mevcutPersonel.rol === 'gunduz_85') {
      if (gun >= 1 && gun <= 5 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz (08:00-17:00)."; }
    } else if (mevcutPersonel.rol === 'gunduz_816') {
      if (gun !== 4 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz."; }
    } else if (mevcutPersonel.vardiya) {
      if (mevcutPersonel.vardiya === sistemAyar.aktif_vardiya) { baslatabilir = false; uyari = "Şu an nöbetçi vardiyadasınız. Asli görevinizdesiniz."; }
    }
    
    html += `<div class="kart">
      <div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--kirmizi-acik); color:var(--kirmizi);">🚒</div>Yeni İcap Görevi</div>
      ${!baslatabilir ? `<div style="background:var(--kirmizi-acik); color:var(--kirmizi-koyu); padding:14px; border-radius:12px; font-size:13px; margin-bottom:16px; font-weight:700; border:1px solid #FECACA;">⚠️ ${uyari}</div>` : ''}
      <textarea id="gorevAciklama" placeholder="İcap görev açıklaması yazınız..." ${!baslatabilir?'disabled':''}></textarea>
      <button type="button" class="btn btn-primary" onclick="icapBaslat()" ${!baslatabilir?'disabled style="opacity:0.5;"':''}>▶ İcap Görevini Başlat</button>
    </div>`;
  }

  if (!kendiAktif) {
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--mor-acik); color:var(--mor);">📅</div>İcap İzni Kullan</div><button type="button" class="btn btn-mor" onclick="izinModalAc()">📅 İzin Talebi Oluştur</button></div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let query = sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    const { data: bekleyenler } = await query;
    
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenler.forEach(b => {
        bHtml += `<div style="border:1px solid var(--kenar); border-radius:12px; padding:16px; margin-bottom:12px; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:800; font-size:15px;">${b.personel.ad_soyad}</div>
            <span class="badge badge-turuncu">Onay Bekliyor</span>
          </div>
          <div style="font-size:13px; color:var(--ikincil); margin-bottom:12px;">
            <b>Rol:</b> ${b.personel.rol.replace('_',' ')} <br>
            <b>Süre:</b> ${Math.floor(b.toplam_dakika/60)}s ${b.toplam_dakika%60}dk
          </div>
          ${b.gorev_aciklamasi ? `<div style="font-size:12px; background:#F8FAFC; padding:10px; border-radius:8px; margin-bottom:12px; color:#475569;">${b.gorev_aciklamasi}</div>` : ''}
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-success" style="margin:0; padding:10px;" onclick="onayla('${b.id}', 'icap')">Onayla</button>
            <button type="button" class="btn btn-danger" style="margin:0; padding:10px;" onclick="reddet('${b.id}', 'icap')">Reddet</button>
          </div>
        </div>`;
      });
    } else { bHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px; padding:20px;">Onay bekleyen yok.</div>'; }
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--turuncu-acik); color:var(--turuncu);">⏳</div>Onay Bekleyen İcaplar</div>${bHtml}</div>`;

    let izinQuery = sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') izinQuery = izinQuery.eq('personel.vardiya', mevcutPersonel.vardiya).eq('eksi_bakiye_mi', false);
    if (rol === 'grup_amiri' || rol === 'super_admin') izinQuery = izinQuery.or(`eksi_bakiye_mi.eq.true,personel.rol.in.(gunduz_85,gunduz_816)`);
    const { data: izinler } = await izinQuery;
    
    let iHtml = '';
    if (izinler && izinler.length > 0) {
      izinler.forEach(b => {
        iHtml += `<div style="border:1px solid var(--kenar); border-radius:12px; padding:16px; margin-bottom:12px; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:800; font-size:15px;">${b.personel.ad_soyad}</div>
            <span class="badge badge-turuncu">İzin Talebi</span>
          </div>
          <div style="font-size:13px; color:var(--ikincil); margin-bottom:12px;">
            <b>Süre:</b> ${Math.floor(b.talep_edilen_dakika/60)}s ${b.talep_edilen_dakika%60}dk <br>
            <b>Tarih:</b> ${b.izin_tarihi} ${b.eksi_bakiye_mi?'<span style="color:red; font-weight:bold;">(Eksi Bakiye!)</span>':''}
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-success" style="margin:0; padding:10px;" onclick="onayla('${b.id}', 'izin')">Onayla</button>
            <button type="button" class="btn btn-danger" style="margin:0; padding:10px;" onclick="reddet('${b.id}', 'izin')">Reddet</button>
          </div>
        </div>`;
      });
    } else { iHtml = '<div style="text-align:center; color:#94A3B8; font-size:13px; padding:20px;">Onay bekleyen izin talebi yok.</div>'; }
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--mor-acik); color:var(--mor);">📅</div>Onay Bekleyen İzinler</div>${iHtml}</div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:var(--mavi-acik); color:var(--mavi);">🚨</div>Hazır İcapçı Seçimi</div>
      <p style="font-size:13px; color:var(--ikincil); margin-bottom:16px;">48 saatlik istirahat dönemi için 1 Er ve 1 Şoför belirleyin.</p>
      <button type="button" class="btn btn-mavi" onclick="hazirIcapciModalAc()">Personel Seç</button>
    </div>`;
  }

  if (['grup_amiri', 'super_admin', 'vardiya_cavusu'].includes(rol)) {
    const bugun = new Date().toISOString().split('T')[0];
    const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge">📊</div>Raporlama</div>
      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <div style="flex:1;"><label style="font-size:11px; font-weight:700; color:var(--ikincil);">Başlangıç</label><input type="date" id="raporBaslangic" value="${otuzGunOnce}" style="width:100%; padding:12px; border-radius:10px; border:1.5px solid var(--kenar); font-family:inherit;"></div>
        <div style="flex:1;"><label style="font-size:11px; font-weight:700; color:var(--ikincil);">Bitiş</label><input type="date" id="raporBitis" value="${bugun}" style="width:100%; padding:12px; border-radius:10px; border:1.5px solid var(--kenar); font-family:inherit;"></div>
      </div>
      <button type="button" class="btn btn-outline" onclick="raporCsvIndir()">⬇ Detaylı CSV İndir</button>
    </div>`;
  }
  
  el.innerHTML = html;
}

// İŞLEMLER
async function icapBaslat() {
  const aciklama = document.getElementById('gorevAciklama').value;
  const { error } = await sb.from('icap_gorevleri').insert([{ personel_id: mevcutPersonel.id, vardiya: mevcutPersonel.vardiya, gorev_aciklamasi: aciklama, durum: 'aktif' }]);
  if (error) toast("Hata: " + error.message); 
  else { toast("İcap başlatıldı", "basari"); await logEkle("İcap Başlattı", aciklama); await bildirimGonder("🚨 İCAP BAŞLADI", `${mevcutPersonel.ad_soyad} - ${aciklama}`); }
}

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  
  const { error } = await sb.from('icap_gorevleri').update({ bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null }).eq('id', id);
  if (error) toast("Hata: " + error.message); 
  else { toast("İcap bitirildi", "basari"); await logEkle("İcabı Bitirdi", `${dk} dk`); await bildirimGonder("✅ İCAP BİTTİ", `${mevcutPersonel.ad_soyad} - Süre: ${Math.floor(dk/60)}s ${dk%60}dk`); }
}

async function onayla(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  await sb.from(tablo).update({ durum: 'onaylandi', onaylayan_id: mevcutPersonel.id, onay_zamani: new Date().toISOString() }).eq('id', id);
  toast("Onaylandı", "basari"); await logEkle(tip === 'icap' ? "İcap Onayladı" : "İzin Onayladı");
}

async function reddet(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const sebep = prompt("Red sebebi:"); if (sebep === null) return;
  await sb.from(tablo).update({ durum: 'reddedildi', onaylayan_id: mevcutPersonel.id, red_sebebi: sebep }).eq('id', id);
  toast("Reddedildi"); await logEkle(tip === 'icap' ? "İcap Reddetti" : "İzin Reddetti", sebep);
}

// MODALLAR
function izinModalAc() {
  let html = `<div class="modal aktif" id="izinModal"><div class="modal-content">
    <h3 style="margin:0 0 16px 0; color:var(--mor);">İzin Talebi</h3>
    <div class="form-grup"><label>Süre (Saat)</label><input type="number" id="izinSaat" min="0" value="1"></div>
    <div class="form-grup"><label>Dakika</label><input type="number" id="izinDakika" min="0" max="59" value="0"></div>
    <div class="form-grup"><label>Tarih</label><input type="date" id="izinTarih" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-grup"><label>Açıklama</label><input type="text" id="izinAciklama" placeholder="Neden izin kullanıyorsunuz?"></div>
    <button type="button" class="btn btn-mor" onclick="izinTalepEt()">Talebi Gönder</button>
    <button type="button" class="btn btn-outline" onclick="document.getElementById('izinModal').remove()">İptal</button>
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
  const bakiye = (icaps||[]).reduce((s,x)=>s+(x.toplam_dakika||0),0) - (izins||[]).reduce((s,x)=>s+(x.talep_edilen_dakika||0),0);
  const eksiMi = toplamDk > bakiye;
  
  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if(!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek. Sadece Grup Amiri onaylayabilir. Onaylıyor musunuz?")) return;
  }
  await sb.from('icap_izin_talepleri').insert([{ personel_id: mevcutPersonel.id, talep_edilen_dakika: toplamDk, izin_tarihi: document.getElementById('izinTarih').value, aciklama: document.getElementById('izinAciklama').value, eksi_bakiye_mi: eksiMi }]);
  document.getElementById('izinModal').remove();
  toast("İzin talebi gönderildi.", "basari"); await logEkle("İzin Talebi Oluşturdu", `${s}s ${d}dk`);
}

async function hazirIcapciModalAc() {
  let vardiyaSecimiHtml = '';
  if (mevcutPersonel.rol !== 'vardiya_cavusu') {
    vardiyaSecimiHtml = `<div class="form-grup"><label>Hangi Vardiya İçin Seçim Yapıyorsunuz?</label><select id="secVardiya" onchange="hazirPersonelleriGetir()"><option value="1">1. Vardiya</option><option value="2">2. Vardiya</option><option value="3">3. Vardiya</option></select></div>`;
  } else { vardiyaSecimiHtml = `<input type="hidden" id="secVardiya" value="${mevcutPersonel.vardiya}">`; }

  let html = `<div class="modal aktif" id="hazirModal"><div class="modal-content">
    <h3 style="margin:0 0 16px 0; color:var(--mavi);">Hazır İcapçı Seçimi</h3>
    ${vardiyaSecimiHtml}
    <div id="hazirPersonelAlan"></div>
    <button type="button" class="btn btn-primary" onclick="hazirKaydet()">Seçimi Onayla</button>
    <button type="button" class="btn btn-outline" onclick="document.getElementById('hazirModal').remove()">İptal</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  hazirPersonelleriGetir();
}

async function hazirPersonelleriGetir() {
  const vardiya = parseInt(document.getElementById('secVardiya').value);
  const { data: personeller } = await sb.from('personel').select('*').eq('vardiya', vardiya);
  const erler = personeller.filter(p => p.rol === 'itfaiye_eri');
  const soforler = personeller.filter(p => p.rol === 'itfaiye_soforu');
  document.getElementById('hazirPersonelAlan').innerHTML = `
    <div class="form-grup"><label>İtfaiye Eri</label><select id="secEr">${erler.length ? erler.map(e=>`<option value="${e.id}">${e.ad_soyad}</option>`).join('') : '<option value="">Er bulunamadı</option>'}</select></div>
    <div class="form-grup"><label>İtfaiye Şoförü</label><select id="secSofor">${soforler.length ? soforler.map(s=>`<option value="${s.id}">${s.ad_soyad}</option>`).join('') : '<option value="">Şoför bulunamadı</option>'}</select></div>
  `;
}

async function hazirKaydet() {
  const vardiya = parseInt(document.getElementById('secVardiya').value);
  const erId = document.getElementById('secEr').value;
  const soforId = document.getElementById('secSofor').value;
  if(!erId || !soforId) return toast("Lütfen personel seçin.");
  const erAd = document.getElementById('secEr').options[document.getElementById('secEr').selectedIndex].text;
  const soforAd = document.getElementById('secSofor').options[document.getElementById('secSofor').selectedIndex].text;

  const simdi = new Date(); const bitis = new Date(simdi.getTime() + (48 * 60 * 60 * 1000));
  await sb.from('hazir_icapcilar').insert([{ vardiya: vardiya, er_personel_id: erId, sofor_personel_id: soforId, baslangic_zamani: simdi.toISOString(), bitis_zamani: bitis.toISOString(), secen_cavus_id: mevcutPersonel.id }]);
  document.getElementById('hazirModal').remove();
  toast("Hazır icapçılar belirlendi.", "basari"); await logEkle("Hazır İcapçı Seçti", `${vardiya}. Vardiya - ${erAd} & ${soforAd}`);
  await bildirimGonder("🚨 HAZIR İCAPÇI BELİRLENDİ", `${vardiya}. Vardiya Ekibi:\nEr: ${erAd}\nŞoför: ${soforAd}`);
}

// SÜPER ADMİN
function adminPaneliAc() {
  let html = `<div class="modal aktif" id="adminModal"><div class="modal-content" style="max-width:800px;">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:10px; margin-bottom:15px;">
      <h3 style="margin:0; color:#23262b;">🛠️ Süper Admin Yönetim Paneli</h3>
      <button type="button" class="btn btn-danger" style="width:auto; padding:5px 15px; margin:0;" onclick="document.getElementById('adminModal').remove()">Kapat ✕</button>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;">
      <button type="button" class="btn btn-primary" onclick="adminTab('personel')" style="margin:0; width:auto;">👥 Personel Yönetimi</button>
      <button type="button" class="btn btn-mor" onclick="adminTab('ayarlar')" style="margin:0; width:auto;">⚙️ Sistem Ayarları</button>
    </div>
    <div id="adminIcerik"></div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  adminTab('personel');
}

async function adminTab(tab) {
  const el = document.getElementById('adminIcerik');
  el.innerHTML = '<div style="text-align:center; padding:20px;">Yükleniyor...</div>';

  if (tab === 'personel') {
    const { data: personeller } = await sb.from('personel').select('*').order('rol').order('vardiya');
    let rows = '';
    if(personeller) {
      personeller.forEach(p => {
        const rolAd = p.rol.replace('_', ' ').toUpperCase();
        const vardiyaAd = p.vardiya ? p.vardiya + ". Vardiya" : "Gündüz";
        const durum = p.auth_user_id ? '<span class="badge badge-yesil">Aktif</span>' : '<span class="badge badge-turuncu">Bekliyor</span>';
        rows += `<tr>
          <td style="font-weight:700;">${p.ad_soyad}</td>
          <td>${p.email}</td>
          <td>${rolAd}</td>
          <td>${vardiyaAd}</td>
          <td>${durum}</td>
          <td><button type="button" onclick="personelSil('${p.id}')" style="background:none; border:none; color:red; cursor:pointer; font-size:16px;">🗑️</button></td>
        </tr>`;
      });
    }

    el.innerHTML = `
      <div style="background:#F8FAFC; padding:20px; border-radius:16px; margin-bottom:20px; border:1px solid #E2E8F0;">
        <h4 style="margin:0 0 16px 0;">Yeni Personel Ekle</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-grup"><label>Ad Soyad</label><input type="text" id="addAd" placeholder="Örn: Ahmet Yılmaz"></div>
          <div class="form-grup"><label>E-posta</label><input type="email" id="addEmail" placeholder="ahmet@gmail.com"></div>
          <div class="form-grup"><label>Rol</label>
            <select id="addRol">
              <option value="itfaiye_eri">İtfaiye Eri</option><option value="itfaiye_soforu">İtfaiye Şoförü</option>
              <option value="vardiya_cavusu">Vardiya Çavuşu</option><option value="grup_amiri">Grup Amiri</option>
              <option value="gunduz_85">Gündüz 8/5</option><option value="gunduz_816">Gündüz 8/16</option>
              <option value="super_admin">Süper Admin</option>
            </select>
          </div>
          <div class="form-grup"><label>Vardiya (Gündüz ise Boş)</label>
            <select id="addVardiya"><option value="">Gündüz / Yok</option><option value="1">1. Vardiya</option><option value="2">2. Vardiya</option><option value="3">3. Vardiya</option></select>
          </div>
        </div>
        <button type="button" class="btn btn-success" onclick="personelEkle()">➕ Personeli Kaydet</button>
      </div>
      
      <div class="modern-tablo-wrap">
        <table class="modern-tablo">
          <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>Vardiya</th><th>Durum</th><th>Sil</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } 
  else if (tab === 'ayarlar') {
    el.innerHTML = `
      <div style="background:#F8FAFC; padding:20px; border-radius:16px; border:1px solid #E2E8F0; margin-bottom:20px;">
        <h4 style="margin:0 0 16px 0;">Sistem Ayarları</h4>
        <div class="form-grup">
          <label>Şu Anki Aktif Vardiya:</label>
          <input type="number" id="ayarVardiya" value="${sistemAyar.aktif_vardiya}" min="1" max="3">
        </div>
        <button type="button" class="btn btn-primary" onclick="ayarKaydet()">Ayarları Güncelle</button>
      </div>

      <div style="background:var(--yesil-acik); padding:20px; border-radius:16px; border:1px solid #A7F3D0;">
        <h4 style="margin:0 0 16px 0; color:var(--yesil-koyu);">📦 Yedek Yönetimi</h4>
        <p style="font-size:12px; color:#047857; margin-bottom:16px;">Sistem her gece 22:00'de otomatik yedek alır. Dilerseniz en son yedeği buradan indirebilir veya geri yükleyebilirsiniz.</p>
        <button type="button" class="btn btn-success" onclick="sonYedegiIndir()" style="margin-bottom:16px;">⬇ En Son Yedeği İndir</button>
        <hr style="border:0; border-top:1px dashed #A7F3D0; margin:16px 0;">
        <p style="font-size:12px; color:#B91C1C; font-weight:bold; margin-bottom:12px;">Dikkat: Geri yükleme işlemi mevcut verilerle çakışabilir.</p>
        <input type="file" id="yedekGeriYukleInput" accept=".json" style="display:none;" onchange="yedekGeriYukleIslem(event)">
        <button type="button" class="btn btn-danger" onclick="yedekGeriYukleTetikle()">⬆ Bir Yedek Dosyası Seç ve Geri Yükle</button>
      </div>
    `;
  }
}

async function personelEkle() {
  const ad = document.getElementById('addAd').value, email = document.getElementById('addEmail').value, rol = document.getElementById('addRol').value, vardiya = document.getElementById('addVardiya').value;
  if(!ad || !email) return toast("Lütfen tüm alanları doldurun.");
  const { error } = await sb.from('personel').insert([{ ad_soyad: ad, email: email, rol: rol, vardiya: vardiya ? parseInt(vardiya) : null }]);
  if(error) toast("Hata: " + error.message);
  else { toast("Personel eklendi.", "basari"); await logEkle("Personel Ekledi", ad); adminTab('personel'); }
}

async function personelSil(id) {
  if(!confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
  const { error } = await sb.from('personel').delete().eq('id', id);
  if(error) toast("Hata: " + error.message); else { toast("Personel silindi.", "basari"); adminTab('personel'); }
}

async function ayarKaydet() {
  const yeniVardiya = parseInt(document.getElementById('ayarVardiya').value);
  if(![1,2,3].includes(yeniVardiya)) return toast("Vardiya 1, 2 veya 3 olabilir.");
  const { error } = await sb.from('sistem_ayarlari').update({ aktif_vardiya: yeniVardiya }).eq('id', 1);
  if(error) toast("Hata: " + error.message);
  else { sistemAyar.aktif_vardiya = yeniVardiya; toast("Ayarlar güncellendi.", "basari"); await logEkle("Vardiya Değiştirdi", `Yeni: ${yeniVardiya}`); }
}

async function raporCsvIndir() {
  const bas = document.getElementById('raporBaslangic').value, bit = document.getElementById('raporBitis').value;
  if(!bas || !bit) return toast("Lütfen tarih aralığı seçin.");
  const basISO = new Date(bas + "T00:00:00").toISOString(), bitISO = new Date(bit + "T23:59:59").toISOString();
  const { data: icaps } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'onaylandi').gte('baslama_zamani', basISO).lte('baslama_zamani', bitISO);
  if (!icaps || !icaps.length) return toast("Seçilen tarihlerde onaylanmış icap yok.");
  let csv = "Personel,Rol,Gorev Aciklamasi,Baslangic,Bitis,Sure(Dakika)\n";
  icaps.forEach(i => { csv += `"${i.personel.ad_soyad}","${i.personel.rol}","${(i.gorev_aciklamasi||'').replace(/"/g, '""')}","${new Date(i.baslama_zamani).toLocaleString('tr-TR')}","${new Date(i.bitis_zamani).toLocaleString('tr-TR')}",${i.toplam_dakika}\n`; });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `icap_raporu_${bas}_${bit}.csv`; link.click();
}

async function veriYedekle() {
  toast("Yedek alınıyor...", "basari");
  try { const { error } = await sb.rpc('yedek_al'); if (error) throw error; toast("Yedeklendi! (Supabase Bulut)", "basari"); await logEkle("Manuel Yedek Aldı", "Buluta kaydedildi"); } catch (e) { toast("Hata: " + e.message); }
}

async function sonYedegiIndir() {
  toast("Son yedek aranıyor...", "basari");
  const { data, error } = await sb.from('yedekler').select('*').order('tarih', { ascending: false }).limit(1).single();
  if (error || !data) { toast("Henüz yedek bulunamadı."); return; }
  const str = JSON.stringify(data.veri, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${data.dosya_adi}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  toast("Yedek indirildi.", "basari");
}

function yedekGeriYukleTetikle() { document.getElementById('yedekGeriYukleInput').click(); }

async function yedekGeriYukleIslem(event) {
  const file = event.target.files[0]; if (!file) return;
  if (!confirm("DİKKAT! Mevcut verilerin üzerine yazılacaktır. Emin misiniz?")) { event.target.value = ''; return; }
  toast("Yedek okunuyor...", "basari");
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const icerik = JSON.parse(e.target.result);
      if (!icerik.personel || !icerik.icap_gorevleri) throw new Error("Geçersiz yedek formatı!");
      toast("Yükleniyor...", "basari"); await sb.from('personel').upsert(icerik.personel, { onConflict: 'id' });
      await sb.from('icap_gorevleri').upsert(icerik.icap_gorevleri, { onConflict: 'id' });
      if (icerik.izin_talepleri) await sb.from('icap_izin_talepleri').upsert(icerik.izin_talepleri, { onConflict: 'id' });
      if (icerik.hazir_icapcilar) await sb.from('hazir_icapcilar').upsert(icerik.hazir_icapcilar, { onConflict: 'id' });
      toast("Geri yüklendi!", "basari"); setTimeout(() => window.location.reload(), 1500);
    } catch (err) { alert("Hata: " + err.message); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

if (sb) { sb.auth.getSession().then(({ data: { session } }) => { if (session) oturumBaslat(session.user); }); }
