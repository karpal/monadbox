require("dotenv").config();
const { ethers } = require("ethers");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_URL = process.env.PROVIDER_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const FID = process.env.FID;
const UPSTASH_AUTH = process.env.UPSTASH_AUTH;
const CLAIM_INTERVAL = 3 * 60 * 60 * 1000; // 3 jam

if (!PRIVATE_KEY || !PROVIDER_URL || !CONTRACT_ADDRESS || !FID || !UPSTASH_AUTH) {
  console.error("❌ Lengkapi PRIVATE_KEY, PROVIDER_URL, CONTRACT_ADDRESS, FID, UPSTASH_AUTH di .env");
  process.exit(1);
}

// ABI klaim sesuai smart contract di Monad, contoh minimal:
const ABI = [
  "function claimBox(uint256 fid) public returns (bool)"
];

const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

async function getCooldown() {
  try {
    const res = await fetch(`https://monadbox.vercel.app/api/box-cooldown?fid=${FID}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return data.lastOpen ?? null;
  } catch (e) {
    console.error("❌ Gagal fetch cooldown:", e);
    return null;
  }
}

async function getRankAndPoints() {
  try {
    const res = await fetch("https://evolved-macaw-13512.upstash.io/pipeline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: UPSTASH_AUTH,
      },
      body: JSON.stringify([
        ["zscore", "leaderboard", FID],
        ["zrevrank", "leaderboard", FID]
      ]),
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);

    const data = await res.json();

    const points = data[0]?.result ?? "N/A";
    const rankZeroBased = data[1]?.result;
    const rank = rankZeroBased !== undefined && rankZeroBased !== null
      ? rankZeroBased + 1
      : "N/A";

    return { points, rank };
  } catch (e) {
    console.error("❌ Gagal ambil rank dan poin:", e);
    return { points: "N/A", rank: "N/A" };
  }
}

async function claimBox() {
  try {
    const tx = await contract.claimBox(Number(FID));
    console.log(`📝 Transaksi dikirim, menunggu konfirmasi... (tx: ${tx.hash})`);
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      console.log("✅ Klaim berhasil!");
      return true;
    } else {
      console.log("❌ Transaksi gagal!");
      return false;
    }
  } catch (e) {
    console.error("❌ Gagal klaim:", e);
    return false;
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

async function main() {
  console.log("🚀 Bot auto claim started...");

  while (true) {
    const lastOpen = await getCooldown();

    if (!lastOpen) {
      console.log("⚠️ Tidak dapat data cooldown, coba klaim langsung.");
    } else {
      const nextClaim = lastOpen + CLAIM_INTERVAL;
      console.log(`🕐 Last open at: ${formatDate(lastOpen)}`);
      console.log(`🕐 Next claim at: ${formatDate(nextClaim)}`);

      if (Date.now() < nextClaim) {
        const diffMs = nextClaim - Date.now();
        console.log(`⏳ Masih cooldown, bisa klaim lagi dalam ${formatTime(diffMs)}`);

        const { points, rank } = await getRankAndPoints();
        console.log(`🎯 Rank: ${rank} | Points: ${points}\n`);

        await new Promise(r => setTimeout(r, diffMs));
        continue;
      }
    }

    const success = await claimBox();

    if (success) {
      const { points, rank } = await getRankAndPoints();
      console.log(`🎯 Rank: ${rank} | Points: ${points}\n`);
    } else {
      console.log("❌ Gagal klaim atau sudah klaim sebelumnya.\n");
    }

    await new Promise(r => setTimeout(r, CLAIM_INTERVAL));
  }
}

main();
