const express = require("express");
const { createClient } = require("redis");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
app.use(express.json());

// Redis connection (works locally + on Render)
const client = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

client.on("error", (err) => console.error("Redis Client Error", err));

(async () => {
  await client.connect();
})();

const TOTAL_SEATS = 100;
const LOCK_TIMEOUT = 5000;

// Initialize seats
async function initializeSeats() {
  const existing = await client.get("available_seats");
  if (!existing) {
    await client.set("available_seats", TOTAL_SEATS);
  }
}
initializeSeats();


// ✅ NEW ROUTE (Homepage Message)
app.get("/", (req, res) => {
  res.send("Concurrent Ticket Booking System is Live 🚀");
});


// Booking API
app.post("/api/book", async (req, res) => {
  const lockKey = "seat_lock";
  const lockId = uuidv4();

  try {
    const lock = await client.set(lockKey, lockId, {
      NX: true,
      PX: LOCK_TIMEOUT,
    });

    if (!lock) {
      return res.status(429).json({
        success: false,
        message: "Another user is booking. Try again."
      });
    }

    let seats = await client.get("available_seats");
    seats = parseInt(seats);

    if (seats <= 0) {
      return res.status(400).json({
        success: false,
        message: "Sold Out"
      });
    }

    seats -= 1;
    await client.set("available_seats", seats);

    const bookingId = Date.now();

    const currentLock = await client.get(lockKey);
    if (currentLock === lockId) {
      await client.del(lockKey);
    }

    res.json({
      success: true,
      bookingId,
      remaining: seats
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Use dynamic port for deployment
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Booking system running on port ${PORT}`);
});