  const nav = document.getElementById('main-nav');
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('mobileDrawer');

  // true dès que l'utilisateur a manuellement changé le thème
  let userToggled = false;

  function switchPage(targetId, pushState = true) {
    const current = document.querySelector('.page.active');
    const target  = document.getElementById('page-' + targetId);
    if (!target || target === current) return;

    current.classList.remove('active');
    current.classList.add('exit');
    setTimeout(() => current.classList.remove('exit'), 600);

    target.classList.add('active');
    target.scrollTop = 0;

    // Thème : défaut par page sauf si l'utilisateur a déjà togglé
    if (!userToggled) {
      if (targetId === 'home') {
        document.body.classList.remove('dark');
      } else {
        document.body.classList.add('dark');
      }
    }

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

    // Scroll listener pour masquer/afficher le nav
    setupScrollHide(target, targetId);

    // Historique navigateur (bouton retour Android)
    if (pushState) {
      history.pushState({ page: targetId }, '', '#' + targetId);
    }
  }

  function setupScrollHide(pageEl, pageId) {
    if (pageId === 'home') return;
    let lastScroll = 0;
    const onScroll = () => {
      const s = pageEl.scrollTop;
      if (s > lastScroll && s > 80) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }
      lastScroll = s;
    };
    // Nettoyer les anciens listeners
    pageEl.onscroll = onScroll;
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
  // Si le modal de réservation est ouvert → le fermer au lieu de naviguer
  window.addEventListener('popstate', (e) => {
    const bkOverlay = document.getElementById('bk-overlay');
    if (bkOverlay && bkOverlay.classList.contains('open')) {
      bkOverlay.classList.remove('open');
      document.body.style.overflow = '';
      return;
    }
    const pageId = e.state?.page || 'home';
    switchPage(pageId, false);
  });

  // État initial de la page home dans l'historique
  history.replaceState({ page: 'home' }, '', '#home');

  // Email — ouvre Gmail compose directement dans le navigateur
  const mailLink = document.getElementById('mail-link');
  const mailVal  = document.getElementById('mail-val');
  if (mailLink && mailVal) {
    const email = 'expertimmotournai' + '@' + 'gmail.com';
    mailLink.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + email + '&su=Contact%20Tournai%20Expert%20Immo';
    mailLink.target = '_blank';
    mailVal.textContent = email;
  }

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    userToggled = true;
    document.body.classList.toggle('dark');
  });

  // Fix scroll 1 doigt Android : signaler les pages comme cibles de scroll
  document.querySelectorAll('.page').forEach(p => {
    p.addEventListener('touchstart', () => {}, { passive: true });
  });

  // ─── Alignement dynamique bandeau nav sur bord gauche du hero-sketch ───
  function alignNavBand() {
    const sketch = document.querySelector('.hero-sketch');
    const logo   = document.querySelector('.logo');
    if (!sketch || !logo) return;
    const left = sketch.getBoundingClientRect().left;
    logo.style.width = left + 'px';
  }
  alignNavBand();
  window.addEventListener('resize', alignNavBand);

  // Fix Safari/WebKit : force la navigation sur les <a>.contact-row
  // Les liens mailto: sont laissés au navigateur (ouverture messagerie native)
  document.querySelectorAll('a.contact-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      if (!row.href) return;
      if (row.href.startsWith('mailto:')) return; // laisser le navigateur gérer
      e.preventDefault();
      if (row.target === '_blank') {
        window.open(row.href, '_blank');
      } else {
        window.location.href = row.href;
      }
    });
  });
