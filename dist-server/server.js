// server.ts
import express from "express";
import path3 from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// server/db.ts
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

// server/auth.ts
import crypto from "node:crypto";
var JWT_SECRET = (() => {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length > 0) {
    return process.env.SESSION_SECRET.trim();
  }
  console.warn(
    "[Auth] WARNING: SESSION_SECRET is not set. Generating a random 32-byte secret for this process (sessions will reset on restart)."
  );
  return crypto.randomBytes(32).toString("hex");
})();
var TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1e3;
function hashPassword(password, salt) {
  const passwordSalt = salt || crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, passwordSalt, 64);
  return {
    hash: derivedKey.toString("hex"),
    salt: passwordSalt
  };
}
function verifyPassword(password, hash, salt) {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(derivedKey.toString("hex"), "hex");
    const hashBuffer = Buffer.from(hash, "hex");
    if (keyBuffer.length !== hashBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, hashBuffer);
  } catch {
    return false;
  }
}
function signToken(payload) {
  const iat = Date.now();
  const exp = iat + TOKEN_EXPIRY_MS;
  const fullPayload = { ...payload, iat, exp };
  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}
function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
function getSessionFromRequest(req) {
  const cookieToken = req.cookies?.golden_hour_session || req.cookies?.saarthi_session;
  if (cookieToken) {
    const session = verifyToken(cookieToken);
    if (session) return session;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    return verifyToken(token);
  }
  return null;
}
function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ success: false, error: "Authentication required. Please log in." });
  }
  req.user = session;
  next();
}
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ success: false, error: "Authentication required. Please log in." });
    }
    if (!allowedRoles.includes(session.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: role '${session.role}' is not authorized for this resource.`
      });
    }
    req.user = session;
    next();
  };
}

// server/data/hospitals.seed.json
var hospitals_seed_default = [
  {
    id: "hosp-bombay",
    name: "Bombay Hospital & Medical Research Centre",
    zone: "South Mumbai",
    nearestStationId: "marine-lines",
    stationVicinity: "Near Marine Lines Station (East)",
    address: "12, Marine Lines, Mumbai 400020",
    lat: 18.9401,
    lng: 72.8282,
    phone: "+91 22 2206 7676",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 14,
    trauma: 8,
    vent: 10,
    oxygen: 25,
    burns: 4,
    general: 50,
    bloodStock: {
      "O+": 18,
      "O-": 6,
      "A+": 14,
      "A-": 4,
      "B+": 16,
      "B-": 5,
      "AB+": 8,
      "AB-": 2
    },
    specialists: [
      "Dr. Senior Neurosurgeon",
      "Dr. On-Duty Trauma Lead",
      "Dr. Critical Care Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman Bharat",
      "Star Health",
      "HDFC ERGO",
      "Medi Assist",
      "Bajaj Allianz"
    ],
    tpaDeskPhone: "+91 22 2206 7678",
    capacityPercent: 55,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-bombay.jpg"
  },
  {
    id: "hosp-saifee",
    name: "Saifee Hospital",
    zone: "South Mumbai",
    nearestStationId: "charni-road",
    stationVicinity: "Opposite Charni Road Station (East)",
    address: "15/17, Maharshi Karve Road, Mumbai 400004",
    lat: 18.9525,
    lng: 72.8184,
    phone: "+91 22 6757 0111",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 12,
    trauma: 6,
    vent: 8,
    oxygen: 20,
    burns: 3,
    general: 40,
    bloodStock: {
      "O+": 15,
      "O-": 5,
      "A+": 12,
      "A-": 3,
      "B+": 14,
      "B-": 4,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. Interventional Cardiologist",
      "Dr. Trauma Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "ICICI Lombard",
      "Care Health",
      "Star Health",
      "Tata AIG"
    ],
    tpaDeskPhone: "+91 22 6757 0115",
    capacityPercent: 60,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-saifee.jpg"
  },
  {
    id: "hosp-gt",
    name: "Gokuldas Tejpal (GT) Municipal Hospital",
    zone: "South Mumbai",
    nearestStationId: "marine-lines",
    stationVicinity: "Near Marine Lines / Crawford Market",
    address: "Lokmanya Tilak Road, Fort, Mumbai 400001",
    lat: 18.9463,
    lng: 72.8335,
    phone: "+91 22 2262 1464",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 10,
    vent: 6,
    oxygen: 30,
    burns: 4,
    general: 65,
    bloodStock: {
      "O+": 25,
      "O-": 8,
      "A+": 20,
      "A-": 6,
      "B+": 22,
      "B-": 7,
      "AB+": 9,
      "AB-": 4
    },
    specialists: [
      "Dr. Chief Casualty Medical Officer",
      "Dr. General Surgery Registrar"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Govt Free Emergency Care",
      "PM-JAY Ayushman Bharat",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2262 1465",
    capacityPercent: 75,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-gt.jpg"
  },
  {
    id: "hosp-stgeorge",
    name: "St. George Govt Hospital",
    zone: "South Mumbai",
    nearestStationId: "churchgate",
    stationVicinity: "Near Churchgate / CST Corridor",
    address: "P D'Mello Road, Fort, Mumbai 400001",
    lat: 18.9395,
    lng: 72.8364,
    phone: "+91 22 2262 0241",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 6,
    trauma: 8,
    vent: 5,
    oxygen: 22,
    burns: 5,
    general: 55,
    bloodStock: {
      "O+": 20,
      "O-": 7,
      "A+": 16,
      "A-": 4,
      "B+": 18,
      "B-": 5,
      "AB+": 7,
      "AB-": 3
    },
    specialists: [
      "Dr. Emergency Officer",
      "Dr. Orthopaedic Trauma Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "100% Free Govt Healthcare",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2262 0245",
    capacityPercent: 68,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-stgeorge.jpg"
  },
  {
    id: "hosp-nair",
    name: "B.Y.L. Nair Charitable Municipal Hospital",
    zone: "Mumbai Central - Parel",
    nearestStationId: "mumbai-central",
    stationVicinity: "200m from Mumbai Central Station (East)",
    address: "Dr. A.L. Nair Road, Mumbai Central, Mumbai 400008",
    lat: 18.9749,
    lng: 72.8219,
    phone: "+91 22 2302 7000",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 12,
    trauma: 15,
    vent: 10,
    oxygen: 35,
    burns: 6,
    general: 80,
    bloodStock: {
      "O+": 30,
      "O-": 10,
      "A+": 24,
      "A-": 8,
      "B+": 28,
      "B-": 9,
      "AB+": 12,
      "AB-": 5
    },
    specialists: [
      "Dr. Professor of Emergency Medicine",
      "Dr. Trauma Lead Registrar",
      "Dr. Neurotrauma Unit"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "BMC Free Municipal Emergency",
      "PM-JAY Ayushman",
      "MJPJAY Scheme"
    ],
    tpaDeskPhone: "+91 22 2302 7100",
    capacityPercent: 82,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-nair.jpg"
  },
  {
    id: "hosp-wockhardt-mc",
    name: "Wockhardt Hospital Mumbai Central",
    zone: "Mumbai Central - Parel",
    nearestStationId: "mumbai-central",
    stationVicinity: "Near Mumbai Central Station (West)",
    address: "1877, Dr. Anandrao Nair Marg, Mumbai Central, Mumbai 400011",
    lat: 18.9774,
    lng: 72.8228,
    phone: "+91 22 6178 4444",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 10,
    trauma: 6,
    vent: 8,
    oxygen: 18,
    burns: 2,
    general: 35,
    bloodStock: {
      "O+": 14,
      "O-": 4,
      "A+": 11,
      "A-": 3,
      "B+": 13,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. Critical Care Intensivist",
      "Dr. Cardiac Emergency Consultant"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Max Bupa",
      "HDFC ERGO",
      "Vidal Health"
    ],
    tpaDeskPhone: "+91 22 6178 4455",
    capacityPercent: 50,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-wockhardt-mc.jpg"
  },
  {
    id: "hosp-bhatia",
    name: "Bhatia Hospital",
    zone: "Mumbai Central - Parel",
    nearestStationId: "grant-road",
    stationVicinity: "Near Grant Road Station (West)",
    address: "Tardeo Road, Grant Road West, Mumbai 400007",
    lat: 18.9669,
    lng: 72.8144,
    phone: "+91 22 6666 0000",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 7,
    trauma: 4,
    vent: 5,
    oxygen: 15,
    burns: 1,
    general: 30,
    bloodStock: {
      "O+": 10,
      "O-": 3,
      "A+": 8,
      "A-": 2,
      "B+": 9,
      "B-": 2,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. General Physician",
      "Dr. Orthopaedic Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Star Health",
      "Care Health",
      "PM-JAY",
      "ICICI Lombard"
    ],
    tpaDeskPhone: "+91 22 6666 0111",
    capacityPercent: 58,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-bhatia.jpg"
  },
  {
    id: "hosp-kem",
    name: "King Edward Memorial (KEM) Hospital",
    zone: "Mumbai Central - Parel",
    nearestStationId: "prabhadevi",
    stationVicinity: "Near Prabhadevi / Parel Junction",
    address: "Acharya Donde Marg, Parel, Mumbai 400012",
    lat: 19.0033,
    lng: 72.8427,
    phone: "+91 22 2410 7000",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 18,
    trauma: 20,
    vent: 14,
    oxygen: 45,
    burns: 8,
    general: 90,
    bloodStock: {
      "O+": 35,
      "O-": 12,
      "A+": 28,
      "A-": 9,
      "B+": 30,
      "B-": 10,
      "AB+": 15,
      "AB-": 6
    },
    specialists: [
      "Dr. Head of Emergency Medicine",
      "Dr. Chief Neurotrauma Surgeon",
      "Dr. Cardiovascular Resuscitation Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free Municipal Emergency Service",
      "PM-JAY Ayushman",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2410 7200",
    capacityPercent: 88,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-kem.jpg"
  },
  {
    id: "hosp-hinduja",
    name: "P.D. Hinduja Hospital & Medical Research Centre",
    zone: "Dadar - Mahim",
    nearestStationId: "mahim",
    stationVicinity: "Near Mahim Station (West)",
    address: "Veer Savarkar Marg, Mahim West, Mumbai 400016",
    lat: 19.033,
    lng: 72.8385,
    phone: "+91 22 2445 1515",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 15,
    trauma: 8,
    vent: 10,
    oxygen: 28,
    burns: 3,
    general: 45,
    bloodStock: {
      "O+": 22,
      "O-": 7,
      "A+": 17,
      "A-": 5,
      "B+": 19,
      "B-": 6,
      "AB+": 8,
      "AB-": 3
    },
    specialists: [
      "Dr. Director Critical Care",
      "Dr. Stroke & Neuro Specialist",
      "Dr. Vascular Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "All Major TPAs",
      "Star Health",
      "HDFC ERGO",
      "Medi Assist",
      "Care Health"
    ],
    tpaDeskPhone: "+91 22 2445 2222",
    capacityPercent: 62,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-hinduja.jpg"
  },
  {
    id: "hosp-shushrusha",
    name: "Shushrusha Citizens Co-operative Hospital",
    zone: "Dadar - Mahim",
    nearestStationId: "dadar",
    stationVicinity: "Near Dadar Station (West)",
    address: "698-B, Ranade Road, Dadar West, Mumbai 400028",
    lat: 19.0227,
    lng: 72.8378,
    phone: "+91 22 2443 6500",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 6,
    trauma: 4,
    vent: 4,
    oxygen: 16,
    burns: 1,
    general: 32,
    bloodStock: {
      "O+": 9,
      "O-": 3,
      "A+": 7,
      "A-": 2,
      "B+": 8,
      "B-": 2,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "New India Assurance"
    ],
    tpaDeskPhone: "+91 22 2443 6555",
    capacityPercent: 48,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-shushrusha.jpg"
  },
  {
    id: "hosp-slraheja",
    name: "S.L. Raheja Hospital (Fortis Associate)",
    zone: "Dadar - Mahim",
    nearestStationId: "mahim",
    stationVicinity: "Near Mahim Station (East)",
    address: "Raheja Rugnalaya Marg, Mahim East, Mumbai 400016",
    lat: 19.0494,
    lng: 72.8475,
    phone: "+91 22 6652 9999",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 5,
    vent: 6,
    oxygen: 18,
    burns: 2,
    general: 35,
    bloodStock: {
      "O+": 12,
      "O-": 4,
      "A+": 10,
      "A-": 3,
      "B+": 11,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. Intensivist On Duty",
      "Dr. Diabetic Foot & Trauma Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Fortis TPAs",
      "Star Health",
      "Bajaj Allianz",
      "PM-JAY"
    ],
    tpaDeskPhone: "+91 22 6652 9911",
    capacityPercent: 54,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-slraheja.jpg"
  },
  {
    id: "hosp-lilavati",
    name: "Lilavati Hospital & Research Centre",
    zone: "Bandra - Khar",
    nearestStationId: "bandra",
    stationVicinity: "Near Bandra Station (West) / Reclamation",
    address: "A-791, Bandra Reclamation, Bandra West, Mumbai 400050",
    lat: 19.0515,
    lng: 72.8291,
    phone: "+91 22 2675 1000",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 16,
    trauma: 9,
    vent: 11,
    oxygen: 30,
    burns: 4,
    general: 55,
    bloodStock: {
      "O+": 25,
      "O-": 8,
      "A+": 19,
      "A-": 6,
      "B+": 21,
      "B-": 6,
      "AB+": 9,
      "AB-": 4
    },
    specialists: [
      "Dr. Senior Trauma Consultant",
      "Dr. Head of Critical Care",
      "Dr. Neurotrauma Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "All Major Corporate TPAs",
      "Star Health",
      "HDFC ERGO",
      "PM-JAY Trust Empaneled"
    ],
    tpaDeskPhone: "+91 22 2675 1111",
    capacityPercent: 65,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-lilavati.jpg"
  },
  {
    id: "hosp-holyfamily",
    name: "Holy Family Multispeciality Hospital",
    zone: "Bandra - Khar",
    nearestStationId: "bandra",
    stationVicinity: "Near Bandra Station (West)",
    address: "St. Andrew's Road, Bandra West, Mumbai 400050",
    lat: 19.0558,
    lng: 72.8279,
    phone: "+91 22 6267 0555",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 10,
    trauma: 6,
    vent: 7,
    oxygen: 22,
    burns: 2,
    general: 40,
    bloodStock: {
      "O+": 16,
      "O-": 5,
      "A+": 12,
      "A-": 4,
      "B+": 13,
      "B-": 4,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. Cardiothoracic On-Call"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Care Health",
      "Star Health",
      "ICICI Lombard"
    ],
    tpaDeskPhone: "+91 22 6267 0560",
    capacityPercent: 52,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-holyfamily.jpg"
  },
  {
    id: "hosp-bhabha-bandra",
    name: "K.B. Bhabha Municipal General Hospital",
    zone: "Bandra - Khar",
    nearestStationId: "bandra",
    stationVicinity: "Near Bandra Station (West)",
    address: "R.K. Patkar Marg, Bandra West, Mumbai 400050",
    lat: 19.0578,
    lng: 72.834,
    phone: "+91 22 2642 2775",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 7,
    trauma: 9,
    vent: 5,
    oxygen: 25,
    burns: 3,
    general: 60,
    bloodStock: {
      "O+": 22,
      "O-": 7,
      "A+": 18,
      "A-": 5,
      "B+": 20,
      "B-": 6,
      "AB+": 8,
      "AB-": 3
    },
    specialists: [
      "Dr. BMC Casualty Medical Officer",
      "Dr. Orthopaedic Registrar"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free BMC Emergency",
      "PM-JAY Mahatma Phule Jan Arogya Yojana"
    ],
    tpaDeskPhone: "+91 22 2642 2779",
    capacityPercent: 78,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-bhabha-bandra.jpg"
  },
  {
    id: "hosp-pdhinduja-khar",
    name: "P.D. Hinduja Healthcare Surgical",
    zone: "Bandra - Khar",
    nearestStationId: "khar-road",
    stationVicinity: "Near Khar Road Station (West)",
    address: "11th Road, Khar West, Mumbai 400052",
    lat: 19.0716,
    lng: 72.8345,
    phone: "+91 22 2646 9999",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 5,
    trauma: 3,
    vent: 3,
    oxygen: 12,
    burns: 1,
    general: 24,
    bloodStock: {
      "O+": 8,
      "O-": 2,
      "A+": 6,
      "A-": 2,
      "B+": 7,
      "B-": 2,
      "AB+": 3,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Intensivist",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 0,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Star Health",
      "HDFC ERGO",
      "Niva Bupa"
    ],
    tpaDeskPhone: "+91 22 2646 9900",
    capacityPercent: 45,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-pdhinduja-khar.jpg"
  },
  {
    id: "hosp-nanavati",
    name: "Nanavati Max Super Speciality Hospital",
    zone: "Santacruz - Vile Parle",
    nearestStationId: "vile-parle",
    stationVicinity: "Near Vile Parle / Santacruz West",
    address: "Swami Vivekanand Road, Vile Parle West, Mumbai 400056",
    lat: 19.0963,
    lng: 72.8412,
    phone: "+91 22 2626 7500",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 18,
    trauma: 10,
    vent: 12,
    oxygen: 32,
    burns: 4,
    general: 60,
    bloodStock: {
      "O+": 28,
      "O-": 9,
      "A+": 21,
      "A-": 7,
      "B+": 23,
      "B-": 7,
      "AB+": 10,
      "AB-": 4
    },
    specialists: [
      "Dr. Director of Emergency & Trauma",
      "Dr. Senior Interventionist",
      "Dr. On-Duty Pulmonologist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "All Major TPAs",
      "Star Health",
      "Max Bupa",
      "PM-JAY Ayushman",
      "ICICI Lombard"
    ],
    tpaDeskPhone: "+91 22 2626 7555",
    capacityPercent: 66,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-nanavati.jpg"
  },
  {
    id: "hosp-vnmukherjee",
    name: "V.N. Desai Municipal Hospital",
    zone: "Santacruz - Vile Parle",
    nearestStationId: "santacruz",
    stationVicinity: "Near Santacruz Station (East)",
    address: "Golibar Road, Santacruz East, Mumbai 400055",
    lat: 19.0811,
    lng: 72.8475,
    phone: "+91 22 2618 2088",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 6,
    trauma: 7,
    vent: 4,
    oxygen: 20,
    burns: 3,
    general: 50,
    bloodStock: {
      "O+": 18,
      "O-": 6,
      "A+": 15,
      "A-": 4,
      "B+": 16,
      "B-": 5,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Municipal Medical Officer",
      "Dr. Casualty Registrar"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free BMC Emergency Treatment",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2618 2090",
    capacityPercent: 74,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-vnmukherjee.jpg"
  },
  {
    id: "hosp-surya",
    name: "Surya Multispeciality Hospital",
    zone: "Santacruz - Vile Parle",
    nearestStationId: "santacruz",
    stationVicinity: "Near Santacruz Station (West)",
    address: "Swami Vivekanand Road, Santacruz West, Mumbai 400054",
    lat: 19.0833,
    lng: 72.8368,
    phone: "+91 22 6153 8989",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 4,
    vent: 5,
    oxygen: 16,
    burns: 2,
    general: 28,
    bloodStock: {
      "O+": 11,
      "O-": 3,
      "A+": 9,
      "A-": 2,
      "B+": 10,
      "B-": 3,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Pediatric & Adult Emergency Specialist",
      "Dr. Critical Care Fellow"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Star Health",
      "Medi Assist",
      "Care Health",
      "PM-JAY"
    ],
    tpaDeskPhone: "+91 22 6153 8990",
    capacityPercent: 49,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-surya.jpg"
  },
  {
    id: "hosp-cooper",
    name: "Dr. R.N. Cooper Municipal General Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "vile-parle",
    stationVicinity: "Near Vile Parle / Andheri West",
    address: "U-15, Bhaktivedanta Swami Marg, Juhu, Vile Parle West, Mumbai 400056",
    lat: 19.1075,
    lng: 72.836,
    phone: "+91 22 2620 7254",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 10,
    trauma: 12,
    vent: 8,
    oxygen: 30,
    burns: 4,
    general: 70,
    bloodStock: {
      "O+": 26,
      "O-": 9,
      "A+": 20,
      "A-": 6,
      "B+": 24,
      "B-": 7,
      "AB+": 9,
      "AB-": 4
    },
    specialists: [
      "Dr. Emergency Medical Officer",
      "Dr. General Surgery Registrar",
      "Dr. Orthopaedic Trauma Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free Municipal Emergency",
      "PM-JAY Mahatma Phule Jan Arogya Yojana"
    ],
    tpaDeskPhone: "+91 22 2620 7200",
    capacityPercent: 80,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-cooper.jpg"
  },
  {
    id: "hosp-kokilaben",
    name: "Kokilaben Dhirubhai Ambani Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "andheri",
    stationVicinity: "Near Andheri Station (West) / Four Bungalows",
    address: "Rao Saheb Achutrao Patwardhan Marg, Four Bungalows, Andheri West, Mumbai 400053",
    lat: 19.1314,
    lng: 72.8252,
    phone: "+91 22 4269 6969",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 18,
    trauma: 12,
    vent: 14,
    oxygen: 35,
    burns: 5,
    general: 65,
    bloodStock: {
      "O+": 30,
      "O-": 10,
      "A+": 22,
      "A-": 7,
      "B+": 25,
      "B-": 8,
      "AB+": 11,
      "AB-": 5
    },
    specialists: [
      "Dr. Director Trauma & Emergency",
      "Dr. Senior Neurosurgeon",
      "Dr. Cardiac Critical Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "All Major TPAs",
      "Star Health",
      "Niva Bupa",
      "Tata AIG",
      "PM-JAY Trust"
    ],
    tpaDeskPhone: "+91 22 4269 6900",
    capacityPercent: 64,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-kokilaben.jpg"
  },
  {
    id: "hosp-sevenhills",
    name: "Seven Hills Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "andheri",
    stationVicinity: "Near Andheri Station (East) / Marol",
    address: "Marol Maroshi Road, Andheri East, Mumbai 400059",
    lat: 19.1228,
    lng: 72.8797,
    phone: "+91 22 6767 6767",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 12,
    trauma: 8,
    vent: 8,
    oxygen: 26,
    burns: 3,
    general: 45,
    bloodStock: {
      "O+": 16,
      "O-": 6,
      "A+": 13,
      "A-": 4,
      "B+": 14,
      "B-": 5,
      "AB+": 7,
      "AB-": 3
    },
    specialists: [
      "Dr. Rohan Mehta (Trauma)",
      "Dr. Anita Deshmukh (Vascular)",
      "Dr. Farhan Qureshi (Neuro)"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman Bharat (100% Cashless)",
      "Maharashtra Gov Health Scheme",
      "Star Health"
    ],
    tpaDeskPhone: "+91 22 6767 6710",
    capacityPercent: 52,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-sevenhills.jpg"
  },
  {
    id: "hosp-holyspirit",
    name: "Holy Spirit Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "andheri",
    stationVicinity: "Near Andheri Station (East) / Mahakali",
    address: "Mahakali Caves Road, Andheri East, Mumbai 400093",
    lat: 19.1255,
    lng: 72.8682,
    phone: "+91 22 2820 4000",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 6,
    vent: 6,
    oxygen: 20,
    burns: 3,
    general: 38,
    bloodStock: {
      "O+": 14,
      "O-": 6,
      "A+": 14,
      "A-": 3,
      "B+": 11,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. Emergency Physician (Trauma)",
      "Dr. Vascular Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman",
      "ICICI Lombard",
      "Care Health",
      "Bajaj Allianz"
    ],
    tpaDeskPhone: "+91 22 2820 4050",
    capacityPercent: 50,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-holyspirit.jpg"
  },
  {
    id: "hosp-shagun",
    name: "Shagun Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "andheri",
    stationVicinity: "Near Andheri Station (East)",
    address: "Old Nagardas Road, Andheri East, Mumbai 400069",
    lat: 19.1156,
    lng: 72.8521,
    phone: "+91 22 2820 4100",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 7,
    vent: 7,
    oxygen: 16,
    burns: 2,
    general: 25,
    bloodStock: {
      "O+": 12,
      "O-": 4,
      "A+": 8,
      "A-": 2,
      "B+": 10,
      "B-": 3,
      "AB+": 5,
      "AB-": 1
    },
    specialists: [
      "Dr. Emergency Physician (Trauma)",
      "Dr. On-Call Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman",
      "Star Health",
      "HDFC ERGO",
      "Medi Assist"
    ],
    tpaDeskPhone: "+91 22 2820 4115",
    capacityPercent: 48,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-shagun.jpg"
  },
  {
    id: "hosp-criticare-andheri",
    name: "Criticare Asia Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "andheri",
    stationVicinity: "Andheri East (Telli Galli)",
    address: "Telli Galli, Andheri East, Mumbai 400069",
    lat: 19.114,
    lng: 72.8624,
    phone: "+91 22 2822 5555",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 6,
    trauma: 4,
    vent: 3,
    oxygen: 12,
    burns: 1,
    general: 20,
    bloodStock: {
      "O+": 8,
      "O-": 2,
      "A+": 6,
      "A-": 1,
      "B+": 7,
      "B-": 2,
      "AB+": 3,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Intensivist"
    ],
    cashlessPMJAY: 0,
    acceptsInsurance: 0,
    insuranceProviders: [
      "Direct Cash Billing Only"
    ],
    tpaDeskPhone: "+91 22 2822 5560",
    capacityPercent: 42,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-criticare-andheri.jpg"
  },
  {
    id: "hosp-trauma-jogeshwari",
    name: "Balasaheb Thackeray Trauma Care Municipal Hospital",
    zone: "Andheri - Jogeshwari",
    nearestStationId: "jogeshwari",
    stationVicinity: "Jogeshwari East / Western Express Hwy",
    address: "Western Express Highway, Jogeshwari East, Mumbai 400060",
    lat: 19.1378,
    lng: 72.8553,
    phone: "+91 22 2825 4147",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 14,
    trauma: 16,
    vent: 10,
    oxygen: 30,
    burns: 5,
    general: 65,
    bloodStock: {
      "O+": 24,
      "O-": 8,
      "A+": 18,
      "A-": 5,
      "B+": 20,
      "B-": 7,
      "AB+": 8,
      "AB-": 3
    },
    specialists: [
      "Dr. Trauma Surgery Specialist",
      "Dr. Orthopaedic Emergency Registrar"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free Municipal Emergency Trauma Care",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2825 4150",
    capacityPercent: 76,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-trauma-jogeshwari.jpg"
  },
  {
    id: "hosp-siddharth",
    name: "Siddharth Municipal General Hospital",
    zone: "Goregaon - Malad",
    nearestStationId: "goregaon",
    stationVicinity: "Near Goregaon Station (West)",
    address: "SV Road, Goregaon West, Mumbai 400104",
    lat: 19.1631,
    lng: 72.8452,
    phone: "+91 22 2872 0336",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 7,
    trauma: 8,
    vent: 5,
    oxygen: 22,
    burns: 3,
    general: 55,
    bloodStock: {
      "O+": 19,
      "O-": 6,
      "A+": 14,
      "A-": 4,
      "B+": 16,
      "B-": 5,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Casualty Medical Officer",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free Municipal Healthcare",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2872 0340",
    capacityPercent: 72,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-siddharth.jpg"
  },
  {
    id: "hosp-lifeline-malad",
    name: "Lifeline Multispeciality Hospital",
    zone: "Goregaon - Malad",
    nearestStationId: "malad",
    stationVicinity: "Near Malad Station (West)",
    address: "SV Road, Malad West, Mumbai 400064",
    lat: 19.1834,
    lng: 72.8465,
    phone: "+91 22 2888 8888",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 5,
    vent: 6,
    oxygen: 16,
    burns: 2,
    general: 32,
    bloodStock: {
      "O+": 11,
      "O-": 3,
      "A+": 9,
      "A-": 2,
      "B+": 10,
      "B-": 3,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. Critical Care Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Star Health",
      "PM-JAY",
      "HDFC ERGO",
      "Care Health"
    ],
    tpaDeskPhone: "+91 22 2888 8890",
    capacityPercent: 50,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-lifeline-malad.jpg"
  },
  {
    id: "hosp-thunga-malad",
    name: "Thunga Hospital Malad",
    zone: "Goregaon - Malad",
    nearestStationId: "malad",
    stationVicinity: "Near Malad Station (West)",
    address: "Marve Road, Mithchowki, Malad West, Mumbai 400064",
    lat: 19.1882,
    lng: 72.8431,
    phone: "+91 22 4088 8888",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 5,
    vent: 6,
    oxygen: 18,
    burns: 2,
    general: 35,
    bloodStock: {
      "O+": 13,
      "O-": 4,
      "A+": 10,
      "A-": 3,
      "B+": 12,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. On-Duty Trauma Specialist",
      "Dr. Emergency Medicine Resident"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Medi Assist",
      "Bajaj Allianz"
    ],
    tpaDeskPhone: "+91 22 4088 8899",
    capacityPercent: 56,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-thunga-malad.jpg"
  },
  {
    id: "hosp-suchak-malad",
    name: "Suchak Hospital",
    zone: "Goregaon - Malad",
    nearestStationId: "malad",
    stationVicinity: "Near Malad Station (East)",
    address: "Manchubhai Road, Malad East, Mumbai 400097",
    lat: 19.1873,
    lng: 72.854,
    phone: "+91 22 2889 4444",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 5,
    trauma: 3,
    vent: 3,
    oxygen: 12,
    burns: 1,
    general: 22,
    bloodStock: {
      "O+": 8,
      "O-": 2,
      "A+": 6,
      "A-": 1,
      "B+": 7,
      "B-": 2,
      "AB+": 3,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Specialist"
    ],
    cashlessPMJAY: 0,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Star Health",
      "Care Health"
    ],
    tpaDeskPhone: "+91 22 2889 4450",
    capacityPercent: 46,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-suchak-malad.jpg"
  },
  {
    id: "hosp-shatabdi-kandivali",
    name: "Bharatratna Dr. Babasaheb Ambedkar (Shatabdi) Hospital",
    zone: "Kandivali - Borivali - Dahisar",
    nearestStationId: "kandivali",
    stationVicinity: "Near Kandivali Station (West)",
    address: "SV Road, Kandivali West, Mumbai 400067",
    lat: 19.2058,
    lng: 72.8492,
    phone: "+91 22 2805 1141",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 14,
    trauma: 14,
    vent: 10,
    oxygen: 32,
    burns: 5,
    general: 75,
    bloodStock: {
      "O+": 26,
      "O-": 8,
      "A+": 20,
      "A-": 6,
      "B+": 22,
      "B-": 7,
      "AB+": 9,
      "AB-": 4
    },
    specialists: [
      "Dr. Head Casualty Officer",
      "Dr. Ortho Trauma Surgeon",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free Municipal Emergency",
      "PM-JAY Ayushman",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2805 1145",
    capacityPercent: 79,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-shatabdi-kandivali.jpg"
  },
  {
    id: "hosp-bhagwati",
    name: "Bhagwati Municipal Hospital",
    zone: "Kandivali - Borivali - Dahisar",
    nearestStationId: "borivali",
    stationVicinity: "Near Borivali Station (West)",
    address: "Mandpeshwar Road, Borivali West, Mumbai 400092",
    lat: 19.2312,
    lng: 72.8528,
    phone: "+91 22 2893 2461",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 12,
    trauma: 12,
    vent: 8,
    oxygen: 28,
    burns: 4,
    general: 65,
    bloodStock: {
      "O+": 22,
      "O-": 7,
      "A+": 18,
      "A-": 5,
      "B+": 20,
      "B-": 6,
      "AB+": 8,
      "AB-": 3
    },
    specialists: [
      "Dr. Casualty Medical Officer",
      "Dr. Trauma Registrar"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free BMC Emergency",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2893 2465",
    capacityPercent: 81,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-bhagwati.jpg"
  },
  {
    id: "hosp-apex-borivali",
    name: "Apex Superspeciality Hospital",
    zone: "Kandivali - Borivali - Dahisar",
    nearestStationId: "borivali",
    stationVicinity: "Near Borivali Station (West)",
    address: "Babhai Naka, LT Road, Borivali West, Mumbai 400092",
    lat: 19.2335,
    lng: 72.851,
    phone: "+91 22 6230 7300",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 5,
    vent: 5,
    oxygen: 16,
    burns: 2,
    general: 30,
    bloodStock: {
      "O+": 12,
      "O-": 3,
      "A+": 9,
      "A-": 2,
      "B+": 11,
      "B-": 3,
      "AB+": 5,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Specialist",
      "Dr. Cardiac Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "HDFC ERGO",
      "ICICI Lombard"
    ],
    tpaDeskPhone: "+91 22 6230 7310",
    capacityPercent: 55,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-apex-borivali.jpg"
  },
  {
    id: "hosp-karuna",
    name: "Karuna Hospital",
    zone: "Kandivali - Borivali - Dahisar",
    nearestStationId: "borivali",
    stationVicinity: "Near Borivali Station (West) / LIC Colony",
    address: "Jeevan Bima Nagar, Borivali West, Mumbai 400103",
    lat: 19.2361,
    lng: 72.8564,
    phone: "+91 22 6159 0222",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 6,
    vent: 6,
    oxygen: 20,
    burns: 2,
    general: 38,
    bloodStock: {
      "O+": 14,
      "O-": 4,
      "A+": 11,
      "A-": 3,
      "B+": 12,
      "B-": 4,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Care Health",
      "Star Health",
      "Bajaj Allianz"
    ],
    tpaDeskPhone: "+91 22 6159 0250",
    capacityPercent: 58,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-karuna.jpg"
  },
  {
    id: "hosp-shree-krishna",
    name: "Shree Krishna Hospital & ICU",
    zone: "Kandivali - Borivali - Dahisar",
    nearestStationId: "dahisar",
    stationVicinity: "Near Dahisar Station (East)",
    address: "SV Road, Dahisar East, Mumbai 400068",
    lat: 19.252,
    lng: 72.8621,
    phone: "+91 22 2892 5555",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 6,
    trauma: 3,
    vent: 4,
    oxygen: 14,
    burns: 1,
    general: 25,
    bloodStock: {
      "O+": 9,
      "O-": 2,
      "A+": 7,
      "A-": 2,
      "B+": 8,
      "B-": 2,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Medi Assist"
    ],
    tpaDeskPhone: "+91 22 2892 5560",
    capacityPercent: 48,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-shree-krishna.jpg"
  },
  {
    id: "hosp-wockhardt-mira",
    name: "Wockhardt Hospital Mira Road",
    zone: "Mira Road - Bhayandar",
    nearestStationId: "mira-road",
    stationVicinity: "Near Mira Road Station (East)",
    address: "The Umrao IMSR, Mira Bhayandar Road, Mira Road East, Thane 401107",
    lat: 19.2818,
    lng: 72.8654,
    phone: "+91 22 6884 6666",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 14,
    trauma: 8,
    vent: 10,
    oxygen: 26,
    burns: 3,
    general: 50,
    bloodStock: {
      "O+": 20,
      "O-": 6,
      "A+": 16,
      "A-": 4,
      "B+": 18,
      "B-": 5,
      "AB+": 7,
      "AB-": 3
    },
    specialists: [
      "Dr. Head of Emergency Medicine",
      "Dr. Interventional Cardiologist",
      "Dr. Neurotrauma Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "All Major TPAs",
      "PM-JAY Ayushman",
      "Star Health",
      "HDFC ERGO"
    ],
    tpaDeskPhone: "+91 22 6884 6670",
    capacityPercent: 61,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-wockhardt-mira.jpg"
  },
  {
    id: "hosp-bhaktivedanta",
    name: "Bhaktivedanta Hospital & Research Institute",
    zone: "Mira Road - Bhayandar",
    nearestStationId: "mira-road",
    stationVicinity: "Near Mira Road Station (East)",
    address: "Srishti Complex, Sector 1, Mira Road East, Thane 401107",
    lat: 19.2895,
    lng: 72.8687,
    phone: "+91 22 6188 2200",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 12,
    trauma: 7,
    vent: 8,
    oxygen: 24,
    burns: 3,
    general: 45,
    bloodStock: {
      "O+": 17,
      "O-": 5,
      "A+": 13,
      "A-": 4,
      "B+": 15,
      "B-": 4,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Critical Care Director",
      "Dr. Trauma Specialist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "ICICI Lombard",
      "Care Health"
    ],
    tpaDeskPhone: "+91 22 6188 2210",
    capacityPercent: 57,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-bhaktivedanta.jpg"
  },
  {
    id: "hosp-thunga-mira",
    name: "Thunga Multispeciality Hospital Mira Road",
    zone: "Mira Road - Bhayandar",
    nearestStationId: "mira-road",
    stationVicinity: "Near Mira Road Station / Highway",
    address: "Mira Bhayandar Road, Beverly Park, Mira Road East 401107",
    lat: 19.2872,
    lng: 72.8598,
    phone: "+91 22 2811 7777",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 4,
    vent: 5,
    oxygen: 16,
    burns: 2,
    general: 30,
    bloodStock: {
      "O+": 11,
      "O-": 3,
      "A+": 9,
      "A-": 2,
      "B+": 10,
      "B-": 3,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. Orthopaedic Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Medi Assist"
    ],
    tpaDeskPhone: "+91 22 2811 7788",
    capacityPercent: 50,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-thunga-mira.jpg"
  },
  {
    id: "hosp-temba-bhayandar",
    name: "Pandit Bhimsen Joshi (Temba) Municipal Hospital",
    zone: "Mira Road - Bhayandar",
    nearestStationId: "bhayandar",
    stationVicinity: "Near Bhayandar Station (West)",
    address: "Temba Road, Bhayandar West, Thane 401101",
    lat: 19.3039,
    lng: 72.8465,
    phone: "+91 22 2819 2200",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 10,
    vent: 6,
    oxygen: 24,
    burns: 4,
    general: 60,
    bloodStock: {
      "O+": 21,
      "O-": 6,
      "A+": 16,
      "A-": 4,
      "B+": 18,
      "B-": 5,
      "AB+": 7,
      "AB-": 3
    },
    specialists: [
      "Dr. MBMC Chief Casualty Officer",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free MBMC Emergency Care",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 22 2819 2210",
    capacityPercent: 77,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-temba-bhayandar.jpg"
  },
  {
    id: "hosp-cardinal-gracias",
    name: "Cardinal Gracias Memorial Hospital",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "vasai-road",
    stationVicinity: "Near Vasai Road Station (West)",
    address: "Bangli, Sandor, Vasai West, Palghar 401201",
    lat: 19.3752,
    lng: 72.8251,
    phone: "+91 250 232 2252",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 11,
    trauma: 7,
    vent: 7,
    oxygen: 22,
    burns: 3,
    general: 45,
    bloodStock: {
      "O+": 16,
      "O-": 5,
      "A+": 12,
      "A-": 3,
      "B+": 14,
      "B-": 4,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. Senior Trauma Consultant",
      "Dr. Critical Care Intensivist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman",
      "Star Health",
      "Medi Assist",
      "Care Health"
    ],
    tpaDeskPhone: "+91 250 232 2260",
    capacityPercent: 56,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-cardinal-gracias.jpg"
  },
  {
    id: "hosp-golden-park",
    name: "Golden Park Hospital",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "vasai-road",
    stationVicinity: "Near Vasai Road Station (West)",
    address: "Sai Nagar, Ambadi Road, Vasai West 401202",
    lat: 19.3789,
    lng: 72.8354,
    phone: "+91 250 233 4444",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 7,
    trauma: 4,
    vent: 4,
    oxygen: 15,
    burns: 2,
    general: 28,
    bloodStock: {
      "O+": 10,
      "O-": 3,
      "A+": 8,
      "A-": 2,
      "B+": 9,
      "B-": 2,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Emergency Physician",
      "Dr. On-Call Anaesthetist"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "HDFC ERGO"
    ],
    tpaDeskPhone: "+91 250 233 4455",
    capacityPercent: 48,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-golden-park.jpg"
  },
  {
    id: "hosp-platinum-vasai",
    name: "Platinum Hospital Vasai",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "vasai-road",
    stationVicinity: "Near Vasai Road Station (West)",
    address: "Ambadi Road, Vasai West, Palghar 401202",
    lat: 19.3815,
    lng: 72.831,
    phone: "+91 250 663 3333",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 5,
    vent: 5,
    oxygen: 18,
    burns: 2,
    general: 32,
    bloodStock: {
      "O+": 12,
      "O-": 4,
      "A+": 9,
      "A-": 3,
      "B+": 11,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. Critical Care Intensivist",
      "Dr. Cardiac Lead"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Care Health",
      "ICICI Lombard"
    ],
    tpaDeskPhone: "+91 250 663 3340",
    capacityPercent: 53,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-platinum-vasai.jpg"
  },
  {
    id: "hosp-riddhi-vinayak",
    name: "Riddhi Vinayak Multispeciality Hospital",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "nallasopara",
    stationVicinity: "Near Nallasopara Station (West)",
    address: "Central Park, Nallasopara West, Palghar 401203",
    lat: 19.4145,
    lng: 72.8162,
    phone: "+91 250 240 7777",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 9,
    trauma: 6,
    vent: 6,
    oxygen: 18,
    burns: 2,
    general: 35,
    bloodStock: {
      "O+": 13,
      "O-": 4,
      "A+": 10,
      "A-": 3,
      "B+": 12,
      "B-": 3,
      "AB+": 5,
      "AB-": 2
    },
    specialists: [
      "Dr. Trauma Lead",
      "Dr. Emergency Medicine Physician"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY Ayushman",
      "Star Health",
      "Medi Assist"
    ],
    tpaDeskPhone: "+91 250 240 7788",
    capacityPercent: 52,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-riddhi-vinayak.jpg"
  },
  {
    id: "hosp-vvcmc-virar",
    name: "VVCMC Municipal Triage Hospital",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "virar",
    stationVicinity: "Near Virar Station (East)",
    address: "Manvelpada Road, Virar East, Palghar 401305",
    lat: 19.4589,
    lng: 72.8195,
    phone: "+91 250 252 5100",
    isGovernment: 1,
    has24x7Emergency: 1,
    icu: 8,
    trauma: 10,
    vent: 5,
    oxygen: 25,
    burns: 4,
    general: 58,
    bloodStock: {
      "O+": 20,
      "O-": 6,
      "A+": 15,
      "A-": 4,
      "B+": 17,
      "B-": 5,
      "AB+": 6,
      "AB-": 2
    },
    specialists: [
      "Dr. VVCMC Casualty Officer",
      "Dr. General Surgeon"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "Free VVCMC Emergency Healthcare",
      "PM-JAY",
      "MJPJAY"
    ],
    tpaDeskPhone: "+91 250 252 5110",
    capacityPercent: 75,
    isRecommended: 1,
    imageUrl: "/assets/hospitals/hosp-vvcmc-virar.jpg"
  },
  {
    id: "hosp-sanjivani-virar",
    name: "Sanjivani Hospital Virar",
    zone: "Vasai - Nallasopara - Virar",
    nearestStationId: "virar",
    stationVicinity: "Near Virar Station (West)",
    address: "Station Road, Virar West, Palghar 401303",
    lat: 19.456,
    lng: 72.808,
    phone: "+91 250 250 4444",
    isGovernment: 0,
    has24x7Emergency: 1,
    icu: 7,
    trauma: 4,
    vent: 4,
    oxygen: 16,
    burns: 2,
    general: 28,
    bloodStock: {
      "O+": 11,
      "O-": 3,
      "A+": 8,
      "A-": 2,
      "B+": 10,
      "B-": 3,
      "AB+": 4,
      "AB-": 1
    },
    specialists: [
      "Dr. Critical Care Intensivist",
      "Dr. Emergency Physician"
    ],
    cashlessPMJAY: 1,
    acceptsInsurance: 1,
    insuranceProviders: [
      "PM-JAY",
      "Star Health",
      "Bajaj Allianz"
    ],
    tpaDeskPhone: "+91 250 250 4455",
    capacityPercent: 50,
    isRecommended: 0,
    imageUrl: "/assets/hospitals/hosp-sanjivani-virar.jpg"
  }
];

// server/db.ts
var dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
var oldDbPath = path.join(dataDir, "saarthi_emergency.db");
var dbPath = path.join(dataDir, "golden_hour.db");
if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
  try {
    fs.copyFileSync(oldDbPath, dbPath);
    console.log("[Database] Migrated existing database from saarthi_emergency.db to golden_hour.db");
  } catch (copyErr) {
    console.warn("[Database] Could not copy old db file:", copyErr);
  }
}
var db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      name TEXT NOT NULL,
      hospital_id TEXT,
      vehicle_no TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hospitals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT 'Andheri - Jogeshwari',
      nearest_station_id TEXT NOT NULL DEFAULT 'andheri',
      station_vicinity TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      distance_km REAL NOT NULL DEFAULT 1.5,
      lat REAL NOT NULL DEFAULT 19.1197,
      lng REAL NOT NULL DEFAULT 72.8464,
      phone TEXT NOT NULL,
      is_government INTEGER NOT NULL DEFAULT 0,
      has_24x7_emergency INTEGER NOT NULL DEFAULT 1,
      icu_beds INTEGER NOT NULL DEFAULT 0,
      trauma_beds INTEGER NOT NULL DEFAULT 0,
      vent_beds INTEGER NOT NULL DEFAULT 0,
      oxygen_beds INTEGER NOT NULL DEFAULT 0,
      burns_beds INTEGER NOT NULL DEFAULT 0,
      general_beds INTEGER NOT NULL DEFAULT 0,
      blood_stock_json TEXT NOT NULL DEFAULT '{}',
      specialists_json TEXT NOT NULL DEFAULT '[]',
      cashless_pmjay INTEGER NOT NULL DEFAULT 1,
      accepts_insurance INTEGER NOT NULL DEFAULT 1,
      insurance_providers_json TEXT NOT NULL DEFAULT '[]',
      tpa_desk_phone TEXT,
      capacity_percent INTEGER NOT NULL DEFAULT 50,
      is_recommended INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admission_records (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      case_id TEXT,
      patient_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      blood_type TEXT NOT NULL,
      phone TEXT NOT NULL,
      relative_name TEXT NOT NULL,
      login_intake_time TEXT NOT NULL,
      confirmed_hospital TEXT NOT NULL DEFAULT 'Pending Facility Hold',
      confirmed_bay TEXT DEFAULT '',
      confirmation_time TEXT DEFAULT '',
      discharge_status TEXT NOT NULL DEFAULT 'Pending Facility Hold',
      discharge_time TEXT,
      notes TEXT,
      insurance_type TEXT DEFAULT 'PM-JAY / Cashless In Review',
      is_unidentified INTEGER NOT NULL DEFAULT 0,
      is_quick_intake INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_logs (
      id TEXT PRIMARY KEY,
      user_and_contact TEXT NOT NULL,
      role TEXT NOT NULL,
      facility_or_station TEXT NOT NULL,
      login_timestamp TEXT NOT NULL,
      session_status TEXT NOT NULL DEFAULT 'Active Session',
      ip_origin TEXT NOT NULL DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_cases (
      case_id TEXT PRIMARY KEY,
      admission_id TEXT,
      user_id TEXT,
      patient_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      relative_name TEXT NOT NULL,
      relative_phone TEXT NOT NULL,
      blood_type TEXT NOT NULL,
      injury TEXT NOT NULL,
      location TEXT NOT NULL,
      hospital_id TEXT,
      hospital_name TEXT NOT NULL,
      hospital_phone TEXT NOT NULL,
      bed_bay TEXT NOT NULL,
      bed_type TEXT NOT NULL DEFAULT 'icu',
      specialist_name TEXT NOT NULL,
      vehicle_no TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_phone TEXT NOT NULL,
      eta_minutes INTEGER NOT NULL,
      current_street TEXT NOT NULL,
      lat REAL DEFAULT 19.1156,
      lng REAL DEFAULT 72.8521,
      target_location TEXT NOT NULL,
      pipeline_stage INTEGER NOT NULL DEFAULT 1,
      ambulance_service TEXT NOT NULL DEFAULT 'none',
      is_quick_intake INTEGER NOT NULL DEFAULT 0,
      insurance_claim_mode TEXT DEFAULT 'Cashless Insurance / PM-JAY',
      hold_expires_at TEXT,
      hold_status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL DEFAULT 'hosp-sevenhills',
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      specialty TEXT NOT NULL,
      dept TEXT NOT NULL,
      location TEXT NOT NULL,
      active_case TEXT DEFAULT 'No Active Case',
      avatar TEXT,
      phone TEXT DEFAULT '+91 22 6767 6767',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  try {
    const hospCols = db.prepare("PRAGMA table_info(hospitals)").all();
    const hospColNames = hospCols.map((c) => c.name);
    if (!hospColNames.includes("zone")) {
      db.exec("ALTER TABLE hospitals ADD COLUMN zone TEXT NOT NULL DEFAULT 'Andheri - Jogeshwari';");
    }
    if (!hospColNames.includes("nearest_station_id")) {
      db.exec("ALTER TABLE hospitals ADD COLUMN nearest_station_id TEXT NOT NULL DEFAULT 'andheri';");
    }
    if (!hospColNames.includes("address")) {
      db.exec("ALTER TABLE hospitals ADD COLUMN address TEXT NOT NULL DEFAULT '';");
    }
    if (!hospColNames.includes("is_government")) {
      db.exec("ALTER TABLE hospitals ADD COLUMN is_government INTEGER NOT NULL DEFAULT 0;");
    }
    if (!hospColNames.includes("has_24x7_emergency")) {
      db.exec("ALTER TABLE hospitals ADD COLUMN has_24x7_emergency INTEGER NOT NULL DEFAULT 1;");
    }
    const caseCols = db.prepare("PRAGMA table_info(emergency_cases)").all();
    const caseColNames = caseCols.map((c) => c.name);
    if (!caseColNames.includes("user_id")) {
      db.exec("ALTER TABLE emergency_cases ADD COLUMN user_id TEXT;");
    }
    if (!caseColNames.includes("hold_expires_at")) {
      db.exec("ALTER TABLE emergency_cases ADD COLUMN hold_expires_at TEXT;");
    }
    if (!caseColNames.includes("hold_status")) {
      db.exec("ALTER TABLE emergency_cases ADD COLUMN hold_status TEXT NOT NULL DEFAULT 'active';");
    }
    if (!caseColNames.includes("is_quick_intake")) {
      db.exec("ALTER TABLE emergency_cases ADD COLUMN is_quick_intake INTEGER NOT NULL DEFAULT 0;");
    }
    if (!caseColNames.includes("ambulance_service")) {
      db.exec("ALTER TABLE emergency_cases ADD COLUMN ambulance_service TEXT NOT NULL DEFAULT 'none';");
    }
    const admCols = db.prepare("PRAGMA table_info(admission_records)").all();
    const admColNames = admCols.map((c) => c.name);
    if (!admColNames.includes("user_id")) {
      db.exec("ALTER TABLE admission_records ADD COLUMN user_id TEXT;");
    }
    if (!admColNames.includes("is_unidentified")) {
      db.exec("ALTER TABLE admission_records ADD COLUMN is_unidentified INTEGER NOT NULL DEFAULT 0;");
    }
    if (!admColNames.includes("is_quick_intake")) {
      db.exec("ALTER TABLE admission_records ADD COLUMN is_quick_intake INTEGER NOT NULL DEFAULT 0;");
    }
  } catch (migErr) {
    console.warn("[Database] Migration notice:", migErr);
  }
  seedOrSyncDatabase();
}
function releaseExpiredHolds() {
  try {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const expiredCases = db.prepare(`
          SELECT * FROM emergency_cases
          WHERE hold_status = 'active' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?
        `).all(nowIso);
      for (const c of expiredCases) {
        if (c.hospital_id && c.bed_type) {
          const colMap = {
            icu: "icu_beds",
            trauma: "trauma_beds",
            vent: "vent_beds",
            oxygen: "oxygen_beds",
            burns: "burns_beds",
            general: "general_beds"
          };
          const col = colMap[c.bed_type] || "icu_beds";
          db.prepare(`UPDATE hospitals SET ${col} = ${col} + 1, updated_at = ? WHERE id = ?`).run(
            nowIso,
            c.hospital_id
          );
        }
        db.prepare(`UPDATE emergency_cases SET hold_status = 'expired', updated_at = ? WHERE case_id = ?`).run(
          nowIso,
          c.case_id
        );
        if (c.admission_id) {
          db.prepare(`
            UPDATE admission_records
            SET discharge_status = 'Pending Facility Hold', confirmed_hospital = 'Hold Expired - Please re-select', updated_at = ?
            WHERE id = ? AND discharge_status = 'Admitted / In Care'
          `).run(nowIso, c.admission_id);
        }
      }
      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }
  } catch (err) {
    console.warn("[Database] Error checking expired holds:", err);
  }
}
function seedOrSyncDatabase() {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO auth_users (id, role, username, password_hash, password_salt, name, hospital_id, vehicle_no, phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const adminHash = hashPassword("admin123");
  insertUser.run("usr-admin-1", "admin", "ADM-OPS-01", adminHash.hash, adminHash.salt, "Central Operations Officer", null, null, "+91 22 2262 0108", nowIso);
  const ambHash = hashPassword("9192");
  insertUser.run("usr-amb-1", "ambulance", "AMB-108-9192", ambHash.hash, ambHash.salt, "Ramesh Sawant (ALS Pilot)", null, "MH-02-ER-9192", "+91 98700 11223", nowIso);
  const nurseHash = hashPassword("123456");
  insertUser.run("usr-nurse-1", "nurse", "NS-7H-104", nurseHash.hash, nurseHash.salt, "Sister Sneha Kadam", "hosp-sevenhills", null, "+91 22 6767 6767", nowIso);
  insertUser.run("usr-nurse-2", "nurse", "NS-BH-101", nurseHash.hash, nurseHash.salt, "Sister Mary Dsouza", "hosp-bombay", null, "+91 22 2206 7676", nowIso);
  insertUser.run("usr-nurse-3", "nurse", "NS-LIL-101", nurseHash.hash, nurseHash.salt, "Sister Ananya Roy", "hosp-lilavati", null, "+91 22 2675 1000", nowIso);
  insertUser.run("usr-nurse-4", "nurse", "NS-NAN-101", nurseHash.hash, nurseHash.salt, "Sister Preeti Nair", "hosp-nanavati", null, "+91 22 2626 7500", nowIso);
  insertUser.run("usr-nurse-5", "nurse", "NS-SHAT-101", nurseHash.hash, nurseHash.salt, "Sister Kavita Shinde", "hosp-shatabdi-kandivali", null, "+91 22 2805 1141", nowIso);
  insertUser.run("usr-nurse-6", "nurse", "NS-CG-101", nurseHash.hash, nurseHash.salt, "Sister Rita Fernandes", "hosp-cardinal-gracias", null, "+91 250 232 2252", nowIso);
  try {
    let seedHospitals = Array.isArray(hospitals_seed_default) ? hospitals_seed_default : [];
    if (seedHospitals.length === 0) {
      const fallbackPath = path.resolve(process.cwd(), "server/data/hospitals.seed.json");
      if (fs.existsSync(fallbackPath)) {
        seedHospitals = JSON.parse(fs.readFileSync(fallbackPath, "utf-8"));
      }
    }
    const checkHospitalStmt = db.prepare("SELECT id FROM hospitals WHERE id = ?");
    const insertHospitalStmt = db.prepare(`
      INSERT INTO hospitals (
        id, name, zone, nearest_station_id, station_vicinity, address, distance_km, lat, lng, phone,
        is_government, has_24x7_emergency,
        icu_beds, trauma_beds, vent_beds, oxygen_beds, burns_beds, general_beds,
        blood_stock_json, specialists_json, cashless_pmjay, accepts_insurance,
        insurance_providers_json, tpa_desk_phone, capacity_percent,
        is_recommended, image_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateMetadataStmt = db.prepare(`
      UPDATE hospitals SET
        name = ?, zone = ?, nearest_station_id = ?, station_vicinity = ?, address = ?,
        lat = ?, lng = ?, phone = ?, is_government = ?, has_24x7_emergency = ?,
        specialists_json = ?, cashless_pmjay = ?, accepts_insurance = ?,
        insurance_providers_json = ?, tpa_desk_phone = ?, is_recommended = ?,
        image_url = COALESCE(NULLIF(?, ''), image_url)
      WHERE id = ?
    `);
    for (const h of seedHospitals) {
      const existing = checkHospitalStmt.get(h.id);
      if (!existing) {
        insertHospitalStmt.run(
          h.id,
          h.name,
          h.zone || "Andheri - Jogeshwari",
          h.nearestStationId || "andheri",
          h.stationVicinity || "Near Western Line",
          h.address || "",
          h.distanceKm || 1.5,
          h.lat || 19.1197,
          h.lng || 72.8464,
          h.phone || "+91 22 2820 0000",
          h.isGovernment ? 1 : 0,
          h.has24x7Emergency ? 1 : 0,
          h.icu ?? 6,
          h.trauma ?? 4,
          h.vent ?? 4,
          h.oxygen ?? 15,
          h.burns ?? 2,
          h.general ?? 30,
          JSON.stringify(h.bloodStock || { "O+": 10, "A+": 8, "B+": 10 }),
          JSON.stringify(h.specialists || ["Dr. Emergency Medical Officer"]),
          h.cashlessPMJAY ? 1 : 0,
          h.acceptsInsurance ? 1 : 0,
          JSON.stringify(h.insuranceProviders || ["PM-JAY"]),
          h.tpaDeskPhone || "",
          h.capacityPercent || 50,
          h.isRecommended ? 1 : 0,
          h.imageUrl || "",
          nowIso
        );
      } else {
        updateMetadataStmt.run(
          h.name,
          h.zone || "Andheri - Jogeshwari",
          h.nearestStationId || "andheri",
          h.stationVicinity || "Near Western Line",
          h.address || "",
          h.lat || 19.1197,
          h.lng || 72.8464,
          h.phone || "+91 22 2820 0000",
          h.isGovernment ? 1 : 0,
          h.has24x7Emergency ? 1 : 0,
          JSON.stringify(h.specialists || ["Dr. Emergency Medical Officer"]),
          h.cashlessPMJAY ? 1 : 0,
          h.acceptsInsurance ? 1 : 0,
          JSON.stringify(h.insuranceProviders || ["PM-JAY"]),
          h.tpaDeskPhone || "",
          h.isRecommended ? 1 : 0,
          h.imageUrl || "",
          h.id
        );
      }
    }
    console.log(`[Database] Synced ${seedHospitals.length} hospitals across Western Railway grid.`);
    const allHospitals = db.prepare("SELECT id, name, phone FROM hospitals ORDER BY id").all();
    for (const [index, hospital] of allHospitals.entries()) {
      const demoNumber = String(index + 1).padStart(3, "0");
      insertUser.run(
        `usr-nurse-demo-${demoNumber}`,
        "nurse",
        `NS-DEMO-${demoNumber}`,
        nurseHash.hash,
        nurseHash.salt,
        `Demo Nurse \u2014 ${hospital.name}`,
        hospital.id,
        null,
        hospital.phone || null,
        nowIso
      );
    }
  } catch (err) {
    console.warn("[Database] Could not seed hospitals from JSON:", err);
  }
  const docCount = db.prepare("SELECT COUNT(*) as c FROM doctors").get().c;
  if (docCount === 0) {
    const insertDoc = db.prepare(`
      INSERT INTO doctors (id, hospital_id, name, status, specialty, dept, location, active_case, avatar, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const initialDoctors = [
      {
        id: "doc1",
        hospital_id: "hosp-sevenhills",
        name: "Dr. Rohan Mehta",
        status: "AVAILABLE",
        specialty: "Trauma & Emergency Specialist",
        dept: "Emergency & Critical Care - MBBS, MD (Emergency Medicine)",
        location: "In Emergency Triage Bay",
        activeCase: "No Active Case",
        avatar: "",
        phone: "+91 22 6767 6701"
      },
      {
        id: "doc2",
        hospital_id: "hosp-sevenhills",
        name: "Dr. Anita Deshmukh",
        status: "AVAILABLE",
        specialty: "Vascular & Trauma Surgeon",
        dept: "Vascular Surgery - MS, MCh (Vascular)",
        location: "On standby for acute blood loss trauma",
        activeCase: "Available for Trauma consult",
        avatar: "",
        phone: "+91 22 6767 6702"
      },
      {
        id: "doc3",
        hospital_id: "hosp-sevenhills",
        name: "Dr. Vikramaditya Rao",
        status: "IN SURGERY",
        specialty: "Interventional Cardiologist",
        dept: "Cardiology & Cath Lab - MD, DM (Cardio)",
        location: "Cath Lab Room 2",
        activeCase: "In Surgery",
        avatar: "",
        phone: "+91 22 6767 6703"
      },
      {
        id: "doc4",
        hospital_id: "hosp-sevenhills",
        name: "Dr. Farhan Qureshi",
        status: "AVAILABLE",
        specialty: "Neurosurgeon",
        dept: "Neurosurgery - MS, MCh (Neurosurgery)",
        location: "Trauma ICU Floor 3",
        activeCase: "No Active Case",
        avatar: "",
        phone: "+91 22 6767 6704"
      },
      {
        id: "doc5",
        hospital_id: "hosp-bombay",
        name: "Dr. Sorabji Mehta",
        status: "AVAILABLE",
        specialty: "Senior Intensivist & Critical Care",
        dept: "Critical Care Unit",
        location: "ICU Triage",
        activeCase: "No Active Case",
        avatar: "",
        phone: "+91 22 2206 7679"
      }
    ];
    for (const d of initialDoctors) {
      insertDoc.run(d.id, d.hospital_id, d.name, d.status, d.specialty, d.dept, d.location, d.activeCase, d.avatar, d.phone, nowIso, nowIso);
    }
  }
}

// server/routes.ts
import { Router } from "express";
import crypto2 from "node:crypto";

// server/validators.ts
import { z } from "zod";
var indianPhoneRegex = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;
var LoginSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("admin"),
    username: z.string().trim().min(1, "Username is required"),
    passcode: z.string().trim().min(1, "Passcode is required")
  }),
  z.object({
    role: z.literal("nurse"),
    username: z.string().trim().min(1, "Staff ID is required"),
    passcode: z.string().trim().min(1, "Passcode is required"),
    hospitalId: z.string().trim().min(1, "Hospital is required").optional()
  }),
  z.object({
    role: z.literal("ambulance"),
    username: z.string().trim().min(1, "Driver Badge ID is required"),
    passcode: z.string().trim().min(1, "Passcode is required"),
    vehicleNo: z.string().trim().min(1, "Vehicle number is required").optional()
  }),
  z.object({
    role: z.literal("patient"),
    patientName: z.string().trim().min(1, "Please enter the patient's name (or select 'I don't know their name')"),
    relativeName: z.string().trim().min(1, "Please enter the attendant/contact person's name"),
    phone: z.string().trim().regex(indianPhoneRegex, "Please enter a valid 10-digit Indian phone number"),
    age: z.coerce.number().int("Age must be a whole number").min(0, "Age must be at least 0").max(120, "Age cannot exceed 120").nullable().optional(),
    gender: z.enum(["Female", "Male", "Other"]).nullable().optional(),
    bloodType: z.string().trim().default("Don't know"),
    nearestStation: z.string().trim().default("Andheri Station"),
    isUnidentified: z.boolean().optional().default(false),
    isQuickIntake: z.boolean().optional().default(false)
  })
]);
var BedCountUpdateSchema = z.object({
  icu: z.number().int().nonnegative().optional(),
  trauma: z.number().int().nonnegative().optional(),
  vent: z.number().int().nonnegative().optional(),
  oxygen: z.number().int().nonnegative().optional(),
  burns: z.number().int().nonnegative().optional(),
  general: z.number().int().nonnegative().optional()
});
var EmergencyHoldSchema = z.object({
  caseId: z.string().trim().min(1, "caseId is required"),
  admissionId: z.string().trim().min(1, "admissionId is required"),
  hospitalId: z.string().trim().min(1, "hospitalId is required"),
  bedBay: z.string().trim().min(1, "bedBay is required"),
  bedType: z.enum(["icu", "trauma", "vent", "oxygen", "burns", "general"]).default("icu"),
  insuranceClaimMode: z.string().trim().min(1, "Payment/insurance mode is required"),
  patientName: z.string().trim().optional(),
  age: z.coerce.number().int().min(0).max(120).optional(),
  gender: z.enum(["Female", "Male", "Other"]).optional(),
  bloodType: z.string().trim().optional(),
  relativeName: z.string().trim().optional(),
  relativePhone: z.string().trim().optional(),
  isQuickIntake: z.boolean().optional().default(false),
  ambulanceService: z.enum(["hospital", "private", "none"]).default("none")
});
var CancelHoldSchema = z.object({
  caseId: z.string().trim().min(1, "caseId is required")
});
var EmergencyResponseSchema = z.object({
  caseId: z.string().trim().min(1, "caseId is required"),
  decision: z.enum(["accept", "reject"])
});
var EmergencyStageSchema = z.object({
  caseId: z.string().trim().min(1),
  stage: z.number().int().min(1).max(5),
  street: z.string().trim().optional(),
  etaMinutes: z.number().int().nonnegative().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});
var EmergencyLocationSchema = z.object({
  caseId: z.string().trim().min(1),
  lat: z.number(),
  lng: z.number(),
  street: z.string().trim().optional(),
  etaMinutes: z.number().int().nonnegative().optional()
});
var DoctorStatusUpdateSchema = z.object({
  status: z.enum(["AVAILABLE", "IN SURGERY", "BUSY", "OFF DUTY", "ON CALL"]),
  location: z.string().trim().optional()
});
var CreateHospitalSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]+$/, "Hospital id must match /^[a-z0-9-]+$/").optional(),
  name: z.string().trim().min(1, "Hospital name is required"),
  zone: z.string().trim().default("Andheri - Jogeshwari"),
  nearestStationId: z.string().trim().default("andheri"),
  stationVicinity: z.string().trim().default("Near Western Line"),
  address: z.string().trim().default(""),
  distanceKm: z.number().optional().default(1.5),
  lat: z.number().optional().default(19.1197),
  lng: z.number().optional().default(72.8464),
  phone: z.string().trim().min(1, "Hospital phone is required"),
  isGovernment: z.boolean().optional().default(false),
  has24x7Emergency: z.boolean().optional().default(true),
  beds: BedCountUpdateSchema.optional(),
  bloodStock: z.record(z.string(), z.number()).optional(),
  specialists: z.array(z.string()).optional(),
  cashlessPMJAY: z.boolean().optional(),
  acceptsInsurance: z.boolean().optional(),
  insuranceProviders: z.array(z.string()).optional(),
  tpaDeskPhone: z.string().trim().optional(),
  capacityPercent: z.number().optional(),
  isRecommended: z.boolean().optional(),
  imageUrl: z.string().trim().optional()
});
var CreateAdmissionSchema = z.object({
  caseId: z.string().trim().optional(),
  patientName: z.string().trim().min(1, "Patient name is required"),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.enum(["Female", "Male", "Other"]),
  bloodType: z.string().trim().default("Don't know"),
  phone: z.string().trim().regex(indianPhoneRegex, "Valid 10-digit Indian phone required"),
  relativeName: z.string().trim().min(1, "Attendant name is required"),
  notes: z.string().trim().optional(),
  insuranceType: z.string().trim().optional(),
  isUnidentified: z.boolean().optional().default(false)
});
var AadhaarScanInputSchema = z.object({
  image: z.string().min(50, "Image payload must be a valid base64 data string")
});
var lenientString = z.preprocess(
  (v) => v === void 0 || v === null || String(v).trim() === "" ? null : String(v).trim(),
  z.string().nullable()
);
var AadhaarExtractedSchema = z.object({
  isAadhaarDetected: z.preprocess(
    (v) => typeof v === "boolean" ? v : v === void 0 || v === null ? true : String(v).toLowerCase() !== "false",
    z.boolean()
  ),
  patientName: lenientString,
  dob: lenientString,
  age: z.preprocess((v) => {
    if (v === void 0 || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return Number.isFinite(n) && n >= 0 && n <= 130 ? n : null;
  }, z.number().nullable()),
  gender: z.preprocess((v) => {
    if (v === void 0 || v === null || String(v).trim() === "") return null;
    const g = String(v).trim().toLowerCase();
    if (g.startsWith("f")) return "Female";
    if (g.startsWith("m")) return "Male";
    return "Other";
  }, z.enum(["Female", "Male", "Other"]).nullable()),
  aadhaarNumberMasked: lenientString,
  relativeName: lenientString,
  phone: lenientString,
  bloodType: lenientString,
  address: lenientString,
  nearestStation: lenientString
});

// server/routes.ts
import fs2 from "fs";
import path2 from "path";
var apiRouter = Router();
function safeJsonParse(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function computeTimeAgo(isoString) {
  const timestamp = new Date(isoString).getTime();
  if (isNaN(timestamp)) return "Recently";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1e3));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
function computeFreshMinutesAgo(isoString) {
  const timestamp = new Date(isoString).getTime();
  if (isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 6e4));
}
var BED_COLUMN_MAP = {
  icu: "icu_beds",
  trauma: "trauma_beds",
  vent: "vent_beds",
  oxygen: "oxygen_beds",
  burns: "burns_beds",
  general: "general_beds"
};
function doesPatientOwnCase(row, userId) {
  if (!row || !userId) return false;
  if (row.user_id === userId) return true;
  if (row.admission_id) {
    const adm = db.prepare("SELECT user_id FROM admission_records WHERE id = ?").get(row.admission_id);
    if (adm && adm.user_id === userId) return true;
  }
  return false;
}
function formatHospital(row) {
  const freshMinutesAgo = computeFreshMinutesAgo(row.updated_at);
  const isStale = freshMinutesAgo >= 15;
  return {
    id: row.id,
    name: row.name,
    zone: row.zone || "Andheri - Jogeshwari",
    nearestStationId: row.nearest_station_id || "andheri",
    stationVicinity: row.station_vicinity,
    address: row.address || "",
    distanceKm: row.distance_km,
    lat: Number(row.lat) || 19.1197,
    lng: Number(row.lng) || 72.8464,
    phone: row.phone,
    isGovernment: Boolean(row.is_government),
    has24x7Emergency: Boolean(row.has_24x7_emergency),
    beds: {
      icu: row.icu_beds,
      trauma: row.trauma_beds,
      vent: row.vent_beds,
      oxygen: row.oxygen_beds,
      burns: row.burns_beds,
      general: row.general_beds
    },
    bloodStock: safeJsonParse(row.blood_stock_json, {}),
    specialists: safeJsonParse(row.specialists_json, []),
    cashlessPMJAY: Boolean(row.cashless_pmjay),
    acceptsInsurance: Boolean(row.accepts_insurance),
    insuranceProviders: safeJsonParse(row.insurance_providers_json, []),
    tpaDeskPhone: row.tpa_desk_phone || "",
    capacityPercent: row.capacity_percent,
    freshMinutesAgo,
    isStale,
    isRecommended: Boolean(row.is_recommended),
    imageUrl: row.image_url || "",
    updatedAt: row.updated_at
  };
}
function formatAdmission(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    caseId: row.case_id || null,
    patientName: row.patient_name,
    age: row.is_quick_intake ? null : row.age,
    gender: row.is_quick_intake ? null : row.gender,
    bloodType: row.blood_type,
    phone: row.phone,
    relativeName: row.relative_name,
    loginIntakeTime: row.login_intake_time,
    intakeAgo: computeTimeAgo(row.login_intake_time),
    confirmedHospital: row.confirmed_hospital,
    confirmedBay: row.confirmed_bay || "",
    confirmationTime: row.confirmation_time || "Awaiting response",
    confirmationAgo: row.confirmation_time ? computeTimeAgo(row.confirmation_time) : "",
    dischargeStatus: row.discharge_status,
    dischargeTime: row.discharge_time || void 0,
    notes: row.notes || "",
    insuranceType: row.insurance_type || "PM-JAY / Cashless In Review",
    isUnidentified: Boolean(row.is_unidentified),
    isQuickIntake: Boolean(row.is_quick_intake),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function formatLog(row) {
  return {
    id: row.id,
    userAndContact: row.user_and_contact,
    role: row.role,
    facilityOrStation: row.facility_or_station,
    loginTimestamp: row.login_timestamp,
    timeAgo: computeTimeAgo(row.login_timestamp),
    sessionStatus: row.session_status,
    ipOrigin: row.ip_origin
  };
}
function formatEmergencyCase(row) {
  return {
    caseId: row.case_id,
    admissionId: row.admission_id || null,
    userId: row.user_id || null,
    patientName: row.patient_name,
    age: row.is_quick_intake ? null : row.age,
    gender: row.is_quick_intake ? null : row.gender,
    relativeName: row.relative_name,
    relativePhone: row.relative_phone,
    bloodType: row.blood_type,
    injury: row.injury,
    location: row.location,
    hospitalId: row.hospital_id || null,
    hospitalName: row.hospital_name,
    hospitalPhone: row.hospital_phone,
    bedBay: row.bed_bay,
    bedType: row.bed_type || "icu",
    specialistName: row.specialist_name,
    vehicleNo: row.vehicle_no,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    etaMinutes: row.eta_minutes,
    currentStreet: row.current_street,
    lat: row.lat !== null && row.lat !== void 0 ? Number(row.lat) : null,
    lng: row.lng !== null && row.lng !== void 0 ? Number(row.lng) : null,
    targetLocation: row.target_location,
    pipelineStage: row.pipeline_stage,
    ambulanceService: row.ambulance_service || "none",
    insuranceClaimMode: row.insurance_claim_mode,
    holdExpiresAt: row.hold_expires_at || null,
    holdStatus: row.hold_status || "active",
    isQuickIntake: Boolean(row.is_quick_intake),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function formatDoctor(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    name: row.name,
    status: row.status,
    specialty: row.specialty,
    dept: row.dept,
    location: row.location,
    activeCase: row.active_case,
    avatar: row.avatar,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
apiRouter.post("/auth/login", (req, res) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid credentials payload"
      });
    }
    const data = parseResult.data;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const clientIp = req.ip || "127.0.0.1";
    let userSession = null;
    let initialAdmissionId = null;
    if (data.role === "admin" || data.role === "nurse" || data.role === "ambulance") {
      const userRow = db.prepare("SELECT * FROM auth_users WHERE username = ? AND role = ?").get(data.username, data.role);
      if (!userRow) {
        return res.status(401).json({ success: false, error: "Invalid identifier or passcode." });
      }
      const isValid = verifyPassword(data.passcode, userRow.password_hash, userRow.password_salt);
      if (!isValid) {
        return res.status(401).json({ success: false, error: "Invalid identifier or passcode." });
      }
      if (data.role === "nurse") {
        if (data.hospitalId && data.hospitalId !== userRow.hospital_id) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: Nurse account '${userRow.username}' is assigned to '${userRow.hospital_id}', not '${data.hospitalId}'.`
          });
        }
      }
      if (data.role === "ambulance") {
        if (data.vehicleNo && data.vehicleNo !== userRow.vehicle_no) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: Ambulance badge '${userRow.username}' is assigned to vehicle '${userRow.vehicle_no}', not '${data.vehicleNo}'.`
          });
        }
      }
      userSession = {
        userId: userRow.id,
        role: userRow.role,
        name: userRow.name,
        badgeId: userRow.username,
        hospitalId: userRow.hospital_id || void 0,
        vehicleNo: userRow.vehicle_no || void 0
      };
      const logStmt = db.prepare(`
        INSERT INTO user_logs (id, user_and_contact, role, facility_or_station, login_timestamp, session_status, ip_origin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      logStmt.run(
        "LOG-" + crypto2.randomUUID(),
        `${userRow.name}
${userRow.phone || ""}`,
        userRow.role.toUpperCase(),
        userRow.hospital_id ? `Hospital: ${userRow.hospital_id}` : userRow.vehicle_no ? `Unit: ${userRow.vehicle_no}` : "Central Operations",
        nowIso,
        "Active Session",
        clientIp,
        nowIso
      );
    } else if (data.role === "patient") {
      const patientId = "PAT-" + crypto2.randomUUID();
      const admissionId = "PAT-INTAKE-" + crypto2.randomUUID();
      initialAdmissionId = admissionId;
      const isUnidentified = Boolean(data.isUnidentified || data.patientName === "Unknown patient");
      const patientDisplayName = isUnidentified ? "Unknown patient" : data.patientName;
      userSession = {
        userId: patientId,
        role: "patient",
        name: patientDisplayName,
        station: data.nearestStation,
        phone: data.phone,
        admissionId
      };
      const admStmt = db.prepare(`
        INSERT INTO admission_records (
          id, user_id, case_id, patient_name, age, gender, blood_type, phone, relative_name,
          login_intake_time, confirmed_hospital, confirmed_bay,
          confirmation_time, discharge_status, notes, insurance_type, is_unidentified, is_quick_intake, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      admStmt.run(
        admissionId,
        patientId,
        null,
        patientDisplayName,
        data.isQuickIntake ? 0 : data.age ?? 0,
        data.isQuickIntake ? "Not disclosed" : data.gender ?? "Not disclosed",
        data.bloodType,
        data.phone,
        data.relativeName,
        nowIso,
        "Pending Facility Hold",
        "",
        "",
        "Pending Facility Hold",
        `Emergency intake from ${data.nearestStation}`,
        "PM-JAY / Cashless In Review",
        isUnidentified ? 1 : 0,
        data.isQuickIntake ? 1 : 0,
        nowIso,
        nowIso
      );
      const logStmt = db.prepare(`
        INSERT INTO user_logs (id, user_and_contact, role, facility_or_station, login_timestamp, session_status, ip_origin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      logStmt.run(
        "LOG-" + crypto2.randomUUID(),
        `${patientDisplayName} (Contact: ${data.relativeName})
${data.phone}`,
        "PATIENT / ATTENDANT",
        `${data.nearestStation} Corridor`,
        nowIso,
        "Active Session",
        clientIp,
        nowIso
      );
    }
    const token = signToken(userSession);
    res.cookie("golden_hour_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1e3
    });
    res.clearCookie("saarthi_session");
    return res.json({
      success: true,
      token,
      user: userSession,
      admissionId: initialAdmissionId
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, error: err.message || "Authentication failed" });
  }
});
apiRouter.get("/auth/me", requireAuth, (req, res) => {
  const user = req.user;
  let currentAdmission = null;
  if (user.role === "patient") {
    currentAdmission = db.prepare("SELECT * FROM admission_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(user.userId);
  }
  return res.json({
    success: true,
    user,
    admission: currentAdmission ? formatAdmission(currentAdmission) : null
  });
});
apiRouter.post("/auth/logout", (req, res) => {
  res.clearCookie("golden_hour_session");
  res.clearCookie("saarthi_session");
  return res.json({ success: true, message: "Logged out successfully" });
});
apiRouter.get("/hospitals", (req, res) => {
  try {
    releaseExpiredHolds();
    const { insurance } = req.query;
    let query = "SELECT * FROM hospitals";
    const params = [];
    if (insurance === "insurance_only") {
      query += " WHERE accepts_insurance = 1";
    } else if (insurance === "cash_only") {
      query += " WHERE accepts_insurance = 0";
    }
    query += " ORDER BY distance_km ASC";
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    const hospitals = rows.map(formatHospital);
    return res.json({ success: true, count: hospitals.length, data: hospitals });
  } catch (err) {
    console.error("Error fetching hospitals:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/hospitals", requireRole("admin"), (req, res) => {
  try {
    const parseResult = CreateHospitalSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid hospital data"
      });
    }
    const h = parseResult.data;
    const id = h.id || "hosp-" + crypto2.randomUUID().slice(0, 8);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const existing = db.prepare("SELECT id FROM hospitals WHERE id = ?").get(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Hospital with id '${id}' already exists.`
      });
    }
    const stmt = db.prepare(`
      INSERT INTO hospitals (
        id, name, zone, nearest_station_id, station_vicinity, address, distance_km, lat, lng, phone,
        is_government, has_24x7_emergency,
        icu_beds, trauma_beds, vent_beds, oxygen_beds, burns_beds, general_beds,
        blood_stock_json, specialists_json, cashless_pmjay, accepts_insurance,
        insurance_providers_json, tpa_desk_phone, capacity_percent,
        is_recommended, image_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      h.name,
      h.zone,
      h.nearestStationId,
      h.stationVicinity,
      h.address,
      Number(h.distanceKm) || 1.5,
      Number(h.lat) || 19.1197,
      Number(h.lng) || 72.8464,
      h.phone,
      h.isGovernment ? 1 : 0,
      h.has24x7Emergency ? 1 : 0,
      Math.max(0, Number(h.beds?.icu) || 0),
      Math.max(0, Number(h.beds?.trauma) || 0),
      Math.max(0, Number(h.beds?.vent) || 0),
      Math.max(0, Number(h.beds?.oxygen) || 0),
      Math.max(0, Number(h.beds?.burns) || 0),
      Math.max(0, Number(h.beds?.general) || 0),
      JSON.stringify(h.bloodStock || { "O+": 10, "A+": 5 }),
      JSON.stringify(h.specialists || ["Dr. Emergency Medical Officer"]),
      h.cashlessPMJAY ? 1 : 0,
      h.acceptsInsurance ? 1 : 0,
      JSON.stringify(h.insuranceProviders || ["PM-JAY"]),
      h.tpaDeskPhone || "",
      Math.max(0, Math.min(100, Number(h.capacityPercent) || 50)),
      h.isRecommended ? 1 : 0,
      h.imageUrl || "",
      nowIso
    );
    const created = db.prepare("SELECT * FROM hospitals WHERE id = ?").get(id);
    return res.status(201).json({ success: true, data: formatHospital(created) });
  } catch (err) {
    console.error("Error creating hospital:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.patch("/hospitals/:id/beds", requireRole("nurse", "admin"), (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (user.role === "nurse" && (!user.hospitalId || user.hospitalId !== id)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Nurses can only update bed inventory for their assigned facility (${user.hospitalId}).`
      });
    }
    const parseResult = BedCountUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.issues[0]?.message || "Invalid bed counts" });
    }
    const { icu, trauma, vent, oxygen, burns, general } = parseResult.data;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const existing = db.prepare("SELECT * FROM hospitals WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Hospital not found." });
    }
    const stmt = db.prepare(`
      UPDATE hospitals SET
        icu_beds = COALESCE(?, icu_beds),
        trauma_beds = COALESCE(?, trauma_beds),
        vent_beds = COALESCE(?, vent_beds),
        oxygen_beds = COALESCE(?, oxygen_beds),
        burns_beds = COALESCE(?, burns_beds),
        general_beds = COALESCE(?, general_beds),
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      icu !== void 0 ? icu : null,
      trauma !== void 0 ? trauma : null,
      vent !== void 0 ? vent : null,
      oxygen !== void 0 ? oxygen : null,
      burns !== void 0 ? burns : null,
      general !== void 0 ? general : null,
      nowIso,
      id
    );
    const updated = db.prepare("SELECT * FROM hospitals WHERE id = ?").get(id);
    return res.json({ success: true, data: formatHospital(updated) });
  } catch (err) {
    console.error("Error updating hospital beds:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/admissions", requireAuth, (req, res) => {
  try {
    const user = req.user;
    let query = "SELECT * FROM admission_records";
    const params = [];
    if (user.role === "patient") {
      query += " WHERE user_id = ?";
      params.push(user.userId);
    } else if (user.role === "nurse") {
      if (user.hospitalId) {
        const hosp = db.prepare("SELECT name FROM hospitals WHERE id = ?").get(user.hospitalId);
        if (hosp) {
          query += " WHERE confirmed_hospital = ?";
          params.push(hosp.name);
        } else {
          return res.json({ success: true, count: 0, data: [] });
        }
      } else {
        return res.json({ success: true, count: 0, data: [] });
      }
    }
    query += " ORDER BY created_at DESC";
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    const admissions = rows.map(formatAdmission);
    return res.json({ success: true, count: admissions.length, data: admissions });
  } catch (err) {
    console.error("Error fetching admissions:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/admissions", requireAuth, (req, res) => {
  try {
    const parseResult = CreateAdmissionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid admission data"
      });
    }
    const a = parseResult.data;
    const user = req.user;
    const id = "PAT-INTAKE-" + crypto2.randomUUID();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const stmt = db.prepare(`
      INSERT INTO admission_records (
        id, user_id, case_id, patient_name, age, gender, blood_type, phone, relative_name,
        login_intake_time, confirmed_hospital, confirmed_bay,
          confirmation_time, discharge_status, notes, insurance_type, is_unidentified, is_quick_intake, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      user.userId || null,
      a.caseId || null,
      a.patientName,
      a.age,
      a.gender,
      a.bloodType,
      a.phone,
      a.relativeName,
      nowIso,
      "Pending Facility Hold",
      "",
      "",
      "Pending Facility Hold",
      a.notes || "Emergency intake from Western Line sector",
      a.insuranceType || "PM-JAY / Cashless In Review",
      a.isUnidentified ? 1 : 0,
      0,
      nowIso,
      nowIso
    );
    const created = db.prepare("SELECT * FROM admission_records WHERE id = ?").get(id);
    return res.status(201).json({ success: true, data: formatAdmission(created) });
  } catch (err) {
    console.error("Error registering patient admission:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/admissions/:id/discharge", requireRole("nurse", "admin"), (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const existingAdm = db.prepare("SELECT * FROM admission_records WHERE id = ?").get(id);
    if (!existingAdm) {
      return res.status(404).json({ success: false, error: "Admission record not found." });
    }
    if (user.role === "nurse") {
      const nurseHosp = user.hospitalId ? db.prepare("SELECT * FROM hospitals WHERE id = ?").get(user.hospitalId) : null;
      if (!nurseHosp || existingAdm.confirmed_hospital !== nurseHosp.name) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Nurses may only discharge admissions belonging to their assigned hospital."
        });
      }
    }
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        UPDATE admission_records SET
          discharge_status = 'Discharged',
          discharge_time = ?,
          notes = 'Patient stabilized and formally discharged by attending team.',
          updated_at = ?
        WHERE id = ?
      `).run(nowIso, nowIso, id);
      const linkedCases = db.prepare(`
          SELECT * FROM emergency_cases
          WHERE (admission_id = ? OR (? != '' AND case_id = ?))
            AND hold_status IN ('active', 'confirmed')
        `).all(id, existingAdm.case_id || "", existingAdm.case_id || "");
      for (const c of linkedCases) {
        if (c.hospital_id && c.bed_type) {
          const col = BED_COLUMN_MAP[c.bed_type] || "icu_beds";
          db.prepare(`UPDATE hospitals SET ${col} = ${col} + 1, updated_at = ? WHERE id = ?`).run(
            nowIso,
            c.hospital_id
          );
        }
        db.prepare(`
          UPDATE emergency_cases SET
            hold_status = 'completed',
            hold_expires_at = NULL,
            updated_at = ?
          WHERE case_id = ?
        `).run(nowIso, c.case_id);
      }
      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }
    const updated = db.prepare("SELECT * FROM admission_records WHERE id = ?").get(id);
    return res.json({ success: true, message: "Patient successfully discharged.", data: formatAdmission(updated) });
  } catch (err) {
    console.error("Error discharging patient:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/logs", requireRole("admin"), (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM user_logs ORDER BY created_at DESC LIMIT 100");
    const rows = stmt.all();
    const logs = rows.map(formatLog);
    return res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error("Error fetching logs:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/emergency/active", requireAuth, (req, res) => {
  try {
    releaseExpiredHolds();
    const user = req.user;
    const caseId = typeof req.query.caseId === "string" && req.query.caseId.trim() ? req.query.caseId.trim() : void 0;
    let row = null;
    if (caseId) {
      const candidate = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ? AND hold_status IN ('active', 'confirmed')").get(caseId);
      if (!candidate) {
        return res.status(404).json({ success: false, error: "No active emergency case found." });
      }
      if (user.role === "patient") {
        if (doesPatientOwnCase(candidate, user.userId)) {
          row = candidate;
        }
      } else if (user.role === "nurse") {
        if (user.hospitalId && candidate.hospital_id === user.hospitalId) {
          row = candidate;
        }
      } else if (user.role === "ambulance") {
        if (user.vehicleNo && candidate.vehicle_no === user.vehicleNo && candidate.ambulance_service !== "none") {
          row = candidate;
        }
      } else if (user.role === "admin") {
        row = candidate;
      }
    } else if (user.role === "patient") {
      row = db.prepare(`
          SELECT * FROM emergency_cases
          WHERE (user_id = ? OR admission_id IN (SELECT id FROM admission_records WHERE user_id = ?))
            AND hold_status IN ('active', 'confirmed')
          ORDER BY updated_at DESC LIMIT 1
        `).get(user.userId, user.userId);
    } else if (user.role === "nurse") {
      if (user.hospitalId) {
        row = db.prepare(`
            SELECT * FROM emergency_cases
            WHERE hospital_id = ? AND hold_status IN ('active', 'confirmed')
            ORDER BY updated_at DESC LIMIT 1
          `).get(user.hospitalId);
      }
    } else if (user.role === "ambulance") {
      if (user.vehicleNo) {
        row = db.prepare(`
            SELECT * FROM emergency_cases
            WHERE vehicle_no = ? AND ambulance_service != 'none' AND hold_status IN ('active', 'confirmed')
            ORDER BY updated_at DESC LIMIT 1
          `).get(user.vehicleNo);
      }
    } else if (user.role === "admin") {
      row = db.prepare(`
          SELECT * FROM emergency_cases
          WHERE hold_status IN ('active', 'confirmed')
          ORDER BY updated_at DESC LIMIT 1
        `).get();
    }
    if (!row) {
      return res.status(404).json({ success: false, error: "No active emergency case found." });
    }
    return res.json({ success: true, data: formatEmergencyCase(row) });
  } catch (err) {
    console.error("Error fetching active case:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/emergency/hold", requireRole("patient", "admin"), (req, res) => {
  try {
    releaseExpiredHolds();
    const user = req.user;
    const parseResult = EmergencyHoldSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid hold request payload"
      });
    }
    const {
      caseId,
      admissionId,
      hospitalId,
      bedBay,
      bedType,
      insuranceClaimMode,
      patientName,
      age,
      gender,
      bloodType,
      relativeName,
      relativePhone,
      isQuickIntake,
      ambulanceService
    } = parseResult.data;
    const bedCol = BED_COLUMN_MAP[bedType] || "icu_beds";
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const holdExpiresAt = new Date(Date.now() + 120 * 1e3).toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const admRow = db.prepare("SELECT * FROM admission_records WHERE id = ?").get(admissionId);
      if (!admRow) {
        db.exec("ROLLBACK;");
        return res.status(404).json({ success: false, error: "Admission record not found." });
      }
      if (user.role === "patient" && admRow.user_id !== user.userId) {
        db.exec("ROLLBACK;");
        return res.status(403).json({
          success: false,
          error: "Forbidden: admissionId does not belong to the logged-in patient."
        });
      }
      const existingCase = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
      if (existingCase) {
        if (user.role === "patient" && !doesPatientOwnCase(existingCase, user.userId)) {
          db.exec("ROLLBACK;");
          return res.status(403).json({
            success: false,
            error: "Forbidden: This emergency case belongs to another patient."
          });
        }
        if ((existingCase.hold_status === "active" || existingCase.hold_status === "confirmed") && existingCase.hospital_id && existingCase.bed_type) {
          const oldCol = BED_COLUMN_MAP[existingCase.bed_type] || "icu_beds";
          db.prepare(`UPDATE hospitals SET ${oldCol} = ${oldCol} + 1, updated_at = ? WHERE id = ?`).run(
            nowIso,
            existingCase.hospital_id
          );
        }
      }
      const hosp = db.prepare("SELECT * FROM hospitals WHERE id = ?").get(hospitalId);
      if (!hosp) {
        db.exec("ROLLBACK;");
        return res.status(404).json({ success: false, error: "Hospital not found." });
      }
      const availableCount = Number(hosp[bedCol]) || 0;
      if (availableCount <= 0) {
        db.exec("ROLLBACK;");
        return res.status(409).json({
          success: false,
          error: `No ${bedType.toUpperCase()} beds available at ${hosp.name}. Please select another facility.`
        });
      }
      db.prepare(`UPDATE hospitals SET ${bedCol} = ${bedCol} - 1, updated_at = ? WHERE id = ?`).run(
        nowIso,
        hospitalId
      );
      if (existingCase) {
        const updateCaseStmt = db.prepare(`
          UPDATE emergency_cases SET
            admission_id = COALESCE(?, admission_id),
            user_id = COALESCE(?, user_id),
            hospital_id = ?,
            hospital_name = ?,
            hospital_phone = ?,
            bed_bay = ?,
            bed_type = ?,
            insurance_claim_mode = ?,
            patient_name = COALESCE(?, patient_name),
            age = COALESCE(?, age),
            gender = COALESCE(?, gender),
            blood_type = COALESCE(?, blood_type),
            relative_name = COALESCE(?, relative_name),
            relative_phone = COALESCE(?, relative_phone),
            is_quick_intake = ?,
            ambulance_service = ?,
            hold_expires_at = ?,
            hold_status = 'active',
            updated_at = ?
          WHERE case_id = ?
        `);
        updateCaseStmt.run(
          admissionId,
          user.userId || null,
          hospitalId,
          hosp.name,
          hosp.phone,
          bedBay,
          bedType,
          insuranceClaimMode,
          patientName || null,
          age !== void 0 ? age : null,
          gender || null,
          bloodType || null,
          relativeName || null,
          relativePhone || null,
          isQuickIntake ? 1 : Boolean(admRow.is_quick_intake) ? 1 : 0,
          ambulanceService,
          holdExpiresAt,
          nowIso,
          caseId
        );
      } else {
        const insertCaseStmt = db.prepare(`
          INSERT INTO emergency_cases (
            case_id, admission_id, user_id, patient_name, age, gender, relative_name, relative_phone,
            blood_type, injury, location, hospital_id, hospital_name, hospital_phone, bed_bay, bed_type,
            specialist_name, vehicle_no, driver_name, driver_phone, eta_minutes,
            current_street, lat, lng, target_location, pipeline_stage, ambulance_service, insurance_claim_mode,
            hold_expires_at, hold_status, is_quick_intake, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertCaseStmt.run(
          caseId,
          admissionId,
          user.userId || admRow.user_id || null,
          patientName || admRow.patient_name || user.name || "Emergency Patient",
          isQuickIntake ? 0 : age !== void 0 ? age : admRow.age,
          isQuickIntake ? "Not disclosed" : gender ?? admRow.gender,
          relativeName || admRow.relative_name || "Attendant",
          relativePhone || admRow.phone || "+91 98201 00000",
          bloodType || admRow.blood_type || "Don't know",
          "Acute emergency condition requiring rapid admission",
          `Near ${user.station || "Western Line"} Sector`,
          hospitalId,
          hosp.name,
          hosp.phone,
          bedBay,
          bedType,
          safeJsonParse(hosp.specialists_json, ["Trauma Lead"])[0] || "Trauma Lead",
          "MH-02-ER-9192",
          "Ramesh Sawant (ALS Pilot)",
          "+91 98700 11223",
          4,
          `En route to ${hosp.name} emergency ramp`,
          hosp.lat || 19.1197,
          hosp.lng || 72.8464,
          `${hosp.name} Emergency Bay`,
          1,
          ambulanceService,
          insuranceClaimMode,
          holdExpiresAt,
          "active",
          isQuickIntake ? 1 : Boolean(admRow.is_quick_intake) ? 1 : 0,
          nowIso,
          nowIso
        );
      }
      const updateAdmStmt = db.prepare(`
        UPDATE admission_records SET
          case_id = ?,
          confirmed_hospital = ?,
          confirmed_bay = ?,
          confirmation_time = ?,
          discharge_status = 'Admitted / In Care',
          notes = ?,
          insurance_type = ?,
          updated_at = ?
        WHERE id = ?
      `);
      updateAdmStmt.run(
        caseId,
        hosp.name,
        bedBay,
        nowIso,
        `Bed locked via Golden Hour (${hosp.name}) - ${insuranceClaimMode}`,
        insuranceClaimMode,
        nowIso,
        admissionId
      );
      db.exec("COMMIT;");
      const updatedCase = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
      return res.json({ success: true, data: formatEmergencyCase(updatedCase) });
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }
  } catch (err) {
    console.error("Error reserving bed in transaction:", err);
    return res.status(500).json({ success: false, error: err.message || "Bed reservation transaction failed" });
  }
});
apiRouter.post("/emergency/respond", requireRole("nurse", "admin"), (req, res) => {
  try {
    releaseExpiredHolds();
    const parsed = EmergencyResponseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "A case and decision are required." });
    const user = req.user;
    const { caseId, decision } = parsed.data;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ? AND hold_status = 'active'").get(caseId);
      if (!existing) {
        db.exec("ROLLBACK;");
        return res.status(409).json({ success: false, error: "This request is no longer awaiting a hospital response." });
      }
      if (user.role === "nurse" && existing.hospital_id !== user.hospitalId) {
        db.exec("ROLLBACK;");
        return res.status(403).json({ success: false, error: "You can respond only for your assigned hospital." });
      }
      if (decision === "accept") {
        db.prepare("UPDATE emergency_cases SET hold_status = 'confirmed', hold_expires_at = NULL, updated_at = ? WHERE case_id = ?").run(nowIso, caseId);
        db.exec("COMMIT;");
        const updated2 = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
        return res.json({ success: true, message: "Bed accepted and held for the inbound ambulance.", data: formatEmergencyCase(updated2) });
      }
      const bedCol = BED_COLUMN_MAP[existing.bed_type] || "icu_beds";
      db.prepare(`UPDATE hospitals SET ${bedCol} = ${bedCol} + 1, updated_at = ? WHERE id = ?`).run(nowIso, existing.hospital_id);
      const next = db.prepare(`SELECT * FROM hospitals WHERE id != ? AND ${bedCol} > 0 ORDER BY updated_at DESC, capacity_percent ASC LIMIT 1`).get(existing.hospital_id);
      if (!next) {
        db.prepare("UPDATE emergency_cases SET hold_status = 'rejected', hold_expires_at = NULL, updated_at = ? WHERE case_id = ?").run(nowIso, caseId);
        db.exec("COMMIT;");
        return res.json({ success: true, message: "Facility declined. No matching alternative is currently available.", data: null });
      }
      db.prepare(`UPDATE hospitals SET ${bedCol} = ${bedCol} - 1, updated_at = ? WHERE id = ?`).run(nowIso, next.id);
      const expires = new Date(Date.now() + 12e4).toISOString();
      db.prepare(`UPDATE emergency_cases SET hospital_id = ?, hospital_name = ?, hospital_phone = ?, bed_bay = ?, hold_status = 'active', hold_expires_at = ?, updated_at = ? WHERE case_id = ?`).run(next.id, next.name, next.phone, `${String(existing.bed_type).toUpperCase()} Bay #01`, expires, nowIso, caseId);
      db.prepare(`UPDATE admission_records SET confirmed_hospital = ?, confirmed_bay = ?, confirmation_time = '', notes = ?, updated_at = ? WHERE id = ?`).run(next.name, `${String(existing.bed_type).toUpperCase()} Bay #01`, `Previous facility declined; automatically offered to ${next.name}.`, nowIso, existing.admission_id);
      db.exec("COMMIT;");
      const updated = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
      return res.json({ success: true, message: `Facility declined. Hold automatically offered to ${next.name}.`, data: formatEmergencyCase(updated) });
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Could not record the hospital response." });
  }
});
apiRouter.post("/emergency/cancel-hold", requireAuth, (req, res) => {
  try {
    const parseResult = CancelHoldSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: "caseId is required to cancel reservation" });
    }
    const { caseId } = parseResult.data;
    const user = req.user;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
      if (!existing) {
        db.exec("ROLLBACK;");
        return res.status(404).json({ success: false, error: "Reservation case not found" });
      }
      let isAuthorized = false;
      if (user.role === "admin") {
        isAuthorized = true;
      } else if (user.role === "patient") {
        isAuthorized = doesPatientOwnCase(existing, user.userId);
      } else if (user.role === "nurse") {
        isAuthorized = Boolean(user.hospitalId && existing.hospital_id === user.hospitalId);
      }
      if (!isAuthorized) {
        db.exec("ROLLBACK;");
        return res.status(403).json({
          success: false,
          error: "Forbidden: You are not authorized to cancel this emergency reservation."
        });
      }
      if ((existing.hold_status === "active" || existing.hold_status === "confirmed") && existing.hospital_id && existing.bed_type) {
        const col = BED_COLUMN_MAP[existing.bed_type] || "icu_beds";
        db.prepare(`UPDATE hospitals SET ${col} = ${col} + 1, updated_at = ? WHERE id = ?`).run(
          nowIso,
          existing.hospital_id
        );
      }
      db.prepare(`
        UPDATE emergency_cases SET
          hold_status = 'cancelled',
          hold_expires_at = NULL,
          updated_at = ?
        WHERE case_id = ?
      `).run(nowIso, caseId);
      if (existing.admission_id) {
        db.prepare(`
          UPDATE admission_records SET
            discharge_status = 'Pending Facility Hold',
            confirmed_hospital = 'Pending Facility Hold',
            confirmed_bay = '',
            confirmation_time = '',
            notes = 'Bed reservation cancelled by patient / attendant.',
            updated_at = ?
          WHERE id = ?
        `).run(nowIso, existing.admission_id);
      }
      db.exec("COMMIT;");
      return res.json({ success: true, message: "Reservation cancelled and bed released." });
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }
  } catch (err) {
    console.error("Cancel hold error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to cancel hold" });
  }
});
apiRouter.patch("/emergency/stage", requireRole("ambulance", "admin"), (req, res) => {
  try {
    const parseResult = EmergencyStageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid stage data"
      });
    }
    const { caseId, stage, street, etaMinutes, lat, lng } = parseResult.data;
    const user = req.user;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const existing = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Emergency case not found" });
    }
    if (user.role === "ambulance" && existing.vehicle_no !== user.vehicleNo) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Ambulance pilots may only update cases assigned to their vehicle."
      });
    }
    if (user.role === "ambulance" && existing.ambulance_service === "none") {
      return res.status(409).json({ success: false, error: "No ambulance service was requested for this reservation." });
    }
    if (stage < existing.pipeline_stage) {
      return res.status(409).json({
        success: false,
        error: `Dispatch progression cannot move backwards (currently at stage ${existing.pipeline_stage}).`
      });
    }
    const shouldConfirmHold = stage >= 2 && (existing.hold_status === "active" || existing.hold_status === "confirmed");
    const newHoldStatus = shouldConfirmHold ? "confirmed" : existing.hold_status;
    const newHoldExpiresAt = shouldConfirmHold ? null : existing.hold_expires_at;
    const stmt = db.prepare(`
      UPDATE emergency_cases SET
        pipeline_stage = ?,
        current_street = COALESCE(?, current_street),
        eta_minutes = COALESCE(?, eta_minutes),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        hold_status = ?,
        hold_expires_at = ?,
        updated_at = ?
      WHERE case_id = ?
    `);
    stmt.run(
      stage,
      street || null,
      etaMinutes !== void 0 ? etaMinutes : null,
      lat !== void 0 ? lat : null,
      lng !== void 0 ? lng : null,
      newHoldStatus,
      newHoldExpiresAt,
      nowIso,
      caseId
    );
    const updated = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
    return res.json({ success: true, data: formatEmergencyCase(updated) });
  } catch (err) {
    console.error("Error updating emergency stage:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.patch("/emergency/location", requireRole("ambulance", "admin"), (req, res) => {
  try {
    const parseResult = EmergencyLocationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid location telemetry data"
      });
    }
    const { caseId, lat, lng, street, etaMinutes } = parseResult.data;
    const user = req.user;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const existing = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Emergency case not found" });
    }
    if (user.role === "ambulance" && existing.vehicle_no !== user.vehicleNo) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Ambulance pilots may only update telemetry for cases assigned to their vehicle."
      });
    }
    if (user.role === "ambulance" && existing.ambulance_service === "none") {
      return res.status(409).json({ success: false, error: "No ambulance service was requested for this reservation." });
    }
    const shouldConfirmHold = existing.hold_status === "active" || existing.hold_status === "confirmed";
    const newHoldStatus = shouldConfirmHold ? "confirmed" : existing.hold_status;
    const newHoldExpiresAt = shouldConfirmHold ? null : existing.hold_expires_at;
    const stmt = db.prepare(`
      UPDATE emergency_cases SET
        lat = ?,
        lng = ?,
        current_street = COALESCE(?, current_street),
        eta_minutes = COALESCE(?, eta_minutes),
        hold_status = ?,
        hold_expires_at = ?,
        updated_at = ?
      WHERE case_id = ?
    `);
    stmt.run(
      lat,
      lng,
      street || null,
      etaMinutes !== void 0 ? etaMinutes : null,
      newHoldStatus,
      newHoldExpiresAt,
      nowIso,
      caseId
    );
    const updated = db.prepare("SELECT * FROM emergency_cases WHERE case_id = ?").get(caseId);
    return res.json({ success: true, data: formatEmergencyCase(updated) });
  } catch (err) {
    console.error("Error updating emergency location:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/doctors", requireAuth, (req, res) => {
  try {
    const { hospitalId } = req.query;
    let query = "SELECT * FROM doctors";
    const params = [];
    if (hospitalId) {
      query += " WHERE hospital_id = ?";
      params.push(hospitalId);
    }
    query += " ORDER BY name ASC";
    const rows = db.prepare(query).all(...params);
    return res.json({ success: true, data: rows.map(formatDoctor) });
  } catch (err) {
    console.error("Error fetching doctors:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.patch("/doctors/:id/status", requireRole("nurse", "admin"), (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const parseResult = DoctorStatusUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid doctor status. Allowed values: AVAILABLE, IN SURGERY, BUSY, OFF DUTY, ON CALL."
      });
    }
    const existing = db.prepare("SELECT * FROM doctors WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Doctor not found." });
    }
    if (user.role === "nurse" && existing.hospital_id !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Nurses may only update status for doctors assigned to their own hospital."
      });
    }
    const { status, location } = parseResult.data;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const stmt = db.prepare(`
      UPDATE doctors SET
        status = ?,
        location = COALESCE(?, location),
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, location || null, nowIso, id);
    const updated = db.prepare("SELECT * FROM doctors WHERE id = ?").get(id);
    return res.json({ success: true, data: formatDoctor(updated) });
  } catch (err) {
    console.error("Error updating doctor status:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/db/status", requireRole("admin"), (req, res) => {
  try {
    const dataDir2 = path2.resolve(process.cwd(), "data");
    const dbPath2 = path2.join(dataDir2, "golden_hour.db");
    let dbSizeKb = 0;
    if (fs2.existsSync(dbPath2)) {
      const stats = fs2.statSync(dbPath2);
      dbSizeKb = Math.round(stats.size / 1024);
    }
    const hospitalCount = db.prepare("SELECT COUNT(*) as c FROM hospitals").get().c;
    const admissionsCount = db.prepare("SELECT COUNT(*) as c FROM admission_records").get().c;
    const logsCount = db.prepare("SELECT COUNT(*) as c FROM user_logs").get().c;
    const doctorsCount = db.prepare("SELECT COUNT(*) as c FROM doctors").get().c;
    const casesCount = db.prepare("SELECT COUNT(*) as c FROM emergency_cases").get().c;
    const usersCount = db.prepare("SELECT COUNT(*) as c FROM auth_users").get().c;
    const journalMode = db.prepare("PRAGMA journal_mode").get().journal_mode;
    return res.json({
      success: true,
      data: {
        engine: "SQLite 3 (Node.js 22 native DatabaseSync)",
        databaseFile: dbPath2,
        sizeKb: dbSizeKb,
        journalMode,
        tables: {
          hospitals: hospitalCount,
          admission_records: admissionsCount,
          user_logs: logsCount,
          doctors: doctorsCount,
          emergency_cases: casesCount,
          auth_users: usersCount
        },
        nodeVersion: process.version,
        serverUptimeSec: Math.round(process.uptime()),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (err) {
    console.error("Error fetching DB status:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/db/query", requireRole("admin"), (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ success: false, error: "SQL query string is required." });
    }
    const trimmed = query.trim();
    const withoutTrailingSemi = trimmed.replace(/;+\s*$/, "");
    if (withoutTrailingSemi.includes(";")) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Multiple SQL statements are not allowed."
      });
    }
    if (/\b(auth_users|password_hash|password_salt|sqlite_master|sqlite_schema|sqlite_temp_master)\b/i.test(withoutTrailingSemi)) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Queries referencing auth_users or credential columns are restricted."
      });
    }
    const isReadOnly = /^(SELECT|EXPLAIN|PRAGMA\s+table_info|PRAGMA\s+database_list|PRAGMA\s+journal_mode)/i.test(
      withoutTrailingSemi
    );
    const hasForbiddenKeywords = /\b(DROP|DELETE|INSERT|UPDATE|ALTER|TRUNCATE|ATTACH|DETACH|CREATE|REPLACE|VACUUM|PRAGMA\s+writable_schema)\b/i.test(
      withoutTrailingSemi
    );
    if (!isReadOnly || hasForbiddenKeywords) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: The SQL runner is strictly read-only. Data modification and DDL statements are disabled."
      });
    }
    const startTime = performance.now();
    const stmt = db.prepare(withoutTrailingSemi);
    const rows = stmt.all();
    const executionMs = Math.round((performance.now() - startTime) * 100) / 100;
    return res.json({
      success: true,
      type: "SELECT",
      rowCount: rows.length,
      executionMs,
      rows
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});
apiRouter.post("/db/reset", requireRole("admin"), (req, res) => {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DB_RESET !== "true") {
    return res.status(403).json({
      success: false,
      error: "Database reset is restricted. Set ALLOW_DB_RESET=true in non-production environments."
    });
  }
  try {
    db.exec(`
      DROP TABLE IF EXISTS auth_users;
      DROP TABLE IF EXISTS hospitals;
      DROP TABLE IF EXISTS admission_records;
      DROP TABLE IF EXISTS user_logs;
      DROP TABLE IF EXISTS emergency_cases;
      DROP TABLE IF EXISTS doctors;
    `);
    initDatabase();
    return res.json({ success: true, message: "Database reset and seeded with default data." });
  } catch (err) {
    console.error("Error resetting DB:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.get("/db/export", requireRole("admin"), (req, res) => {
  try {
    const hospitals = db.prepare("SELECT * FROM hospitals").all();
    const admissions = db.prepare("SELECT * FROM admission_records").all();
    const logs = db.prepare("SELECT * FROM user_logs").all();
    const cases = db.prepare("SELECT * FROM emergency_cases").all();
    const doctors = db.prepare("SELECT * FROM doctors").all();
    const users = db.prepare("SELECT id, role, username, name, hospital_id, vehicle_no, created_at FROM auth_users").all();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="golden_hour_backup.json"');
    return res.json({
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      engine: "SQLite 3 / Node.js 22",
      tables: {
        hospitals,
        admissions,
        logs,
        cases,
        doctors,
        users
      }
    });
  } catch (err) {
    console.error("Error exporting DB:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// src/data/stations.ts
var WESTERN_LINE_STATIONS = [
  { id: "churchgate", name: "Churchgate Station", lat: 18.9322, lng: 72.8264, zone: "South Mumbai" },
  { id: "marine-lines", name: "Marine Lines Station", lat: 18.9447, lng: 72.8236, zone: "South Mumbai" },
  { id: "charni-road", name: "Charni Road Station", lat: 18.9519, lng: 72.8193, zone: "South Mumbai" },
  { id: "grant-road", name: "Grant Road Station", lat: 18.9633, lng: 72.8159, zone: "South Mumbai" },
  { id: "mumbai-central", name: "Mumbai Central Station", lat: 18.9712, lng: 72.8197, zone: "Mumbai Central - Parel" },
  { id: "mahalaxmi", name: "Mahalaxmi Station", lat: 18.9827, lng: 72.8242, zone: "Mumbai Central - Parel" },
  { id: "lower-parel", name: "Lower Parel Station", lat: 18.9953, lng: 72.8306, zone: "Mumbai Central - Parel" },
  { id: "prabhadevi", name: "Prabhadevi Station", lat: 19.0146, lng: 72.829, zone: "Mumbai Central - Parel" },
  { id: "dadar", name: "Dadar Station", lat: 19.0178, lng: 72.8478, zone: "Dadar - Mahim" },
  { id: "matunga-road", name: "Matunga Road Station", lat: 19.0289, lng: 72.8427, zone: "Dadar - Mahim" },
  { id: "mahim", name: "Mahim Station", lat: 19.041, lng: 72.8422, zone: "Dadar - Mahim" },
  { id: "bandra", name: "Bandra Station", lat: 19.0544, lng: 72.8402, zone: "Bandra - Khar" },
  { id: "khar-road", name: "Khar Road Station", lat: 19.0694, lng: 72.8384, zone: "Bandra - Khar" },
  { id: "santacruz", name: "Santacruz Station", lat: 19.0818, lng: 72.8409, zone: "Santacruz - Vile Parle" },
  { id: "vile-parle", name: "Vile Parle Station", lat: 19.0998, lng: 72.8438, zone: "Santacruz - Vile Parle" },
  { id: "andheri", name: "Andheri Station", lat: 19.1197, lng: 72.8464, zone: "Andheri - Jogeshwari" },
  { id: "jogeshwari", name: "Jogeshwari Station", lat: 19.1362, lng: 72.8489, zone: "Andheri - Jogeshwari" },
  { id: "ram-mandir", name: "Ram Mandir Station", lat: 19.1517, lng: 72.8503, zone: "Andheri - Jogeshwari" },
  { id: "goregaon", name: "Goregaon Station", lat: 19.1648, lng: 72.8492, zone: "Goregaon - Malad" },
  { id: "malad", name: "Malad Station", lat: 19.186, lng: 72.8486, zone: "Goregaon - Malad" },
  { id: "kandivali", name: "Kandivali Station", lat: 19.2045, lng: 72.8522, zone: "Kandivali - Borivali - Dahisar" },
  { id: "borivali", name: "Borivali Station", lat: 19.229, lng: 72.8573, zone: "Kandivali - Borivali - Dahisar" },
  { id: "dahisar", name: "Dahisar Station", lat: 19.2503, lng: 72.8592, zone: "Kandivali - Borivali - Dahisar" },
  { id: "mira-road", name: "Mira Road Station", lat: 19.2812, lng: 72.8559, zone: "Mira Road - Bhayandar" },
  { id: "bhayandar", name: "Bhayandar Station", lat: 19.3082, lng: 72.852, zone: "Mira Road - Bhayandar" },
  { id: "naigaon", name: "Naigaon Station", lat: 19.3512, lng: 72.8468, zone: "Vasai - Nallasopara - Virar" },
  { id: "vasai-road", name: "Vasai Road Station", lat: 19.3807, lng: 72.8322, zone: "Vasai - Nallasopara - Virar" },
  { id: "nallasopara", name: "Nallasopara Station", lat: 19.4182, lng: 72.8196, zone: "Vasai - Nallasopara - Virar" },
  { id: "virar", name: "Virar Station", lat: 19.4552, lng: 72.8115, zone: "Vasai - Nallasopara - Virar" }
];
var WESTERN_STATION_NAMES = WESTERN_LINE_STATIONS.map((s) => s.name);
var WESTERN_STATIONS_MAP = Object.fromEntries(
  WESTERN_LINE_STATIONS.map((s) => [s.name, s])
);
var WESTERN_STATIONS_BY_ID = Object.fromEntries(
  WESTERN_LINE_STATIONS.map((s) => [s.id, s])
);

// server.ts
dotenv.config();
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.set("trust proxy", 1);
initDatabase();
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? void 0 : false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        process.env.APP_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000"
      ].filter((o) => Boolean(o));
      if (allowedOrigins.some((o) => origin === o)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
var generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later." }
});
app.use("/api", generalLimiter);
var authLimiter = rateLimit({
  windowMs: 5 * 60 * 1e3,
  max: (req) => {
    const role = req.body?.role;
    if (role === "patient") return 60;
    return 10;
  },
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip || "127.0.0.1");
    const role = req.body?.role;
    if (role === "patient") {
      return `patient:${ip}`;
    }
    const identifier = String(req.body?.username || "anon").trim().toLowerCase();
    return `staff:${ip}:${identifier}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many login attempts. Please wait 5 minutes." }
});
app.use("/api/auth/login", authLimiter);
var ocrLimiter = rateLimit({
  windowMs: 10 * 60 * 1e3,
  max: 12,
  keyGenerator: (req) => ipKeyGenerator(req.ip || "127.0.0.1"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many document scan requests. Please wait a few minutes before trying again." }
});
app.use("/api", apiRouter);
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Golden Hour Emergency Grid",
    database: "SQLite 3 (Node.js native DatabaseSync)",
    serverTime: (/* @__PURE__ */ new Date()).toISOString()
  });
});
function extractBase64Data(raw) {
  if (raw.startsWith("data:")) {
    const parts = raw.split(";base64,");
    const mime = parts[0].replace("data:", "") || "image/jpeg";
    return { mimeType: mime, base64: parts[1] || "" };
  }
  return { mimeType: "image/jpeg", base64: raw };
}
app.post("/api/scan-aadhaar", ocrLimiter, async (req, res) => {
  try {
    const parseResult = AadhaarScanInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: "Invalid image payload." });
    }
    const { mimeType, base64 } = extractBase64Data(parseResult.data.image);
    if (!base64 || base64.length < 50) {
      return res.status(400).json({ success: false, error: "Invalid or empty image payload." });
    }
    const supportedImageTypes = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!supportedImageTypes.has(mimeType)) {
      return res.status(400).json({ success: false, error: "Please upload a JPEG, PNG, or WEBP Aadhaar image." });
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return res.status(400).json({ success: false, error: "The uploaded image data is malformed. Please choose the image again." });
    }
    const decodedByteLength = Buffer.from(base64, "base64").byteLength;
    if (decodedByteLength > 3 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: "Image size exceeds the 3 MB limit. Please upload a smaller image."
      });
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      return res.status(503).json({
        success: false,
        error: "Aadhaar OCR service is currently unavailable (GEMINI_API_KEY is not configured). Please enter details manually."
      });
    }
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const systemPrompt = `You are a high-precision, strict OCR extraction system for Indian Government Aadhaar identity cards.
RULES FOR DATA INTEGRITY - CRITICAL:
1. NEVER invent, fabricate, guess, or estimate any data.
2. If a field is not clearly visible or not printed on the document, you MUST return null for that field. Do NOT provide defaults.
3. NEVER guess blood group. If not printed, return null.
4. NEVER invent a family member or relative. If not printed in "C/O:", "S/O:", "D/O:", "W/O:", return null.
5. If Date of Birth (DOB) is printed, extract it as "DD/MM/YYYY" or "YYYY". Calculate age based on current year ${currentYear}. If DOB is absent, age MUST be null.
6. Mask the 12-digit Aadhaar number to ONLY the last 4 digits in format "XXXX XXXX 1234". NEVER reveal or output the full 12 digits.
7. Map address to the nearest Western Railway station from this list ONLY if the locality or pin code matches: ${WESTERN_LINE_STATIONS.map((s) => `"${s.name}"`).join(", ")}. If unable to map accurately, return null.
 
Return ONLY valid JSON matching this schema:
{
  "isAadhaarDetected": boolean,
  "patientName": string | null,
  "dob": string | null,
  "age": number | null,
  "gender": "Female" | "Male" | "Other" | null,
  "aadhaarNumberMasked": string | null,
  "relativeName": string | null,
  "phone": string | null,
  "bloodType": string | null,
  "address": string | null,
  "nearestStation": string | null
}`;
    const candidateModels = Array.from(
      new Set(
        [
          process.env.GEMINI_OCR_MODEL?.trim(),
          "gemini-3.8-flash",
          "gemini-3.6-flash",
          "gemini-3.5-flash-lite",
          "gemini-2.5-flash"
        ].filter(Boolean)
      )
    );
    const isTransient = (e) => {
      const st = Number(e?.status);
      return !st || [408, 429, 500, 502, 503, 504].includes(st);
    };
    let response = null;
    let lastErr = null;
    const deadline = Date.now() + 6e4;
    const PER_CALL_TIMEOUT_MS = 25e3;
    outer: for (const modelName of candidateModels) {
      if (Date.now() > deadline) break;
      try {
        const remaining = deadline - Date.now();
        if (remaining < 3e3) break outer;
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } },
                { text: systemPrompt }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 2048,
            abortSignal: AbortSignal.timeout(Math.min(PER_CALL_TIMEOUT_MS, remaining))
          }
        });
        console.log(`Aadhaar scan used model: ${modelName}`);
        break outer;
      } catch (e) {
        lastErr = e;
        console.error(`Model "${modelName}" failed:`, e?.status, String(e?.message || e).slice(0, 400));
        if (!isTransient(e) && Number(e?.status) !== 404) throw e;
      }
    }
    if (!response) throw lastErr;
    const text = response.text?.trim() || "";
    if (!text) {
      const reason = response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason || "unknown";
      throw new Error(`No response received from OCR vision model (reason: ${reason})`);
    }
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      parsedJson = JSON.parse(cleaned);
    }
    if (Array.isArray(parsedJson)) parsedJson = parsedJson[0];
    const validatedData = AadhaarExtractedSchema.parse(parsedJson);
    if (validatedData.aadhaarNumberMasked) {
      const digits = validatedData.aadhaarNumberMasked.replace(/\D/g, "");
      const last4 = digits.slice(-4);
      validatedData.aadhaarNumberMasked = last4.length === 4 ? `XXXX XXXX ${last4}` : null;
    }
    return res.json({ success: true, data: validatedData });
  } catch (err) {
    console.error("AADHAAR SCAN ERROR:", {
      name: err?.name,
      status: err?.status,
      message: String(err?.message || err).slice(0, 800),
      zodIssues: err?.issues
    });
    const status = Number(err?.status);
    if (status === 429) {
      return res.status(429).json({ success: false, error: "Gemini quota/rate limit reached. Please wait a minute and try again, or enter details manually." });
    }
    if (status === 503 || status === 504) {
      return res.status(503).json({ success: false, error: "Gemini is temporarily overloaded. Please tap scan again in a few seconds." });
    }
    if (err?.name === "AbortError" || /timed?\s*out/i.test(String(err?.message || ""))) {
      return res.status(504).json({ success: false, error: "The document reader took too long. Please retry once; if it persists, enter the details manually." });
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ success: false, error: "Gemini rejected the API key or access (check GEMINI_API_KEY and project permissions)." });
    }
    if (status === 404) {
      return res.status(502).json({ success: false, error: "None of the Gemini models tried are available to this API key. Set GEMINI_OCR_MODEL in .env to a model your key can use (e.g. gemini-3.8-flash) and restart the server." });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to scan Aadhaar card. Please try again with clear lighting or enter details manually."
    });
  }
});
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});
async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const clientDistPath = path3.resolve(process.cwd(), "dist");
    app.use(express.static(clientDistPath));
    app.get("*", (_req, res) => {
      res.sendFile(path3.join(clientDistPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Golden Hour Server running on http://0.0.0.0:${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
}
startServer();
