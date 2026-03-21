/* ═══════════════════════════════════════════════
   BOOKING WIZARD — Tournai Expert Immo
   Wizard interactif 7 étapes + succès
═══════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Données de référence ─── */

  const SERVICES = {
    expertise: [
      { id: 'avant_achat',     name: "Expertise avant achat",          sub: "Due diligence" },
      { id: 'litige',          name: "Expertise en cas de litige",      sub: "Rapport juridique" },
      { id: 'valeur_locative', name: "Expertise de valeur locative",    sub: "Estimation" },
      { id: 'assurance',       name: "Rapport pour assurance",          sub: "Sinistre" },
    ],
    etl: [
      { id: 'entree',   name: "État des lieux d'entrée",  sub: "Entrée dans les lieux" },
      { id: 'sortie',   name: "État des lieux de sortie", sub: "Fin de bail" },
      { id: 'travaux',  name: "État des lieux de travaux",sub: "Avant / après chantier" },
    ],
  };

  const PROPERTIES = [
    { id: 'studio',     name: "Studio",                  sub: null,                 showExtras: true  },
    { id: 'appt_1ch',   name: "Appartement 1 chambre",   sub: null,                 showExtras: true  },
    { id: 'appt_2ch',   name: "Appartement 2 chambres",  sub: null,                 showExtras: true  },
    { id: 'appt_3ch',   name: "Appartement 3 chambres",  sub: null,                 showExtras: true  },
    { id: 'maison_3ch', name: "Maison ≤ 3 chambres",     sub: null,                 showExtras: true  },
    { id: 'maison_4ch', name: "Maison 4 chambres",       sub: null,                 showExtras: true  },
    { id: 'devis',      name: "Autre / Sur devis",        sub: "Travaux, grand ensemble, litige", showExtras: false },
  ];

  const CATEGORY_LABELS = { expertise: "Expertise", etl: "État des lieux" };
  const DURATION = { expertise: 30, etl: 90 };

  const MONTH_FR = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];
  const DOW_FR = ["Lu","Ma","Me","Je","Ve","Sa","Di"];

  /* ─── État du wizard ─── */
  const state = {
    step: 1,
    totalSteps: 7,
    category: null,
    service: null,
    property: null,
    extraMeuble: false,
    extraPieces: 0,
    date: null,       // YYYY-MM-DD
    slot: null,       // HH:MM
    duration: null,   // 30 | 90
    form: {},
  };

  let calYear, calMonth;

  /* ─── Références DOM ─── */
  const overlay    = document.getElementById('bk-overlay');
  const panel      = document.querySelector('.bk-panel');
  const btnOpen    = document.getElementById('bk-open');
  const btnClose   = document.getElementById('bk-close');
  const btnBack    = document.getElementById('bk-btn-back');
  const btnNext    = document.getElementById('bk-btn-next');
  const progressFill = document.getElementById('bk-progress-fill');
  const footer     = document.getElementById('bk-footer');

  /* ─── Ouverture / Fermeture ─── */

  function openModal() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ bkModal: true }, '');
    resetWizard();
  }

  // Ouvre le modal en pré-sélectionnant catégorie + service → saute à l'étape 3 sans animation
  function openModalPreset(category, service) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ bkModal: true }, '');
    // Reset state directement sans passer par resetWizard (qui afficherait step 1)
    Object.assign(state, {
      step: 3, category, service,
      duration: DURATION[category],
      property: null, extraMeuble: false, extraPieces: 0,
      date: null, slot: null, form: {},
    });
    // Afficher step 3 directement sans transition
    document.querySelectorAll('.bk-step').forEach(s => {
      s.classList.remove('active');
      s.style.transform = '';
      s.style.opacity   = '';
      s.style.pointerEvents = '';
    });
    const step3 = document.getElementById('bk-step-3');
    if (step3) step3.classList.add('active');
    renderProperties();
    updateProgress();
    updateNav();
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    // Retirer le focus de tout champ du modal pour bloquer la saisie clavier
    if (document.activeElement && overlay.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    // Dépiler l'état modal si c'est bien lui qui est au sommet
    if (history.state && history.state.bkModal) {
      history.back();
    }
  }

  function resetWizard() {
    Object.assign(state, {
      step: 1, category: null, service: null, property: null,
      extraMeuble: false, extraPieces: 0,
      date: null, slot: null, duration: null, form: {},
    });
    showStep(1);
    updateProgress();
    updateNav();
  }

  /* ─── Navigation entre étapes ─── */

  function showStep(n, direction) {
    const steps = document.querySelectorAll('.bk-step');

    // Marquer la sortie de l'étape courante
    steps.forEach(s => {
      if (s.classList.contains('active')) {
        s.classList.remove('active');
        if (direction === 'back') {
          s.classList.add('exit-left');
          s.style.transform = 'translateX(40px)';
        } else {
          s.style.transform = 'translateX(-40px)';
          s.style.opacity = '0';
          s.style.pointerEvents = 'none';
        }
        setTimeout(() => {
          s.classList.remove('exit-left');
          s.style.transform = '';
          s.style.opacity = '';
          s.style.pointerEvents = '';
        }, 400);
      }
    });

    // Afficher la nouvelle étape
    const target = document.getElementById('bk-step-' + n);
    if (target) {
      if (direction === 'back') {
        target.style.transform = 'translateX(-40px)';
        target.style.opacity = '0';
      }
      setTimeout(() => {
        target.classList.add('active');
        target.style.transform = '';
        target.style.opacity = '';
      }, direction ? 60 : 0);
    }

    state.step = n;
    updateProgress();
    updateNav();

    // Rendu spécifique à chaque étape
    if (n === 2) renderServices();
    if (n === 3) renderProperties();
    if (n === 4) renderCalendar();
    if (n === 5) renderSlots();
    if (n === 6) renderFormOptions();
    if (n === 7) renderSummary();
  }

  function updateProgress() {
    if (state.step === 'success') { progressFill.style.width = '100%'; return; }
    const pct = state.step > state.totalSteps ? 100
              : Math.round(((state.step - 1) / state.totalSteps) * 100);
    progressFill.style.width = pct + '%';
  }

  function updateNav() {
    const isSuccess = state.step === 'success';
    footer.style.display = isSuccess ? 'none' : '';
    if (isSuccess) return;

    btnBack.disabled = (state.step === 1);

    // Libellé du bouton Next
    if (state.step === 7) {
      btnNext.textContent = 'Envoyer la demande';
    } else if ([1, 2, 3].includes(state.step)) {
      btnNext.textContent = 'Suivant';
      btnNext.disabled = true; // désactivé tant que rien n'est sélectionné
    } else {
      btnNext.textContent = 'Suivant';
      btnNext.disabled = false;
    }

    // Activer Next selon l'état
    if (state.step === 1 && state.category) btnNext.disabled = false;
    if (state.step === 2 && state.service)  btnNext.disabled = false;
    if (state.step === 3 && state.property) btnNext.disabled = false;
    if (state.step === 4 && state.date)     btnNext.disabled = false;
    if (state.step === 5 && state.slot)     btnNext.disabled = false;
  }

  /* ─── Étape 1 : Catégorie — gestion des cartes ─── */

  function initCategoryCards() {
    document.querySelectorAll('.bk-choice-card').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        state.category = cat;
        state.duration  = DURATION[cat];
        // reset les étapes suivantes
        state.service = state.property = state.date = state.slot = null;
        state.extraMeuble = false; state.extraPieces = 0;

        document.querySelectorAll('.bk-choice-card').forEach(c =>
          c.classList.toggle('selected', c.dataset.category === cat));

        // Auto-avance après un court délai visuel
        setTimeout(() => goNext(), 280);
      });
    });
  }

  /* ─── Étape 2 : Services ─── */

  function renderServices() {
    const container = document.getElementById('bk-service-list');
    container.innerHTML = '';
    const list = SERVICES[state.category] || [];

    list.forEach(svc => {
      const btn = document.createElement('button');
      btn.className = 'bk-list-item' + (state.service === svc.id ? ' selected' : '');
      btn.innerHTML = `
        <div>
          <div class="bk-list-item-name">${svc.name}</div>
          ${svc.sub ? `<div class="bk-list-item-sub">${svc.sub}</div>` : ''}
        </div>
        <svg class="bk-list-item-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      btn.addEventListener('click', () => {
        state.service = svc.id;
        setTimeout(() => goNext(), 200);
      });
      container.appendChild(btn);
    });
  }

  /* ─── Étape 3 : Type de bien ─── */

  function renderProperties() {
    const container = document.getElementById('bk-property-list');
    const extrasGroup = document.getElementById('bk-extras-group');
    container.innerHTML = '';

    PROPERTIES.forEach(prop => {
      const btn = document.createElement('button');
      btn.className = 'bk-list-item' + (state.property === prop.id ? ' selected' : '');
      btn.innerHTML = `
        <div>
          <div class="bk-list-item-name">${prop.name}</div>
          ${prop.sub ? `<div class="bk-list-item-sub">${prop.sub}</div>` : ''}
        </div>
        <svg class="bk-list-item-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      btn.addEventListener('click', () => {
        state.property = prop.id;
        document.querySelectorAll('#bk-property-list .bk-list-item')
          .forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        // Afficher les extras pour ETL avec bien standard
        const showExtras = (state.category === 'etl') && prop.showExtras;
        extrasGroup.style.display = showExtras ? '' : 'none';

        updateNav();
      });
      container.appendChild(btn);
    });

    // Initialiser extras
    extrasGroup.style.display = 'none';
    const chkMeuble = document.getElementById('bk-extra-meuble');
    chkMeuble.checked = state.extraMeuble;
    document.getElementById('bk-pieces-val').textContent = state.extraPieces;

    chkMeuble.addEventListener('change', () => { state.extraMeuble = chkMeuble.checked; });
    document.getElementById('bk-pieces-minus').addEventListener('click', () => {
      if (state.extraPieces > 0) {
        state.extraPieces--;
        document.getElementById('bk-pieces-val').textContent = state.extraPieces;
      }
    });
    document.getElementById('bk-pieces-plus').addEventListener('click', () => {
      state.extraPieces++;
      document.getElementById('bk-pieces-val').textContent = state.extraPieces;
    });
  }

  /* ─── Étape 4 : Calendrier ─── */

  function renderCalendar() {
    const container = document.getElementById('bk-calendar');
    const now = new Date();
    if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }

    container.innerHTML = buildCalendarHTML(calYear, calMonth);

    // Navigation mois
    container.querySelector('.bk-cal-prev').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    container.querySelector('.bk-cal-next').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });

    // Sélection jour
    container.querySelectorAll('.bk-cal-day:not(.disabled):not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        state.date = cell.dataset.date;
        state.slot = null; // reset créneau
        container.querySelectorAll('.bk-cal-day').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        updateNav();
        // Auto-avance
        setTimeout(() => goNext(), 300);
      });
    });
  }

  function buildCalendarHTML(year, month) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);

    // Lundi = 0 dans notre grille (ISO)
    let startDow = firstDay.getDay(); // 0=dim
    startDow = (startDow === 0) ? 6 : startDow - 1; // convertir: lundi=0

    let html = `
      <div class="bk-cal-header">
        <button class="bk-cal-nav bk-cal-prev" aria-label="Mois précédent">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="bk-cal-month">${MONTH_FR[month]} ${year}</div>
        <button class="bk-cal-nav bk-cal-next" aria-label="Mois suivant">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="bk-cal-grid">`;

    // En-têtes jours
    DOW_FR.forEach(d => { html += `<div class="bk-cal-dow">${d}</div>`; });

    // Cases vides avant le 1er
    for (let i = 0; i < startDow; i++) {
      html += `<div class="bk-cal-day empty"></div>`;
    }

    // Jours du mois
    const minBooking = new Date(Date.now() + 72 * 60 * 60 * 1000);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      date.setHours(0,0,0,0);
      const isPast    = date < today;
      const isToday   = date.getTime() === today.getTime();
      const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isSelected= state.date === dateStr;
      // Dernier créneau = 11h30 → bloquer si avant minBooking
      const lastSlot  = new Date(year, month, d, 11, 30, 0);
      const isTooSoon = lastSlot < minBooking;

      let cls = 'bk-cal-day';
      if (isPast || isTooSoon) cls += ' disabled';
      if (isToday)    cls += ' today';
      if (isSelected) cls += ' selected';

      html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }

    html += '</div>';
    return html;
  }

  /* ─── Étape 5 : Créneaux ─── */

  function changeDay(delta) {
    const d = new Date(state.date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) return;
    state.date = d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
    state.slot = null;
    updateNav();
    renderSlots();
  }

  function updateDayNav() {
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const dateObj = new Date(state.date + 'T00:00:00');
    const label   = dateObj.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('bk-day-label').textContent =
      label.charAt(0).toUpperCase() + label.slice(1);
    const prevBtn = document.getElementById('bk-day-prev');
    prevBtn.disabled = dateObj.getTime() <= today.getTime();
    prevBtn.onclick  = () => changeDay(-1);
    document.getElementById('bk-day-next').onclick = () => changeDay(1);
  }

  function appendNextDayBtn(container) {
    const btn = document.createElement('button');
    btn.className = 'bk-next-day-btn';
    btn.innerHTML = `Rendez-vous suivant <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.addEventListener('click', () => scanNextAvailableSlot(container, btn));
    container.appendChild(btn);
  }

  async function scanNextAvailableSlot(container, btn) {
    btn.disabled = true;
    btn.innerHTML = `Recherche en cours… <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    let d = new Date(state.date + 'T00:00:00');

    for (let i = 0; i < 60; i++) {
      d.setDate(d.getDate() + 1);
      // Construire dateStr depuis la date LOCALE (toISOString = UTC → décalage d'un jour en UTC+1/+2)
      const dateStr = d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
      try {
        const res = await fetch(`/api/slots?date=${dateStr}&duration=${state.duration}`);
        if (!res.ok) continue;
        const { slots } = await res.json();
        const available = slots && slots.filter(s => s.available);
        if (available && available.length > 0) {
          state.date = dateStr;
          state.slot = null; // le client choisit parmi les créneaux affichés
          updateNav();

          // Afficher la date trouvée + tous les créneaux disponibles
          const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });

          container.innerHTML = '';

          const header = document.createElement('div');
          header.className = 'bk-slots-found';
          header.innerHTML = `
            <div class="bk-slots-found-label">Prochain créneau disponible</div>
            <div class="bk-slots-found-value">${dateLabel}</div>`;
          container.appendChild(header);

          available.forEach(s => {
            const slotBtn = document.createElement('button');
            slotBtn.className = 'bk-slot';
            slotBtn.textContent = s.time;
            slotBtn.addEventListener('click', () => {
              state.slot = s.time;
              container.querySelectorAll('.bk-slot').forEach(b => b.classList.remove('selected'));
              slotBtn.classList.add('selected');
              updateNav();
              setTimeout(() => goNext(), 250);
            });
            container.appendChild(slotBtn);
          });

          return;
        }
      } catch (e) { continue; }
    }

    // Aucun créneau trouvé dans les 60 prochains jours
    btn.disabled = false;
    btn.innerHTML = `Rendez-vous suivant <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const msg = container.querySelector('.bk-slots-loading');
    if (msg) msg.textContent = 'Aucun créneau disponible dans les 60 prochains jours. Veuillez nous appeler.';
  }

  async function renderSlots() {
    updateDayNav();
    const container = document.getElementById('bk-slots-grid');
    container.innerHTML = `<div class="bk-slots-loading">Vérification des disponibilités…</div>`;
    btnNext.disabled = true;

    try {
      const res = await fetch(`/api/slots?date=${state.date}&duration=${state.duration}`);
      if (!res.ok) throw new Error('Erreur réseau');
      const { slots } = await res.json();

      container.innerHTML = '';

      const noSlots = !slots || slots.length === 0;
      const allTaken = !noSlots && slots.every(s => !s.available);

      if (noSlots || allTaken) {
        const msg = document.createElement('div');
        msg.className = 'bk-slots-loading';
        msg.textContent = 'Aucun créneau disponible ce jour.';
        container.appendChild(msg);
        appendNextDayBtn(container);
        return;
      }

      slots.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'bk-slot' + (s.available ? '' : ' unavailable');
        btn.textContent = s.time;
        if (s.time === state.slot) btn.classList.add('selected');
        btn.disabled = !s.available;

        if (s.available) {
          btn.addEventListener('click', () => {
            state.slot = s.time;
            container.querySelectorAll('.bk-slot').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateNav();
            setTimeout(() => goNext(), 250);
          });
        }
        container.appendChild(btn);
      });
    } catch (err) {
      container.innerHTML = `<div class="bk-slots-loading">Impossible de charger les créneaux.<br>Veuillez réessayer.</div>`;
    }
  }

  /* ─── Étape 7 : Récapitulatif ─── */

  function renderSummary() {
    const c = document.getElementById('bk-summary');
    const svcList = SERVICES[state.category] || [];
    const svcItem = svcList.find(s => s.id === state.service);
    const propItem = PROPERTIES.find(p => p.id === state.property);

    const extras = [];
    if (state.extraMeuble) extras.push('Meublé');
    if (state.extraPieces > 0) extras.push(`+${state.extraPieces} ch./bureau`);

    const dateObj = state.date ? new Date(state.date + 'T00:00:00') : null;
    const dateLabel = dateObj ? dateObj.toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';

    const rows = [
      { key: 'Prestation',    val: CATEGORY_LABELS[state.category] || '—' },
      { key: 'Type',          val: svcItem ? svcItem.name : '—' },
      { key: 'Bien',          val: propItem ? propItem.name : '—' },
      { key: 'Options',       val: extras.length ? extras.join(', ') : 'Aucune' },
      { key: 'Date',          val: dateLabel },
      { key: 'Horaire',       val: state.slot ? `${state.slot} (${state.duration} min)` : '—' },
      { key: 'Nom',           val: `${state.form.prenom || ''} ${state.form.nom || ''}`.trim() || '—' },
      { key: 'Email',         val: state.form.email || '—' },
      { key: 'Téléphone',     val: state.form.telephone || '—' },
      { key: 'Adresse bien',  val: state.form.adresse_bien || '—' },
      { key: 'Bailleur',        val: `${state.form.bailleur_prenom || ''} ${state.form.bailleur_nom || ''}`.trim() || '—' },
      { key: 'Email bailleur',  val: state.form.bailleur_email      || '—' },
      { key: 'Tél. bailleur',   val: state.form.bailleur_telephone  || '—' },
    ];

    c.innerHTML = rows.map(r => `
      <div class="bk-summary-row">
        <span class="bk-summary-key">${r.key}</span>
        <span class="bk-summary-val">${r.val}</span>
      </div>`).join('');
  }

  /* ─── Étape 6 : Options formulaire selon le service ─── */

  function renderFormOptions() {
    const isTravaux = state.service === 'travaux';
    // Section bailleur masquée pour ETL travaux
    document.getElementById('bk-bailleur-section').style.display = isTravaux ? 'none' : '';
    // Titre client adapté selon le service
    document.getElementById('bk-client-role-label').textContent = isTravaux ? 'Propriétaire' : 'Locataire';
  }

  /* ─── Navigation (Next / Back) ─── */

  function goNext() {
    if (state.step === 1 && !state.category) return;
    if (state.step === 2 && !state.service)  return;
    if (state.step === 3 && !state.property) return;
    if (state.step === 4 && !state.date)     return;
    if (state.step === 5 && !state.slot)     return;

    if (state.step === 6) {
      if (!validateForm()) return;
      collectForm();
      showStep(7);
      return;
    }

    if (state.step === 7) {
      submitAppointment();
      return;
    }

    showStep(state.step + 1);
  }

  function goBack() {
    if (state.step === 'success' || state.step <= 1) return;
    showStep(state.step - 1, 'back');
  }

  /* ─── Validation formulaire ─── */

  function validateForm() {
    const form = document.getElementById('bk-form');
    let valid = true;
    form.querySelectorAll('.bk-input').forEach(input => {
      input.classList.remove('error');
      if (input.dataset.optional) return; // champs facultatifs (bailleur)
      if (!input.value.trim()) {
        input.classList.add('error');
        valid = false;
      } else if (input.type === 'email' && !input.value.includes('@')) {
        input.classList.add('error');
        valid = false;
      }
    });
    return valid;
  }

  function collectForm() {
    const form = document.getElementById('bk-form');
    form.querySelectorAll('.bk-input').forEach(input => {
      state.form[input.name] = input.value.trim();
    });
    // Recombiner l'adresse pour le backend
    const rue = state.form.rue || '';
    const num = state.form.numero || '';
    const cp  = state.form.code_postal || '';
    const vil = state.form.ville || '';
    state.form.adresse_bien = `${rue} ${num}, ${cp} ${vil}`.trim();
  }

  /* ─── Soumission ─── */

  async function submitAppointment() {
    btnNext.disabled = true;
    btnNext.textContent = 'Envoi…';

    const svcList = SERVICES[state.category] || [];
    const svcItem = svcList.find(s => s.id === state.service);
    const propItem = PROPERTIES.find(p => p.id === state.property);

    const extras = [];
    if (state.extraMeuble) extras.push('Meublé');
    if (state.extraPieces > 0) extras.push(`${state.extraPieces} chambre(s)/bureau(x) supplémentaire(s)`);

    const payload = {
      category:      state.category,
      service:       state.service,
      service_label: svcItem ? svcItem.name : state.service,
      property:      state.property,
      property_label:propItem ? propItem.name : state.property,
      extras:        extras,
      date:          state.date,
      slot:          state.slot,
      duration:      state.duration,
      theme:         document.body.classList.contains('dark') ? 'dark' : 'light',
      ...state.form,
    };

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      showStep('success');
    } catch (err) {
      btnNext.disabled = false;
      btnNext.textContent = 'Envoyer la demande';
      alert("Une erreur est survenue. Veuillez réessayer ou nous contacter directement au +32 476/03.27.88.");
    }
  }

  /* ─── Initialisation ─── */

  function init() {
    if (!overlay) return;

    // Tous les boutons d'ouverture (contact + page rendez-vous)
    document.querySelectorAll('.bk-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.bkCategory;
        const svc = btn.dataset.bkService;
        if (cat && svc) openModalPreset(cat, svc);
        else            openModal();
      });
    });
    btnClose.addEventListener('click', closeModal);

    // Fermeture uniquement via le bouton X ou la touche Échap (pas au clic sur l'overlay)

    // Échap
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });

    btnNext.addEventListener('click', goNext);
    btnBack.addEventListener('click', goBack);

    initCategoryCards();
    showStep(1);
  }

  // Lancer après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
