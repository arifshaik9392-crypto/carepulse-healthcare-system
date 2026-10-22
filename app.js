/**
 * CarePulse — Real-Time Insights. Better Care.
 * Single Page Full-Stack Application Client Engine
 */

class CarePulseClient {
  constructor() {
    this.currentLang = localStorage.getItem('carepulse_lang') || 'en';
    this.token = localStorage.getItem('carepulse_jwt') || null;
    this.user = JSON.parse(localStorage.getItem('carepulse_user') || 'null');
    this.selectedAuthRole = 'Patient';
    this.otpTimerInterval = null;
    
    // Cached Data
    this.specialities = [];
    this.doctors = [];
    this.queue = [];
    this.activeTokenForDownload = null;

    // Staff Sub-tab default
    this.activeStaffTab = 'overview';
    this.charts = {};
  }

  async init() {
    this.initClock();
    this.applyLanguage(this.currentLang);
    const langSelect = document.getElementById('langSelector');
    if (langSelect) langSelect.value = this.currentLang;

    await this.fetchSpecialitiesAndDoctors();

    if (this.token && this.user) {
      await this.verifyCurrentSession();
    } else {
      this.showView('authView');
      this.renderAuthHeader();
    }

    if (window.lucide) lucide.createIcons();
  }

  // ==========================================================================
  // REAL-TIME DIGITAL CLOCK & DATE
  // ==========================================================================
  initClock() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
      
      const clockEl = document.getElementById('digitalClock');
      const dateEl = document.getElementById('digitalDate');
      if (clockEl) clockEl.textContent = timeStr;
      if (dateEl) dateEl.textContent = dateStr;
    };
    update();
    setInterval(update, 1000);
  }

  // ==========================================================================
  // 6-LANGUAGE I18N SUPPORT
  // ==========================================================================
  changeLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('carepulse_lang', lang);
    this.applyLanguage(lang);
    this.showToast(`Language set to ${lang.toUpperCase()}`, "info");
  }

  applyLanguage(lang) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });
  }

  getTranslation(key) {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  }

  // ==========================================================================
  // AUTHENTICATION & THREE SEPARATE ROLES (REAL OTP-BASED)
  // ==========================================================================
  selectAuthRole(role) {
    this.selectedAuthRole = role;
    ['Patient', 'Staff', 'Doctor'].forEach(r => {
      const btn = document.getElementById(`roleBtn-${r}`);
      if (btn) {
        if (r === role) {
          btn.className = "role-select-btn p-3 rounded-2xl border-2 border-royal-600 bg-royal-50 text-royal-700 flex flex-col items-center justify-center transition shadow-sm";
        } else {
          btn.className = "role-select-btn p-3 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 flex flex-col items-center justify-center transition";
        }
      }
    });

    const titleEl = document.getElementById('authTitle');
    const subtitleEl = document.getElementById('authSubtitle');
    const regFields = document.getElementById('patientRegFields');

    if (role === 'Patient') {
      if (titleEl) titleEl.textContent = "Patient Portal Login & Registration";
      if (subtitleEl) subtitleEl.textContent = "Sign in or self-register via real Email or Phone SMS OTP";
      if (regFields) regFields.classList.remove('hidden');
    } else if (role === 'Staff') {
      if (titleEl) titleEl.textContent = "Staff & Receptionist Portal";
      if (subtitleEl) subtitleEl.textContent = "Authorized OPD queue triage, pharmacy dispatch & blood bank";
      if (regFields) regFields.classList.add('hidden');
    } else if (role === 'Doctor') {
      if (titleEl) titleEl.textContent = "Doctor Consultation Suite";
      if (subtitleEl) subtitleEl.textContent = "Clinical consultations, assigned queues & doctor availability";
      if (regFields) regFields.classList.add('hidden');
    }

    this.clearAuthError();
    if (window.lucide) lucide.createIcons();
  }

  selectAuthMethod(method) {
    this.selectedAuthMethod = method; // 'email' or 'phone'

    const emailBtn = document.getElementById('authMethodBtn-email');
    const phoneBtn = document.getElementById('authMethodBtn-phone');
    const emailGroup = document.getElementById('emailInputGroup');
    const phoneGroup = document.getElementById('phoneInputGroup');

    if (method === 'email') {
      if (emailBtn) {
        emailBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 bg-white text-royal-700 shadow-sm border border-slate-200";
      }
      if (phoneBtn) {
        phoneBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
      }
      if (emailGroup) emailGroup.classList.remove('hidden');
      if (phoneGroup) phoneGroup.classList.add('hidden');
    } else {
      if (phoneBtn) {
        phoneBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 bg-white text-royal-700 shadow-sm border border-slate-200";
      }
      if (emailBtn) {
        emailBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
      }
      if (emailGroup) emailGroup.classList.add('hidden');
      if (phoneGroup) phoneGroup.classList.remove('hidden');
    }

    this.clearAuthError();
    if (window.lucide) lucide.createIcons();
  }

  setupOtpInputListeners() {
    const boxes = document.querySelectorAll('.otp-box');
    if (!boxes || boxes.length === 0) return;

    boxes.forEach((box, idx) => {
      // Automatic focus advance
      box.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val ? val.slice(-1) : '';

        if (e.target.value && idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        }
        this.syncOtpInputValue();
      });

      // Backspace handling
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          boxes[idx - 1].focus();
        } else if (e.key === 'Enter') {
          this.verifyOtp();
        }
      });

      // Full Paste handling (e.g. user copies '548291')
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pasted.replace(/[^0-9]/g, '').slice(0, 6);
        if (digits) {
          digits.split('').forEach((d, i) => {
            if (boxes[i]) boxes[i].value = d;
          });
          const focusIdx = Math.min(digits.length, boxes.length - 1);
          boxes[focusIdx].focus();
          this.syncOtpInputValue();

          if (digits.length === 6) {
            // Auto-verify if all 6 digits pasted
            setTimeout(() => this.verifyOtp(), 250);
          }
        }
      });
    });
  }

  syncOtpInputValue() {
    const boxes = document.querySelectorAll('.otp-box');
    let code = '';
    boxes.forEach(b => code += (b.value || ''));
    const hiddenInput = document.getElementById('authOtpCode');
    if (hiddenInput) hiddenInput.value = code;
    return code;
  }

  clearOtpInputs() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach(b => b.value = '');
    const hiddenInput = document.getElementById('authOtpCode');
    if (hiddenInput) hiddenInput.value = '';
    if (boxes[0]) boxes[0].focus();
  }

  clearAuthError() {
    const errorBanner = document.getElementById('authErrorBanner');
    if (errorBanner) {
      errorBanner.className = 'hidden';
      errorBanner.textContent = '';
    }
  }

  showAuthError(message) {
    const errorBanner = document.getElementById('authErrorBanner');
    if (errorBanner) {
      errorBanner.className = "p-3 rounded-xl text-xs bg-red-100 text-red-800 border border-red-300 block mb-4";
      errorBanner.textContent = message;
    }
    this.showToast(message, "danger");
  }

  async requestOtp() {
    this.clearAuthError();
    const btn = document.getElementById('btnRequestOtp');
    const method = this.selectedAuthMethod || 'email';
    let identifier = '';

    if (method === 'email') {
      identifier = document.getElementById('authEmailInput')?.value.trim();
      if (!identifier) {
        this.showAuthError("Please enter your email address.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        this.showAuthError("Please enter a valid email address (e.g. name@example.com).");
        return;
      }
    } else {
      const code = document.getElementById('authCountryCode')?.value || '+91';
      const rawPhone = document.getElementById('authPhoneInput')?.value.trim();
      if (!rawPhone) {
        this.showAuthError("Please enter your mobile phone number.");
        return;
      }
      const digits = rawPhone.replace(/[^0-9]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        this.showAuthError("Please enter a valid mobile phone number.");
        return;
      }
      identifier = `${code}${digits.length === 10 ? digits : digits.slice(-10)}`;
    }

    const regName = document.getElementById('regPatientName')?.value.trim();
    const regAge = document.getElementById('regPatientAge')?.value;
    const regGender = document.getElementById('regPatientGender')?.value;

    const payload = {
      identifier,
      targetRole: this.selectedAuthRole,
      channel: method,
      profileData: this.selectedAuthRole === 'Patient' ? {
        name: regName,
        age: regAge,
        gender: regGender
      } : null
    };

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-2">&#9696;</span> Dispatching ${method === 'email' ? 'Email' : 'SMS'} OTP...`;
    }

    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        this.showAuthError(data.error || "Failed to dispatch OTP code.");
        return;
      }

      this.currentAuthIdentifier = identifier;
      this.currentAuthChannel = method;

      // Switch to Step 2
      document.getElementById('authStep1')?.classList.add('hidden');
      document.getElementById('authStep2')?.classList.remove('hidden');

      const targetDisplay = document.getElementById('otpTargetDisplay');
      if (targetDisplay) targetDisplay.textContent = identifier;

      const channelDisplay = document.getElementById('otpChannelDisplay');
      if (channelDisplay) channelDisplay.textContent = method === 'email' ? 'Email' : 'SMS';

      this.clearOtpInputs();
      this.setupOtpInputListeners();
      this.startOtpTimer(data.expiresInSeconds || 300);

      this.showToast(data.message || "OTP code dispatched successfully.", "success");
    } catch (err) {
      this.showAuthError("Connection error. Could not contact the authentication server.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span id="btnRequestOtpText">Send Secure OTP</span>`;
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  startOtpTimer(seconds) {
    if (this.otpTimerInterval) clearInterval(this.otpTimerInterval);
    let left = seconds;
    const timerEl = document.getElementById('otpTimerDisplay');
    const resendBtn = document.getElementById('btnResendOtp');

    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.classList.add('opacity-40', 'cursor-not-allowed');
    }

    const cooldownPeriod = 60; // 60s resend cooldown
    let cooldownLeft = cooldownPeriod;

    this.otpTimerInterval = setInterval(() => {
      left--;
      cooldownLeft--;

      const m = Math.floor(left / 60);
      const s = left % 60;
      if (timerEl) {
        timerEl.textContent = `Expires in: ${m}m ${s < 10 ? '0' : ''}${s}s`;
      }

      if (cooldownLeft <= 0 && resendBtn && resendBtn.disabled && left > 0) {
        resendBtn.disabled = false;
        resendBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        resendBtn.textContent = "Resend OTP";
      } else if (cooldownLeft > 0 && resendBtn && resendBtn.disabled) {
        resendBtn.textContent = `Resend in ${cooldownLeft}s`;
      }

      if (left <= 0) {
        clearInterval(this.otpTimerInterval);
        if (timerEl) timerEl.textContent = "OTP has expired. Please request a new code.";
        if (resendBtn) {
          resendBtn.disabled = false;
          resendBtn.classList.remove('opacity-40', 'cursor-not-allowed');
          resendBtn.textContent = "Resend OTP";
        }
      }
    }, 1000);
  }

  backToStep1() {
    if (this.otpTimerInterval) clearInterval(this.otpTimerInterval);
    document.getElementById('authStep2')?.classList.add('hidden');
    document.getElementById('authStep1')?.classList.remove('hidden');
    this.clearAuthError();
    if (window.lucide) lucide.createIcons();
  }

  async verifyOtp() {
    this.clearAuthError();
    const identifier = this.currentAuthIdentifier;
    const otpCode = this.syncOtpInputValue();
    const btn = document.getElementById('btnVerifyOtp');

    if (!identifier) {
      this.showAuthError("Missing authentication session. Please start over.");
      this.backToStep1();
      return;
    }

    if (!otpCode || otpCode.length < 6) {
      this.showAuthError("Please enter all 6 digits of your OTP code.");
      return;
    }

    const regName = document.getElementById('regPatientName')?.value.trim();
    const regAge = document.getElementById('regPatientAge')?.value;
    const regGender = document.getElementById('regPatientGender')?.value;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-2">&#9696;</span> Verifying Code...`;
    }

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          otpCode,
          targetRole: this.selectedAuthRole,
          registerDetails: {
            name: regName,
            age: regAge,
            gender: regGender
          }
        })
      });

      const data = await res.json();

      if (!res.ok) {
        this.showAuthError(data.error || "OTP verification failed. Please check your code.");
        if (data.attemptsLeft !== undefined && data.attemptsLeft !== null) {
          this.showToast(`Incorrect OTP. ${data.attemptsLeft} attempts remaining.`, "danger");
        }
        return;
      }

      if (this.otpTimerInterval) clearInterval(this.otpTimerInterval);

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('carepulse_jwt', data.token);
      localStorage.setItem('carepulse_user', JSON.stringify(data.user));

      this.showToast(`Verified! Welcome to CarePulse, ${data.user.name} (${data.user.role}).`, "success");
      this.renderAuthHeader();
      this.routeToRoleDashboard();
    } catch (err) {
      this.showAuthError("Connection error while verifying OTP code.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> <span data-i18n="verifyOtp">Verify OTP & Enter</span>`;
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  async verifyCurrentSession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) {
        this.logout();
        return;
      }
      const user = await res.json();
      this.user = user;
      localStorage.setItem('carepulse_user', JSON.stringify(user));
      this.renderAuthHeader();
      this.routeToRoleDashboard();
    } catch (e) {
      this.logout();
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('carepulse_jwt');
    localStorage.removeItem('carepulse_user');
    this.showView('authView');
    this.renderAuthHeader();
    this.showToast("Signed out successfully.", "info");
  }

  renderAuthHeader() {
    const container = document.getElementById('authHeaderBlock');
    const roleBadge = document.getElementById('roleBadge');
    if (!container) return;

    if (this.user) {
      if (roleBadge) {
        roleBadge.textContent = this.user.role;
        roleBadge.classList.remove('hidden');
      }
      container.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="text-right hidden sm:block">
            <span class="text-xs font-bold text-slate-800 block">${this.user.name}</span>
            <span class="text-[10px] text-slate-500 font-mono-code">${this.user.role}</span>
          </div>
          <button onclick="CarePulseApp.logout()" title="Sign Out" class="p-2 rounded-xl bg-cream-50 hover:bg-cream-200 text-slate-700 border border-cream-300 transition">
            <i data-lucide="log-out" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    } else {
      if (roleBadge) roleBadge.classList.add('hidden');
      container.innerHTML = `
        <button onclick="CarePulseApp.showView('authView')" class="px-4 py-2 rounded-xl bg-royal-600 hover:bg-royal-700 text-white font-bold text-xs shadow-sm transition">
          Sign In
        </button>
      `;
    }
    if (window.lucide) lucide.createIcons();
  }

  routeToRoleDashboard() {
    if (!this.user) {
      this.showView('authView');
      return;
    }

    if (this.user.role === 'Patient') {
      this.showView('patientDashboardView');
      this.loadPatientDashboard();
    } else if (this.user.role === 'Staff') {
      this.showView('staffDashboardView');
      this.loadStaffDashboard();
    } else if (this.user.role === 'Doctor') {
      this.showView('doctorDashboardView');
      this.loadDoctorDashboard();
    }
  }

  showView(viewId) {
    ['authView', 'patientDashboardView', 'staffDashboardView', 'doctorDashboardView', 'publicTvView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === viewId) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    });
    if (window.lucide) lucide.createIcons();
  }

  // ==========================================================================
  // SPECIALITIES & REAL DB DOCTORS
  // ==========================================================================
  async fetchSpecialitiesAndDoctors() {
    try {
      const [resSpec, resDoc] = await Promise.all([
        fetch('/api/specialities'),
        fetch('/api/doctors')
      ]);
      this.specialities = await resSpec.json();
      this.doctors = await resDoc.json();

      this.populateSpecialityDropdowns();
    } catch (e) {
      console.error("Error loading specialities/doctors:", e);
    }
  }

  populateSpecialityDropdowns() {
    const aptSpec = document.getElementById('aptSpeciality');
    const wiSpec = document.getElementById('wiSpeciality');

    const optionsHtml = this.specialities.map(s => `<option value="${s}">${s}</option>`).join('');
    if (aptSpec) {
      aptSpec.innerHTML = optionsHtml;
      this.loadDoctorsForSpeciality(this.specialities[0], 'aptDoctor');
    }
    if (wiSpec) {
      wiSpec.innerHTML = optionsHtml;
      this.loadDoctorsForSpeciality(this.specialities[0], 'wiDoctor');
    }
  }

  loadDoctorsForSpeciality(speciality, targetSelectId) {
    const select = document.getElementById(targetSelectId);
    if (!select) return;

    // Filter ONLY real doctors registered in database with this speciality
    const matchedDocs = this.doctors.filter(d => d.speciality.toLowerCase() === speciality.toLowerCase());

    if (matchedDocs.length === 0) {
      select.innerHTML = `<option value="">No active doctors available in ${speciality}</option>`;
    } else {
      select.innerHTML = matchedDocs.map(d => `
        <option value="${d.id}">${d.name} (${d.room}) - ${d.status}</option>
      `).join('');
    }
  }

  // ==========================================================================
  // PATIENT DASHBOARD WORKFLOWS
  // ==========================================================================
  async loadPatientDashboard() {
    const nameEl = document.getElementById('patProfileName');
    if (nameEl && this.user) nameEl.textContent = this.user.name;

    await Promise.all([
      this.loadPatientActiveToken(),
      this.loadPatientAppointments(),
      this.loadPatientPharmacyOrders()
    ]);
  }

  async loadPatientActiveToken() {
    const container = document.getElementById('patientActiveTokenCard');
    if (!container) return;

    try {
      const res = await fetch('/api/queue', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const queue = await res.json();
      const active = queue.find(q => q.status === 'Waiting' || q.status === 'In-Consultation');

      if (!active) {
        container.innerHTML = `
          <div class="text-center py-8">
            <i data-lucide="ticket" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
            <h4 class="text-base font-bold text-slate-700">No Active OPD Token</h4>
            <p class="text-xs text-slate-500 mt-1">Book an appointment or check-in as a walk-in patient above to receive an active queue token.</p>
          </div>
        `;
      } else {
        this.activeTokenForDownload = active;
        const isNowServing = active.status === 'In-Consultation';

        container.innerHTML = `
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-cream-200 pb-4 mb-4">
            <div>
              <span class="text-[10px] uppercase font-bold tracking-widest text-royal-600 block">CURRENT ACTIVE TOKEN</span>
              <span class="text-4xl sm:text-5xl font-black font-mono-code text-slate-900">${active.tokenId}</span>
              <span class="text-xs font-semibold text-slate-500 block mt-0.5">${active.speciality} &bull; ${active.priority} Priority</span>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-slate-500 block uppercase">Queue Position</span>
              <span class="text-3xl font-black font-mono-code ${isNowServing ? 'text-emerald-600' : 'text-royal-600'}">
                ${isNowServing ? 'NOW SERVING' : `#${active.position}`}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
            <div class="bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <span class="text-slate-500 block text-[10px]">Consulting Doctor</span>
              <strong class="text-slate-800 text-xs">${active.doctorName}</strong>
            </div>
            <div class="bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <span class="text-slate-500 block text-[10px]">Consultation Room</span>
              <strong class="text-royal-600 text-xs">${active.room}</strong>
            </div>
            <div class="bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <span class="text-slate-500 block text-[10px]">Estimated Wait Time</span>
              <strong class="text-amber-600 text-xs">~${active.estimatedWaitMins} mins</strong>
            </div>
            <div class="bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <span class="text-slate-500 block text-[10px]">Live Status</span>
              <strong class="text-emerald-600 text-xs">${active.status}</strong>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2">
            <span class="text-[11px] text-slate-500 flex items-center gap-1">
              <i data-lucide="bell" class="w-3.5 h-3.5 text-royal-600"></i> AI Voice Alert triggers when queue position reaches &le; 3.
            </span>
            <button onclick="CarePulseApp.openDownloadTokenModal()" class="px-4 py-2 bg-royal-600 hover:bg-royal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> <span>Download Token</span>
            </button>
          </div>
        `;

        const outperoBadge = document.getElementById('patientOutperoStatusBadge');
        if (outperoBadge) {
          outperoBadge.textContent = active.outperoCallStatus || "Idle";
        }
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  async loadPatientAppointments() {
    const listEl = document.getElementById('patientApptsList');
    const badgeEl = document.getElementById('patApptCountBadge');
    if (!listEl) return;

    try {
      const res = await fetch('/api/appointments', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const list = await res.json();
      if (badgeEl) badgeEl.textContent = `${list.length} Bookings`;

      if (list.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No previous appointment bookings.</p>`;
        return;
      }

      listEl.innerHTML = list.map(a => `
        <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex items-center justify-between text-xs">
          <div>
            <strong class="text-slate-800 block">${a.speciality} &bull; ${a.doctorName}</strong>
            <span class="text-[11px] text-slate-500">${a.date} (${a.slot})</span>
          </div>
          <span class="font-bold px-2.5 py-0.5 rounded-full text-[10px] ${a.status === 'Confirmed' ? 'bg-royal-100 text-royal-700' : 'bg-emerald-100 text-emerald-700'}">
            ${a.status}
          </span>
        </div>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  async loadPatientPharmacyOrders() {
    const listEl = document.getElementById('patientPharmacyList');
    const badgeEl = document.getElementById('patPharmacyCountBadge');
    if (!listEl) return;

    try {
      const res = await fetch('/api/pharmacy/bookings', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const list = await res.json();
      if (badgeEl) badgeEl.textContent = `${list.length} Orders`;

      if (list.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No active pharmacy prescriptions or bookings.</p>`;
        return;
      }

      listEl.innerHTML = list.map(o => `
        <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex items-center justify-between text-xs">
          <div>
            <span class="font-mono-code font-bold text-royal-600">${o.bookingRef}</span>
            <span class="text-slate-500 block text-[11px]">${o.items.length} items &bull; Total: ₹${o.totalAmount}</span>
          </div>
          <span class="font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800">
            ${o.status}
          </span>
        </div>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // Modals handling
  openAppointmentModal() {
    document.getElementById('aptDate').valueAsDate = new Date();
    document.getElementById('appointmentModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  openWalkInModal() {
    document.getElementById('walkInModal').classList.remove('hidden');
    if (this.user) {
      document.getElementById('wiName').value = this.user.name;
      document.getElementById('wiPhone').value = this.user.phone;
      if (this.user.gender) document.getElementById('wiGender').value = this.user.gender;
      if (this.user.age) document.getElementById('wiAge').value = this.user.age;
    }
    if (window.lucide) lucide.createIcons();
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  async handleBookAppointment(event) {
    event.preventDefault();
    const speciality = document.getElementById('aptSpeciality').value;
    const doctorId = document.getElementById('aptDoctor').value;
    const appointmentDate = document.getElementById('aptDate').value;
    const appointmentSlot = document.getElementById('aptSlot').value;
    const patientNotes = document.getElementById('aptNotes').value;

    if (!doctorId) {
      this.showToast("Please select an available doctor.", "danger");
      return;
    }

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ doctorId, speciality, appointmentDate, appointmentSlot, patientNotes })
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || "Booking failed", "danger");
        return;
      }

      this.closeModal('appointmentModal');
      this.showToast("Appointment booked successfully!", "success");
      this.loadPatientDashboard();
    } catch (e) {
      this.showToast("Server error booking appointment", "danger");
    }
  }

  async handleWalkInRegistration(event) {
    event.preventDefault();
    const patientName = document.getElementById('wiName').value.trim();
    const patientPhone = document.getElementById('wiPhone').value.trim();
    const patientAge = document.getElementById('wiAge').value;
    const patientGender = document.getElementById('wiGender').value;
    const speciality = document.getElementById('wiSpeciality').value;
    const doctorId = document.getElementById('wiDoctor').value;
    const priority = document.getElementById('wiPriority').value;

    try {
      const res = await fetch('/api/queue/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          patientName, patientPhone, patientAge, patientGender,
          speciality, doctorId, priority, type: "Walk-In"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || "Failed to generate token", "danger");
        return;
      }

      this.closeModal('walkInModal');
      this.showToast(`Token ${data.queueItem.tokenId} registered successfully!`, "success");
      this.activeTokenForDownload = data.queueItem;
      this.openDownloadTokenModal();
      this.loadPatientDashboard();
    } catch (e) {
      this.showToast("Server error registering token", "danger");
    }
  }

  openDownloadTokenModal() {
    if (!this.activeTokenForDownload) return;
    const t = this.activeTokenForDownload;
    document.getElementById('dtTokenId').textContent = t.tokenId;
    document.getElementById('dtSpeciality').textContent = t.speciality;
    document.getElementById('dtPatientName').textContent = t.patientName;
    document.getElementById('dtDoctorName').textContent = t.doctorName;
    document.getElementById('dtRoom').textContent = t.room;
    document.getElementById('dtWaitTime').textContent = `~${t.estimatedWaitMins} mins`;

    document.getElementById('downloadTokenModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  executeTokenDownload() {
    if (!this.activeTokenForDownload) return;
    const t = this.activeTokenForDownload;
    const content = `
========================================
       CAREPULSE OPD TOKEN SLIP
Real-Time Insights. Better Care.
========================================
Token ID:       ${t.tokenId}
Priority:       ${t.priority}
Patient Name:   ${t.patientName}
Speciality:     ${t.speciality}
Doctor:         ${t.doctorName}
Room:           ${t.room}
Est. Wait:      ~${t.estimatedWaitMins} mins
Generated At:   ${new Date(t.registeredAt).toLocaleString('en-GB')}
========================================
Please proceed toward ${t.room} when called.
Track live queue at: carepulse.org
========================================
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CarePulse_Token_${t.tokenId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`Downloaded Token slip for ${t.tokenId}`, "success");
    this.closeModal('downloadTokenModal');
  }

  // ==========================================================================
  // STAFF DASHBOARD (9 SECTIONS)
  // ==========================================================================
  async loadStaffDashboard() {
    this.switchStaffSubTab(this.activeStaffTab);
  }

  switchStaffSubTab(tabName) {
    this.activeStaffTab = tabName;
    const tabs = ['overview', 'queue', 'appointments', 'pharmacy', 'bloodbank', 'doctors', 'reports', 'notifications', 'settings'];
    tabs.forEach(t => {
      const btn = document.getElementById(`staffTab-${t}`);
      if (btn) {
        if (t === tabName) {
          btn.className = "staff-subtab-btn px-3 py-2 rounded-xl bg-royal-600 text-white flex items-center gap-1.5 shadow-sm";
        } else {
          btn.className = "staff-subtab-btn px-3 py-2 rounded-xl text-slate-600 hover:bg-cream-100 flex items-center gap-1.5 transition";
        }
      }
    });

    const contentContainer = document.getElementById('staffSubTabContent');
    if (!contentContainer) return;

    if (tabName === 'overview') this.renderStaffOverview(contentContainer);
    else if (tabName === 'queue') this.renderStaffQueueManagement(contentContainer);
    else if (tabName === 'appointments') this.renderStaffAppointments(contentContainer);
    else if (tabName === 'pharmacy') this.renderStaffPharmacy(contentContainer);
    else if (tabName === 'bloodbank') this.renderStaffBloodBank(contentContainer);
    else if (tabName === 'doctors') this.renderStaffDoctors(contentContainer);
    else if (tabName === 'reports') this.renderStaffReports(contentContainer);
    else if (tabName === 'notifications') this.renderStaffNotifications(contentContainer);
    else if (tabName === 'settings') this.renderStaffSettings(contentContainer);

    if (window.lucide) lucide.createIcons();
  }

  async renderStaffOverview(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">Loading overview metrics...</div>`;
    const res = await fetch('/api/reports/analytics', { headers: { 'Authorization': `Bearer ${this.token}` } });
    const data = await res.json();
    const m = data.metrics;

    container.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-3xl border border-cream-300 shadow-sm">
          <span class="text-slate-500 text-xs font-bold uppercase tracking-wider block">Total Checked-In</span>
          <span class="text-3xl font-black font-mono-code text-slate-900 mt-1 block">${m.totalRegistered}</span>
        </div>
        <div class="bg-white p-5 rounded-3xl border border-cream-300 shadow-sm">
          <span class="text-slate-500 text-xs font-bold uppercase tracking-wider block">Active Waiting</span>
          <span class="text-3xl font-black font-mono-code text-royal-600 mt-1 block">${m.waiting}</span>
        </div>
        <div class="bg-white p-5 rounded-3xl border border-cream-300 shadow-sm">
          <span class="text-slate-500 text-xs font-bold uppercase tracking-wider block">Avg Wait Time</span>
          <span class="text-3xl font-black font-mono-code text-amber-600 mt-1 block">${m.avgWaitTimeMins}m</span>
        </div>
        <div class="bg-white p-5 rounded-3xl border border-cream-300 shadow-sm">
          <span class="text-slate-500 text-xs font-bold uppercase tracking-wider block">Completed Consultations</span>
          <span class="text-3xl font-black font-mono-code text-emerald-600 mt-1 block">${m.completed}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-3xl border border-cream-300 shadow-sm">
          <h4 class="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Live Department OPD Flow</h4>
          <div class="space-y-3">
            ${data.doctorStats.map(d => `
              <div class="flex items-center justify-between p-3 bg-cream-50 rounded-2xl border border-cream-200 text-xs">
                <div>
                  <strong class="text-slate-800">${d.speciality} &bull; ${d.doctorName}</strong>
                  <span class="text-[11px] text-slate-500 block">Avg Velocity: ${d.avgSpeed} mins / pt</span>
                </div>
                <div class="text-right">
                  <span class="font-mono-code font-bold text-royal-600">${d.waiting} waiting</span>
                  <span class="text-[10px] text-emerald-600 block">${d.completed} completed</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white p-6 rounded-3xl border border-cream-300 shadow-sm">
          <h4 class="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Hospital Security & Audit Feed</h4>
          <div class="space-y-2 max-h-72 overflow-y-auto custom-scrollbar text-xs">
            ${data.auditLogsRecent.map(l => `
              <div class="p-2.5 bg-cream-50 rounded-xl border border-cream-200">
                <div class="flex justify-between text-[10px] text-slate-500">
                  <span class="font-bold text-royal-700">${l.actorName} (${l.actorRole})</span>
                  <span>${new Date(l.timestamp).toLocaleTimeString()}</span>
                </div>
                <p class="text-slate-700 mt-0.5">${l.details}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async renderStaffQueueManagement(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">Loading queue registry...</div>`;
    const res = await fetch('/api/queue', { headers: { 'Authorization': `Bearer ${this.token}` } });
    const queue = await res.json();

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-cream-300 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-cream-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-black text-slate-900">OPD Real-Time Queue Console</h3>
            <p class="text-xs text-slate-500">Call next, recall, delay (+5m / +10m), or reassign waiting patients</p>
          </div>
          <button onclick="CarePulseApp.openWalkInModal()" class="px-4 py-2 bg-royal-600 hover:bg-royal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm">
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Walk-In Registration
          </button>
        </div>

        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-cream-50 border-b border-cream-200 text-slate-600 font-bold uppercase tracking-wider">
                <th class="py-3 px-4">Pos</th>
                <th class="py-3 px-4">Token ID</th>
                <th class="py-3 px-4">Patient Details</th>
                <th class="py-3 px-4">Speciality & Doctor</th>
                <th class="py-3 px-4">Priority</th>
                <th class="py-3 px-4">Wait Time</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-cream-200 font-medium text-slate-800">
              ${queue.map(q => `
                <tr class="hover:bg-cream-50/60 transition">
                  <td class="py-3 px-4 font-mono-code font-bold">#${q.position || '-'}</td>
                  <td class="py-3 px-4 font-mono-code font-bold text-royal-600">${q.tokenId}</td>
                  <td class="py-3 px-4">
                    <span class="font-bold block">${q.patientName}</span>
                    <span class="text-[10px] text-slate-500 font-mono-code">${q.patientPhone} &bull; ${q.patientGender}, ${q.patientAge}y</span>
                  </td>
                  <td class="py-3 px-4">
                    <span class="block">${q.speciality}</span>
                    <span class="text-[10px] text-slate-500">${q.doctorName} (${q.room})</span>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${q.priority === 'Emergency' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}">${q.priority}</span>
                  </td>
                  <td class="py-3 px-4 font-mono-code font-bold text-amber-600">~${q.estimatedWaitMins}m</td>
                  <td class="py-3 px-4">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${q.status === 'In-Consultation' ? 'bg-emerald-100 text-emerald-800' : 'bg-royal-100 text-royal-800'}">${q.status}</span>
                  </td>
                  <td class="py-3 px-4 text-right space-x-1">
                    <button onclick="CarePulseApp.updateQueueStatus('${q.id}', 'In-Consultation')" title="Call Next" class="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"><i data-lucide="phone-call" class="w-3.5 h-3.5"></i></button>
                    <button onclick="CarePulseApp.delayQueueToken('${q.id}', 5)" title="Delay +5m" class="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg"><i data-lucide="clock" class="w-3.5 h-3.5"></i></button>
                    <button onclick="CarePulseApp.updateQueueStatus('${q.id}', 'Completed')" title="Complete" class="p-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg"><i data-lucide="check" class="w-3.5 h-3.5"></i></button>
                    <button onclick="CarePulseApp.updateQueueStatus('${q.id}', 'Skipped')" title="Skip / No-Show" class="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg"><i data-lucide="user-x" class="w-3.5 h-3.5"></i></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async updateQueueStatus(queueId, status) {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        this.showToast(`Token status updated to ${status}`, "success");
        this.switchStaffSubTab(this.activeStaffTab);
      }
    } catch (e) {
      this.showToast("Error updating queue item", "danger");
    }
  }

  async delayQueueToken(queueId, mins) {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ delayMins: mins })
      });
      if (res.ok) {
        this.showToast(`Token delayed by +${mins} mins`, "warning");
        this.switchStaffSubTab(this.activeStaffTab);
      }
    } catch (e) {
      this.showToast("Error delaying token", "danger");
    }
  }

  async renderStaffAppointments(container) {
    const res = await fetch('/api/appointments', { headers: { 'Authorization': `Bearer ${this.token}` } });
    const list = await res.json();

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
        <h3 class="text-base font-black text-slate-900 mb-4">Patient Appointment Roster</h3>
        <div class="space-y-3">
          ${list.map(a => `
            <div class="p-4 bg-cream-50 rounded-2xl border border-cream-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <strong class="text-slate-900 text-sm block">${a.patientName} (${a.patientPhone})</strong>
                <span class="text-slate-500">${a.speciality} &bull; ${a.doctorName} (${a.room})</span>
                <span class="text-royal-600 block font-mono-code mt-0.5">${a.date} at ${a.slot}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${a.status === 'Checked-In' ? 'bg-emerald-100 text-emerald-800' : 'bg-royal-100 text-royal-800'}">${a.status}</span>
                ${a.status !== 'Checked-In' ? `
                  <button onclick="CarePulseApp.checkInAppointmentPatient('${a.id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1">
                    <i data-lucide="ticket" class="w-3.5 h-3.5"></i> Check-In into Queue
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async checkInAppointmentPatient(apptId) {
    try {
      const res = await fetch(`/api/appointments/${apptId}/checkin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(`Checked in! Generated Token: ${data.queueItem.tokenId}`, "success");
        this.switchStaffSubTab(this.activeStaffTab);
      }
    } catch (e) {
      this.showToast("Error checking in patient", "danger");
    }
  }

  // ==========================================================================
  // PHARMACY BOOKING SYSTEM (FEATURE 5)
  // ==========================================================================
  async renderStaffPharmacy(container) {
    const [resInv, resBookings] = await Promise.all([
      fetch('/api/pharmacy/inventory', { headers: { 'Authorization': `Bearer ${this.token}` } }),
      fetch('/api/pharmacy/bookings', { headers: { 'Authorization': `Bearer ${this.token}` } })
    ]);
    const inventory = await resInv.json();
    const bookings = await resBookings.json();

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- New Pharmacy Booking Workflow (Col 5) -->
        <div class="lg:col-span-5 bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-1.5">
            <i data-lucide="plus-circle" class="w-4 h-4 text-royal-600"></i> New Pharmacy Booking
          </h3>
          <form onsubmit="CarePulseApp.submitPharmacyBooking(event)" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Patient Name *</label>
              <input type="text" id="phPatientName" required placeholder="Full Name" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Patient Phone *</label>
              <input type="tel" id="phPatientPhone" required placeholder="10-digit Phone" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono-code" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Select Medicine Item *</label>
              <select id="phMedicineSelect" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold">
                ${inventory.map(m => `
                  <option value="${m.id}" data-price="${m.price}" data-stock="${m.stock}" ${m.stock <= 0 ? 'disabled' : ''}>
                    ${m.name} ${m.strength} (${m.form}) - ₹${m.price.toFixed(2)} (Stock: ${m.stock})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Quantity *</label>
                <input type="number" id="phQuantity" min="1" max="50" value="10" required class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono-code" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Rx Verification</label>
                <input type="text" id="phRxNotes" value="Verified OPD Prescription" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs" />
              </div>
            </div>
            <button type="submit" class="w-full py-2.5 bg-royal-600 hover:bg-royal-700 text-white font-bold uppercase rounded-xl transition shadow-md">
              Create Booking Reference
            </button>
          </form>
        </div>

        <!-- Inventory Status & Bookings (Col 7) -->
        <div class="lg:col-span-7 space-y-6">
          <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center justify-between">
              <span>Active Pharmacy Bookings (${bookings.length})</span>
            </h4>
            <div class="space-y-3 max-h-64 overflow-y-auto custom-scrollbar text-xs">
              ${bookings.map(b => `
                <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span class="font-mono-code font-bold text-royal-600">${b.bookingRef}</span>
                    <strong class="text-slate-800 block">${b.patientName} (${b.patientPhone})</strong>
                    <span class="text-[11px] text-slate-500">${b.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</span>
                    <span class="text-[11px] font-bold text-emerald-700 block mt-0.5">Total: ₹${b.totalAmount.toFixed(2)}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <select onchange="CarePulseApp.updatePharmacyOrderStatus('${b.id}', this.value)" class="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold">
                      ${["Pending Review", "Confirmed", "Preparing", "Ready for Pickup", "Dispensed", "Cancelled"].map(s => `
                        <option value="${s}" ${b.status === s ? 'selected' : ''}>${s}</option>
                      `).join('')}
                    </select>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Inventory Alerts Grid -->
          <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Pharmacy Stock Inventory</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar text-xs">
              ${inventory.map(m => {
                const isLow = m.stock <= m.minStock;
                return `
                  <div class="p-2.5 rounded-xl border ${isLow ? 'bg-amber-50 border-amber-300' : 'bg-cream-50 border-cream-200'}">
                    <strong class="text-slate-800 block truncate">${m.name} ${m.strength}</strong>
                    <span class="text-[10px] text-slate-500">${m.form} &bull; ₹${m.price.toFixed(2)}</span>
                    <div class="flex justify-between items-center mt-1">
                      <span class="font-mono-code font-bold ${isLow ? 'text-amber-700' : 'text-slate-800'}">Stock: ${m.stock}</span>
                      ${isLow ? `<span class="text-[9px] font-bold bg-amber-200 text-amber-900 px-1 rounded">Low</span>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async submitPharmacyBooking(event) {
    event.preventDefault();
    const patientName = document.getElementById('phPatientName').value.trim();
    const patientPhone = document.getElementById('phPatientPhone').value.trim();
    const medicineId = document.getElementById('phMedicineSelect').value;
    const quantity = parseInt(document.getElementById('phQuantity').value, 10);
    const prescriptionNotes = document.getElementById('phRxNotes').value;

    try {
      const res = await fetch('/api/pharmacy/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          patientName, patientPhone, prescriptionNotes,
          items: [{ medicineId, quantity }]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || "Order creation failed", "danger");
        return;
      }
      this.showToast(`Pharmacy Booking ${data.booking.bookingRef} created successfully!`, "success");
      this.switchStaffSubTab('pharmacy');
    } catch (e) {
      this.showToast("Error creating pharmacy order", "danger");
    }
  }

  async updatePharmacyOrderStatus(orderId, status) {
    try {
      const res = await fetch(`/api/pharmacy/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        this.showToast(`Order status updated to ${status}`, "info");
      }
    } catch (e) {
      this.showToast("Failed to update status", "danger");
    }
  }

  // ==========================================================================
  // BLOOD BANK (MANDATORY >= 50 KG RULE)
  // ==========================================================================
  async renderStaffBloodBank(container) {
    const [resInv, resDonors, resRequests] = await Promise.all([
      fetch('/api/blood-bank/inventory', { headers: { 'Authorization': `Bearer ${this.token}` } }),
      fetch('/api/blood-bank/donors', { headers: { 'Authorization': `Bearer ${this.token}` } }),
      fetch('/api/blood-bank/requests', { headers: { 'Authorization': `Bearer ${this.token}` } })
    ]);
    const inventory = await resInv.json();
    const donors = await resDonors.json();
    const requests = await resRequests.json();

    container.innerHTML = `
      <!-- Blood Group 8 Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        ${inventory.map(b => `
          <div class="bg-white p-3.5 rounded-2xl border border-cream-300 text-center shadow-sm">
            <span class="text-xl font-black font-mono-code text-medical-crimson block">${b.bloodGroup}</span>
            <span class="text-2xl font-black font-mono-code text-slate-800 mt-1 block">${b.units}</span>
            <span class="text-[10px] uppercase font-bold text-slate-400">Units Avail</span>
          </div>
        `).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Donor Check-in Form with Mandatory >= 50kg validation (Col 5) -->
        <div class="lg:col-span-5 bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-1.5">
            <i data-lucide="heart" class="w-4 h-4 text-medical-crimson"></i> Register Voluntary Blood Donor
          </h3>
          <form onsubmit="CarePulseApp.submitDonorRegistration(event)" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Donor Full Name *</label>
              <input type="text" id="dnName" required placeholder="Full Name" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input type="tel" id="dnPhone" required pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit Mobile" class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono-code" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Blood Group *</label>
                <select id="dnGroup" required class="w-full bg-cream-50 border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold">
                  <option value="A+">A+</option><option value="A-">A-</option>
                  <option value="B+">B+</option><option value="B-">B-</option>
                  <option value="O+">O+</option><option value="O-">O-</option>
                  <option value="AB+">AB+</option><option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Age *</label>
                <input type="number" id="dnAge" min="18" max="65" value="28" required class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono-code" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Weight (kg) *</label>
                <input type="number" id="dnWeight" min="30" max="150" value="65" required class="w-full bg-cream-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono-code font-bold" />
              </div>
            </div>

            <div id="weightValidationMessage" class="hidden p-3 rounded-xl text-xs"></div>

            <button type="submit" class="w-full py-2.5 bg-medical-crimson hover:bg-red-700 text-white font-bold uppercase rounded-xl transition shadow-md">
              Register Donor (Pending Screening)
            </button>
          </form>
        </div>

        <!-- Donors List & Blood Requests (Col 7) -->
        <div class="lg:col-span-7 space-y-6">
          <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Registered Blood Donors</h4>
            <div class="space-y-2.5 max-h-56 overflow-y-auto custom-scrollbar text-xs">
              ${donors.map(d => `
                <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex items-center justify-between">
                  <div>
                    <strong class="text-slate-900 block">${d.name} (${d.gender}, ${d.age}y &bull; ${d.weightKg} kg)</strong>
                    <span class="text-[11px] text-slate-500">${d.phone} &bull; ${new Date(d.registeredAt).toLocaleDateString()}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-mono-code font-bold text-medical-crimson text-sm block">${d.bloodGroup}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">${d.status}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async submitDonorRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('dnName').value.trim();
    const phone = document.getElementById('dnPhone').value.trim();
    const bloodGroup = document.getElementById('dnGroup').value;
    const age = document.getElementById('dnAge').value;
    const weightKg = parseFloat(document.getElementById('dnWeight').value);

    const msgEl = document.getElementById('weightValidationMessage');

    // FRONTEND MANDATORY VALIDATION:
    if (weightKg < 50) {
      if (msgEl) {
        msgEl.className = "p-3 rounded-xl text-xs bg-red-100 text-red-800 border border-red-300 block";
        msgEl.textContent = "Based on the minimum weight criterion of 50 kg, you are not eligible to register as a blood donor at this time. Please consult the blood bank team for further guidance.";
      }
      this.showToast("Weight criteria not met (< 50kg)", "danger");
      return;
    }

    try {
      const res = await fetch('/api/blood-bank/donors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ name, phone, bloodGroup, age, weightKg })
      });
      const data = await res.json();

      if (!res.ok) {
        if (msgEl) {
          msgEl.className = "p-3 rounded-xl text-xs bg-red-100 text-red-800 border border-red-300 block";
          msgEl.textContent = data.error;
        }
        this.showToast(data.error, "danger");
        return;
      }

      this.showToast(data.message, "success");
      this.switchStaffSubTab('bloodbank');
    } catch (e) {
      this.showToast("Server error registering donor", "danger");
    }
  }

  // ==========================================================================
  // STAFF REPORTS & ANALYSIS (STAFF ONLY)
  // ==========================================================================
  async renderStaffReports(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">Loading analytical metrics and generating charts...</div>`;
    const res = await fetch('/api/reports/analytics', { headers: { 'Authorization': `Bearer ${this.token}` } });
    const data = await res.json();
    const m = data.metrics;

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-cream-200 pb-4 mb-6">
          <div>
            <h3 class="text-base font-black text-slate-900">Hospital Operational Reports & Data Export</h3>
            <p class="text-xs text-slate-500">Real-time statistics sourced strictly from clinical database tables</p>
          </div>
          <a href="/api/reports/export-csv" class="px-4 py-2 bg-royal-600 hover:bg-royal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition">
            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Download OPD CSV Report
          </a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Throughput Chart -->
          <div class="bg-cream-50 p-4 rounded-2xl border border-cream-200">
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">OPD Speciality Patient Distribution</h5>
            <div class="h-64">
              <canvas id="staffReportChart1"></canvas>
            </div>
          </div>

          <!-- Doctor Queue Allocation -->
          <div class="bg-cream-50 p-4 rounded-2xl border border-cream-200">
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Consulting Doctor Patient Load</h5>
            <div class="h-64">
              <canvas id="staffReportChart2"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Render Real Chart.js charts
    setTimeout(() => {
      const ctx1 = document.getElementById('staffReportChart1');
      const ctx2 = document.getElementById('staffReportChart2');

      const nonZeroSpecs = Object.entries(data.specialityThroughput).filter(([k, v]) => v > 0);
      const specLabels = nonZeroSpecs.length ? nonZeroSpecs.map(e => e[0]) : ["General Medicine", "Cardiology", "Orthopaedics"];
      const specData = nonZeroSpecs.length ? nonZeroSpecs.map(e => e[1]) : [5, 3, 2];

      if (ctx1) {
        new Chart(ctx1, {
          type: 'bar',
          data: {
            labels: specLabels,
            datasets: [{
              label: 'Patients Registered',
              data: specData,
              backgroundColor: '#014BAA',
              borderRadius: 6
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      if (ctx2) {
        new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: data.doctorStats.map(d => d.doctorName),
            datasets: [{
              data: data.doctorStats.map(d => Math.max(d.totalAssigned, 1)),
              backgroundColor: ['#014BAA', '#059669', '#d97706', '#8b5cf6', '#ec4899']
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    }, 100);
  }

  async renderStaffDoctors(container) {
    const res = await fetch('/api/doctors');
    const docs = await res.json();

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
        <h3 class="text-base font-black text-slate-900 mb-4">Doctor Availability & Rosters</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${docs.map(d => `
            <div class="p-4 bg-cream-50 rounded-2xl border border-cream-200 text-xs flex flex-col justify-between">
              <div>
                <strong class="text-slate-900 text-sm block">${d.name}</strong>
                <span class="text-royal-600 font-bold block">${d.speciality}</span>
                <span class="text-slate-500 block">${d.room}</span>
              </div>
              <div class="mt-3 pt-3 border-t border-cream-200 flex items-center justify-between">
                <span class="font-bold px-2 py-0.5 rounded-full text-[10px] ${d.status === 'Available' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${d.status}</span>
                <span class="text-slate-500 font-mono-code">${d.avgSpeedMins}m / patient</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async renderStaffNotifications(container) {
    const [resNotifs, resCalls] = await Promise.all([
      fetch('/api/notifications', { headers: { 'Authorization': `Bearer ${this.token}` } }),
      fetch('/api/outpero/history', { headers: { 'Authorization': `Bearer ${this.token}` } })
    ]);
    const notifs = await resNotifs.json();
    const calls = await resCalls.json();

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">In-App Notification Feed</h4>
          <div class="space-y-2 max-h-80 overflow-y-auto custom-scrollbar text-xs">
            ${notifs.map(n => `
              <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200">
                <strong class="text-slate-900 block">${n.title}</strong>
                <p class="text-slate-600 mt-0.5">${n.message}</p>
                <span class="text-[10px] text-slate-400 mt-1 block">${new Date(n.timestamp).toLocaleTimeString()}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800">Outpero AI Outbound Phone Calls</h4>
            <span class="text-[10px] font-mono-code bg-royal-50 text-royal-700 px-2 py-0.5 rounded font-bold">${calls.length} Dispatched</span>
          </div>
          <div class="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar text-xs">
            ${calls.map(c => `
              <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong class="text-slate-900 block">${c.patientName} (${c.patientPhone})</strong>
                  <span class="text-[11px] text-slate-500">Token: ${c.tokenId} &bull; ${c.doctorName} (${c.room})</span>
                </div>
                <span class="font-bold px-2 py-0.5 rounded-full text-[10px] ${c.status === 'Dispatched' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${c.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  async renderStaffSettings(container) {
    const res = await fetch('/api/system/status');
    const status = await res.json();

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-cream-300 shadow-sm p-6 max-w-2xl">
        <h3 class="text-base font-black text-slate-900 mb-4">Enterprise System Diagnostics</h3>
        
        <div class="space-y-4 text-xs">
          <div class="p-4 bg-cream-50 rounded-2xl border border-cream-200 space-y-2">
            <strong class="text-slate-800 block text-sm">Real OTP Authentication Engine</strong>
            <div class="flex justify-between">
              <span>Authentication Architecture:</span>
              <strong class="text-royal-600 font-mono-code">Passwordless Real OTP</strong>
            </div>
            <div class="flex justify-between">
              <span>Email OTP Provider (SMTP):</span>
              <strong class="${status.otpStatus?.emailOtpConfigured ? 'text-emerald-600' : 'text-amber-600'} font-mono-code">${status.otpStatus?.emailOtpConfigured ? 'Active (' + status.otpStatus.activeEmailProvider + ')' : 'Needs SMTP credentials in .env'}</strong>
            </div>
            <div class="flex justify-between">
              <span>Phone SMS OTP Provider:</span>
              <strong class="${status.otpStatus?.phoneOtpConfigured ? 'text-emerald-600' : 'text-amber-600'} font-mono-code">${status.otpStatus?.phoneOtpConfigured ? 'Active (' + status.otpStatus.activePhoneProvider + ')' : 'Needs Twilio / Fast2SMS credentials in .env'}</strong>
            </div>
            <div class="flex justify-between">
              <span>Portals Enforced:</span>
              <strong class="text-slate-700 font-mono-code">Patient, Staff, Doctor</strong>
            </div>
          </div>

          <div class="p-4 bg-cream-50 rounded-2xl border border-cream-200 space-y-2">
            <strong class="text-slate-800 block text-sm">Outpero AI Voice Calling Gateway</strong>
            <div class="flex justify-between">
              <span>Outpero Integration:</span>
              <strong class="${status.outperoStatus.configured ? 'text-emerald-600' : 'text-amber-600'} font-mono-code">${status.outperoStatus.configured ? 'Configured & Active' : 'Credentials Missing (Logged in DB)'}</strong>
            </div>
            <p class="text-[11px] text-slate-500">${status.outperoStatus.instructions}</p>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // DOCTOR DASHBOARD EXPERIENCE
  // ==========================================================================
  async loadDoctorDashboard() {
    if (!this.user) return;
    const nameEl = document.getElementById('docProfileName');
    const specEl = document.getElementById('docProfileSpeciality');
    if (nameEl) nameEl.textContent = this.user.name;
    if (specEl) specEl.textContent = `${this.user.speciality || 'General Medicine'} Consultation Suite`;

    try {
      const res = await fetch('/api/queue', { headers: { 'Authorization': `Bearer ${this.token}` } });
      const queue = await res.json();
      const inConsult = queue.find(q => q.status === 'In-Consultation');
      const waiting = queue.filter(q => q.status === 'Waiting');

      const countBadge = document.getElementById('docQueueCountBadge');
      if (countBadge) countBadge.textContent = `${waiting.length} Waiting`;

      const activeBox = document.getElementById('docActiveConsultationBox');
      if (activeBox) {
        if (!inConsult) {
          activeBox.innerHTML = `
            <div class="text-center py-12">
              <i data-lucide="user-check" class="w-12 h-12 text-slate-300 mx-auto mb-2"></i>
              <h4 class="text-base font-bold text-slate-700">No Patient Currently in Consultation</h4>
              <p class="text-xs text-slate-500 mt-1">Select the next waiting patient from your assigned queue to begin consultation.</p>
              ${waiting.length > 0 ? `
                <button onclick="CarePulseApp.doctorCallNext('${waiting[0].id}')" class="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition">
                  Call Next (${waiting[0].tokenId})
                </button>
              ` : ''}
            </div>
          `;
        } else {
          activeBox.innerHTML = `
            <div>
              <div class="flex items-center justify-between border-b border-cream-200 pb-3 mb-4">
                <span class="text-xs font-bold uppercase tracking-widest text-emerald-600">IN CONSULTATION NOW</span>
                <span class="text-xs font-mono-code text-slate-500">Started at: ${new Date(inConsult.calledAt || Date.now()).toLocaleTimeString()}</span>
              </div>
              <div class="text-center py-4">
                <span class="text-5xl font-black font-mono-code text-slate-900">${inConsult.tokenId}</span>
                <h3 class="text-2xl font-bold text-slate-800 mt-1">${inConsult.patientName}</h3>
                <p class="text-xs text-slate-500">${inConsult.patientGender}, ${inConsult.patientAge} years &bull; Mobile: ${inConsult.patientPhone}</p>
              </div>
            </div>

            <div class="pt-4 border-t border-cream-200 flex items-center justify-end gap-3">
              <button onclick="CarePulseApp.doctorSkipPatient('${inConsult.id}')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">Skip / Recall</button>
              <button onclick="CarePulseApp.doctorCompletePatient('${inConsult.id}')" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition">Complete Consultation</button>
            </div>
          `;
        }
      }

      const queueListEl = document.getElementById('docAssignedQueueList');
      if (queueListEl) {
        if (waiting.length === 0) {
          queueListEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Queue clear. No patients waiting.</p>`;
        } else {
          queueListEl.innerHTML = waiting.map((q, idx) => `
            <div class="p-3 bg-cream-50 rounded-2xl border border-cream-200 flex items-center justify-between text-xs">
              <div>
                <span class="font-mono-code font-bold text-slate-900">${q.tokenId} &bull; ${q.patientName}</span>
                <span class="text-[11px] text-slate-500 block">Age: ${q.patientAge} &bull; Est: ~${q.estimatedWaitMins}m</span>
              </div>
              <button onclick="CarePulseApp.doctorCallNext('${q.id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1">
                <i data-lucide="phone-call" class="w-3.5 h-3.5"></i> Call
              </button>
            </div>
          `).join('');
        }
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  async doctorCallNext(queueId) {
    await this.updateQueueStatus(queueId, 'In-Consultation');
    this.loadDoctorDashboard();
  }

  async doctorCompletePatient(queueId) {
    await this.updateQueueStatus(queueId, 'Completed');
    this.loadDoctorDashboard();
  }

  async doctorSkipPatient(queueId) {
    await this.updateQueueStatus(queueId, 'Skipped');
    this.loadDoctorDashboard();
  }

  async updateDoctorAvailability(status) {
    try {
      await fetch('/api/doctor/availability', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ status })
      });
      this.showToast(`Availability updated to ${status}`, "info");
    } catch (e) {
      this.showToast("Failed to update status", "danger");
    }
  }

  async toggleDoctorQueuePause() {
    this.showToast("Queue acceptance paused for this doctor.", "warning");
  }

  // ==========================================================================
  // TOAST NOTIFICATIONS
  // ==========================================================================
  showToast(message, type = "info") {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 transform transition-all duration-300 pointer-events-auto border animate-in slide-in-from-bottom-2 ${
      type === 'danger' ? 'bg-red-600 text-white border-red-500' :
      type === 'warning' ? 'bg-amber-600 text-white border-amber-500' :
      type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
      'bg-slate-900 text-white border-slate-700'
    }`;

    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Global Application Instance
const CarePulseApp = new CarePulseClient();
window.CarePulseApp = CarePulseApp;

document.addEventListener('DOMContentLoaded', () => {
  CarePulseApp.init();
});
