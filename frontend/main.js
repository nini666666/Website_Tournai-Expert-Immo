  const nav = document.getElementById('main-nav');
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('mobileDrawer');

  // ── Thème automatique ──────────────────────────────────────────────────────
  // null  = auto (dark sur pages intérieures, light sur home)
  // 'dark' / 'light' = choix explicite de l'utilisateur via le toggle
  let userTheme = null;

  function applyAutoTheme(pageId) {
    if (userTheme !== null) return; // l'utilisateur a choisi manuellement : ne pas écraser
    if (pageId === 'home') {
      document.body.classList.remove('dark');
    } else {
      document.body.classList.add('dark');
    }
  }

  function switchPage(targetId, pushState = true) {
    const current = document.querySelector('.page.active');
    const target  = document.getElementById('page-' + targetId);
    if (!target || target === current) return;

    current.classList.remove('active');
    current.classList.add('exit');
    setTimeout(() => current.classList.remove('exit'), 400);

    // Pattern entering : force un reflow entre display:none→block et l'ajout de .active.
    // Sans ce reflow, le navigateur fusionne les changements et n'anime pas l'opacité.
    target.classList.add('entering');
    void target.offsetHeight; // reflow délibéré
    target.classList.remove('entering');
    target.classList.add('active');
    const scrollEl = target.querySelector('.page-scroll') || target;
    scrollEl.scrollTop = 0;

    // Nav style selon la page
    nav.classList.remove('hidden');
    if (targetId === 'home') {
      nav.classList.remove('dark');
      nav.classList.remove('on-contact');
    } else if (targetId === 'contact') {
      nav.classList.add('dark');
      nav.classList.add('on-contact');
    } else {
      nav.classList.add('dark');
      nav.classList.remove('on-contact');
    }

    document.querySelectorAll('[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === targetId);
    });

    // Fermer le drawer mobile
    drawer.classList.remove('open');
    burger.classList.remove('open');

    // Thème automatique : dark sur pages intérieures, light sur home
    applyAutoTheme(targetId);

    // Scroll listener pour masquer/afficher le nav
    setupScrollHide(target, targetId);

    // Historique navigateur (bouton retour Android)
    if (pushState) {
      history.pushState({ page: targetId }, '', '#' + targetId);
    }
  }

  function setupScrollHide(pageEl, pageId) {
    if (pageId === 'home') return;
    const scrollEl = pageEl.querySelector('.page-scroll') || pageEl;
    let lastScroll = 0;
    const onScroll = () => {
      const s = scrollEl.scrollTop;
      if (s > lastScroll && s > 80) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }
      lastScroll = s;
    };
    scrollEl.onscroll = onScroll;
  }

  // Burger toggle (touchend + click avec flag anti-doublon pour iOS/Android)
  let burgerTouchHandled = false;

  burger.addEventListener('touchend', (e) => {
    e.preventDefault();
    burgerTouchHandled = true;
    burger.classList.toggle('open');
    drawer.classList.toggle('open');
  }, { passive: false });

  burger.addEventListener('click', () => {
    if (burgerTouchHandled) { burgerTouchHandled = false; return; }
    burger.classList.toggle('open');
    drawer.classList.toggle('open');
  });

  // Tous les liens de navigation
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      switchPage(this.dataset.page);
    });
  });

  // Bouton retour Android
  window.addEventListener('popstate', (e) => {
    const pageId = e.state?.page || 'home';
    switchPage(pageId, false);
  });

  // État initial de la page home dans l'historique
  history.replaceState({ page: 'home' }, '', '#home');

  // Email anti-spam
  const mailLink = document.getElementById('mail-link');
  const mailVal  = document.getElementById('mail-val');
  if (mailLink && mailVal) {
    const email = 'expertimmotournai' + '@' + 'gmail.com';
    mailLink.href = 'mailto:' + email;
    mailVal.textContent = email;
  }

  // Theme toggle — mémorise le choix explicite de l'utilisateur
  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    userTheme = document.body.classList.contains('dark') ? 'dark' : 'light';
  });

  // Fix Safari/WebKit : force la navigation sur les <a>.contact-row
  // Exception mailto: — laisser le navigateur ouvrir le client mail nativement.
  // Sur desktop, window.location.href = 'mailto:...' ne déclenche pas
  // systématiquement le client mail ; le comportement natif <a href="mailto:"> est fiable.
  document.querySelectorAll('a.contact-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      if (!row.href) return;
      // Liens mailto : comportement natif du navigateur (client mail desktop + iOS)
      if (row.href.startsWith('mailto:')) return;
      e.preventDefault();
      if (row.target === '_blank') {
        window.open(row.href, '_blank');
      } else {
        window.location.href = row.href;
      }
    });
  });
