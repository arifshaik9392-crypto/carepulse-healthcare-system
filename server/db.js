// server/db.js - Persistent JSON File Database Engine for CarePulse
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

const INITIAL_DATA = {
  users: [
    {
      id: "usr_doc_1",
      name: "Dr. A. Sharma",
      email: "dr.sharma@carepulse.org",
      phone: "9876543210",
      role: "Doctor",
      speciality: "General Medicine",
      gender: "Male",
      active: true,
      room: "Room 101 (OPD Block A)",
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_doc_2",
      name: "Dr. Priya Narang",
      email: "dr.narang@carepulse.org",
      phone: "9845012345",
      role: "Doctor",
      speciality: "Cardiology",
      gender: "Female",
      active: true,
      room: "Room 204 (Cath Suite)",
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_doc_3",
      name: "Dr. R. K. Mukherjee",
      email: "dr.mukherjee@carepulse.org",
      phone: "9812345678",
      role: "Doctor",
      speciality: "Orthopaedics",
      gender: "Male",
      active: true,
      room: "Room 108 (Joint Care)",
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_doc_4",
      name: "Dr. Sneha Paul",
      email: "dr.paul@carepulse.org",
      phone: "9711223344",
      role: "Doctor",
      speciality: "Paediatrics",
      gender: "Female",
      active: true,
      room: "Room 102 (Child Wellness)",
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_doc_5",
      name: "Dr. Meenakshi Iyer",
      email: "dr.iyer@carepulse.org",
      phone: "9900112233",
      role: "Doctor",
      speciality: "Gynaecology",
      gender: "Female",
      active: true,
      room: "Room 205 (Women Care)",
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_staff_1",
      name: "Ramesh Receptionist",
      email: "staff@carepulse.org",
      phone: "9888877777",
      role: "Staff",
      gender: "Male",
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "usr_pat_1",
      name: "Suresh Chandra",
      email: "patient@carepulse.org",
      phone: "9123456789",
      role: "Patient",
      gender: "Male",
      age: 42,
      active: true,
      createdAt: new Date().toISOString()
    }
  ],
  doctors: [
    {
      id: "doc_1",
      userId: "usr_doc_1",
      name: "Dr. A. Sharma",
      speciality: "General Medicine",
      room: "Room 101 (OPD Block A)",
      status: "Available", // Available, In Consultation, On Break, Offline
      queuePaused: false,
      avgSpeedMins: 10
    },
    {
      id: "doc_2",
      userId: "usr_doc_2",
      name: "Dr. Priya Narang",
      speciality: "Cardiology",
      room: "Room 204 (Cath Suite)",
      status: "Available",
      queuePaused: false,
      avgSpeedMins: 15
    },
    {
      id: "doc_3",
      userId: "usr_doc_3",
      name: "Dr. R. K. Mukherjee",
      speciality: "Orthopaedics",
      room: "Room 108 (Joint Care)",
      status: "Available",
      queuePaused: false,
      avgSpeedMins: 12
    },
    {
      id: "doc_4",
      userId: "usr_doc_4",
      name: "Dr. Sneha Paul",
      speciality: "Paediatrics",
      room: "Room 102 (Child Wellness)",
      status: "Available",
      queuePaused: false,
      avgSpeedMins: 10
    },
    {
      id: "doc_5",
      userId: "usr_doc_5",
      name: "Dr. Meenakshi Iyer",
      speciality: "Gynaecology",
      room: "Room 205 (Women Care)",
      status: "Available",
      queuePaused: false,
      avgSpeedMins: 12
    }
  ],
  appointments: [],
  queue: [
    {
      id: "q_1",
      tokenId: "GM-101",
      patientId: "usr_pat_1",
      patientName: "Suresh Chandra",
      patientPhone: "9123456789",
      patientEmail: "patient@carepulse.org",
      patientAge: 42,
      patientGender: "Male",
      doctorId: "doc_1",
      doctorName: "Dr. A. Sharma",
      speciality: "General Medicine",
      room: "Room 101 (OPD Block A)",
      type: "Walk-In", // Walk-In or Appointment
      priority: "Regular", // Regular, Senior, Special, Emergency
      priorityScore: 0,
      status: "Waiting", // Waiting, In-Consultation, Completed, Skipped, Cancelled
      position: 1,
      estimatedWaitMins: 10,
      delayMins: 0,
      registeredAt: new Date(Date.now() - 25 * 60000).toISOString(),
      calledAt: null,
      completedAt: null,
      notifiedApproaching: false,
      outperoCallStatus: "Idle"
    }
  ],
  pharmacyInventory: [
    { id: "med_1", name: "Paracetamol", strength: "500mg", form: "Tablet", stock: 250, minStock: 50, price: 2.50 },
    { id: "med_2", name: "Amoxicillin", strength: "500mg", form: "Capsule", stock: 80, minStock: 30, price: 8.00 },
    { id: "med_3", name: "Azithromycin", strength: "250mg", form: "Tablet", stock: 45, minStock: 25, price: 15.00 },
    { id: "med_4", name: "Metformin", strength: "500mg", form: "Tablet", stock: 180, minStock: 40, price: 3.50 },
    { id: "med_5", name: "Amlodipine", strength: "5mg", form: "Tablet", stock: 120, minStock: 30, price: 4.00 },
    { id: "med_6", name: "Pantoprazole", strength: "40mg", form: "Tablet", stock: 95, minStock: 30, price: 7.50 },
    { id: "med_7", name: "Cetirizine", strength: "10mg", form: "Tablet", stock: 150, minStock: 40, price: 2.00 },
    { id: "med_8", name: "ORS Hydration Sachet", strength: "21.8g", form: "Powder", stock: 12, minStock: 25, price: 18.00 }, // Low Stock example
    { id: "med_9", name: "Salbutamol Inhaler", strength: "100mcg", form: "Inhaler", stock: 18, minStock: 10, price: 145.00 },
    { id: "med_10", name: "Diclofenac Gel", strength: "1% w/w", form: "Ointment", stock: 35, minStock: 15, price: 65.00 }
  ],
  pharmacyBookings: [
    {
      id: "phb_1",
      bookingRef: "PH-2026-101",
      patientId: "usr_pat_1",
      patientName: "Suresh Chandra",
      patientPhone: "9123456789",
      items: [
        { medicineId: "med_1", name: "Paracetamol 500mg", quantity: 10, unitPrice: 2.50, total: 25.00 },
        { medicineId: "med_6", name: "Pantoprazole 40mg", quantity: 5, unitPrice: 7.50, total: 37.50 }
      ],
      totalAmount: 62.50,
      status: "Preparing", // Pending Review, Confirmed, Preparing, Ready for Pickup, Dispensed, Cancelled
      prescriptionRequired: true,
      prescriptionNotes: "Post OPD consultation Rx",
      createdAt: new Date(Date.now() - 40 * 60000).toISOString()
    }
  ],
  bloodInventory: [
    { bloodGroup: "A+", units: 14, minStock: 10, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "A-", units: 4, minStock: 6, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "B+", units: 18, minStock: 10, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "B-", units: 3, minStock: 5, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "O+", units: 25, minStock: 15, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "O-", units: 2, minStock: 8, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "AB+", units: 9, minStock: 6, status: "Available", lastUpdated: new Date().toISOString() },
    { bloodGroup: "AB-", units: 1, minStock: 4, status: "Available", lastUpdated: new Date().toISOString() }
  ],
  bloodDonors: [
    {
      id: "dnr_1",
      name: "Vikram Rathore",
      phone: "9876500112",
      email: "vikram@example.com",
      age: 29,
      gender: "Male",
      bloodGroup: "O+",
      weightKg: 68,
      status: "Pending Screening", // Pending Screening, Approved, Rejected
      lastDonationDate: null,
      registeredAt: new Date(Date.now() - 120 * 60000).toISOString()
    }
  ],
  bloodRequests: [
    {
      id: "breq_1",
      patientName: "Anita Sharma (Emergency OT)",
      bloodGroup: "O-",
      unitsRequested: 2,
      priority: "Urgent",
      status: "Pending", // Pending, Reserved, Issued, Cancelled
      requesterNotes: "Immediate transfusion required for surgery",
      requestedAt: new Date(Date.now() - 30 * 60000).toISOString()
    }
  ],
  notifications: [
    {
      id: "notif_1",
      recipientId: "usr_pat_1",
      recipientRole: "Patient",
      title: "Queue Status Update",
      message: "Your token GM-101 is now #1 in queue. Please proceed to Room 101.",
      type: "queue",
      read: false,
      timestamp: new Date().toISOString()
    }
  ],
  auditLogs: [
    {
      id: "log_1",
      actorId: "system",
      actorName: "CarePulse System",
      actorRole: "System",
      action: "INIT_DATABASE",
      details: "Persistent medical records database initialized.",
      timestamp: new Date().toISOString()
    }
  ],
  outperoCalls: []
};

class JsonDb {
  constructor() {
    this.ensureDb();
  }

  ensureDb() {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
    }
  }

  read() {
    this.ensureDb();
    try {
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error("Error reading db, returning initial:", e);
      return INITIAL_DATA;
    }
  }

  write(data) {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error("Error writing db:", e);
      return false;
    }
  }

  logAudit(actor, action, details) {
    const data = this.read();
    const log = {
      id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      actorId: actor?.id || "system",
      actorName: actor?.name || "System",
      actorRole: actor?.role || "System",
      action,
      details,
      timestamp: new Date().toISOString()
    };
    data.auditLogs.unshift(log);
    if (data.auditLogs.length > 500) data.auditLogs.pop();
    this.write(data);
    return log;
  }
}

module.exports = new JsonDb();
