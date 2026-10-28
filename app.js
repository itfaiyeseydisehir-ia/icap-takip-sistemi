// Aşama 1: Temel Ekran Geçişi Testi
function ekranDegistir(id) {
  document.querySelectorAll('.ekran-orta, .ekran').forEach(e => e.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
}
