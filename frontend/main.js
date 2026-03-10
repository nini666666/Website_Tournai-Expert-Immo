  const nav = document.getElementById('main-nav');
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('mobileDrawer');

  function switchPage(targetId) {
    const current = document.querySelector('.page.active');
    const target  = document.getElementById('page-' + targetId);
    if (!target || target === current) return;

    current.classList.remove('active');
    current.classList.add('exit');
    setTimeout(() => current.classList.remove('exit'), 600);

    target.classList.add('active');
    target.scrollTop = 0;

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

  // Burger toggle
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    drawer.classList.toggle('open');
  });

  // Tous les liens de navigation
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      switchPage(this.dataset.page);
    });
  });

  // Email anti-spam
  const mailLink = document.getElementById('mail-link');
  const mailVal  = document.getElementById('mail-val');
  if (mailLink && mailVal) {
    const email = 'expertimmotournai' + '@' + 'gmail.com';
    mailLink.href = 'mailto:' + email;
    mailVal.textContent = email;
  }

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });

  // Fix Safari/WebKit : force la navigation sur les <a>.contact-row
  document.querySelectorAll('a.contact-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      if (!row.href) return;
      e.preventDefault();
      if (row.target === '_blank') {
        window.open(row.href, '_blank');
      } else {
        window.location.href = row.href;
      }
    });
  });
