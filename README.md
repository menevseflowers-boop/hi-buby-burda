# HI BUBY BURDA

Telefon uyumlu, pembe tasarimli, Turkce/Ingilizce mesajlasma ve goruntulu konusma uygulamasi.

## Calistirma

```bash
node server.js
```

Sonra tarayicida:

```text
http://localhost:3000
```

## Online kullanim ve kalicilik

Telefonlarda kamera ve mikrofon icin uygulama HTTPS ile yayinda olmalidir. Render, Railway veya benzeri Node.js destekleyen bir servise yuklenebilir.

Baslatma komutu:

```bash
node server.js
```

Saglik kontrolu:

```text
/health
```

Kalici ve kaliteli kullanim icin onerilenler:

- Uygulamayi Render/Railway/Fly.io gibi Node.js destekleyen bir servise yuklemek.
- Kendi alan adini baglamak.
- HTTPS'in aktif oldugundan emin olmak.
- Uzun goruntulu gorusmeler icin TURN sunucusu eklemek.
- Telefonlarda kamera/mikrofon icin sayfanin HTTPS olmasi gerekir.

## Daha saglam goruntulu arama

Bazi operatorlerde veya ulkeler arasi baglantilarda sadece STUN yetmeyebilir. Bu durumda bir TURN sunucusu gerekir. Ortam degiskenleri:

```text
TURN_URL=turn:adres:3478
TURN_USERNAME=kullanici
TURN_CREDENTIAL=sifre
```

Alternatif olarak tum ICE listesini JSON olarak verebilirsin:

```text
ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"}]
```

Uygulama kamera icin 720p/30fps tercih eder, ses icin echo cancellation, noise suppression ve auto gain control kullanir.
