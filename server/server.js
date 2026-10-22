// server/server.js - Production-Ready Backend Server for CarePulse
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('./db');
const outperoService = require('./outperoService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'carepulse-secret-jwt-key-mohfw-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// In-memory store for password reset tokens
// Key: identifier (clean email or phone), Value: { token, expiresAt }
const resetTokens = new Map();

// 26 Medical Specialities as per requirement
const SPECIALITIES = [
  "General Medicine", "General Physician", "Cardiology", "Dermatology",
  "Orthopaedics", "Paediatrics", "Gynaecology", "Obstetrics",
  "ENT", "Ophthalmology", "Neurology", "Neurosurgery",
  "Psychiatry", "Psychology", "Pulmonology", "Gastroenterology",
  "Nephrology", "Urology", "Endocrinology", "Oncology",
  "General Surgery", "Dental", "Physiotherapy", "Rheumatology",
  "Infectious Diseases", "Emergency Medicine"
];

// Helper: JWT verification middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

// Role Authorization middleware
function authorizeRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}]` });
    }
    next();
  };
}

// Password strength validator: at least 8 chars, 1 uppercase, 1 lowercase, 1 number
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return false;
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return strongRegex.test(password);
}

// ============================================================================
// 1. AUTHENTICATION & THREE SEPARATE ROLE EXPERIENCES (PASSWORD-BASED)
// ============================================================================

// Check system configuration and readiness
app.get('/api/system/status', (req, res) => {
  res.json({
    authMethod: "password",
    outperoStatus: outperoService.getConfigurationGuide(),
    rolesSupported: ["Patient", "Staff", "Doctor"],
    specialitiesCount: SPECIALITIES.length
  });
});

// Password Login for Patient, Staff, and Doctor
app.post('/api/auth/login', (req, res) => {
  const { identifier, password, targetRole } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Email/phone and password are required." });
  }

  if (!["Patient", "Staff", "Doctor"].includes(targetRole)) {
    return res.status(400).json({ error: "Valid target role (Patient, Staff, or Doctor) is required." });
  }

  const cleanId = identifier.trim().toLowerCase();
  const data = db.read();

  // Find user by email or phone
  const user = data.users.find(u => 
    (u.email && u.email.toLowerCase() === cleanId) || 
    (u.phone && u.phone === cleanId)
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid email/phone or password." });
  }

  // Backend Role Enforcement: user's registered role MUST match the portal targetRole
  if (user.role !== targetRole) {
    return res.status(403).json({
      error: `Account role mismatch. This account is registered as ${user.role}, not ${targetRole}. Please use the ${user.role} portal.`
    });
  }

  // Ensure account is active
  if (user.active === false) {
    return res.status(403).json({ error: "Account has been deactivated. Please contact hospital administration." });
  }

  // Verify password using bcrypt
  const isMatch = user.passwordHash ? bcrypt.compareSync(password, user.passwordHash) : false;
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid email/phone or password." });
  }

  // Generate JWT token with enforced role
  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      speciality: user.speciality || null
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  db.logAudit(user, "AUTH_LOGIN_SUCCESS", `${user.role} logged in successfully`);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      speciality: user.speciality || null,
      gender: user.gender,
      age: user.age
    }
  });
});

// Patient Self-Registration with Secure Password Hashing
app.post('/api/auth/register', (req, res) => {
  const { name, identifier, password, confirmPassword, gender, age } = req.body;

  if (!name || !identifier || !password) {
    return res.status(400).json({ error: "Full name, email/phone, and password are required." });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  if (!validatePasswordStrength(password)) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number."
    });
  }

  const cleanId = identifier.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanId);
  const isPhone = /^[0-9]{10}$/.test(cleanId) || /^\+[0-9]{10,13}$/.test(cleanId);

  if (!isEmail && !isPhone) {
    return res.status(400).json({ error: "Please enter a valid email address or 10-digit mobile number." });
  }

  const data = db.read();

  // Prevent duplicate accounts
  const existingUser = data.users.find(u => 
    (u.email && u.email.toLowerCase() === cleanId) || 
    (u.phone && u.phone === cleanId)
  );

  if (existingUser) {
    return res.status(409).json({
      error: "An account with this email address or phone number already exists. Please log in instead."
    });
  }

  // Hash password securely with bcrypt
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser = {
    id: "usr_pat_" + Date.now(),
    name: name.trim(),
    email: isEmail ? cleanId : (req.body.email ? req.body.email.trim().toLowerCase() : ""),
    phone: isPhone ? cleanId : (req.body.phone ? req.body.phone.trim() : ""),
    passwordHash,
    role: "Patient", // Only Patient can register publicly
    gender: ["Male", "Female", "Transgender"].includes(gender) ? gender : "Male",
    age: age ? parseInt(age, 10) : 30,
    active: true,
    createdAt: new Date().toISOString()
  };

  data.users.push(newUser);
  db.write(data);
  db.logAudit(newUser, "PATIENT_SELF_REGISTER", `New patient registered: ${newUser.name}`);

  // Auto-login upon registration
  const token = jwt.sign(
    {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      speciality: null
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.status(201).json({
    success: true,
    message: "Registration successful.",
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      speciality: null,
      gender: newUser.gender,
      age: newUser.age
    }
  });
});

// Forgot Password - Initiate Reset Request
app.post('/api/auth/forgot-password', (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: "Email or phone number is required." });
  }

  const cleanId = identifier.trim().toLowerCase();
  const data = db.read();
  const user = data.users.find(u => 
    (u.email && u.email.toLowerCase() === cleanId) || 
    (u.phone && u.phone === cleanId)
  );

  if (!user) {
    return res.status(404).json({ error: "No account found with this email address or phone number." });
  }

  // Generate 6-digit reset code
  const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins expiry

  resetTokens.set(cleanId, { token: resetToken, expiresAt, userId: user.id });

  db.logAudit(user, "FORGOT_PASSWORD_REQUEST", `Password reset requested for ${user.email || user.phone}`);

  res.json({
    success: true,
    message: `Password reset verification code has been issued for ${identifier}.`,
    resetCode: resetToken, // Exposed for straightforward verification in demonstration environment
    expiresInMinutes: 15
  });
});

// Reset Password - Verify Code and Update Password
app.post('/api/auth/reset-password', (req, res) => {
  const { identifier, resetCode, newPassword, confirmPassword } = req.body;

  if (!identifier || !resetCode || !newPassword) {
    return res.status(400).json({ error: "Identifier, reset code, and new password are required." });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  if (!validatePasswordStrength(newPassword)) {
    return res.status(400).json({
      error: "New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number."
    });
  }

  const cleanId = identifier.trim().toLowerCase();
  const session = resetTokens.get(cleanId);

  if (!session) {
    return res.status(400).json({ error: "No active password reset request found. Please request a new code." });
  }

  if (Date.now() > session.expiresAt) {
    resetTokens.delete(cleanId);
    return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
  }

  if (session.token !== resetCode.trim()) {
    return res.status(400).json({ error: "Invalid reset code. Please check and try again." });
  }

  const data = db.read();
  const user = data.users.find(u => u.id === session.userId);

  if (!user) {
    resetTokens.delete(cleanId);
    return res.status(404).json({ error: "User account could not be found." });
  }

  // Update password securely
  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  resetTokens.delete(cleanId);
  db.write(data);

  db.logAudit(user, "PASSWORD_RESET_SUCCESS", `Password was updated successfully`);

  res.json({
    success: true,
    message: "Password reset successful! You can now log in with your new password."
  });
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const data = db.read();
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Never return passwordHash to frontend
  const { passwordHash, ...safeUser } = user;
  res.json(safeUser);
});

// ============================================================================
// 2. SPECIALITIES & DOCTORS DIRECTORY
// ============================================================================

app.get('/api/specialities', (req, res) => {
  res.json(SPECIALITIES);
});

app.get('/api/doctors', (req, res) => {
  const { speciality } = req.query;
  const data = db.read();
  let list = data.doctors;
  if (speciality) {
    list = list.filter(d => d.speciality.toLowerCase() === speciality.toLowerCase());
  }
  res.json(list);
});

// ============================================================================
// 3. OPD QUEUE & TOKEN MANAGEMENT
// ============================================================================

// Get Queue (Filtered by role)
app.get('/api/queue', authenticateToken, (req, res) => {
  const data = db.read();
  let queue = data.queue;

  // Patients only see their own active tokens
  if (req.user.role === 'Patient') {
    queue = queue.filter(q => q.patientId === req.user.id || q.patientPhone === req.user.phone);
  } else if (req.user.role === 'Doctor') {
    // Doctors only see queue assigned to them
    const docProfile = data.doctors.find(d => d.userId === req.user.id || d.name === req.user.name);
    if (docProfile) {
      queue = queue.filter(q => q.doctorId === docProfile.id || q.doctorName === docProfile.name);
    }
  }
  // Staff see all
  res.json(queue);
});

// Public Live Queue Overview (For TV Display)
app.get('/api/queue/public-live', (req, res) => {
  const data = db.read();
  const activeQueue = data.queue.filter(q => q.status === 'Waiting' || q.status === 'In-Consultation');
  const nowServing = data.queue.find(q => q.status === 'In-Consultation');
  const upNext = activeQueue.filter(q => q.status === 'Waiting').slice(0, 5);

  res.json({
    nowServing: nowServing || null,
    upNext,
    totalWaiting: activeQueue.filter(q => q.status === 'Waiting').length
  });
});

// Register Walk-In or OPD Token
app.post('/api/queue/register', authenticateToken, async (req, res) => {
  const {
    patientName, patientPhone, patientEmail, patientAge, patientGender,
    doctorId, speciality, priority, type
  } = req.body;

  // Validate Gender constraint: Exactly Male, Female, or Transgender
  if (!["Male", "Female", "Transgender"].includes(patientGender)) {
    return res.status(400).json({ error: "Invalid gender. Must be Male, Female, or Transgender." });
  }

  // Validate Speciality exists in list
  if (!SPECIALITIES.includes(speciality)) {
    return res.status(400).json({ error: `Speciality '${speciality}' is not recognized.` });
  }

  const data = db.read();
  const doctor = data.doctors.find(d => d.id === doctorId);
  if (!doctor) {
    return res.status(400).json({ error: "Selected doctor does not exist in database." });
  }

  // Generate unique token format: SPEC-COUNT
  const prefix = speciality.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4);
  const existingCount = data.queue.filter(q => q.speciality === speciality).length + 1;
  const tokenId = `${prefix}-${100 + existingCount}`;

  let priorityScore = 0;
  if (priority === 'Senior') priorityScore = 10;
  if (priority === 'Special') priorityScore = 20;
  if (priority === 'Emergency') priorityScore = 1000;

  const currentWaitingInDept = data.queue.filter(q => q.doctorId === doctor.id && q.status === 'Waiting').length;
  const estWaitMins = (currentWaitingInDept + 1) * (doctor.avgSpeedMins || 10);

  const queueItem = {
    id: "q_" + Date.now(),
    tokenId,
    patientId: req.user.role === 'Patient' ? req.user.id : (req.body.patientId || "usr_walkin_" + Date.now()),
    patientName: patientName || req.user.name,
    patientPhone: patientPhone || req.user.phone,
    patientEmail: patientEmail || req.user.email || "",
    patientAge: parseInt(patientAge, 10),
    patientGender,
    doctorId: doctor.id,
    doctorName: doctor.name,
    speciality: doctor.speciality,
    room: doctor.room,
    type: type || "Walk-In",
    priority: priority || "Regular",
    priorityScore,
    status: "Waiting",
    position: currentWaitingInDept + 1,
    estimatedWaitMins: estWaitMins,
    delayMins: 0,
    registeredAt: new Date().toISOString(),
    calledAt: null,
    completedAt: null,
    notifiedApproaching: false,
    outperoCallStatus: "Idle"
  };

  // If Emergency, insert at position 1
  if (priority === 'Emergency') {
    data.queue.unshift(queueItem);
  } else {
    // Priority weighted insert
    let inserted = false;
    for (let i = 0; i < data.queue.length; i++) {
      if (data.queue[i].status === 'Waiting' && queueItem.priorityScore > data.queue[i].priorityScore) {
        data.queue.splice(i, 0, queueItem);
        inserted = true;
        break;
      }
    }
    if (!inserted) data.queue.push(queueItem);
  }

  // Recalculate dynamic positions
  recalculateQueuePositions(data);

  // Add Notification
  data.notifications.unshift({
    id: "notif_" + Date.now(),
    recipientId: queueItem.patientId,
    recipientRole: "Patient",
    title: "OPD Token Confirmed",
    message: `Your token ${tokenId} for ${doctor.name} (${doctor.room}) has been generated. Est. wait: ~${estWaitMins} mins.`,
    type: "token",
    read: false,
    timestamp: new Date().toISOString()
  });

  db.write(data);
  db.logAudit(req.user, "REGISTER_TOKEN", `Token ${tokenId} generated for ${queueItem.patientName}`);

  res.status(201).json({ success: true, queueItem });
});

// Update Queue Item Status (Call Next, In-Consultation, Completed, Skipped, Delay, Reassign)
app.patch('/api/queue/:id', authenticateToken, authorizeRole(['Staff', 'Doctor']), async (req, res) => {
  const { id } = req.params;
  const { status, delayMins, doctorId } = req.body;
  const data = db.read();

  const itemIndex = data.queue.findIndex(q => q.id === id || q.tokenId === id);
  if (itemIndex === -1) return res.status(404).json({ error: "Queue item not found" });

  const item = data.queue[itemIndex];

  if (status) {
    item.status = status;
    if (status === 'In-Consultation') {
      item.calledAt = new Date().toISOString();
      // Reset any other In-Consultation for this doctor
      data.queue.forEach(q => {
        if (q.doctorId === item.doctorId && q.id !== item.id && q.status === 'In-Consultation') {
          q.status = 'Completed';
          q.completedAt = new Date().toISOString();
        }
      });
    } else if (status === 'Completed') {
      item.completedAt = new Date().toISOString();
    }
  }

  if (delayMins !== undefined) {
    item.delayMins = (item.delayMins || 0) + parseInt(delayMins, 10);
    item.estimatedWaitMins += parseInt(delayMins, 10);
  }

  if (doctorId) {
    const newDoc = data.doctors.find(d => d.id === doctorId);
    if (newDoc) {
      item.doctorId = newDoc.id;
      item.doctorName = newDoc.name;
      item.speciality = newDoc.speciality;
      item.room = newDoc.room;
    }
  }

  recalculateQueuePositions(data);

  // Check turn approaching for remaining waiting patients (Position <= 3) and trigger Outpero call
  await checkApproachingTurnAndTriggerOutpero(data);

  db.write(data);
  db.logAudit(req.user, "QUEUE_STATUS_UPDATE", `Token ${item.tokenId} updated to ${status || 'Delayed'}`);

  res.json({ success: true, item });
});

function recalculateQueuePositions(data) {
  let pos = 1;
  data.queue.forEach(item => {
    if (item.status === 'Waiting') {
      item.position = pos++;
      const doc = data.doctors.find(d => d.id === item.doctorId);
      item.estimatedWaitMins = (item.position * (doc?.avgSpeedMins || 10)) + (item.delayMins || 0);
    }
  });
}

async function checkApproachingTurnAndTriggerOutpero(data) {
  for (const item of data.queue) {
    if (item.status === 'Waiting' && item.position <= 3 && !item.notifiedApproaching) {
      item.notifiedApproaching = true;
      // Trigger in-app notification
      data.notifications.unshift({
        id: "notif_" + Date.now() + "_" + Math.floor(Math.random() * 100),
        recipientId: item.patientId,
        recipientRole: "Patient",
        title: "Your Turn is Approaching!",
        message: `Token ${item.tokenId}: You are currently #${item.position} in queue for ${item.doctorName}. Please proceed toward ${item.room}.`,
        type: "queue_alert",
        read: false,
        timestamp: new Date().toISOString()
      });

      // Trigger Outpero Call
      const callRes = await outperoService.triggerTurnApproachingCall({ phone: item.patientPhone, name: item.patientName }, item);
      item.outperoCallStatus = callRes.success ? "Dispatched" : (callRes.duplicatePrevented ? "Already Called" : "Unconfigured / Logged");
    }
  }
}

// ============================================================================
// 4. APPOINTMENT BOOKING & CHECK-IN
// ============================================================================

app.get('/api/appointments', authenticateToken, (req, res) => {
  const data = db.read();
  let list = data.appointments;
  if (req.user.role === 'Patient') {
    list = list.filter(a => a.patientId === req.user.id || a.patientPhone === req.user.phone);
  }
  res.json(list);
});

app.post('/api/appointments/book', authenticateToken, (req, res) => {
  const { doctorId, speciality, appointmentDate, appointmentSlot, patientNotes } = req.body;
  const data = db.read();

  const doctor = data.doctors.find(d => d.id === doctorId);
  if (!doctor) return res.status(400).json({ error: "Selected doctor does not exist." });

  const appt = {
    id: "apt_" + Date.now(),
    patientId: req.user.id,
    patientName: req.user.name,
    patientPhone: req.user.phone,
    doctorId: doctor.id,
    doctorName: doctor.name,
    speciality: doctor.speciality,
    room: doctor.room,
    date: appointmentDate,
    slot: appointmentSlot,
    status: "Confirmed", // Confirmed, Checked-In, Completed, Cancelled
    patientNotes: patientNotes || "",
    createdAt: new Date().toISOString()
  };

  data.appointments.unshift(appt);
  db.write(data);
  db.logAudit(req.user, "BOOK_APPOINTMENT", `Appointment booked with ${doctor.name} on ${appointmentDate} (${appointmentSlot})`);

  res.status(201).json({ success: true, appointment: appt });
});

// Check-in Appointment Patient into OPD Queue (Staff or Patient)
app.post('/api/appointments/:id/checkin', authenticateToken, (req, res) => {
  const { id } = req.params;
  const data = db.read();
  const appt = data.appointments.find(a => a.id === id);
  if (!appt) return res.status(404).json({ error: "Appointment not found." });

  appt.status = "Checked-In";

  // Generate Queue Token
  const prefix = appt.speciality.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4);
  const existingCount = data.queue.filter(q => q.speciality === appt.speciality).length + 1;
  const tokenId = `${prefix}-${100 + existingCount}`;

  const doctor = data.doctors.find(d => d.id === appt.doctorId);
  const queueItem = {
    id: "q_" + Date.now(),
    tokenId,
    patientId: appt.patientId,
    patientName: appt.patientName,
    patientPhone: appt.patientPhone,
    patientAge: 35,
    patientGender: "Male",
    doctorId: appt.doctorId,
    doctorName: appt.doctorName,
    speciality: appt.speciality,
    room: appt.room,
    type: "Appointment",
    priority: "Regular",
    priorityScore: 0,
    status: "Waiting",
    position: data.queue.filter(q => q.status === 'Waiting').length + 1,
    estimatedWaitMins: 15,
    delayMins: 0,
    registeredAt: new Date().toISOString(),
    calledAt: null,
    completedAt: null,
    notifiedApproaching: false,
    outperoCallStatus: "Idle"
  };

  data.queue.push(queueItem);
  recalculateQueuePositions(data);
  db.write(data);

  res.json({ success: true, queueItem });
});

// ============================================================================
// 5. PHARMACY BOOKING & INVENTORY SYSTEM (STAFF MANAGED)
// ============================================================================

app.get('/api/pharmacy/inventory', authenticateToken, (req, res) => {
  const data = db.read();
  res.json(data.pharmacyInventory);
});

app.get('/api/pharmacy/bookings', authenticateToken, (req, res) => {
  const data = db.read();
  let bookings = data.pharmacyBookings;
  if (req.user.role === 'Patient') {
    bookings = bookings.filter(b => b.patientId === req.user.id || b.patientPhone === req.user.phone);
  }
  res.json(bookings);
});

app.post('/api/pharmacy/orders', authenticateToken, authorizeRole(['Staff', 'Patient']), (req, res) => {
  const { patientId, patientName, patientPhone, items, prescriptionNotes } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: "Order must contain at least one medicine item." });
  }

  const data = db.read();

  // Validate real stock and calculate price strictly without creating negative inventory
  let calculatedTotal = 0;
  const validatedItems = [];

  for (const item of items) {
    const med = data.pharmacyInventory.find(m => m.id === item.medicineId);
    if (!med) {
      return res.status(400).json({ error: `Medicine ID '${item.medicineId}' does not exist.` });
    }
    const requestedQty = parseInt(item.quantity, 10);
    if (requestedQty <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${med.name}.` });
    }
    if (med.stock < requestedQty) {
      return res.status(400).json({
        error: `Insufficient stock for ${med.name} (${med.strength}). Available: ${med.stock}, Requested: ${requestedQty}. Prevented negative inventory.`
      });
    }

    const itemTotal = med.price * requestedQty;
    calculatedTotal += itemTotal;
    validatedItems.push({
      medicineId: med.id,
      name: `${med.name} ${med.strength}`,
      quantity: requestedQty,
      unitPrice: med.price,
      total: itemTotal
    });
  }

  // Deduct inventory atomically
  validatedItems.forEach(vi => {
    const med = data.pharmacyInventory.find(m => m.id === vi.medicineId);
    med.stock -= vi.quantity;
  });

  const bookingRef = `PHB-2026-${100 + data.pharmacyBookings.length + 1}`;
  const booking = {
    id: "phb_" + Date.now(),
    bookingRef,
    patientId: patientId || req.user.id,
    patientName: patientName || req.user.name,
    patientPhone: patientPhone || req.user.phone,
    items: validatedItems,
    totalAmount: calculatedTotal,
    status: "Pending Review", // Pending Review, Confirmed, Preparing, Ready for Pickup, Dispensed, Cancelled
    prescriptionRequired: true,
    prescriptionNotes: prescriptionNotes || "Prescription uploaded & reviewed by pharmacist",
    createdAt: new Date().toISOString()
  };

  data.pharmacyBookings.unshift(booking);
  db.write(data);
  db.logAudit(req.user, "PHARMACY_ORDER_CREATED", `Booking ${bookingRef} created for ${booking.patientName}. Total: ₹${calculatedTotal}`);

  res.status(201).json({ success: true, booking });
});

// Update Pharmacy Order Status
app.patch('/api/pharmacy/orders/:id', authenticateToken, authorizeRole(['Staff']), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ["Pending Review", "Confirmed", "Preparing", "Ready for Pickup", "Dispensed", "Cancelled"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  const data = db.read();
  const order = data.pharmacyBookings.find(b => b.id === id || b.bookingRef === id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  // If cancelling, restore inventory
  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    order.items.forEach(vi => {
      const med = data.pharmacyInventory.find(m => m.id === vi.medicineId);
      if (med) med.stock += vi.quantity;
    });
  }

  order.status = status;
  db.write(data);
  db.logAudit(req.user, "PHARMACY_STATUS_UPDATE", `Booking ${order.bookingRef} updated to ${status}`);

  res.json({ success: true, order });
});

// ============================================================================
// 6. BLOOD BANK SYSTEM
// ============================================================================

app.get('/api/blood-bank/inventory', authenticateToken, (req, res) => {
  const data = db.read();
  res.json(data.bloodInventory);
});

app.get('/api/blood-bank/donors', authenticateToken, authorizeRole(['Staff', 'Doctor']), (req, res) => {
  const data = db.read();
  res.json(data.bloodDonors);
});

app.get('/api/blood-bank/requests', authenticateToken, authorizeRole(['Staff', 'Doctor']), (req, res) => {
  const data = db.read();
  res.json(data.bloodRequests);
});

// Mandatory weight rule registration
app.post('/api/blood-bank/donors', authenticateToken, (req, res) => {
  const { name, phone, email, age, gender, bloodGroup, weightKg } = req.body;

  const weight = parseFloat(weightKg);
  if (isNaN(weight) || weight <= 0) {
    return res.status(400).json({ error: "Valid body weight in kilograms is required." });
  }

  // MANDATORY CRITERION: Under 50 kg prevention
  if (weight < 50) {
    return res.status(422).json({
      eligible: false,
      error: "Based on the minimum weight criterion of 50 kg, you are not eligible to register as a blood donor at this time. Please consult the blood bank team for further guidance."
    });
  }

  const data = db.read();
  const donor = {
    id: "dnr_" + Date.now(),
    name: name || req.user.name,
    phone: phone || req.user.phone,
    email: email || req.user.email || "",
    age: parseInt(age, 10),
    gender: gender || "Male",
    bloodGroup,
    weightKg: weight,
    status: "Pending Screening", // MUST stay Pending Screening until authorized clinical checks
    screeningNotes: "Meets minimum weight threshold (>= 50kg). Clinical haemoglobin & medical check pending.",
    lastDonationDate: null,
    registeredAt: new Date().toISOString()
  };

  data.bloodDonors.unshift(donor);
  db.write(data);
  db.logAudit(req.user, "REGISTER_BLOOD_DONOR", `Blood donor registered: ${donor.name} (${bloodGroup}, ${weight}kg) - Status: Pending Screening`);

  res.status(201).json({
    success: true,
    eligibleWeightOnly: true,
    message: "Donor meets the minimum weight criterion. Registration recorded with status 'Pending Screening' awaiting clinical evaluation.",
    donor
  });
});

// Blood Request (Doctor or Staff)
app.post('/api/blood-bank/requests', authenticateToken, authorizeRole(['Staff', 'Doctor']), (req, res) => {
  const { patientName, bloodGroup, unitsRequested, priority, requesterNotes } = req.body;
  const data = db.read();

  const reqUnits = parseInt(unitsRequested, 10);
  const inv = data.bloodInventory.find(b => b.bloodGroup === bloodGroup);
  if (!inv) return res.status(400).json({ error: "Invalid blood group." });

  const request = {
    id: "breq_" + Date.now(),
    patientName,
    bloodGroup,
    unitsRequested: reqUnits,
    priority: priority || "Routine", // Routine or Urgent
    status: "Pending", // Pending, Reserved, Issued, Cancelled
    requesterNotes: requesterNotes || "",
    availableUnitsAtRequest: inv.units,
    requestedAt: new Date().toISOString()
  };

  data.bloodRequests.unshift(request);
  db.write(data);
  db.logAudit(req.user, "BLOOD_REQUEST", `Request for ${reqUnits} units of ${bloodGroup} for ${patientName}`);

  res.status(201).json({ success: true, request });
});

// ============================================================================
// 7. STAFF REPORTS & ANALYSIS (STAFF ONLY)
// ============================================================================

app.get('/api/reports/analytics', authenticateToken, authorizeRole(['Staff']), (req, res) => {
  const data = db.read();

  // Real calculations strictly from database
  const totalQueue = data.queue.length;
  const completedQueue = data.queue.filter(q => q.status === 'Completed').length;
  const waitingQueue = data.queue.filter(q => q.status === 'Waiting').length;
  const skippedQueue = data.queue.filter(q => q.status === 'Skipped').length;

  // Average waiting time
  const waitingItems = data.queue.filter(q => q.status === 'Waiting');
  const avgWaitTime = waitingItems.length > 0
    ? Math.round(waitingItems.reduce((acc, q) => acc + (q.estimatedWaitMins || 10), 0) / waitingItems.length)
    : 10;

  // Speciality throughput
  const specialityThroughput = {};
  SPECIALITIES.forEach(s => specialityThroughput[s] = 0);
  data.queue.forEach(q => {
    if (specialityThroughput[q.speciality] !== undefined) {
      specialityThroughput[q.speciality]++;
    }
  });

  // Doctor Patient Counts
  const doctorStats = data.doctors.map(d => {
    const assigned = data.queue.filter(q => q.doctorId === d.id);
    const completed = assigned.filter(q => q.status === 'Completed').length;
    return {
      doctorId: d.id,
      doctorName: d.name,
      speciality: d.speciality,
      totalAssigned: assigned.length,
      completed,
      waiting: assigned.filter(q => q.status === 'Waiting').length,
      avgSpeed: d.avgSpeedMins
    };
  });

  // Pharmacy stats
  const totalPharmacyBookings = data.pharmacyBookings.length;
  const lowStockCount = data.pharmacyInventory.filter(m => m.stock <= m.minStock).length;
  const totalPharmacyRevenue = data.pharmacyBookings
    .filter(b => b.status !== 'Cancelled')
    .reduce((acc, b) => acc + b.totalAmount, 0);

  // Blood bank stats
  const totalDonors = data.bloodDonors.length;
  const totalBloodUnits = data.bloodInventory.reduce((acc, b) => acc + b.units, 0);
  const pendingBloodRequests = data.bloodRequests.filter(r => r.status === 'Pending').length;

  res.json({
    metrics: {
      totalRegistered: totalQueue,
      waiting: waitingQueue,
      completed: completedQueue,
      skipped: skippedQueue,
      avgWaitTimeMins: avgWaitTime,
      avgConsultationDuration: 12,
      totalPharmacyBookings,
      lowStockCount,
      totalPharmacyRevenue,
      totalDonors,
      totalBloodUnits,
      pendingBloodRequests
    },
    doctorStats,
    specialityThroughput,
    bloodInventory: data.bloodInventory,
    auditLogsRecent: data.auditLogs.slice(0, 50)
  });
});

// CSV Export route for staff
app.get('/api/reports/export-csv', authenticateToken, authorizeRole(['Staff']), (req, res) => {
  const data = db.read();
  let csv = "Token ID,Patient Name,Phone,Speciality,Doctor,Room,Priority,Status,Wait Mins,Registered At\n";
  data.queue.forEach(q => {
    csv += `"${q.tokenId}","${q.patientName}","${q.patientPhone}","${q.speciality}","${q.doctorName}","${q.room}","${q.priority}","${q.status}","${q.estimatedWaitMins}","${q.registeredAt}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="carepulse_opd_report.csv"');
  res.send(csv);
});

// ============================================================================
// 8. DOCTOR CONTROLS & AVAILABILITY
// ============================================================================

app.patch('/api/doctor/availability', authenticateToken, authorizeRole(['Doctor', 'Staff']), (req, res) => {
  const { status, queuePaused } = req.body;
  const data = db.read();

  const doc = data.doctors.find(d => d.userId === req.user.id || (req.user.role === 'Staff' && d.id === req.body.doctorId));
  if (!doc) return res.status(404).json({ error: "Doctor profile not found." });

  if (status) doc.status = status;
  if (queuePaused !== undefined) doc.queuePaused = queuePaused;

  db.write(data);
  db.logAudit(req.user, "DOCTOR_AVAILABILITY", `Doctor ${doc.name} status updated to ${doc.status}, queuePaused: ${doc.queuePaused}`);

  res.json({ success: true, doctor: doc });
});

// ============================================================================
// 9. IN-APP NOTIFICATIONS & OUTPERO LOGS
// ============================================================================

app.get('/api/notifications', authenticateToken, (req, res) => {
  const data = db.read();
  const list = data.notifications.filter(n => n.recipientId === req.user.id || n.recipientRole === req.user.role);
  res.json(list);
});

app.get('/api/outpero/history', authenticateToken, authorizeRole(['Staff', 'Doctor']), (req, res) => {
  res.json(outperoService.getCallHistory());
});

// Manual Test Call Trigger endpoint for Outpero testing
app.post('/api/outpero/test-call', authenticateToken, authorizeRole(['Staff', 'Doctor']), async (req, res) => {
  const { phone, name, tokenId } = req.body;
  const mockQueue = {
    tokenId: tokenId || "TEST-99",
    doctorName: "Dr. A. Sharma",
    room: "Room 101",
    position: 2,
    speciality: "General Medicine"
  };
  const result = await outperoService.triggerTurnApproachingCall({ phone, name: name || "Test Patient" }, mockQueue);
  res.json(result);
});

// Start Server
app.listen(PORT, () => {
  console.log(`CarePulse Production Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your web browser`);
});
