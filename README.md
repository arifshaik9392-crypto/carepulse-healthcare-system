# CarePulse — Real-Time Insights. Better Care.

**CarePulse** is an enterprise-grade, full-stack outpatient queue and hospital operations management application aligned with digital health mission guidelines.

---

## 🏥 Design & Brand System
- **Product Name:** CarePulse
- **Tagline:** Real-Time Insights. Better Care.
- **Primary Color:** Royal Blue `#014BAA`
- **Main Background:** Light Cream `#F8F3F0` (light aesthetic, zero dark-mode by default)

---

## 👥 Three Strictly Enforced Roles (No Admin Role)
1. **Patient**: Self-registration with Name, Age, Gender (Male, Female, Transgender). Can book appointments, check-in for walk-ins, track queue status live, download token slips, view appointment history, and track pharmacy prescriptions.
2. **Staff / Receptionist**: Provisioned account. Controls 9 operational hubs: Overview, OPD & Queue Management, Appointments, Pharmacy, Blood Bank, Doctors & Availability, Reports & Analysis, Notifications, and Settings.
3. **Doctor**: Provisioned account. Clinical suite to accept queue, start and complete consultations, pause queue, skip/recall patients, and adjust availability.

---

## 🔐 Real OTP Verification System
- Supports login via **Email Address** or **10-Digit Mobile Number**.
- Implemented with **cryptographic SHA-256 hashes**, **5-minute expiration**, **60-second resend cooldown**, and **5-attempt limit**.
- Rejects arbitrary OTP codes; verifies authentic codes dispatched by provider.
- In development/testing environments, dispatched OTP codes are logged directly to the server terminal.

---

## 🩺 26 Medical Specialities Supported
CarePulse strictly includes the 26 authorized specialities:
1. General Medicine
2. General Physician
3. Cardiology
4. Dermatology
5. Orthopaedics
6. Paediatrics
7. Gynaecology
8. Obstetrics
9. ENT
10. Ophthalmology
11. Neurology
12. Neurosurgery
13. Psychiatry
14. Psychology
15. Pulmonology
16. Gastroenterology
17. Nephrology
18. Urology
19. Endocrinology
20. Oncology
21. General Surgery
22. Dental
23. Physiotherapy
24. Rheumatology
25. Infectious Diseases
26. Emergency Medicine

---

## 💊 Pharmacy Booking System (Staff Managed)
- Real medicine catalogue with prices, form, strength, and live inventory.
- Real stock validation preventing dispensing unavailable items or creating negative inventory.
- Booking reference generation (e.g. `PHB-2026-101`) with full price calculation.
- 6-stage status tracking: `Pending Review`, `Confirmed`, `Preparing`, `Ready for Pickup`, `Dispensed`, `Cancelled`.

---

## 🩸 Blood Bank & Mandatory Weight Rule
- All 8 Blood Groups: A+, A-, B+, B-, O+, O-, AB+, AB-.
- **Mandatory Weight Criterion**:
  - If `< 50 kg`: Blocked on both frontend and backend with exact message:
    > *"Based on the minimum weight criterion of 50 kg, you are not eligible to register as a blood donor at this time. Please consult the blood bank team for further guidance."*
  - If `≥ 50 kg`: Recorded with status `Pending Screening` awaiting clinical checks.

---

## 📞 Outpero AI Phone Calls
- Integrates with the official Outpero Lead Intake API (`POST https://outpero.com/lead-intake/{slug}`).
- Dispatches outbound AI phone calls when a patient's turn is approaching (`position <= 3`).
- Prevents duplicate calls per token session.
- Logs full call history, provider status, and response data in the database.

---

## 🌐 6-Language Support
Full multilingual localization across all screens, buttons, and validation messages:
1. **English** (EN)
2. **Telugu (తెలుగు)** (TE)
3. **Hindi (हिंदी)** (HI)
4. **Tamil (தமிழ்)** (TA)
5. **Kannada (ಕನ್ನಡ)** (KN)
6. **Malayalam (മലയാളം)** (ML)

---

## 🚀 Running the Application
```bash
# Start server
node server/server.js

# Access in browser
http://localhost:3000
```
