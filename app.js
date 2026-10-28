// ============================================================
// AŞAMA 6: LOG SİSTEMİ VE SİSTEM HAREKETLERİ PENCERESİ (TAM)
// ============================================================

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  const hedef = document.getElementById(id);
  if(hedef) hedef.classList.add('aktif');
}

window.onerror = function(msg, url, line, col, error) {
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

function toast(msg, tip='hata') {
  const t = document.getElementById('toast');
  t.innerText = msg; t.style.background = tip === 'hata' ? '#9c2b2b' : '#2f7a52';
  t.classList.add('gorunur'); setTimeout(()=>t.classList.remove('gorunur'), 3000);
}

async function logEkle(islem, aciklama = "") {
  if (!mevcutPersonel) return;
  await sb.from('log_kayitlari').insert([{
    personel_id: mevcutPersonel.id,
    ad_soyad_snapshot: mevcutPersonel.ad_soyad,
    islem: islem,
    aciklama: aciklama
  }]);
}

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
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz";

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

async function panelYukle() {
  if (!mevcutPersonel) return;

  const { data: aktifler } = await sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  document.getElementById('aktifIcapSayisi').innerText = aktifler ? aktifler.length : 0;
  
  let aHtml = '';
  if (aktifler && aktifler.length > 0) {
    aktifler.forEach(a => {
      const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
      aHtml += `<div class="aktif-item"><div class="aktif-ust"><div class="aktif-isim">${a.personel.ad_soyad}</div><div style="font-size:11px;color:#35618a;">${a.personel.rol.includes('sofor')?'🚛 Şoför':'👨‍🚒 Er'}</div></div><div style="font-size:11px;color:#6b7178;">Başlama: ${new Date(a.baslama_zamani).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})} (${Math.floor(dk/60)}s ${dk%60}dk)</div></div>`;
    });
  } else { aHtml = '<div style="font-size:12px;color:#979da3;text-align:center;">Şu an icapte personel yok.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  const { data: hazirlar } = await sb.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString());
  let hHtml = '';
  if (hazirlar && hazirlar.length > 0) {
    hazirlar.forEach(h => {
      hHtml += `<div style="background:#eef3f7;padding:10px;border-radius:10px;margin-bottom:8px;border-left:4px solid #35618a;"><strong>${h.vardiya}. Vardiya İstirahat Ekibi</strong><br><span style="font-size:12px;">👨‍🚒 ${h.er.ad_soyad} | 🚛 ${h.sofor.ad_soyad}</span></div>`;
    });
  } else { hHtml = '<div style="font-size:12px;color:#979da3;">Aktif hazır icapçı ekibi bulunmuyor.</div>'; }
  document.getElementById('hazirIcapcilarKart').innerHTML = `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#eef3f7;color:#35618a;">🚨</div>Hazır İcapçı Ekibi</div>${hHtml}</div>`;

    // GEÇMİŞ DETAYLI BAKİYE HESAPLAMA
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
    gecmisHtml += `<div style="margin-top:15px; border-top:1px solid #c9dbe7; padding-top:10px;">`;
    gecmisHtml += `<div style="font-size:11px; font-weight:800; color:#2f5474; margin-bottom:8px;">GEÇMİŞ İCAP / İZİN DETAYLARI</div>`;
    tumGecmis.forEach(x => {
      if(x.tip === 'icap') {
         gecmisHtml += `<div style="display:flex; justify-content:space-between; font-size:11px; padding:6px 0; border-bottom:1px dashed #e0e8f0;">
            <div style="flex:1;">
              <strong>İcap:</strong> ${new Date(x.data.baslama_zamani).toLocaleDateString('tr-TR')} <br>
              <span style="color:#6b7178;">${new Date(x.data.baslama_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} - ${new Date(x.data.bitis_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
              ${x.data.gorev_aciklamasi ? `<br><em style="color:#979da3;">${x.data.gorev_aciklamasi}</em>` : ''}
            </div>
            <div style="font-weight:800; color:#2f7a52; white-space:nowrap; margin-left:10px;">+${Math.floor(x.data.toplam_dakika/60)}s ${x.data.toplam_dakika%60}dk</div>
         </div>`;
      } else {
         gecmisHtml += `<div style="display:flex; justify-content:space-between; font-size:11px; padding:6px 0; border-bottom:1px dashed #e0e8f0;">
            <div style="flex:1;">
              <strong>İzin:</strong> ${new Date(x.data.izin_tarihi).toLocaleDateString('tr-TR')} <br>
              <span style="color:#6b7178;">${x.data.aciklama || 'İzin kullanımı'}</span>
            </div>
            <div style="font-weight:800; color:#a33a3a; white-space:nowrap; margin-left:10px;">-${Math.floor(x.data.talep_edilen_dakika/60)}s ${x.data.talep_edilen_dakika%60}dk</div>
         </div>`;
      }
    });
    gecmisHtml += `</div>`;
  }

  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="bakiye-kart">
      <div class="kart-baslik" style="margin-bottom:8px;color:#2f5474;">💼 İcap / İzin Bakiyeniz</div>
      <div class="bakiye-grid">
        <div class="bakiye-item"><div class="bakiye-etiket">Biriken</div><div class="bakiye-deger">${Math.floor(toplam/60)}s ${toplam%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kullanılan</div><div class="bakiye-deger">${Math.floor(kullanilan/60)}s ${kullanilan%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kalan</div><div class="bakiye-deger" style="color:${kalan<0?'#a33a3a':'#2f7a52'}">${Math.floor(Math.abs(kalan)/60)}s ${Math.abs(kalan)%60}dk</div></div>
      </div>
      <div style="max-height:200px; overflow-y:auto;">${gecmisHtml}</div>
    </div>`;

  rolIcerikCiz(aktifler, hazirlar);

  // SİSTEM HAREKETLERİ (LOGLAR) ÇEKME - HATA TOLERANSLI
  let logHtml = '';
  try {
    const { data: loglar } = await sb.from('log_kayitlari').select('*').order('ne_zaman', { ascending: false }).limit(10);
    if (loglar && loglar.length > 0) {
      loglar.forEach(l => {
        const t = new Date(l.ne_zaman).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
        logHtml += `<div style="border-bottom:1px solid #eee; padding:6px 0; font-size:12px;">
          <span style="color:#6b7178; font-size:11px; margin-right:8px;">[${t}]</span>
          <strong style="color:#30363d;">${l.ad_soyad_snapshot}</strong>: 
          <span style="color:#35618a;">${l.islem}</span> 
          <span style="color:#6b7178; font-size:11px;">${l.aciklama ? '- ' + l.aciklama : ''}</span>
        </div>`;
      });
    } else {
      logHtml = '<div style="font-size:12px;color:#979da3;">Henüz sistem hareketi yok.</div>';
    }
  } catch (err) {
    logHtml = '<div style="font-size:12px;color:#a33a3a;">Loglar yüklenemedi.</div>';
  }
  
  const logKutu = document.getElementById('logPenceresi');
  if (logKutu) {
    logKutu.style.display = 'block'; 
    logKutu.innerHTML = `
      <div class="kart-baslik" style="color:#6b7178;"><div class="kart-baslik-simge" style="background:#e0e5e9;">📜</div>Sistem Hareketleri (Son İşlemler)</div>
      <div style="max-height:200px; overflow-y:auto;">${logHtml}</div>
    `;
  }
}

async function rolIcerikCiz(aktifler, hazirlar) {
  const el = document.getElementById('rolIcerik');
  const rol = mevcutPersonel.rol;
  let html = '';

  if (rol === 'super_admin') {
    html += `<div class="kart" style="background:#23262b;color:#fff;">
      <div class="kart-baslik" style="color:#fff;"><div class="kart-baslik-simge" style="background:#444;">🛠️</div>Süper Admin Yönetim Paneli</div>
      <p style="font-size:12px;opacity:0.8;margin-bottom:15px;">Personel ekleme, sistem ayarları ve log kayıtlarına buradan ulaşabilirsiniz.</p>
      <button type="button" class="btn btn-mavi" onclick="adminPaneliAc()">🚀 Yönetim Panelini Aç</button>
    </div>`;
  }

  const kendiAktif = aktifler?.find(a => a.personel_id === mevcutPersonel.id);
  
  if (kendiAktif) {
    html += `<div class="kart" style="border-left:4px solid #2f7a52;"><div class="kart-baslik">🟢 İcap Göreviniz Devam Ediyor</div><p style="font-size:13px;">Başlama: ${new Date(kendiAktif.baslama_zamani).toLocaleTimeString('tr-TR')}</p><button type="button" class="btn btn-kirmizi" onclick="icapBitir('${kendiAktif.id}')">⏹ İcap Görevini Bitir</button></div>`;
  } else {
    let baslatabilir = true; let uyari = "";
    const suAn = new Date(); const gun = suAn.getDay(); const saat = suAn.getHours();
    if (mevcutPersonel.rol === 'gunduz_85') {
      if (gun >= 1 && gun <= 5 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz (08:00-17:00)."; }
    } else if (mevcutPersonel.rol === 'gunduz_816') {
      if (gun !== 4 && saat >= 8 && saat < 17) { baslatabilir = false; uyari = "Mesai saatleri içindesiniz. Perşembe tam gün icaplısınız."; }
    } else if (mevcutPersonel.vardiya) {
      if (mevcutPersonel.vardiya === sistemAyar.aktif_vardiya) { baslatabilir = false; uyari = "Şu an nöbetçi vardiyadasınız. Asli görevinizdesiniz."; }
    }
    html += `<div class="kart">
      <div class="kart-baslik"><div class="kart-baslik-simge">🚒</div>Yeni İcap Görevi</div>
      ${!baslatabilir ? `<div style="background:#fdecec;color:#a33a3a;padding:10px;border-radius:8px;font-size:12px;margin-bottom:10px;font-weight:bold;">⚠️ ${uyari}</div>` : ''}
      <textarea id="gorevAciklama" placeholder="İcap görev açıklaması..." ${!baslatabilir?'disabled':''}></textarea>
      <button type="button" class="btn btn-primary" onclick="icapBaslat()" ${!baslatabilir?'disabled style="background:#ccc;"':''}>▶ İcap Görevini Başlat</button>
    </div>`;
  }

  if (!kendiAktif) {
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#f1eef6;color:#6a5590;">📅</div>İcap İzni Kullan</div><button type="button" class="btn btn-mor" onclick="izinModalAc()">📅 İzin Talebi Oluştur</button></div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    let query = sb.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    const { data: bekleyenler } = await query;
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenler.forEach(b => {
        bHtml += `<div class="onay-item"><strong>${b.personel.ad_soyad}</strong> (${b.personel.rol.replace('_',' ')})<br><span style="font-size:11px;">Süre: ${Math.floor(b.toplam_dakika/60)}s ${b.toplam_dakika%60}dk</span><div class="onay-btnler"><button type="button" class="btn-success" onclick="onayla('${b.id}', 'icap')">✓ Onayla</button><button type="button" class="btn-danger" onclick="reddet('${b.id}', 'icap')">✕ Reddet</button></div></div>`;
      });
    } else { bHtml = '<div style="font-size:12px;color:#979da3;">Onay bekleyen yok.</div>'; }
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#faf3e8;color:#b5721f;">⏳</div>Onay Bekleyen İcaplar</div>${bHtml}</div>`;

    let izinQuery = sb.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') izinQuery = izinQuery.eq('personel.vardiya', mevcutPersonel.vardiya).eq('eksi_bakiye_mi', false);
    if (rol === 'grup_amiri' || rol === 'super_admin') izinQuery = izinQuery.or(`eksi_bakiye_mi.eq.true,personel.rol.in.(gunduz_85,gunduz_816)`);
    const { data: izinler } = await izinQuery;
    let iHtml = '';
    if (izinler && izinler.length > 0) {
      izinler.forEach(b => {
        iHtml += `<div class="onay-item"><strong>${b.personel.ad_soyad}</strong> - ${Math.floor(b.talep_edilen_dakika/60)}s ${b.talep_edilen_dakika%60}dk<br><span style="font-size:11px;">Tarih: ${b.izin_tarihi} ${b.eksi_bakiye_mi?'(Eksi Bakiye!)':''}</span><div class="onay-btnler"><button type="button" class="btn-success" onclick="onayla('${b.id}', 'izin')">✓ Onayla</button><button type="button" class="btn-danger" onclick="reddet('${b.id}', 'izin')">✕ Reddet</button></div></div>`;
      });
    } else { iHtml = '<div style="font-size:12px;color:#979da3;">Onay bekleyen izin talebi yok.</div>'; }
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#f1eef6;color:#6a5590;">📅</div>Onay Bekleyen İzinler</div>${iHtml}</div>`;
  }

  if (['vardiya_cavusu', 'grup_amiri', 'super_admin'].includes(rol)) {
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#eef3f7;color:#35618a;">🚨</div>Hazır İcapçı Seçimi</div>
      <p style="font-size:11px;color:#666;">İstirahat dönemi için 1 Er ve 1 Şoför seçin.</p>
      <button type="button" class="btn btn-mavi" onclick="hazirIcapciModalAc()">Personel Seç</button>
    </div>`;
  }

  if (['grup_amiri', 'super_admin', 'vardiya_cavusu'].includes(rol)) {
    const bugun = new Date().toISOString().split('T')[0];
    const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge">📊</div>Raporlama</div>
      <div style="display:flex; gap:10px; margin-bottom:10px;">
        <div style="flex:1;"><label style="font-size:11px;">Başlangıç</label><input type="date" id="raporBaslangic" value="${otuzGunOnce}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc;"></div>
        <div style="flex:1;"><label style="font-size:11px;">Bitiş</label><input type="date" id="raporBitis" value="${bugun}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc;"></div>
      </div>
      <button type="button" class="btn btn-outline" style="border:1px solid #ccc;background:#fff;" onclick="raporCsvIndir()">⬇ Detaylı CSV İndir</button>
    </div>`;
  }
  
  el.innerHTML = html;
}

async function icapBaslat() {
  const aciklama = document.getElementById('gorevAciklama').value;
  const { error } = await sb.from('icap_gorevleri').insert([{ personel_id: mevcutPersonel.id, vardiya: mevcutPersonel.vardiya, gorev_aciklamasi: aciklama, durum: 'aktif' }]);
  
  if (error) toast("Hata: " + error.message); 
  else { 
    toast("İcap başlatıldı", "basari"); 
    logEkle("İcap Başlattı", aciklama);
  }
}

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await sb.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  
  const { error } = await sb.from('icap_gorevleri').update({ bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null }).eq('id', id);
  
  if (error) toast("Hata: " + error.message); 
  else { 
    toast("İcap bitirildi", "basari"); 
    logEkle("İcabı Bitirdi", `Süre: ${dk} dk`);
  }
}

async function onayla(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  await sb.from(tablo).update({ durum: 'onaylandi', onaylayan_id: mevcutPersonel.id, onay_zamani: new Date().toISOString() }).eq('id', id);
  toast("Onaylandı", "basari");
  logEkle(tip === 'icap' ? "İcap Onayladı" : "İzin Onayladı");
}

async function reddet(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const sebep = prompt("Red sebebi:");
  if (sebep === null) return;
  await sb.from(tablo).update({ durum: 'reddedildi', onaylayan_id: mevcutPersonel.id, red_sebebi: sebep }).eq('id', id);
  toast("Reddedildi");
  logEkle(tip === 'icap' ? "İcap Reddetti" : "İzin Reddetti", sebep);
}

function izinModalAc() {
  let html = `<div class="modal aktif" id="izinModal"><div class="modal-content"><h3 style="margin-top:0;color:#6a5590;">İzin Talebi</h3><div class="form-grup"><label>Süre (Saat)</label><input type="number" id="izinSaat" min="0" value="1"></div><div class="form-grup"><label>Dakika</label><input type="number" id="izinDakika" min="0" max="59" value="0"></div><div class="form-grup"><label>Tarih</label><input type="date" id="izinTarih" value="${new Date().toISOString().split('T')[0]}"></div><div class="form-grup"><label>Açıklama</label><input type="text" id="izinAciklama" placeholder="Neden izin kullanıyorsunuz?"></div><button type="button" class="btn btn-mor" onclick="izinTalepEt()">Talebi Gönder</button><button type="button" class="btn btn-link" onclick="document.getElementById('izinModal').remove()">İptal</button></div></div>`;
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
  toast("İzin talebi gönderildi.", "basari");
  logEkle("İzin Talebi Oluşturdu", `${s}s ${d}dk`);
}

async function hazirIcapciModalAc() {
  let vardiyaSecimiHtml = '';
  if (mevcutPersonel.rol !== 'vardiya_cavusu') {
    vardiyaSecimiHtml = `<div class="form-grup"><label>Hangi Vardiya İçin Seçim Yapıyorsunuz?</label><select id="secVardiya" onchange="hazirPersonelleriGetir()"><option value="1">1. Vardiya</option><option value="2">2. Vardiya</option><option value="3">3. Vardiya</option></select></div>`;
  } else {
    vardiyaSecimiHtml = `<input type="hidden" id="secVardiya" value="${mevcutPersonel.vardiya}">`;
  }

  let html = `<div class="modal aktif" id="hazirModal"><div class="modal-content"><h3 style="margin-top:0;">Hazır İcapçı Seçimi</h3><p style="font-size:11px;color:#666;">48 saatlik istirahat dönemi için 1 Er ve 1 Şoför seçiniz.</p>${vardiyaSecimiHtml}<div id="hazirPersonelAlan"></div><button type="button" class="btn btn-primary" onclick="hazirKaydet()">Seçimi Onayla</button><button type="button" class="btn btn-link" onclick="document.getElementById('hazirModal').remove()">İptal</button></div></div>`;
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
  const simdi = new Date(); const bitis = new Date(simdi.getTime() + (48 * 60 * 60 * 1000));
  await sb.from('hazir_icapcilar').insert([{ vardiya: vardiya, er_personel_id: erId, sofor_personel_id: soforId, baslangic_zamani: simdi.toISOString(), bitis_zamani: bitis.toISOString(), secen_cavus_id: mevcutPersonel.id }]);
  document.getElementById('hazirModal').remove();
  toast("Hazır icapçılar belirlendi.", "basari");
  logEkle("Hazır İcapçı Seçti", `${vardiya}. Vardiya`);
}

function adminPaneliAc() {
  let html = `<div class="modal aktif" id="adminModal" style="align-items:flex-start; padding-top:20px;"><div class="modal-content" style="max-width:800px; width:95%;">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:10px; margin-bottom:15px;">
      <h3 style="margin:0; color:#23262b;">🛠️ Süper Admin Yönetim Paneli</h3>
      <button type="button" class="btn btn-kirmizi" style="width:auto; padding:5px 15px; margin:0;" onclick="document.getElementById('adminModal').remove()">Kapat ✕</button>
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
        const durum = p.auth_user_id ? '<span style="color:green;">Aktif</span>' : '<span style="color:orange;">Kayıt Bekliyor</span>';
        rows += `<tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">${p.ad_soyad}</td>
          <td style="padding:8px; border-bottom:1px solid #eee;">${p.email}</td>
          <td style="padding:8px; border-bottom:1px solid #eee;">${rolAd}</td>
          <td style="padding:8px; border-bottom:1px solid #eee;">${vardiyaAd}</td>
          <td style="padding:8px; border-bottom:1px solid #eee;">${durum}</td>
          <td style="padding:8px; border-bottom:1px solid #eee;"><button type="button" onclick="personelSil('${p.id}')" style="background:none; border:none; color:red; cursor:pointer; font-size:16px;">🗑️</button></td>
        </tr>`;
      });
    }

    el.innerHTML = `
      <div style="background:#f8fafb; padding:15px; border-radius:10px; margin-bottom:15px; border:1px solid #eee;">
        <h4 style="margin-top:0;">Yeni Personel Ekle</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-grup"><label>Ad Soyad</label><input type="text" id="addAd" placeholder="Örn: Ahmet Yılmaz" style="margin-bottom:0;"></div>
          <div class="form-grup"><label>E-posta</label><input type="email" id="addEmail" placeholder="ahmet@gmail.com" style="margin-bottom:0;"></div>
          <div class="form-grup"><label>Rol</label>
            <select id="addRol" style="margin-bottom:0;">
              <option value="itfaiye_eri">İtfaiye Eri</option>
              <option value="itfaiye_soforu">İtfaiye Şoförü</option>
              <option value="vardiya_cavusu">Vardiya Çavuşu</option>
              <option value="grup_amiri">Grup Amiri</option>
              <option value="gunduz_85">Gündüz 8/5</option>
              <option value="gunduz_816">Gündüz 8/16</option>
              <option value="super_admin">Süper Admin</option>
            </select>
          </div>
          <div class="form-grup"><label>Vardiya (Gündüz ise Boş Bırakın)</label>
            <select id="addVardiya" style="margin-bottom:0;">
              <option value="">Gündüz / Yok</option>
              <option value="1">1. Vardiya</option>
              <option value="2">2. Vardiya</option>
              <option value="3">3. Vardiya</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-success" style="margin-top:10px; margin-bottom:0;" onclick="personelEkle()">➕ Personeli Kaydet</button>
      </div>
      
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead><tr style="background:#eee; text-align:left;">
            <th style="padding:8px;">Ad Soyad</th><th style="padding:8px;">E-posta</th><th style="padding:8px;">Rol</th><th style="padding:8px;">Vardiya</th><th style="padding:8px;">Durum</th><th style="padding:8px;">Sil</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } 
  else if (tab === 'ayarlar') {
    el.innerHTML = `
      <div style="background:#f8fafb; padding:20px; border-radius:10px; border:1px solid #eee;">
        <h4 style="margin-top:0;">Sistem Ayarları</h4>
        <p style="font-size:12px; color:#666;">Otomasyonun kaçırdığı durumlarda aktif vardiyayı manuel değiştirebilirsiniz.</p>
        <div class="form-grup">
          <label>Şu Anki Aktif Vardiya:</label>
          <input type="number" id="ayarVardiya" value="${sistemAyar.aktif_vardiya}" min="1" max="3" style="max-width:100px;">
        </div>
        <button type="button" class="btn btn-primary" style="width:auto;" onclick="ayarKaydet()">Ayarları Güncelle</button>
      </div>
    `;
  }
}

async function personelEkle() {
  const ad = document.getElementById('addAd').value;
  const email = document.getElementById('addEmail').value;
  const rol = document.getElementById('addRol').value;
  const vardiya = document.getElementById('addVardiya').value;

  if(!ad || !email) return toast("Lütfen tüm alanları doldurun.");
  
  const { error } = await sb.from('personel').insert([{ 
    ad_soyad: ad, 
    email: email, 
    rol: rol, 
    vardiya: vardiya ? parseInt(vardiya) : null 
  }]);

  if(error) {
    toast("Hata: " + error.message);
  } else {
    toast("Personel başarıyla eklendi.", "basari");
    logEkle("Personel Ekledi", ad);
    adminTab('personel');
  }
}

async function personelSil(id) {
  if(!confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
  const { error } = await sb.from('personel').delete().eq('id', id);
  if(error) toast("Hata: " + error.message);
  else { 
    toast("Personel silindi.", "basari"); 
    adminTab('personel'); 
  }
}

async function ayarKaydet() {
  const yeniVardiya = parseInt(document.getElementById('ayarVardiya').value);
  if(![1,2,3].includes(yeniVardiya)) return toast("Vardiya 1, 2 veya 3 olabilir.");
  
  const { error } = await sb.from('sistem_ayarlari').update({ aktif_vardiya: yeniVardiya }).eq('id', 1);
  if(error) toast("Hata: " + error.message);
  else {
    sistemAyar.aktif_vardiya = yeniVardiya;
    toast("Sistem ayarları güncellendi.", "basari");
    logEkle("Vardiya Değiştirdi", `Yeni: ${yeniVardiya}. Vardiya`);
  }
}

async function raporCsvIndir() {
  const bas = document.getElementById('raporBaslangic').value;
  const bit = document.getElementById('raporBitis').value;
  if(!bas || !bit) return toast("Lütfen tarih aralığı seçin.");
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

if (sb) { sb.auth.getSession().then(({ data: { session } }) => { if (session) oturumBaslat(session.user); }); }
