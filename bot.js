require("dotenv").config();
const { ethers } = require("ethers");
const fetch = require("node-fetch");
const cron = require("node-cron");

// Ambil konfigurasi dari environment
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FID = process.env.FID;

const wallet = new ethers.Wallet(PRIVATE_KEY);

// Fungsi utama untuk claim box
async function claimBox() {
  const timestamp = Date.now();
  const message = `${FID}:${timestamp}`; // Ubah jika format sign beda
  const signature = await wallet.signMessage(message);

  const payload = {
    fid: parseInt(FID),
    timestamp,
    signature
  };

  try {
    const response = await fetch("https://monadbox.vercel.app/api/box-cooldown", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`[${new Date().toLocaleString()}] ✅ Claim result:`, result);
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] ❌ Error:`, error);
  }
}

// Jalankan sekali saat start
claimBox();

// Jadwalkan ulang setiap 3 jam
cron.schedule("0 */3 * * *", () => {
  console.log("🕒 Menjalankan auto-claim...");
  claimBox().catch(console.error);
});
