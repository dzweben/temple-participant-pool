const screens = Array.from(document.querySelectorAll(".card"));
const state = {
  consent_contact: null,
  is_guardian: "participant",
  first_name: "",
  middle_name: "",
  last_name: "",
  sex: "",
  birth_city: "",
  race: "",
  ethnicity: "",
  dob: "",
  email: "",
  phone: "",
  tubric_study_code: "",
  newsletter_email: "",
  newsletter_phone: "",
  newsletter_pref: "",
  consent_name: "",
  consent_date: "",
  consent_participant: "",
};
let lookup = { matched: false, guid: "", consented: false };

function showScreen(id) {
  screens.forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function currentScreen() {
  const current = screens.find((s) => !s.classList.contains("hidden"));
  return current ? current.id : "";
}

// ---------- formatting / validation ----------
function formatDOB(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length >= 5) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length >= 3) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length >= 7) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 4) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

function normalizeDob(dob) {
  const parts = dob.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[0]}-${parts[1]}`;
}

function isValidDob(dob) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(dob)) return false;
  const [mm, dd, yyyy] = dob.split("-").map((v) => parseInt(v, 10));
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  if (yyyy < 1900 || yyyy > 2100) return false;
  const date = new Date(yyyy, mm - 1, dd);
  return date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhoneDigits(phone) {
  return phone.replace(/\D/g, "");
}

function todayParts() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { display: `${mm}-${dd}-${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

function ageOn(isoDob, on = new Date()) {
  const [y, m, d] = isoDob.split("-").map((v) => parseInt(v, 10));
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age -= 1;
  return age;
}

// ---------- sign-in screen ----------
document.querySelectorAll("[data-next]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.next));
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const current = currentScreen();
    if (current === "screen-signin") return showScreen("screen-welcome");
    if (current === "screen-about") return showScreen("screen-signin");
    if (current === "screen-consent") return showScreen("screen-about");
    if (current === "screen-study") {
      // Only revisit the consent form if it was actually shown this session.
      return showScreen(lookup.consented ? "screen-signin" : "screen-consent");
    }
  });
});

const dobInput = document.getElementById("dob");
dobInput.addEventListener("input", (e) => {
  e.target.value = formatDOB(e.target.value);
});

const phoneInput = document.getElementById("phone");
phoneInput.addEventListener("input", (e) => {
  e.target.value = formatPhone(e.target.value);
});

// Single-select button groups (sex, race, ethnicity). Values are REDCap codes
// kept as strings, since "0" is a valid code.
document.querySelectorAll(".choice-group").forEach((group) => {
  group.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".choice").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state[group.dataset.field] = btn.dataset.value;
    });
  });
});

const infoContinue = document.getElementById("info-continue");
infoContinue.addEventListener("click", async () => {
  const error = document.getElementById("info-error");
  error.textContent = "";

  const first = document.getElementById("firstName").value.trim();
  const middle = document.getElementById("middleName").value.trim();
  const last = document.getElementById("lastName").value.trim();
  const dob = document.getElementById("dob").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!first || !last) {
    error.textContent = "Please enter your full legal first and last name.";
    return;
  }
  if (!isValidDob(dob)) {
    error.textContent = "Please enter date of birth as MM-DD-YYYY.";
    return;
  }

  // Adults only: anyone under 18 is closed out here. Nothing is saved and
  // the backend is never called.
  if (ageOn(normalizeDob(dob)) < 18) {
    showUnder18();
    return;
  }

  if (!email || !isValidEmail(email)) {
    error.textContent = "Please enter a valid email address.";
    return;
  }
  if (!phone) {
    error.textContent = "Please enter a phone number.";
    return;
  }
  if (normalizePhoneDigits(phone).length !== 10) {
    error.textContent = "Please enter a valid 10-digit phone number.";
    return;
  }

  state.first_name = first;
  state.middle_name = middle;
  state.last_name = last;
  state.dob = normalizeDob(dob);
  state.email = email;
  state.phone = phone;

  // Ask the backend whether this person already exists and has signed consent.
  infoContinue.disabled = true;
  infoContinue.textContent = "Checking…";
  try {
    lookup = await window.tubric.lookup(state);
  } catch (err) {
    // If the lookup fails, fall back to the intake path: re-consenting is
    // harmless, skipping consent for a new person is not.
    lookup = { matched: false, guid: "", consented: false };
  } finally {
    infoContinue.disabled = false;
    infoContinue.textContent = "Continue";
  }

  if (lookup.matched && lookup.consented) {
    // Returning participant: no intake questions, no consent form.
    state.consent_contact = "Yes";
    showScreen("screen-study");
    return;
  }

  showScreen("screen-about");
});

// ---------- under 18: close out ----------
const UNDER18_RESET_MS = 15000;
function showUnder18() {
  ["firstName", "middleName", "lastName", "dob", "email", "phone"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  showScreen("screen-under18");
  setTimeout(() => {
    if (currentScreen() === "screen-under18") window.location.reload();
  }, UNDER18_RESET_MS);
}

document.getElementById("under18-done").addEventListener("click", () => {
  window.location.reload();
});

// ---------- about you (new participants only) ----------
document.getElementById("about-continue").addEventListener("click", () => {
  const error = document.getElementById("about-error");
  error.textContent = "";
  const birthCity = document.getElementById("birthCity").value.trim();

  if (!state.sex) {
    error.textContent = "Please select a sex.";
    return;
  }
  if (!birthCity) {
    error.textContent = "Please enter the city or municipality of birth.";
    return;
  }
  if (state.race === "") {
    error.textContent = "Please select a race, or choose Prefer not to respond.";
    return;
  }
  if (state.ethnicity === "") {
    error.textContent = "Please select an ethnicity, or choose Prefer not to respond.";
    return;
  }
  state.birth_city = birthCity;

  prepareConsentScreen();
  showScreen("screen-consent");
});

// ---------- consent screen ----------
const consentName = document.getElementById("consentName");
const consentDate = document.getElementById("consentDate");
const consentError = document.getElementById("consent-error");

function prepareConsentScreen() {
  consentError.textContent = "";
  const today = todayParts();
  consentDate.value = today.display;
  state.consent_date = today.iso;
  consentName.value = `${state.first_name} ${state.last_name}`.trim();
}

document.getElementById("consent-accept").addEventListener("click", () => {
  consentError.textContent = "";
  const name = consentName.value.trim();
  if (!name) {
    consentError.textContent = "Please print your full name.";
    return;
  }
  // Tapping "I accept and Sign" with a printed name is the signature
  // (REDCap consent_participant = 1).
  state.consent_name = name;
  state.consent_participant = "1";
  state.consent_contact = "Yes";
  showScreen("screen-study");
});

document.getElementById("consent-decline").addEventListener("click", () => {
  // Nothing is saved: the backend is never called on this path.
  showScreen("screen-no-checkin");
});

// ---------- study code / finish ----------
const finishBtn = document.getElementById("finish");
finishBtn.addEventListener("click", async () => {
  const error = document.getElementById("study-error");
  error.textContent = "";
  const code = document.getElementById("studyCode").value.trim();
  if (!code) {
    error.textContent = "Please enter the Study Code.";
    return;
  }

  state.tubric_study_code = code;
  finishBtn.disabled = true;
  finishBtn.textContent = "Saving…";
  try {
    await window.tubric.submitCheckin(state);
    showScreen("screen-done");
  } catch (err) {
    error.textContent = "Submission failed. Please try again or alert staff.";
  } finally {
    finishBtn.disabled = false;
    finishBtn.textContent = "Finish Check-In";
  }
});

document.getElementById("done").addEventListener("click", () => {
  window.location.reload();
});

document.getElementById("no-checkin-done").addEventListener("click", () => {
  window.location.reload();
});
