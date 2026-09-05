/* Каста Феодалов. No dependencies, no tracking, no network submission. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';
  document.documentElement.classList.replace('no-js', 'js');

  // Reveal once; text remains available when JavaScript is disabled.
  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -28px 0px', threshold: 0.04 });
    revealItems.forEach(item => revealObserver.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  // Sticky navigation and a restrained reading-progress line.
  const header = $('#site-header');
  const progress = $('.reading-progress');
  let scrollQueued = false;
  const updateScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 35);
    const range = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, y / range)) : 0})`;
    scrollQueued = false;
  };
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(updateScroll);
  }, { passive: true });
  window.addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  const navLinks = $$('.desktop-nav a');
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });
    $$('main > section[id]').forEach(section => sectionObserver.observe(section));
  }

  // Native dialogs provide a focus trap, Escape support and inert background.
  const menuButton = $('.menu-toggle');
  const dialogs = $$('dialog');
  const openDialog = (id, opener) => {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.tagName !== 'DIALOG') return;
    dialogs.forEach(other => { if (other.open && other !== dialog) other.close(); });
    dialog._kastaOpener = opener || document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add('has-dialog');
    if (id === 'mobile-menu') menuButton.setAttribute('aria-expanded', 'true');
  };
  const closeDialog = dialog => { if (dialog && dialog.open) dialog.close(); };
  menuButton.addEventListener('click', () => openDialog('mobile-menu', menuButton));
  $$('[data-open-dialog]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      openDialog(trigger.dataset.openDialog, trigger);
    });
  });
  $$('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
  });
  dialogs.forEach(dialog => {
    // Keep the Tab cycle inside the modal, including Chromium's last-to-chrome edge case.
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = $$('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])', dialog)
        .filter(item => item.getClientRects().length && !item.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener('close', () => {
      if (!dialogs.some(item => item.open)) document.body.classList.remove('has-dialog');
      if (dialog.id === 'mobile-menu') menuButton.setAttribute('aria-expanded', 'false');
      const opener = dialog._kastaOpener;
      if (opener && opener.isConnected && !opener.closest('[hidden]')) {
        opener.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        closeDialog(dialog);
      }
    });
  });
  // Explicit local scrolling also works in a sandboxed srcdoc preview.
  $$('a[href^="#"]:not([data-open-dialog])').filter(link => !link.closest('dialog')).forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const hash = link.getAttribute('href');
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      try { history.pushState(null, '', hash); } catch (_) { /* opaque-origin preview */ }
    });
  });
  // Navigation from a modal closes it before moving to the page target.
  $$('dialog a[href^="#"]:not([data-open-dialog])').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      const dialog = link.closest('dialog');
      dialog._kastaOpener = null;
      closeDialog(dialog);
      requestAnimationFrame(() => {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        try { history.replaceState(null, '', link.hash); } catch (_) { /* file:// browser restriction */ }
      });
    });
  });
  window.addEventListener('resize', () => {
    const menu = $('#mobile-menu');
    if (window.innerWidth > 980 && menu.open) closeDialog(menu);
  }, { passive: true });

  // Accessible, keyboard-operable tabs. Arrow keys, Home and End are supported.
  $$('[data-tabs]').forEach(group => {
    const tabs = $$('[role="tab"]', group);
    const activate = (index, moveFocus = false) => {
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
      });
      if (moveFocus) tabs[index].focus({ preventScroll: true });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(index));
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(next, true);
      });
    });
  });

  // No autoplay: the reader sets the pace.
  const quotes = $$('.quote-slide');
  let quoteIndex = 0;
  const changeQuote = delta => {
    quoteIndex = (quoteIndex + delta + quotes.length) % quotes.length;
    quotes.forEach((quote, index) => { quote.hidden = index !== quoteIndex; });
    $('#quote-current').textContent = String(quoteIndex + 1).padStart(2, '0');
  };
  $('#quote-prev').addEventListener('click', () => changeQuote(-1));
  $('#quote-next').addEventListener('click', () => changeQuote(1));
  $('.quote-controls').addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    changeQuote(event.key === 'ArrowLeft' ? -1 : 1);
  });

  // Also enforce a single open FAQ item in browsers without details[name].
  const faqItems = $$('.faq-list details');
  faqItems.forEach(item => {
    item.addEventListener('toggle', () => {
      if (item.open) faqItems.forEach(other => { if (other !== item) other.open = false; });
    });
  });

  // Optional verified media destinations. Null values retain useful local links.
  const config = window.KASTA_CONFIG || {};
  const safeHttpsUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch (_) { return null; }
  };
  $$('[data-channel]').forEach(link => {
    const url = safeHttpsUrl(config.channels && config.channels[link.dataset.channel]);
    if (!url) return;
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${link.textContent.trim()} — открыть официальный канал в новой вкладке`);
  });

  // A real local workflow, deliberately not a pretend backend submission.
  const form = $('#application-form');
  const result = $('#application-result');
  const output = $('#application-text');
  const status = $('#application-status');
  const fields = {
    name: $('#app-name'),
    telegram: $('#app-telegram'),
    direction: $('#app-direction'),
    intention: $('#app-intention'),
    honor: $('#app-honor')
  };
  let preparedText = '';
  let attempted = false;
  const showFieldError = (key, message) => {
    document.getElementById(`${key}-error`).textContent = message;
    if (message) fields[key].setAttribute('aria-invalid', 'true');
    else fields[key].removeAttribute('aria-invalid');
    return !message;
  };
  const validateField = key => {
    const field = fields[key];
    const value = field.value.trim();
    let message = '';
    if (key === 'name' && (value.length < 2 || value.length > 60)) message = 'Укажи имя: от 2 до 60 символов.';
    if (key === 'telegram' && !/^@?[a-zA-Z0-9_]{4,32}$/.test(value)) message = 'Укажи имя пользователя: 4–32 латинские буквы, цифры или знак _. Можно с @.';
    if (key === 'direction' && !value) message = 'Выбери направление, с которого хочешь начать.';
    if (key === 'intention' && (value.length < 20 || value.length > 1200)) message = 'Расскажи чуть подробнее: от 20 до 1200 символов.';
    if (key === 'honor' && !field.checked) message = 'Ознакомься с кодексом и подтверди согласие с принципами.';
    return showFieldError(key, message);
  };
  Object.entries(fields).forEach(([key, field]) => {
    field.addEventListener('blur', () => {
      if (key === 'name') field.value = field.value.trim();
      if (key === 'telegram') {
        const value = field.value.trim();
        if (value && /^@?[a-zA-Z0-9_]{4,32}$/.test(value)) field.value = `@${value.replace(/^@/, '')}`;
      }
      if (field.value || attempted) validateField(key);
    });
    field.addEventListener(key === 'honor' || key === 'direction' ? 'change' : 'input', () => {
      if (attempted || field.hasAttribute('aria-invalid')) validateField(key);
    });
  });
  fields.intention.addEventListener('input', () => {
    $('#intention-count').textContent = `${fields.intention.value.length} / 1200`;
  });

  const prepareApplication = event => {
    event.preventDefault();
    attempted = true;
    const checks = Object.keys(fields).map(validateField);
    if (checks.some(valid => !valid)) {
      status.textContent = 'Проверь отмеченные поля. Заявка пока не подготовлена.';
      const invalid = Object.values(fields).find(field => field.getAttribute('aria-invalid') === 'true');
      if (invalid) invalid.focus();
      return;
    }
    const contact = `@${fields.telegram.value.trim().replace(/^@/, '')}`;
    fields.telegram.value = contact;
    preparedText = [
      'ЗАЯВКА НА ЗНАКОМСТВО С «КАСТОЙ ФЕОДАЛОВ»',
      '',
      `Имя: ${fields.name.value.trim()}`,
      `Телеграм: ${contact}`,
      `Начать с: ${fields.direction.value}`,
      '',
      'За что я готов взять ответственность:',
      fields.intention.value.trim(),
      '',
      'Я прочитал кодекс чести и разделяю принципы касты.',
      'Понимаю: заявка — начало знакомства, а не автоматическое вступление.'
    ].join('\n');
    output.value = preparedText;
    const official = safeHttpsUrl(config.applicationTelegram);
    const share = official && official.hostname === 't.me' && /^\/[a-zA-Z0-9_]{4,32}\/?$/.test(official.pathname)
      ? official : new URL('https://t.me/share/url');
    if (share.pathname === '/share/url') share.searchParams.set('url', '');
    share.searchParams.set('text', preparedText);
    $('#telegram-share').href = share.href;
    if (official && share.pathname !== '/share/url') {
      $('#share-hint').textContent = 'Откроется подтверждённый контакт команды. Проверь текст и отправь сообщение сам.';
    }
    form.hidden = true;
    result.hidden = false;
    status.textContent = '';
    requestAnimationFrame(() => {
      result.focus({ preventScroll: true });
      result.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    });
  };
  form.addEventListener('submit', prepareApplication);
  // This is local preparation, not submission. Cancel the button's native form
  // action before a scripts-only sandbox can block it. Enter still works.
  $('.form-submit').addEventListener('click', prepareApplication);

  $('#copy-application').addEventListener('click', async () => {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(preparedText); copied = true; } catch (_) { /* fall through */ }
    }
    if (!copied) {
      output.focus({ preventScroll: true });
      output.select();
      output.setSelectionRange(0, output.value.length);
      try { copied = document.execCommand('copy'); } catch (_) { /* manual fallback below */ }
    }
    status.textContent = copied
      ? 'Текст заявки скопирован. Передай его пригласившему.'
      : 'Текст выделен. Используй команду «Копировать» в браузере или скачай заявку файлом.';
    if (copied) $('#copy-application').focus({ preventScroll: true });
  });
  $('#download-application').addEventListener('click', () => {
    const blob = new Blob(['\uFEFF', preparedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kasta-feodalov-application.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status.textContent = 'Файл заявки подготовлен. Если браузер не начал скачивание, используй кнопку «Скопировать».';
  });
  $('#edit-application').addEventListener('click', () => {
    result.hidden = true;
    form.hidden = false;
    status.textContent = '';
    fields.name.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  });
  // Only enable submission after the complete local workflow has initialized.
  $('#application-fields').disabled = false;

  // Support direct links to editorial material without an additional page.
  const deepLinkedDialog = document.getElementById(location.hash.slice(1));
  if (deepLinkedDialog && deepLinkedDialog.tagName === 'DIALOG') openDialog(deepLinkedDialog.id);
})();
