/**
 * Sign-in accounts and the Tshwane feeders they work on.
 * Tickets, tips, vending history, and investigations start empty —
 * they appear only when someone files them.
 */

import { nowIso } from "./id";
import type {
  Feeder,
  FieldCrew,
  Meter,
  PlatformSnapshot,
  User,
} from "./types";

function pt(lon: number, lat: number) {
  return { lon, lat };
}

export function seedPlatform(): PlatformSnapshot {
  const createdAt = nowIso();

  const users: User[] = [
    {
      id: "usr_system",
      employeeNo: "SYS-000",
      fullName: "ElectroRaid Engine",
      email: "engine@electroraid.tshwane.gov.za",
      phone: null,
      role: "system",
      isActive: true,
      createdAt,
    },
    {
      id: "usr_sibusiso",
      employeeNo: null,
      fullName: "Sibusiso Mabena",
      email: "sibusiso@resident.tshwane",
      phone: "+27 82 441 0190",
      role: "resident",
      isActive: true,
      createdAt,
    },
    {
      id: "usr_thandiwe",
      employeeNo: "COT-4412",
      fullName: "Thandiwe Nkosi",
      email: "t.nkosi@tshwane.gov.za",
      phone: "+27 12 358 4412",
      role: "dispatcher",
      isActive: true,
      createdAt,
    },
    {
      id: "usr_naledi",
      employeeNo: "COT-4545",
      fullName: "Naledi Mashaba",
      email: "n.mashaba@tshwane.gov.za",
      phone: "+27 82 445 4545",
      role: "technician",
      isActive: true,
      createdAt,
    },
    {
      id: "usr_nomsa",
      employeeNo: "RP-1104",
      fullName: "Nomsa Khumalo",
      email: "n.khumalo@tshwane.gov.za",
      phone: "+27 72 334 1104",
      role: "revenue_inspector",
      isActive: true,
      createdAt,
    },
    {
      id: "usr_admin",
      employeeNo: "ADM-001",
      fullName: "Admin",
      email: "admin",
      phone: null,
      role: "admin",
      isActive: true,
      createdAt,
    },
  ];

  const crews: FieldCrew[] = [
    {
      id: "crew_ztr_45",
      userId: "usr_naledi",
      callsign: "ztr-45",
      specialization: "maintenance",
      skillCertifications: ["MV_JOINTING", "OHL_REPAIR", "MINI_SUB", "CABLE_FAULT"],
      status: "available",
      location: pt(28.3932, -25.7228),
      vehicleReg: "CT 445 GP",
      activeQueueSize: 0,
      lastGpsAt: createdAt,
    },
    {
      id: "crew_rp_east",
      userId: "usr_nomsa",
      callsign: "RP-03 East",
      specialization: "revenue_protection",
      skillCertifications: ["METER_TAMPER", "PREPAID_AUDIT", "IZINYOKA"],
      status: "available",
      location: pt(28.241, -25.741),
      vehicleReg: "CT 904 GP",
      activeQueueSize: 0,
      lastGpsAt: createdAt,
    },
  ];

  const feeders: Feeder[] = [
    {
      id: "fdr_mam_12",
      code: "MAM-F12",
      name: "Mamelodi Ext 11 / Tsamaya 11 kV",
      suburb: "Mamelodi",
      status: "ENERGIZED",
      location: pt(28.3932, -25.7228),
      updatedAt: createdAt,
    },
    {
      id: "fdr_att_04",
      code: "ATT-F04",
      name: "Atteridgeville Maunde 11 kV",
      suburb: "Atteridgeville",
      status: "ENERGIZED",
      location: pt(28.0704, -25.7758),
      updatedAt: createdAt,
    },
    {
      id: "fdr_sos_09",
      code: "SOS-F09",
      name: "Soshanguve Block L Mini-sub",
      suburb: "Soshanguve",
      status: "ENERGIZED",
      location: pt(28.1022, -25.5284),
      updatedAt: createdAt,
    },
    {
      id: "fdr_hat_02",
      code: "HAT-F02",
      name: "Hatfield / Steve Biko 11 kV",
      suburb: "Hatfield",
      status: "ENERGIZED",
      location: pt(28.2376, -25.7472),
      updatedAt: createdAt,
    },
    {
      id: "fdr_cbd_01",
      code: "CBD-F01",
      name: "Pretoria CBD Church Square",
      suburb: "Pretoria CBD",
      status: "ENERGIZED",
      location: pt(28.1879, -25.7463),
      updatedAt: createdAt,
    },
  ];

  const meters: Meter[] = [
    {
      id: "mtr_sibusiso",
      accountNumber: "3218840441",
      meterNumber: "PRE-441902",
      householdName: "Sibusiso Mabena",
      address: "12 Tsamaya Road, Mamelodi Ext 11",
      suburb: "Mamelodi",
      location: pt(28.394, -25.7234),
      feederId: "fdr_mam_12",
      status: "active",
      tariffCentsKwh: 285,
      installedAt: createdAt,
      lastPurchaseAt: null,
    },
  ];

  return {
    users,
    crews,
    feeders,
    meters,
    vending: [],
    incidents: [],
    reports: [],
    investigations: [],
    audit: [],
    events: [],
    weights: {
      wHouseholds: 12,
      wCritical: 280,
      wElapsed: 1.8,
    },
    floorRevision: 0,
    autoDispatchEnabled: false,
  };
}
