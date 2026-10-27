// HATA YAKALAYICI (Eğer bir hata varsa ekranda gösterir)
window.onerror = function(msg, url, line, col, error) {
  alert("SİSTEM HATASI: " + msg + "\nSatır: " + line);
  return false;
};

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
}

const SUPABASE_URL = "https://avrdeswpdubsonijbajt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cmRlc3dwZHVic29uaWpiYWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjMzODEsImV4cCI6MjEwODY5OTM4MX0.2bnmnhjk6g3fS9zEOda552GZpZ6TjY0889pd9DT6zl4";

let supabase = null;
try {
  if (typeof window.supabase === 'undefined') {
    alert("KRİTİK HATA: Supabase kütüphanesi yüklenemedi!");
  } else {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  alert("Supabase Başlatma Hatası: " + e.message);
}

const KARA_LISTE = ['123456','111111','000000','654321','123123','121212','112233','123321','111222','222333','123654','147258','159753','987654','999999','000111','123789','456123'];
let mevcutPersonel = null;
let sistemAyar = { aktif_vardiya: 1 };
let realtimeKanal = null;

function toast(msg, tip='hata') {
  const t = document.getElementById('toast');
  t.innerText = msg; t.style.background = tip === 'hata' ? '#9c2b2b' : '#2f7a52';
  t.classList.add('gorunur'); setTimeout(()=>t.classList.remove('gorunur'), 3000);
}

document.getElementById('girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabase) return alert("Supabase yüklenmediği için giriş yapılamıyor.");
  const email = document.getElementById('girisEmail').value.trim();
  const sifre = document.getElementById('girisSifre').value;
  document.getElementById('girisHata').innerText = '';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: sifre });
  if (error) document.getElementById('girisHata').innerText = "Hatalı e-posta veya şifre!";
  else oturumBaslat(data.user);
});

document.getElementById('kayitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabase) return alert("Supabase yüklenmediği için kayıt yapılamıyor.");
  const email = document.getElementById('kayitEmail').value.trim();
  const sifre = document.getElementById('kayitSifre').value;
  const hataEl = document.getElementById('kayitHata');
  hataEl.innerText = '';
  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  const { data: personel } = await supabase.from('personel').select('id, auth_user_id').eq('email', email).single();
  if (!personel) return hataEl.innerText = "Bu e-posta sistemde kayıtlı değil.";
  if (personel.auth_user_id) return hataEl.innerText = "Bu hesap zaten oluşturulmuş. Giriş yapın.";

  const { data, error } = await supabase.auth.signUp({ email, password: sifre });
  if (error) return hataEl.innerText = "Kayıt hatası: " + error.message;
  
  const { data: loginData } = await supabase.auth.signInWithPassword({ email, password: sifre });
  if (loginData) oturumBaslat(loginData.user);
});

async function cikisYap() {
  if (realtimeKanal) await supabase.removeChannel(realtimeKanal);
  await supabase.auth.signOut();
  mevcutPersonel = null;
  ekranDegistir('ekranGiris');
}

async function oturumBaslat(user) {
  const { data } = await supabase.from('personel').select('*').eq('auth_user_id', user.id).single();
  if (!data) { toast("Personel kaydınız bulunamadı!"); return cikisYap(); }
  mevcutPersonel = data;
  const { data: ayar } = await supabase.from('sistem_ayarlari').select('*').eq('id', 1).single();
  if (ayar) sistemAyar = ayar;
  document.getElementById('ustIsim').innerText = mevcutPersonel.ad_soyad;
  document.getElementById('ustRol').innerText = mevcutPersonel.rol.toUpperCase().replace('_', ' ');
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz";
  ekranDegistir('ekranUygulama');
  panelYukle();
  realtimeBaslat();
}

function realtimeBaslat() {
  if (realtimeKanal) supabase.removeChannel(realtimeKanal);
  realtimeKanal = supabase.channel('icap-degisim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'icap_gorevleri' }, () => panelYukle())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hazir_icapcilar' }, () => panelYukle())
    .subscribe();
}

async function panelYukle() {
  if (!mevcutPersonel) return;
  const { data: aktifler } = await supabase.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'aktif').order('baslama_zamani', { ascending: true });
  document.getElementById('aktifIcapSayisi').innerText = aktifler ? aktifler.length : 0;
  
  let aHtml = '';
  if (aktifler && aktifler.length > 0) {
    aktifler.forEach(a => {
      const dk = Math.floor((new Date() - new Date(a.baslama_zamani)) / 60000);
      aHtml += `<div class="aktif-item"><div class="aktif-ust"><div class="aktif-isim">${a.personel.ad_soyad}</div><div style="font-size:11px;color:#35618a;">${a.personel.rol.includes('sofor')?'🚛 Şoför':'👨‍🚒 Er'}</div></div><div style="font-size:11px;color:#6b7178;">Başlama: ${new Date(a.baslama_zamani).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})} (${Math.floor(dk/60)}s ${dk%60}dk)</div></div>`;
    });
  } else { aHtml = '<div style="font-size:12px;color:#979da3;text-align:center;">Şu an icapte personel yok.</div>'; }
  document.getElementById('aktifIcapListe').innerHTML = aHtml;

  const { data: hazirlar } = await supabase.from('hazir_icapcilar').select('*, er:er_personel_id(ad_soyad), sofor:sofor_personel_id(ad_soyad)').eq('durum', 'aktif').gte('bitis_zamani', new Date().toISOString());
  let hHtml = '';
  if (hazirlar && hazirlar.length > 0) {
    hazirlar.forEach(h => {
      hHtml += `<div style="background:#eef3f7;padding:10px;border-radius:10px;margin-bottom:8px;border-left:4px solid #35618a;"><strong>${h.vardiya}. Vardiya İstirahat Ekibi</strong><br><span style="font-size:12px;">👨‍🚒 ${h.er.ad_soyad} | 🚛 ${h.sofor.ad_soyad}</span></div>`;
    });
  } else { hHtml = '<div style="font-size:12px;color:#979da3;">Aktif hazır icapçı ekibi bulunmuyor.</div>'; }
  document.getElementById('hazirIcapcilarKart').innerHTML = `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#eef3f7;color:#35618a;">🚨</div>Hazır İcapçı Ekibi</div>${hHtml}</div>`;

  const { data: icapGecmis } = await supabase.from('icap_gorevleri').select('toplam_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const { data: izinGecmis } = await supabase.from('icap_izin_talepleri').select('talep_edilen_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const toplam = icapGecmis ? icapGecmis.reduce((s,x)=>s+(x.toplam_dakika||0),0) : 0;
  const kullanilan = izinGecmis ? izinGecmis.reduce((s,x)=>s+(x.talep_edilen_dakika||0),0) : 0;
  const kalan = toplam - kullanilan;
  document.getElementById('kisiselBakiyeKart').innerHTML = `
    <div class="bakiye-kart">
      <div class="kart-baslik" style="margin-bottom:8px;color:#2f5474;">💼 İcap / İzin Bakiyeniz</div>
      <div class="bakiye-grid">
        <div class="bakiye-item"><div class="bakiye-etiket">Biriken</div><div class="bakiye-deger">${Math.floor(toplam/60)}s ${toplam%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kullanılan</div><div class="bakiye-deger">${Math.floor(kullanilan/60)}s ${kullanilan%60}dk</div></div>
        <div class="bakiye-item"><div class="bakiye-etiket">Kalan</div><div class="bakiye-deger" style="color:${kalan<0?'#a33a3a':'#2f7a52'}">${Math.floor(Math.abs(kalan)/60)}s ${Math.abs(kalan)%60}dk</div></div>
      </div>
    </div>`;
  rolIcerikCiz(aktifler, hazirlar);
}

async function rolIcerikCiz(aktifler, hazirlar) {
  const el = document.getElementById('rolIcerik');
  const rol = mevcutPersonel.rol;
  let html = '';

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
    let query = supabase.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol, vardiya)').eq('durum', 'onay_bekliyor');
    if (rol === 'vardiya_cavusu') query = query.eq('vardiya', mevcutPersonel.vardiya);
    const { data: bekleyenler } = await query;
    let bHtml = '';
    if (bekleyenler && bekleyenler.length > 0) {
      bekleyenler.forEach(b => {
        bHtml += `<div class="onay-item"><strong>${b.personel.ad_soyad}</strong> (${b.personel.rol.replace('_',' ')})<br><span style="font-size:11px;">Süre: ${Math.floor(b.toplam_dakika/60)}s ${b.toplam_dakika%60}dk</span><div class="onay-btnler"><button type="button" class="btn-success" onclick="onayla('${b.id}', 'icap')">✓ Onayla</button><button type="button" class="btn-danger" onclick="reddet('${b.id}', 'icap')">✕ Reddet</button></div></div>`;
      });
    } else { bHtml = '<div style="font-size:12px;color:#979da3;">Onay bekleyen yok.</div>'; }
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#faf3e8;color:#b5721f;">⏳</div>Onay Bekleyen İcaplar</div>${bHtml}</div>`;

    let izinQuery = supabase.from('icap_izin_talepleri').select('*, personel:personel_id(ad_soyad, vardiya, rol)').eq('durum', 'onay_bekliyor');
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

  if (rol === 'vardiya_cavusu') {
    html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge" style="background:#eef3f7;color:#35618a;">🚨</div>Hazır İcapçı Seçimi (08:50)</div>
      <p style="font-size:11px;color:#666;">Nöbetiniz bitmeden önce kendi vardiyanızdan 1 Er ve 1 Şoför seçin.</p>
      <button type="button" class="btn btn-mavi" onclick="hazirIcapciModalAc()">Personel Seç</button>
    </div>`;
  }

  if (['grup_amiri', 'super_admin', 'vardiya_cavusu'].includes(rol)) {
     html += `<div class="kart"><div class="kart-baslik"><div class="kart-baslik-simge">📊</div>Raporlama</div><button type="button" class="btn btn-outline" style="border:1px solid #ccc;background:#fff;" onclick="raporCsvIndir()">⬇ Detaylı CSV İndir (Son 30 Gün)</button></div>`;
  }
  el.innerHTML = html;
}

async function icapBaslat() {
  const aciklama = document.getElementById('gorevAciklama').value;
  const { error } = await supabase.from('icap_gorevleri').insert([{ personel_id: mevcutPersonel.id, vardiya: mevcutPersonel.vardiya, gorev_aciklamasi: aciklama, durum: 'aktif' }]);
  if (error) toast("Hata: " + error.message); else { toast("İcap başlatıldı", "basari"); panelYukle(); }
}

async function icapBitir(id) {
  if (!confirm("İcap görevini bitirmek istiyor musunuz?")) return;
  const { data } = await supabase.from('icap_gorevleri').select('baslama_zamani').eq('id', id).single();
  const dk = Math.floor((new Date() - new Date(data.baslama_zamani)) / 60000);
  const otomatikOnay = ['grup_amiri', 'vardiya_cavusu', 'super_admin'].includes(mevcutPersonel.rol);
  const { error } = await supabase.from('icap_gorevleri').update({ bitis_zamani: new Date().toISOString(), toplam_dakika: dk, durum: otomatikOnay ? 'onaylandi' : 'onay_bekliyor', onaylayan_id: otomatikOnay ? mevcutPersonel.id : null, onay_zamani: otomatikOnay ? new Date().toISOString() : null }).eq('id', id);
  if (error) toast("Hata: " + error.message); else { toast("İcap bitirildi", "basari"); panelYukle(); }
}

async function onayla(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  await supabase.from(tablo).update({ durum: 'onaylandi', onaylayan_id: mevcutPersonel.id, onay_zamani: new Date().toISOString() }).eq('id', id);
  toast("Onaylandı", "basari"); panelYukle();
}

async function reddet(id, tip) {
  const tablo = tip === 'icap' ? 'icap_gorevleri' : 'icap_izin_talepleri';
  const sebep = prompt("Red sebebi:");
  if (sebep === null) return;
  await supabase.from(tablo).update({ durum: 'reddedildi', onaylayan_id: mevcutPersonel.id, red_sebebi: sebep }).eq('id', id);
  toast("Reddedildi"); panelYukle();
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
  const { data: icaps } = await supabase.from('icap_gorevleri').select('toplam_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const { data: izins } = await supabase.from('icap_izin_talepleri').select('talep_edilen_dakika').eq('personel_id', mevcutPersonel.id).eq('durum', 'onaylandi');
  const bakiye = (icaps||[]).reduce((s,x)=>s+(x.toplam_dakika||0),0) - (izins||[]).reduce((s,x)=>s+(x.talep_edilen_dakika||0),0);
  const eksiMi = toplamDk > bakiye;
  if (eksiMi && mevcutPersonel.rol !== 'grup_amiri' && mevcutPersonel.rol !== 'super_admin') {
    if(!confirm("Bakiyeniz yetersiz! Eksi bakiyeye düşecek. Sadece Grup Amiri onaylayabilir. Onaylıyor musunuz?")) return;
  }
  await supabase.from('icap_izin_talepleri').insert([{ personel_id: mevcutPersonel.id, talep_edilen_dakika: toplamDk, izin_tarihi: document.getElementById('izinTarih').value, aciklama: document.getElementById('izinAciklama').value, eksi_bakiye_mi: eksiMi }]);
  document.getElementById('izinModal').remove();
  toast("İzin talebi gönderildi.", "basari"); panelYukle();
}

async function hazirIcapciModalAc() {
  const { data: personeller } = await supabase.from('personel').select('*').eq('vardiya', mevcutPersonel.vardiya);
  const erler = personeller.filter(p => p.rol === 'itfaiye_eri');
  const soforler = personeller.filter(p => p.rol === 'itfaiye_soforu');
  let html = `<div class="modal aktif" id="hazirModal"><div class="modal-content"><h3 style="margin-top:0;">Hazır İcapçı Seçimi (${mevcutPersonel.vardiya}. Vardiya)</h3><p style="font-size:11px;color:#666;">48 saatlik istirahat dönemi için 1 Er ve 1 Şoför seçiniz.</p><div class="form-grup"><label>İtfaiye Eri</label><select id="secEr">${erler.map(e=>`<option value="${e.id}">${e.ad_soyad}</option>`).join('')}</select></div><div class="form-grup"><label>İtfaiye Şoförü</label><select id="secSofor">${soforler.map(s=>`<option value="${s.id}">${s.ad_soyad}</option>`).join('')}</select></div><button type="button" class="btn btn-primary" onclick="hazirKaydet()">Seçimi Onayla</button><button type="button" class="btn btn-link" onclick="document.getElementById('hazirModal').remove()">İptal</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function hazirKaydet() {
  const erId = document.getElementById('secEr').value;
  const soforId = document.getElementById('secSofor').value;
  const simdi = new Date(); const bitis = new Date(simdi.getTime() + (48 * 60 * 60 * 1000));
  await supabase.from('hazir_icapcilar').insert([{ vardiya: mevcutPersonel.vardiya, er_personel_id: erId, sofor_personel_id: soforId, baslangic_zamani: simdi.toISOString(), bitis_zamani: bitis.toISOString(), secen_cavus_id: mevcutPersonel.id }]);
  document.getElementById('hazirModal').remove();
  toast("Hazır icapçılar belirlendi.", "basari"); panelYukle();
}

async function raporCsvIndir() {
  const son30 = new Date(); son30.setDate(son30.getDate() - 30);
  const { data: icaps } = await supabase.from('icap_gorevleri').select('*, personel:personel_id(ad_soyad, rol)').eq('durum', 'onaylandi').gte('baslama_zamani', son30.toISOString());
  if (!icaps || !icaps.length) return toast("Son 30 günde onaylanmış icap yok.");
  let csv = "Personel,Rol,Baslangic,Bitis,Sure(Dakika)\n";
  icaps.forEach(i => { csv += `"${i.personel.ad_soyad}","${i.personel.rol}","${new Date(i.baslama_zamani).toLocaleString('tr-TR')}","${new Date(i.bitis_zamani).toLocaleString('tr-TR')}",${i.toplam_dakika}\n`; });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `icap_raporu_${new Date().toISOString().split('T')[0]}.csv`; link.click();
}

if (supabase) {
  supabase.from('keepalive').select('id').limit(1).then(() => console.log("Keepalive pinged."));
  supabase.auth.getSession().then(({ data: { session } }) => { if (session) oturumBaslat(session.user); });
}
