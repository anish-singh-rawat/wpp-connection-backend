import dotenv from "dotenv";
import mongoose from "mongoose";

import User, { ROLES } from "../models/User.js";
import Device from "../models/Device.js";
import MessageJob from "../models/MessageJob.js";
import IncomingMessage from "../models/IncomingMessage.js";
import ApiRequestLog from "../models/ApiRequestLog.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const SEED_NAME = "Super Admin";
const SEED_EMAIL = "admin@digibysr.com";
const SEED_PASSWORD = "WPP@2026@Admin";

const run = async () => {
  try {
    console.log("[Seed] Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGODB_URL);

    console.log("[Seed] Connected.");

    console.log("[Seed] Ensuring indexes...");

    try {
      const logCollection = mongoose.connection.collection('apirequestlogs');
      const existingIndexes = await logCollection.indexes();
      const plainCreatedAt = existingIndexes.find(
        (idx) => idx.name === 'createdAt_1' && idx.expireAfterSeconds === undefined
      );
      if (plainCreatedAt) {
        await logCollection.dropIndex('createdAt_1');
        console.log('[Seed] Dropped stale createdAt_1 index on ApiRequestLog (will be recreated with TTL).');
      }
    } catch (e) {

      if (!e.message.includes('ns not found') && !e.message.includes('index not found')) {
        console.warn('[Seed] Index cleanup warning:', e.message);
      }
    }

    await Promise.all([
      User.createIndexes(),
      Device.createIndexes(),
      MessageJob.createIndexes(),
      IncomingMessage.createIndexes(),
      ApiRequestLog.createIndexes(),
    ]);

    console.log("[Seed] Indexes ensured.");

    const existing = await User.findOne({
      role: ROLES.SUPER_ADMIN,
    });

    if (existing) {
      console.log(
        `[Seed] SUPER_ADMIN already exists: ${existing.email}`
      );
      console.log("[Seed] No changes made.");

      await mongoose.disconnect();
      return;
    }

    const admin = await User.create({
      name: SEED_NAME,
      email: SEED_EMAIL.toLowerCase(),
      password: SEED_PASSWORD,
      role: ROLES.SUPER_ADMIN,
      parentCustomerId: null,
      createdBy: null,
      isActive: true,
      status: "active",
    });

    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║           SUPER_ADMIN CREATED                   ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║  Name:     ${admin.name.padEnd(38)}║`);
    console.log(`║  Email:    ${admin.email.padEnd(38)}║`);
    console.log(`║  Password: ${SEED_PASSWORD.padEnd(38)}║`);
    console.log(`║  ID:       ${admin._id.toString().padEnd(38)}║`);
    console.log("╠══════════════════════════════════════════════════╣");
    console.log("║  ⚠ Change the password after first login!       ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");

    await mongoose.disconnect();
    console.log("[Seed] Done.");
  } catch (err) {
    console.error("[Seed] Error:", err.message);

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
};

run();