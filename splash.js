// Splash Screen المشترك لكل صفحات سيمبل
// يطلع شعار العين أول ما المستخدم يفتح أي صفحة لمدة ~٣ ثواني ثم يختفي بـ زووم
// ملاحظة: هذا الملف يُستدعى داخل <head> قبل تحميل <body>، فنركّب السبلاش فورًا
// على <html> (documentElement) عشان يغطّي الشاشة من أول لحظة قبل ظهور أي محتوى.

(function() {
  // لا تظهر سبلاش لو المستخدم انتقل بين الصفحات بنفس الجلسة (تجربة أنعم)
  // فقط لما يدخل من برّا (تبويب جديد، إعادة تحميل، اختصار التطبيق)
  if (sessionStorage.getItem('simbl_splash_shown')) return;
  sessionStorage.setItem('simbl_splash_shown', '1');

  // إنشاء الـ CSS
  var style = document.createElement('style');
  style.textContent = `
    /* إخفاء المحتوى تحت السبلاش حتى لا يبين قبل الشعار */
    html.simbl-splash-active, html.simbl-splash-active body { overflow: hidden !important; }
    #simbl-splash {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: simblSplashOut 0.4s ease 2.65s forwards;
    }
    #simbl-splash .splash-eye {
      width: clamp(120px, 26vw, 190px);
      height: clamp(120px, 26vw, 190px);
      animation: simblSplashZoom 1.3s cubic-bezier(0.7, 0, 0.3, 1) 1.35s forwards;
    }
    #simbl-splash .splash-eye .ln {
      stroke-dasharray: 300;
      stroke-dashoffset: 300;
      animation: simblSplashDraw 0.7s ease forwards;
    }
    #simbl-splash .splash-eye .ln2 { animation-delay: 0.28s; }
    #simbl-splash .splash-eye .eyeShape {
      stroke-dasharray: 120;
      stroke-dashoffset: 120;
      fill: transparent;
      animation: simblSplashDraw 0.45s ease 0.62s forwards, simblEyeFill 0.3s ease 1s forwards;
    }
    #simbl-splash .splash-eye .pupil {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      animation: simblPupilIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.98s forwards;
    }
    @keyframes simblSplashDraw { to { stroke-dashoffset: 0; } }
    @keyframes simblEyeFill { to { fill: #ffffff; } }
    @keyframes simblPupilIn {
      0% { opacity: 0; transform: scale(0); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes simblSplashZoom {
      0% { opacity: 1; transform: scale(1); }
      35% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(11); }
    }
    @keyframes simblSplashOut {
      to { opacity: 0; visibility: hidden; }
    }
    @media (prefers-reduced-motion: reduce) {
      #simbl-splash .splash-eye { animation-duration: 0.5s; }
      #simbl-splash { animation-delay: 0.5s; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // إنشاء عنصر السبلاش
  var splash = document.createElement('div');
  splash.id = 'simbl-splash';
  splash.setAttribute('aria-hidden', 'true');
  splash.innerHTML = `
    <svg class="splash-eye" viewBox="0 0 200 200">
      <g fill="none" stroke-linejoin="miter" stroke-miterlimit="6" stroke-linecap="round">
        <path class="ln" d="M30 100 C61.5 78 138.5 78 170 100 C138.5 122 61.5 122 30 100 Z" stroke="#0a0a0a" stroke-width="8" transform="rotate(25 100 100)"/>
        <path class="ln ln2" d="M30 100 C61.5 78 138.5 78 170 100 C138.5 122 61.5 122 30 100 Z" stroke="#0a0a0a" stroke-width="8" transform="rotate(-25 100 100)"/>
        <path class="eyeShape" d="M76 100 Q100 88 124 100 Q100 112 76 100 Z" fill="#ffffff" stroke="#13B9B2" stroke-width="6"/>
        <circle class="pupil" cx="100" cy="100" r="7" fill="#0a0a0a"/>
      </g>
    </svg>
  `;

  // نركّب السبلاش فورًا على <html> (موجود دائمًا)، بدون انتظار <body>
  document.documentElement.classList.add('simbl-splash-active');
  document.documentElement.appendChild(splash);

  // إزالة السبلاش بعد انتهاء الأنيميشن
  function removeSplash() {
    document.documentElement.classList.remove('simbl-splash-active');
    if (splash.parentNode) splash.style.display = 'none';
  }
  setTimeout(removeSplash, 3050);

  // احتياط: لو لأي سبب تعطّل المؤقّت، نشيل القفل عند تحميل الصفحة بفترة كافية
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (document.documentElement.classList.contains('simbl-splash-active')) {
        removeSplash();
      }
    }, 3200);
  });
})();
