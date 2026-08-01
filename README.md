# Pokémon GO Shop

## รันบนเครื่องตัวเอง (ทดสอบก่อน deploy)

```
npm install
npm run dev
```

แล้วเปิด http://localhost:5173

## Build สำหรับ deploy

```
npm run build
```

จะได้โฟลเดอร์ `dist/` พร้อมอัปโหลด

## Deploy ขึ้น GitHub Pages (อัตโนมัติด้วย GitHub Actions)

โปรเจกต์นี้มีไฟล์ `.github/workflows/deploy.yml` ให้แล้ว ทำตามนี้ครั้งเดียว:

1. Push โค้ดทั้งโฟลเดอร์นี้ (ทุกไฟล์ รวม `.github/`) ขึ้น branch `main` ของ repo
2. เข้า repo บน GitHub → **Settings → Pages**
3. ตรง **Build and deployment → Source** เลือก **"GitHub Actions"** (ไม่ใช่ "Deploy from a branch")
4. รอสักครู่ ไปที่แท็บ **Actions** ของ repo จะเห็น workflow "Deploy to GitHub Pages" รันอยู่ พอเสร็จ (เขียวติ๊กถูก) เว็บจะขึ้นที่ `https://<username>.github.io/<repo>/`
5. ทุกครั้งที่ push โค้ดใหม่เข้า `main` มันจะ build และ deploy ให้อัตโนมัติ ไม่ต้อง `npm run build` มือเอง

**ข้อควรระวัง:** ห้าม deploy ไฟล์ซอร์ส (`src/`, `index.html` ตัวเปล่าๆ) ขึ้น Pages ตรงๆ เพราะเบราว์เซอร์รันไฟล์ `.jsx` หรือ resolve `import react` เองไม่ได้ (จะเจอจอดำ) ต้องผ่าน `npm run build` ให้ได้โฟลเดอร์ `dist/` (ไฟล์ JS ที่ bundle แล้ว) ก่อนเสมอ — ซึ่ง workflow ด้านบนทำให้อัตโนมัติแล้ว

## Deploy ขึ้น Vercel (แนะนำ, ฟรี)

1. สมัคร/ล็อกอิน https://vercel.com ด้วย GitHub
2. อัปโหลดโฟลเดอร์นี้ขึ้น GitHub repo (หรือใช้ `vercel` CLI: `npx vercel`)
3. Vercel จะ detect Vite อัตโนมัติ กด Deploy
4. ได้ลิงก์ เช่น `pokemon-go-shop.vercel.app`

## ติดตั้งบนมือถือ (PWA)

1. เปิดลิงก์ที่ deploy แล้วบน Safari (iOS) หรือ Chrome (Android)
2. iOS: กดปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"
   Android: กดเมนู 3 จุด → "เพิ่มไปยังหน้าจอโฮม" / "ติดตั้งแอป"
3. จะมีไอคอนแอปที่หน้าจอโฮม เปิดแล้วเต็มจอเหมือนแอปจริง

## เรื่องข้อมูล

- ข้อมูลเก็บด้วย `localStorage` ในเครื่อง/เบราว์เซอร์นั้นๆ เท่านั้น
- ใช้ปุ่ม **Backup ข้อมูล (.json)** ในหน้าตั้งค่าเป็นประจำ เพื่อกันข้อมูลหายกรณีล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง
- (ขั้นต่อไป) จะเพิ่มระบบ sync ไป Google Sheets อัตโนมัติ เป็นสำรองชั้นที่สอง
