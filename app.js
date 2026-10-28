// ============================================================
// AŞAMA 2: SUPABASE BAĞLANTISI VE GİRİŞ/KAYIT SİSTEMİ
// ============================================================

function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
}

// 1. Supabase Bağlantısı
const SUPABASE_URL = "https://avrdeswpdubsonijbajt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cmRlc3dwZHVic29uaWpiYWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjMzODEsImV4cCI6MjEwODY5OTM4MX0.2bnmnhjk6g3fS9zEOda552GZpZ6TjY0889pd9DT6zl4";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const KARA_LISTE = ['123456','111111','000000','654321','123123','121212','112233','123321','111222','222333','123654','147258','159753','987654','999999','000111','123789','456123'];
let mevcutPersonel = null;

// 2. Giriş İşlemi
document.getElementById('girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('girisEmail').value.trim();
  const sifre = document.getElementById('girisSifre').value;
  const hataEl = document.getElementById('girisHata');
  hataEl.innerText = 'Giriş yapılıyor...';
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: sifre });
  
  if (error) {
    hataEl.innerText = "Hatalı e-posta veya şifre!";
  } else {
    hataEl.innerText = "";
    oturumBaslat(data.user);
  }
});

// 3. Kayıt İşlemi
document.getElementById('kayitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('kayitEmail').value.trim();
  const sifre = document.getElementById('kayitSifre').value;
  const hataEl = document.getElementById('kayitHata');
  hataEl.innerText = '';

  if (sifre.length !== 6 || isNaN(sifre)) return hataEl.innerText = "Şifre 6 haneli rakam olmalıdır.";
  if (KARA_LISTE.includes(sifre)) return hataEl.innerText = "Bu şifre çok yaygın, başka bir 6 hane girin.";

  hataEl.innerText = 'Kayıt kontrol ediliyor...';

  // Veritabanında bu e-posta var mı?
  const { data: personel, error: pError } = await supabase.from('personel').select('id, auth_user_id').eq('email', email).single();
  
  if (pError || !personel) return hataEl.innerText = "Bu e-posta sistemde kayıtlı değil. Yöneticinize başvurun.";
  if (personel.auth_user_id) return hataEl.innerText = "Bu hesap zaten oluşturulmuş. Lütfen Giriş Yapın.";

  hataEl.innerText = 'Hesap oluşturuluyor...';
  
  const { data, error } = await supabase.auth.signUp({ email, password: sifre });
  if (error) return hataEl.innerText = "Kayıt hatası: " + error.message;
  
  // Kayıt başarılıysa hemen giriş yap
  const { data: loginData } = await supabase.auth.signInWithPassword({ email, password: sifre });
  if (loginData) oturumBaslat(loginData.user);
});

// 4. Oturum Başlatma (Sisteme Giriş Yapıldığında)
async function oturumBaslat(user) {
  // Kullanıcının bilgilerini personel tablosundan çek
  const { data, error } = await supabase.from('personel').select('*').eq('auth_user_id', user.id).single();
  
  if (error || !data) { 
    alert("Personel kaydınız bulunamadı!"); 
    return cikisYap(); 
  }
  
  mevcutPersonel = data;
  
  // Üst bardaki bilgileri doldur
  document.getElementById('ustIsim').innerText = mevcutPersonel.ad_soyad;
  document.getElementById('ustRol').innerText = mevcutPersonel.rol.toUpperCase().replace('_', ' ');
  document.getElementById('ustVardiya').innerText = mevcutPersonel.vardiya ? mevcutPersonel.vardiya + ". Vardiya" : "Gündüz";
  
  // Uygulama ekranına geç
  ekranDegistir('ekranUygulama');
  
  // NOT: Panel yükleme fonksiyonlarını (icap listesi vs.) bir sonraki aşamada ekleyeceğiz.
  alert("Giriş başarılı! Hoş geldin " + mevcutPersonel.ad_soyad + ". (Panel bir sonraki aşamada eklenecek).");
}

// 5. Çıkış Yapma
async function cikisYap() {
  await supabase.auth.signOut();
  mevcutPersonel = null;
  ekranDegistir('ekranGiris');
}

// Sayfa ilk açıldığında oturum açık mı kontrol et
supabase.auth.getSession().then(({ data: { session } }) => { 
  if (session) oturumBaslat(session.user); 
});
