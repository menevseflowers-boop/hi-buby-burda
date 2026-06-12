# Kalici Kullanim Plani

Bu uygulama su anda gecici Cloudflare linkiyle calisir. Kalici, kaliteli ve gunluk kullanim icin asagidaki kurulum gerekir.

## Kapanma riskini kaldirmak icin

Gecici `trycloudflare.com` linkleri kalici degildir. Kapanma riskini kaldirmak icin uygulama 7/24 calisan bir Node.js hosting servisine yuklenmeli ve sabit HTTPS adresi alinmalidir.

En pratik yol:

1. Bu klasoru GitHub'a yukle.
2. Render, Railway veya Fly.io uzerinden yeni bir Node.js web servisi ac.
3. Baslatma komutunu `node server.js` yap.
4. Saglik kontrolu olarak `/health` kullan.
5. Servisin verdigi HTTPS linkini arkadasinla paylas.

Bu adim icin hosting hesabina giris gerekir. Hesap girisi olmadan kalici genel internet adresi olusturulamaz.

## Daha kaliteli goruntulu konusma

Ulke disi ve mobil hatlarda bazen dogrudan kamera baglantisi zorlanabilir. Bunu azaltmak icin TURN sunucusu eklenmelidir.

Ortam degiskenleri:

```text
TURN_URL=turn:adres:3478
TURN_USERNAME=kullanici
TURN_CREDENTIAL=sifre
```

TURN olmadan uygulama calisir; fakat bazi mobil operatorlerde goruntu baglantisi kurulmama, gecikme veya kalite dusmesi olabilir. TURN eklendiginde baglanti daha kararli olur.

## Uygulamada yapilan kalite ayarlari

- Kamera 720p/30fps tercih eder, cihaz desteklerse daha net goruntu verir.
- Ses icin echo cancellation, noise suppression ve auto gain control aciktir.
- Video bitrate siniri yuksek tutulur.
- WebSocket baglantisi canli tutulur.
- HTTPS uzerinden calistiginda telefon kamera/mikrofon izinleri uyumlu olur.

## Dil secenegi

Uygulamada TR/EN secici vardir. Secim tarayicida kaydedilir.
