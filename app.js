// ============================================================
// AŞAMA 2: SUPABASE BAĞLANTISI (Çakışma Giderildi)
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

// DİKKAT: 'supabase' yerine 'sb' kullanıyoruz
let sb = null;
try {
  if (typeof window.supabase === 'undefined') {
    alert("KRİTİK HATA: Supabase kütüphanesi (CDN) yüklenemedi!");
  } else {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  alert("Supabase Başlatma Hatası: " + e.message);
}

const KARA_LISTE = ['123456','111111','000000','654321','123123','121212','112233','123321','111222','222333','123654','147258','159753','987654','999999','000111','123789','456123'];
let mevcutPersonel = null;

// Giriş İşlemi
document.getElementById('girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return alert("Supabase yüklenmedi!");
  
  const email = document.getElementById('girisEmail').value.trim();
  const sifre = document.getElementById('girisSifre').value;
  const hataEl = document.getElementById('girisHata');
  hataEl.innerText = 'Giriş yapılıyor...';
  
  const { data, error } = await sb.auth.signInWithPassword({ email, password: sifre });
  
  if (error) {
    hataEl.innerText = "Hatalı e-posta veya şifre!";
  } else {
    hataEl.innerText = "";
    oturumBaslat(data.user);
  }
});

// Kayıt İşlemi
document.getElementById('kayitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return alert("Supabase yüklenmedi!");

  const email = document.getElementById('kayitEmail').value.trim();
  const sifre = document.getElementById('kayitSifre').value;
  const hataEl = document.getElementById('kayitHata');
  hataEl.innerText = '';

  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  hataEl.innerText = 'Kayıt kontrol ediliyor...';

  const { data: personel, error: pError } = await sb.from('personel').select('id, auth_user_id').eq('email', email).single();
  
  if (pError || !personel) {
    hataEl.innerText = "Hata: Bu e-posta sistemde kayıtlı değil veya okuma izni yok.";
    return;
  }
  if (personel.auth_user_id) {
    hataEl.innerText = "Bu hesap zaten oluşturulmuş. Lütfen Giriş Yapın.";
    return;
  }

  hataEl.innerText = 'Hesap oluşturuluyor...';
  
  const { data, error } = await sb.auth.signUp({ email, password: sifre });
  if (error) {
    hataEl.innerText = "Kayıt hatası: " + error.message;
    return;
  }
  
  const { data: loginData } = await sb.auth.signInWithPassword({ email, password: sifre });
  if (loginData) oturumBaslat(loginData.user);
});

// Oturum Başlatma
async function oturumBaslat(user) {
  // Veritabanından kullanıcıyı çek
  const { data, error } = await sb.from('personel').select('*').eq('auth_user_id', user.id).single();
  
  if (error) {
    // Eğer hata varsa gerçek sebebini ekrana bas
    alert("VERİTABANI HATASI:\n" + error.message + "\nKod: " + error.code + "\nDetay: " + error.details);
    return cikisYap();
  }
  
  if (!data) {
    alert("Kullanıcı giriş yaptı ancak personel tablosunda kaydı bulunamadı!");
    return cikisYap();
  }
  
  mevcutPersonel = data;
  
  document.getElementById('ustIsim').innerText = mevcutPersonel.ad_soyad;
  document.getElementById('ustRol').innerText = mevcutPersonel.rol.toUpperCase().replace('_', ' ');
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz";
  
  ekranDegistir('ekranUygulama');
  
  alert("Giriş başarılı! Hoş geldin " + mevcutPersonel.ad_soyad + ".\nSistemin asıl paneli bir sonraki aşamada eklenecek.");
}

// Çıkış
async function cikisYap() {
  if(sb) await sb.auth.signOut();
  mevcutPersonel = null;
  ekranDegistir('ekranGiris');
}

// Sayfa Açılış Kontrolü
if (sb) {
  sb.auth.getSession().then(({ data: { session } }) => { 
    if (session) oturumBaslat(session.user); 
  });
}
